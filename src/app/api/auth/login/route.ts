import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { comparePassword, createSession, hashPassword } from '@/lib/auth'
import { getUserByEmail, getUsers, createUser } from '@/lib/users'

// --- Rate limiting ---
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

// Clean up stale entries every 30 minutes
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of loginAttempts) {
    if (now > record.resetAt) loginAttempts.delete(ip)
  }
}, 30 * 60 * 1000)

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = loginAttempts.get(ip)
  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (record.count >= MAX_ATTEMPTS) return false
  record.count++
  return true
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Try again in 15 minutes.' },
        { status: 429 }
      )
    }

    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password required' }, { status: 400 })
    }

    // Auto-seed admin on first login if no users exist
    const allUsers = await getUsers()
    if (allUsers.length === 0) {
      const adminName = process.env.ADMIN_NAME || 'Admin'
      const adminEmail = process.env.ADMIN_EMAIL
      const adminPassword = process.env.ADMIN_PASSWORD
      if (adminEmail && adminPassword) {
        await createUser({
          name: adminName,
          email: adminEmail,
          password_hash: await hashPassword(adminPassword),
          role: 'admin',
          can_assign: true,
          active: true,
          in_lead_pool: false,
          is_closer: false,
        })
      }
    }

    const user = await getUserByEmail(email)
    if (!user || !user.active) {
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await comparePassword(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 })
    }

    await createSession({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      can_assign: user.can_assign,
    })

    return NextResponse.json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email, role: user.role, can_assign: user.can_assign },
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: apiError(err, 'Login failed') }, { status: 500 })
  }
}
