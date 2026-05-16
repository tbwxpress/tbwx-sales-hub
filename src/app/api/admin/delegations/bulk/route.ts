import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAdmin } from '@/lib/auth'
import { bulkCreateDelegations, insertLeadEdit } from '@/lib/db'
import { getUserById } from '@/lib/users'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    requireAdmin(session)
    const user = session!

    const body = await req.json()
    const { lead_rows, from_agent_id, to_agent_id, expires_at } = body as {
      lead_rows: number[]
      from_agent_id: string
      to_agent_id: string
      expires_at?: string
    }

    if (!Array.isArray(lead_rows) || lead_rows.length === 0) {
      return NextResponse.json({ success: false, error: 'lead_rows must be a non-empty array' }, { status: 400 })
    }
    if (!from_agent_id || !to_agent_id) {
      return NextResponse.json({ success: false, error: 'from_agent_id and to_agent_id are required' }, { status: 400 })
    }
    if (from_agent_id === to_agent_id) {
      return NextResponse.json({ success: false, error: 'from and to agents must be different' }, { status: 400 })
    }

    const [fromAgent, toAgent] = await Promise.all([
      getUserById(from_agent_id),
      getUserById(to_agent_id),
    ])

    if (!fromAgent || !fromAgent.active) {
      return NextResponse.json({ success: false, error: 'from_agent not found or inactive' }, { status: 400 })
    }
    if (!toAgent || !toAgent.active) {
      return NextResponse.json({ success: false, error: 'to_agent not found or inactive' }, { status: 400 })
    }

    const result = await bulkCreateDelegations({
      lead_rows,
      from_agent_id: fromAgent.id,
      from_agent_name: fromAgent.name,
      to_agent_id: toAgent.id,
      to_agent_name: toAgent.name,
      expires_at: expires_at || undefined,
      admin_id: user.id,
    })

    // Audit log one entry per lead
    const expiresLabel = expires_at ? ` until ${expires_at}` : ''
    await Promise.all(
      lead_rows.map(lr =>
        insertLeadEdit({
          lead_row: lr,
          phone: '',
          field_name: 'delegation',
          old_value: '',
          new_value: `bulk delegated from ${fromAgent.name} to ${toAgent.name}${expiresLabel} by admin`,
          changed_by: user.name,
          changed_by_id: user.id,
        })
      )
    )

    return NextResponse.json({ success: true, data: { created: result.count, ids: result.ids } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Bulk delegation failed') }, { status: 500 })
  }
}
