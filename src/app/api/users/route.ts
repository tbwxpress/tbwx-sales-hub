import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth, requireAdmin, hashPassword } from '@/lib/auth'
import { getUsers, createUser, updateUser, getUserById, deleteUser, countAdmins } from '@/lib/users'
import { clearAssignmentsForTelecaller, getAutoQueueConfig, setAutoQueueConfig } from '@/lib/telecaller'
import { getLeads, bulkUpdateField } from '@/lib/sheets'

export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)

    const users = await getUsers()
    // Strip password hashes
    const safeUsers = users.map(({ password_hash, ...rest }) => rest)
    return NextResponse.json({ success: true, data: safeUsers })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const { name, email, password, role, can_assign, in_lead_pool, is_closer, is_telecaller, lead_pool_paused } = await req.json()
    if (!name || !email || !password) {
      return NextResponse.json({ success: false, error: 'Name, email, and password required' }, { status: 400 })
    }

    const hashed = await hashPassword(password)
    const id = await createUser({
      name,
      email,
      password_hash: hashed,
      role: role || 'agent',
      can_assign: can_assign || false,
      active: true,
      in_lead_pool: in_lead_pool || false,
      is_closer: is_closer || false,
      is_telecaller: is_telecaller || false,
      lead_pool_paused: lead_pool_paused || false,
    })

    return NextResponse.json({ success: true, data: { id } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const { user_id, name, email, password, can_assign, active, role, in_lead_pool, is_closer, is_telecaller, lead_pool_paused } = await req.json()
    if (!user_id) {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 400 })
    }

    // Profile fields require validation + (for name change) cascade to the Sheet
    let nameToWrite: string | undefined
    let emailToWrite: string | undefined
    let passwordHashToWrite: string | undefined
    let leadsRenamed = 0

    if (typeof name === 'string') {
      const trimmed = name.trim()
      if (!trimmed) {
        return NextResponse.json({ success: false, error: 'Name cannot be empty' }, { status: 400 })
      }
      nameToWrite = trimmed
    }

    if (typeof email === 'string') {
      const trimmed = email.trim().toLowerCase()
      if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
        return NextResponse.json({ success: false, error: 'Invalid email' }, { status: 400 })
      }
      // Uniqueness check (allow same email if it's the user's own current value)
      const existing = await getUserById(user_id)
      if (!existing) {
        return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
      }
      if (trimmed !== existing.email.toLowerCase()) {
        const allUsers = await getUsers()
        const conflict = allUsers.find(u => u.email.toLowerCase() === trimmed && u.id !== user_id)
        if (conflict) {
          return NextResponse.json({ success: false, error: `Another user already has the email ${trimmed}` }, { status: 409 })
        }
      }
      emailToWrite = trimmed
    }

    if (typeof password === 'string' && password.length > 0) {
      if (password.length < 6) {
        return NextResponse.json({ success: false, error: 'Password must be at least 6 characters' }, { status: 400 })
      }
      passwordHashToWrite = await hashPassword(password)
    }

    // Cascade name change to Sheet's assigned_to so leads stay attached to the right user
    if (nameToWrite) {
      const existing = await getUserById(user_id)
      if (existing && existing.name !== nameToWrite) {
        const allLeads = await getLeads()
        const ownedRows = allLeads.filter(l => l.assigned_to === existing.name).map(l => l.row_number)
        if (ownedRows.length > 0) {
          await bulkUpdateField(ownedRows, 'assigned_to', nameToWrite)
          leadsRenamed = ownedRows.length
        }
      }
    }

    const updates: Record<string, unknown> = {}
    if (nameToWrite !== undefined) updates.name = nameToWrite
    if (emailToWrite !== undefined) updates.email = emailToWrite
    if (passwordHashToWrite !== undefined) updates.password_hash = passwordHashToWrite
    if (can_assign !== undefined) updates.can_assign = can_assign
    if (active !== undefined) updates.active = active
    if (role !== undefined) updates.role = role
    if (in_lead_pool !== undefined) updates.in_lead_pool = in_lead_pool
    if (is_closer !== undefined) updates.is_closer = is_closer
    if (is_telecaller !== undefined) updates.is_telecaller = is_telecaller
    if (lead_pool_paused !== undefined) updates.lead_pool_paused = lead_pool_paused

    await updateUser(user_id, updates)
    return NextResponse.json({ success: true, data: { leads_renamed: leadsRenamed } })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

// DELETE /api/users
// Body: { user_id, reassign_leads_to?: string }
// Cascade cleanup:
//   - blocks self-delete
//   - blocks last-active-admin delete
//   - if user owns leads in the Sheet (assigned_to=name), requires reassign_leads_to
//   - reassigns Sheet leads to the new owner
//   - clears all lead_telecaller_assignments where deleted user is the telecaller
//   - clears auto-queue config if it pointed at the deleted user
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const { user_id, reassign_leads_to } = await req.json()
    if (!user_id) {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 400 })
    }

    if (user_id === user.id) {
      return NextResponse.json({ success: false, error: 'You cannot delete yourself.' }, { status: 400 })
    }

    const target = await getUserById(user_id)
    if (!target) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    // Block deleting the only active admin
    if (target.role === 'admin' && target.active) {
      const adminCount = await countAdmins()
      if (adminCount <= 1) {
        return NextResponse.json({ success: false, error: 'Cannot delete the only active admin.' }, { status: 400 })
      }
    }

    // If the user owns leads in the Sheet, require a reassign target
    const allLeads = await getLeads()
    const ownedLeadRows = allLeads
      .filter(l => l.assigned_to === target.name && !['CONVERTED', 'LOST'].includes(l.lead_status))
      .map(l => l.row_number)

    if (ownedLeadRows.length > 0) {
      if (!reassign_leads_to) {
        return NextResponse.json({
          success: false,
          requires_reassign: true,
          owned_leads: ownedLeadRows.length,
          error: `${target.name} owns ${ownedLeadRows.length} active lead(s). Pick a new owner to reassign them before deleting.`,
        }, { status: 409 })
      }
      // Validate reassign target exists and is active
      const allUsers = await getUsers()
      const newOwner = allUsers.find(u => u.name === reassign_leads_to && u.active)
      if (!newOwner) {
        return NextResponse.json({ success: false, error: `Reassign target "${reassign_leads_to}" not found or inactive.` }, { status: 400 })
      }
      // Reassign in one batch
      await bulkUpdateField(ownedLeadRows, 'assigned_to', reassign_leads_to)
    }

    // Cascade: clear telecaller assignments where deleted user is the telecaller
    const tcCleared = await clearAssignmentsForTelecaller(user_id)

    // Cascade: clear auto-queue config if it pointed at this user
    const autoQ = await getAutoQueueConfig()
    if (autoQ.user_id === user_id) {
      await setAutoQueueConfig({ enabled: false, user_id: '' })
    }

    // Finally remove the user
    await deleteUser(user_id)

    return NextResponse.json({
      success: true,
      data: {
        leads_reassigned: ownedLeadRows.length,
        telecaller_assignments_cleared: tcCleared,
        auto_queue_reset: autoQ.user_id === user_id,
      },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
