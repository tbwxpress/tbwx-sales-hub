/**
 * Website WhatsApp-click → pipeline lead.
 *
 * The website's franchise CTAs open a WhatsApp chat with the main WABA line
 * (prefilled franchise message). Visitors who tap them but never fill a form
 * used to become inbox CONTACTS only — they got the auto-deck but stayed
 * invisible to auto-send, follow-ups and the pipeline. This module turns
 * their FIRST franchise-intent text into a real lead: dedupe by phone,
 * create the sheet+DB lead, link the contact, assign a Closer from the
 * receiving pool, nudge the owner. No CAPI event (not ad-attributed).
 */

import type { Lead } from './types'

// Covers every website prefill (InlineLeadCTA / QuickLeadBar / ExitIntent /
// ApplyForm / Footer / city + international pages) plus the obvious organic
// opener. Deliberately narrow: ordinary customer chats must never create
// franchise leads.
const INTENT_MARKERS = ['franchise', 'tbwx partnership', 'interested in learning more']

export function isFranchiseIntent(text: string): boolean {
  const t = (text || '').toLowerCase()
  return INTENT_MARKERS.some(m => t.includes(m))
}

// Structured prefills carry "Name: …" / "City: …" lines and a "(via …)" tag.
export function parsePrefill(text: string): { name?: string; city?: string; via?: string } {
  const out: { name?: string; city?: string; via?: string } = {}
  const name = /name\s*:\s*([^\n]+)/i.exec(text || '')?.[1]?.trim()
  const city = /city\s*:\s*([^\n]+)/i.exec(text || '')?.[1]?.trim()
  const via = /\(via\s+([^)]+)\)/i.exec(text || '')?.[1]?.trim()
  if (name) out.name = name
  if (city) out.city = city
  if (via) out.via = via
  return out
}

// Meta retries webhook deliveries — one in-flight guard per phone so a
// duplicate delivery can never create two leads before the first insert lands.
const inFlight = new Set<string>()

/**
 * Create a pipeline lead for a first-time franchise-intent WhatsApp text.
 * Returns the new lead row, or null when nothing was created (no intent,
 * already a lead, invalid phone, or in-flight duplicate).
 */
export async function maybeCreateWebsiteWaLead(params: {
  phone: string
  contactName?: string
  text: string
}): Promise<number | null> {
  const { phone, contactName, text } = params
  if (!isFranchiseIntent(text)) return null

  // The webhook's wa_id already includes the country code (e.g. 9198…,
  // 1415… for international franchise CTAs) — keep it verbatim; the last
  // 10 digits are only the dedupe/id key.
  const fullDigits = String(phone).replace(/\D/g, '')
  const p10 = fullDigits.slice(-10)
  if (p10.length !== 10) return null
  if (inFlight.has(p10)) return null
  inFlight.add(p10)
  try {
    const { getLeads, createLead, forceLeadsSync } = await import('./sheets')
    const { upsertContact } = await import('./db')

    // Close the form→WhatsApp race: the visitor may have submitted the
    // website form SECONDS ago — its lead is in the sheet but not yet synced
    // to the DB. Force one sync so the dedupe below sees it. (Only runs for
    // unknown numbers with franchise intent, so the extra read is rare.)
    await forceLeadsSync()

    // Dedupe against EVERY lead: fresh form leads may not be linked to the
    // contact yet (contact.lead_row lags behind the sheet sync), so a
    // contact-only check is not enough.
    const leads = await getLeads()
    const existing = leads.find(
      (l: Lead) => String(l.phone || '').replace(/\D/g, '').slice(-10) === p10,
    )
    if (existing) {
      // Already in the pipeline — just make sure the contact is linked.
      await upsertContact(phone, { is_lead: true, lead_row: existing.row_number })
      return null
    }

    const prefill = parsePrefill(text)
    const name = prefill.name || contactName || `WA ${p10}`

    // Same eligibility as /api/assign-pool and the auto-send cron: active
    // Closers currently receiving new leads. Pool failure must never block
    // creation — an unassigned lead still enters the pipeline.
    let assignedTo = ''
    try {
      const { getUsers } = await import('./users')
      const { effectiveRole } = await import('./work')
      const pool = (await getUsers()).filter(
        u => u.active && u.receives_new_leads && !u.lead_pool_paused && effectiveRole(u) === 'closer',
      )
      if (pool.length) assignedTo = pool[Math.floor(Math.random() * pool.length)].name
    } catch { /* leave unassigned */ }

    const noteParts = [
      `[Auto] Created from website WhatsApp click — first message: "${(text || '').trim().slice(0, 300)}"`,
    ]
    if (prefill.via) noteParts.push(`(via ${prefill.via})`)

    const newRow = await createLead({
      full_name: name,
      phone: `p:+${fullDigits}`,
      city: prefill.city || '',
      lead_priority: 'WARM',
      assigned_to: assignedTo,
      notes: noteParts.join(' '),
      source: 'WA Organic (Website)',
      id: `wac:${p10}`,
      platform: 'Website WA',
    })
    if (!newRow) return null

    await upsertContact(phone, { name, is_lead: true, lead_row: newRow })

    // Best-effort owner nudge — same notification type the reply flow uses.
    if (assignedTo) {
      try {
        const { getUsers } = await import('./users')
        const { notifyQuiet } = await import('./notifications')
        const owner = (await getUsers()).find(u => u.name === assignedTo && u.active)
        if (owner) {
          await notifyQuiet({
            user_id: owner.id,
            type: 'lead_replied',
            title: `New website WhatsApp lead — ${name}`,
            body: (text || '').slice(0, 80),
            ref_phone: phone,
            ref_lead_row: newRow,
          })
        }
      } catch { /* best effort */ }
    }

    console.log(`[website-wa-lead] Created lead row ${newRow} for ${p10} ("${name}")`)
    return newRow
  } catch (err) {
    console.error('[website-wa-lead] create failed (non-critical):', err)
    return null
  } finally {
    inFlight.delete(p10)
  }
}
