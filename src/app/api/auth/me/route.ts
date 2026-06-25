import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getUserById } from '@/lib/users'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 })
  }
  // Additively enrich the session with the user's current Guided Work Mode dials
  // (read fresh from DB so the nav can branch on mode without a re-login). Falls
  // back to safe Free-mode defaults if the lookup fails — existing consumers of
  // `data` (the session shape) keep working unchanged.
  let work_mode = 'free'
  let guided_surface = 'guided_free'
  let agent_role: string | null = null
  let daily_target = 40
  try {
    const fresh = await getUserById(session.id)
    if (fresh) {
      work_mode = fresh.work_mode
      guided_surface = fresh.guided_surface
      agent_role = fresh.agent_role
      daily_target = fresh.daily_target
    }
  } catch { /* non-critical — keep Free-mode defaults */ }

  return NextResponse.json({
    success: true,
    data: { ...session, work_mode, guided_surface, agent_role, daily_target },
  })
}
