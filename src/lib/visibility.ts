import { getLeads } from './sheets'
import { getActiveDelegationsFor, getOptedOutPhones } from './db'
import { getTelecallerVisibleLeadRows } from './telecaller'
import { getUserByEmail } from './users'
import type { SessionUser } from './types'

// Single source of truth for "which leads can this user see?"
// Mirrors the visibility model used by /api/leads so the inbox and the
// leads list never drift. Returns null for admins (they see everything —
// callers should treat null as "no filter").
export async function getAgentVisiblePhones(user: SessionUser): Promise<string[] | null> {
  if (user.role !== 'agent') return null

  // Live is_telecaller from DB — the JWT may be stale after an admin toggle.
  let liveIsTelecaller = Boolean(user.is_telecaller)
  try {
    const u = await getUserByEmail(user.email)
    if (u) liveIsTelecaller = u.is_telecaller
  } catch { /* fall back to JWT value */ }

  const leads = await getLeads()

  if (liveIsTelecaller) {
    const optedOutPhones = await getOptedOutPhones()
    const visibleRows = await getTelecallerVisibleLeadRows({
      telecallerUserId: user.id,
      leads: leads.map(l => ({ row_number: l.row_number, lead_status: l.lead_status, phone: l.phone })),
      optedOutPhones,
    })
    return leads.filter(l => visibleRows.has(l.row_number)).map(l => l.phone)
  }

  const activeDelegations = await getActiveDelegationsFor(user.id)
  const delegatedRows = new Set(activeDelegations.map(d => d.lead_row))
  return leads
    .filter(l =>
      l.assigned_to === user.name ||
      (user.can_assign && !l.assigned_to) ||
      delegatedRows.has(l.row_number)
    )
    .map(l => l.phone)
}
