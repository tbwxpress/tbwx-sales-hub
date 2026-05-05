import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { getSession, requireAuth, requireAdmin } from '@/lib/auth'
import { getAutoQueueConfig, setAutoQueueConfig } from '@/lib/telecaller'
import { getUserById } from '@/lib/users'

export async function GET() {
  try {
    const session = await getSession()
    requireAuth(session)
    const config = await getAutoQueueConfig()
    return NextResponse.json({ success: true, data: config })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    requireAdmin(user)

    const { enabled, user_id, statuses } = await req.json()
    const partial: { enabled?: boolean; user_id?: string; statuses?: string[] } = {}
    if (typeof enabled === 'boolean') partial.enabled = enabled
    if (typeof user_id === 'string') partial.user_id = user_id
    if (Array.isArray(statuses)) partial.statuses = statuses.filter(s => typeof s === 'string')

    // Validate the target user is a real, active telecaller before turning auto-queue on
    if (partial.enabled && partial.user_id) {
      const target = await getUserById(partial.user_id)
      if (!target) {
        return NextResponse.json({ success: false, error: 'Auto-queue target user not found.' }, { status: 400 })
      }
      if (!target.is_telecaller) {
        return NextResponse.json({ success: false, error: `${target.name} is not a Telecaller. Change their Type to Telecaller first.` }, { status: 400 })
      }
      if (!target.active) {
        return NextResponse.json({ success: false, error: `${target.name} is inactive. Activate them or pick a different telecaller.` }, { status: 400 })
      }
    }

    await setAutoQueueConfig(partial)
    const config = await getAutoQueueConfig()
    return NextResponse.json({ success: true, data: config })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Failed') }, { status: 500 })
  }
}
