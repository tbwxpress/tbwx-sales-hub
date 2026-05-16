import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getLeads, getLeadByRow, updateLead, clearLeadRow } from '@/lib/sheets'
import { logAssignment, recordLeadClose, insertLeadEdit } from '@/lib/db'
import { LEAD_STATUSES } from '@/config/client'
import { computeLeadScore } from '@/lib/scoring'

// Fields that require admin or can_edit_leads permission
const PROFILE_FIELDS = new Set(['full_name', 'email', 'city', 'state', 'model_interest'])

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    requireAuth(session)
    const { id } = await params
    const rowNum = parseInt(id)
    const lead = await getLeadByRow(rowNum)
    if (!lead) {
      return NextResponse.json({ success: false, error: 'Lead not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: { ...lead, lead_score: computeLeadScore(lead) } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Admin only' }, { status: 403 })
    }
    const { id } = await params
    const rowNum = parseInt(id)
    await clearLeadRow(rowNum)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Delete failed') }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const { id } = await params
    const rowNum = parseInt(id)
    const body = await req.json()

    // Agents can only modify leads assigned to them (or unassigned if can_assign)
    if (user.role === 'agent') {
      const allLeads = await getLeads()
      const lead = allLeads.find(l => l.row_number === rowNum)
      const isAssignedToMe = lead?.assigned_to === user.name
      const isUnassigned = !lead?.assigned_to
      if (!isAssignedToMe && !(user.can_assign && isUnassigned)) {
        return NextResponse.json({ success: false, error: 'Not authorized to modify this lead' }, { status: 403 })
      }
    }

    // Only admin or users with can_assign can change assigned_to
    if (body.assigned_to !== undefined && user.role !== 'admin' && !user.can_assign) {
      return NextResponse.json({ success: false, error: 'Not authorized to assign leads' }, { status: 403 })
    }

    // Profile field edits require admin or can_edit_leads (checked against fresh DB record)
    const hasProfileField = Object.keys(body).some(k => PROFILE_FIELDS.has(k))
    if (hasProfileField) {
      if (user.role !== 'admin') {
        // Fresh DB lookup — don't trust the JWT claim for this check
        const { getUserById } = await import('@/lib/users')
        const freshUser = await getUserById(user.id)
        if (!freshUser?.can_edit_leads) {
          return NextResponse.json({ success: false, error: 'Not authorized to edit lead profile fields' }, { status: 403 })
        }
      }
      // Validate: full_name must not be empty if provided
      if (body.full_name !== undefined && !String(body.full_name).trim()) {
        return NextResponse.json({ success: false, error: 'Name cannot be empty' }, { status: 400 })
      }
      // Validate: email must match basic pattern if provided
      if (body.email !== undefined && body.email !== '' && !/^\S+@\S+\.\S+$/.test(String(body.email))) {
        return NextResponse.json({ success: false, error: 'Invalid email address' }, { status: 400 })
      }
    }

    // Validate status if provided
    if (body.lead_status && !(LEAD_STATUSES as readonly string[]).includes(body.lead_status)) {
      return NextResponse.json({ success: false, error: `Invalid status: ${body.lead_status}` }, { status: 400 })
    }

    // Status-specific follow-up intervals
    if (body.lead_status && !body.next_followup) {
      const FOLLOWUP_DAYS: Record<string, number> = {
        NEW: 1, DECK_SENT: 1, REPLIED: 0, NO_RESPONSE: 1,
        CALL_DONE_INTERESTED: 2, HOT: 2, FINAL_NEGOTIATION: 2, DELAYED: 7,
      }
      const days = FOLLOWUP_DAYS[body.lead_status]
      if (days !== undefined) {
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + days)
        body.next_followup = nextDate.toISOString().split('T')[0]
      } else if (body.lead_status === 'CONVERTED' || body.lead_status === 'LOST') {
        body.next_followup = ''
      }
    }

    // Record SLA close on CONVERTED/LOST
    if (body.lead_status === 'CONVERTED' || body.lead_status === 'LOST') {
      try {
        const leads = await getLeads()
        const lead = leads.find(l => l.row_number === rowNum)
        if (lead?.phone) {
          await recordLeadClose(lead.phone, body.lead_status)
        }
      } catch { /* SLA tracking is non-critical */ }
    }

    // Meta CAPI feedback — fire offline conversion events on real progression.
    // Only fires when status actually changes (not on every PATCH that includes
    // the same status). Hashed PII per Meta spec; never logs raw phone/email.
    // Whether the event actually goes to Meta is gated by meta_capi.enabled
    // setting in the admin panel.
    if (body.lead_status === 'HOT' || body.lead_status === 'CONVERTED') {
      try {
        const leads = await getLeads()
        const lead = leads.find(l => l.row_number === rowNum)
        if (lead?.phone && lead.lead_status !== body.lead_status) {
          const [firstName, ...rest] = String(lead.full_name || '').trim().split(/\s+/)
          const lastName = rest.join(' ')
          if (body.lead_status === 'HOT') {
            const { fireLeadHotEvent } = await import('@/lib/meta-capi')
            await fireLeadHotEvent({
              lead_row: rowNum,
              phone: lead.phone,
              email: lead.email,
              first_name: firstName,
              last_name: lastName,
              city: lead.city,
              lead_id: lead.id,  // Meta-generated leadgen_id ("l:..." prefix auto-stripped)
            }).catch(e => console.error('[CAPI] Lead event failed:', e))
          } else if (body.lead_status === 'CONVERTED') {
            const { fireConvertedEvent } = await import('@/lib/meta-capi')
            await fireConvertedEvent({
              lead_row: rowNum,
              phone: lead.phone,
              email: lead.email,
              first_name: firstName,
              last_name: lastName,
              city: lead.city,
              lead_id: lead.id,
            }).catch(e => console.error('[CAPI] Purchase event failed:', e))
          }
        }
      } catch { /* CAPI is non-critical to lead update */ }
    }

    // Log assignment changes + notify the new owner
    if (body.assigned_to !== undefined) {
      const leads = await getLeads()
      const lead = leads.find(l => l.row_number === rowNum)
      await logAssignment({
        lead_row: rowNum,
        phone: lead?.phone || '',
        from_agent: lead?.assigned_to || '',
        to_agent: body.assigned_to,
        assigned_by: user.name,
      })
      if (body.assigned_to && body.assigned_to !== lead?.assigned_to) {
        try {
          const { getUsers } = await import('@/lib/users')
          const { notifyQuiet } = await import('@/lib/notifications')
          const users = await getUsers()
          const newOwner = users.find(u => u.name === body.assigned_to && u.active)
          if (newOwner) {
            await notifyQuiet({
              user_id: newOwner.id,
              type: 'lead_assigned',
              title: `New lead assigned: ${lead?.full_name || lead?.phone || 'lead'}`,
              body: `Reassigned by ${user.name}${lead?.lead_priority ? ` · ${lead.lead_priority}` : ''}`,
              ref_phone: lead?.phone || null,
              ref_lead_row: rowNum,
            })
          }
        } catch { /* notification failures non-critical */ }
      }
    }

    // Notify lead's owner when a non-owner (typically a telecaller) updates the lead
    // — for status changes that signal a real progression (HOT, CALL_DONE_INTERESTED, etc.)
    if (body.lead_status) {
      try {
        const leads = await getLeads()
        const lead = leads.find(l => l.row_number === rowNum)
        const owner = lead?.assigned_to
        const isOwnerEditing = owner && owner === user.name
        const isReassignment = body.assigned_to !== undefined
        if (owner && !isOwnerEditing && !isReassignment && body.lead_status !== lead?.lead_status) {
          const { getUsers } = await import('@/lib/users')
          const { notifyQuiet } = await import('@/lib/notifications')
          const users = await getUsers()
          const ownerUser = users.find(u => u.name === owner && u.active)
          if (ownerUser) {
            await notifyQuiet({
              user_id: ownerUser.id,
              type: body.lead_status === 'HOT' ? 'lead_hot' : 'telecaller_update',
              title: `${lead?.full_name || lead?.phone || 'Lead'} → ${body.lead_status}`,
              body: `Updated by ${user.name}`,
              ref_phone: lead?.phone || null,
              ref_lead_row: rowNum,
            })
          }
        }
      } catch { /* non-critical */ }
    }

    // Audit-log the status change so /agent-stats Daily Activity can attribute it
    if (body.lead_status) {
      try {
        const leads = await getLeads()
        const lead = leads.find(l => l.row_number === rowNum)
        if (lead && lead.lead_status !== body.lead_status) {
          const { insertStatusChange } = await import('@/lib/db')
          await insertStatusChange({
            lead_row: rowNum,
            phone: lead.phone,
            old_status: lead.lead_status,
            new_status: body.lead_status,
            changed_by: user.name,
            changed_by_id: user.id,
            source: 'manual',
          })
        }
      } catch { /* audit log is non-critical */ }
    }

    // Audit-log field-level changes (skip fields already audited by dedicated tables)
    const SKIP_AUDIT_FIELDS = new Set(['lead_status', 'assigned_to'])
    const AUDITED_FIELDS = [
      'full_name', 'email', 'city', 'state', 'model_interest',
      'lead_priority', 'next_followup', 'attempted_contact',
      'first_call_date', 'wa_message_id', 'notes',
    ]
    const fieldsToAudit = Object.keys(body).filter(
      k => !SKIP_AUDIT_FIELDS.has(k) && AUDITED_FIELDS.includes(k)
    )
    if (fieldsToAudit.length > 0) {
      try {
        // Reuse the lead already fetched for assignment/status logic above if available,
        // otherwise fetch fresh. getLeads() is small (<5000 rows) — acceptable for v1.
        const leads = await getLeads()
        const currentLead = leads.find(l => l.row_number === rowNum)
        if (currentLead) {
          for (const field of fieldsToAudit) {
            const oldVal = String(currentLead[field as keyof typeof currentLead] ?? '')
            const newVal = String(body[field] ?? '')
            if (oldVal !== newVal) {
              await insertLeadEdit({
                lead_row: rowNum,
                phone: currentLead.phone || '',
                field_name: field,
                old_value: oldVal,
                new_value: newVal,
                changed_by: user.name ?? user.email,
                changed_by_id: user.id,
              })
            }
          }
        }
      } catch { /* audit log is non-critical */ }
    }

    await updateLead(rowNum, body)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Update failed') }, { status: 500 })
  }
}
