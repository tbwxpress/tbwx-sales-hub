import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth } from '@/lib/auth'
import { getMessages, getContact } from '@/lib/db'
import { getLeads } from '@/lib/sheets'

// POST /api/inbox/ai-suggest
// Body: { phone: string, agent_name?: string }
// Returns: { suggestion: string, model: string }
//
// Drafts a context-aware WhatsApp reply for the agent. Uses KIE_API_KEY
// (kie.ai gateway, OpenAI-compatible). Falls back to a structured template
// if no key is configured so the feature still degrades gracefully.

const KIE_BASE = process.env.KIE_API_BASE || 'https://api.kie.ai/v1'
const DEFAULT_MODEL = process.env.KIE_MODEL || 'gpt-4o-mini'

function fallbackSuggestion(ctx: {
  agentName: string
  leadName: string
  leadCity: string
  status: string
  lastInbound: string
}): string {
  const greet = ctx.leadName ? `Hi ${ctx.leadName}` : 'Hi there'
  const city = ctx.leadCity ? ` in ${ctx.leadCity}` : ''
  if (ctx.lastInbound) {
    return `${greet}, this is ${ctx.agentName} from TBWX. Thanks for your message — happy to walk you through the franchise opportunity${city}. When would be a good time for a quick call today or tomorrow?`
  }
  return `${greet}, this is ${ctx.agentName} from TBWX. Hope you got a chance to look at our franchise deck. Quick question: what investment range and city are you considering? Happy to share what's working best for partners${city}.`
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)

    const { phone, agent_name } = await req.json()
    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ success: false, error: 'phone required' }, { status: 400 })
    }
    const agentName = (typeof agent_name === 'string' && agent_name) || user.name

    // Gather context
    const [contact, msgs] = await Promise.all([
      getContact(phone),
      getMessages(phone, 8, 0),
    ])

    // Try to find the lead row from the contact, then read lead details
    let leadName: string = String(contact?.name || '')
    let leadCity: string = ''
    let leadStatus: string = ''
    let leadPriority: string = ''
    let leadModel: string = ''
    let leadTimeline: string = ''
    let leadExperience: string = ''

    if (contact?.lead_row) {
      try {
        const leads = await getLeads()
        const lead = leads.find(l => l.row_number === Number(contact.lead_row))
        if (lead) {
          leadName = lead.full_name || leadName
          leadCity = lead.city || ''
          leadStatus = lead.lead_status || ''
          leadPriority = lead.lead_priority || ''
          leadModel = lead.model_interest || ''
          leadTimeline = lead.timeline || ''
          leadExperience = lead.experience || ''
        }
      } catch { /* skip */ }
    }

    const recent = (msgs || [])
      .slice()
      .reverse()
      .slice(-8)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => `${m.direction === 'sent' ? 'AGENT' : 'LEAD'}: ${(m.text || '').slice(0, 280)}`)
      .join('\n')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastInbound: any = (msgs || []).find((m: { direction?: string }) => m.direction === 'received')
    const lastInboundText: string = String(lastInbound?.text || '')

    // No KIE key → graceful fallback
    if (!process.env.KIE_API_KEY) {
      return NextResponse.json({
        success: true,
        data: {
          suggestion: fallbackSuggestion({ agentName, leadName, leadCity, status: leadStatus, lastInbound: lastInboundText }),
          model: 'fallback',
        },
      })
    }

    const systemPrompt = `You are an expert WhatsApp sales rep for The Belgian Waffle Xpress (TBWX), a 40+-outlet Indian QSR franchise brand.
Your job is to draft ONE short, warm, professional WhatsApp reply on behalf of agent ${agentName}.

Strict rules:
- Keep it under 80 words. Conversational, not corporate.
- Reference the lead's most recent message specifically if there is one.
- Ask exactly one clear next-step question (book call / share details / clarify objection) when appropriate.
- Sign off as ${agentName} only if the agent hasn't introduced themselves yet in the thread.
- Use ₹ for Indian rupees. Mention specific facts only if asked: Investment ₹4-7 Lakhs · Royalty 5% · ROI 8-12 months · 40+ Locations.
- Never invent locations, names, or numbers not provided.
- Never use emojis at start of message; one is OK at the end if natural.
- Never wrap in quotes, never include "Subject:" or any header.
- Output the message text only. No explanation.`

    const leadContext = `LEAD CONTEXT:
- Name: ${leadName || 'unknown'}
- City: ${leadCity || 'unknown'}
- Current status: ${leadStatus || 'unknown'} (priority: ${leadPriority || 'unknown'})
- Model interest: ${leadModel || 'unspecified'}
- Timeline: ${leadTimeline || 'unspecified'}
- Experience: ${leadExperience || 'unspecified'}

RECENT THREAD (oldest first):
${recent || '(no prior messages)'}

Draft the next message ${agentName} should send.`

    const res = await fetch(`${KIE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: leadContext },
        ],
        temperature: 0.5,
        max_tokens: 250,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[ai-suggest] KIE error:', res.status, errText.slice(0, 300))
      return NextResponse.json({
        success: true,
        data: {
          suggestion: fallbackSuggestion({ agentName, leadName, leadCity, status: leadStatus, lastInbound: lastInboundText }),
          model: 'fallback (KIE error)',
        },
      })
    }

    const data = await res.json()
    let suggestion = String(data?.choices?.[0]?.message?.content || '').trim()
    // Strip surrounding quotes if model wrapped output
    suggestion = suggestion.replace(/^["']|["']$/g, '').trim()
    if (!suggestion) {
      suggestion = fallbackSuggestion({ agentName, leadName, leadCity, status: leadStatus, lastInbound: lastInboundText })
    }

    return NextResponse.json({ success: true, data: { suggestion, model: DEFAULT_MODEL } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
