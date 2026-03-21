import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth, requireAdmin } from '@/lib/auth'
import { WHATSAPP } from '@/config/client'

const WHATSAPP_API = WHATSAPP.apiBase
const WABA_ID = WHATSAPP.wabaId

// GET /api/templates — list all WhatsApp message templates
export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)

    const res = await fetch(
      `${WHATSAPP_API}/${WABA_ID}/message_templates?fields=name,status,category,components,id&limit=50`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
      }
    )
    const data = await res.json()

    if (data.error) {
      return NextResponse.json({ success: false, error: data.error.message }, { status: 400 })
    }

    // Format for frontend
    const templates = (data.data || []).map((t: Record<string, unknown>) => {
      const components = t.components as Array<Record<string, unknown>> || []
      const bodyComponent = components.find((c) => c.type === 'BODY')
      const bodyText = (bodyComponent?.text as string) || ''
      // Count params like {{1}}, {{2}}
      const paramCount = (bodyText.match(/\{\{\d+\}\}/g) || []).length

      return {
        id: t.id,
        name: t.name,
        status: t.status,
        category: t.category,
        body: bodyText,
        param_count: paramCount,
        components,
      }
    })

    return NextResponse.json({ success: true, data: templates })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to fetch templates' },
      { status: 500 }
    )
  }
}

// POST /api/templates — create a new template
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const { name, category, body_text, footer_text, header_text, buttons, example_params } = await req.json()

    if (!name || !body_text) {
      return NextResponse.json({ success: false, error: 'Name and body text are required' }, { status: 400 })
    }

    // Build components
    const components: Record<string, unknown>[] = []

    if (header_text) {
      components.push({ type: 'HEADER', format: 'TEXT', text: header_text })
    }

    // Body with example params
    const bodyComponent: Record<string, unknown> = { type: 'BODY', text: body_text }
    if (example_params?.length) {
      bodyComponent.example = { body_text: [example_params] }
    }
    components.push(bodyComponent)

    if (footer_text) {
      components.push({ type: 'FOOTER', text: footer_text })
    }

    if (buttons?.length) {
      components.push({ type: 'BUTTONS', buttons })
    }

    const res = await fetch(
      `${WHATSAPP_API}/${WABA_ID}/message_templates`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          category: category || 'UTILITY',
          language: 'en',
          components,
        }),
      }
    )

    const data = await res.json()

    if (data.error) {
      return NextResponse.json({ success: false, error: data.error.message }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: { id: data.id, status: data.status, category: data.category || category },
    })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to create template' },
      { status: 500 }
    )
  }
}

// DELETE /api/templates — delete a template by name
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const { name } = await req.json()
    if (!name) {
      return NextResponse.json({ success: false, error: 'Template name required' }, { status: 400 })
    }

    const res = await fetch(
      `${WHATSAPP_API}/${WABA_ID}/message_templates?name=${encodeURIComponent(name)}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
      }
    )

    const data = await res.json()

    if (data.error) {
      return NextResponse.json({ success: false, error: data.error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to delete template' },
      { status: 500 }
    )
  }
}
