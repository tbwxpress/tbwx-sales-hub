import { SignJWT, jwtVerify } from 'jose'
import { hash, compare } from 'bcryptjs'
import { cookies } from 'next/headers'
import type { SessionUser } from './types'
import { AUTH } from '@/config/client'

function getJwtSecret() {
  if (!process.env.JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is required')
  return new TextEncoder().encode(process.env.JWT_SECRET)
}
const COOKIE_NAME = AUTH.cookieName

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12)
}

export async function comparePassword(password: string, hashed: string): Promise<boolean> {
  return compare(password, hashed)
}

export async function createSession(user: SessionUser): Promise<string> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .setIssuedAt()
    .sign(getJwtSecret())

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })

  return token
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    return {
      id: payload.id as string,
      name: payload.name as string,
      email: payload.email as string,
      role: payload.role as SessionUser['role'],
      can_assign: payload.can_assign as boolean,
    }
  } catch {
    return null
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

export function requireAdmin(user: SessionUser | null): void {
  if (!user || user.role !== 'admin') {
    throw new Error('Admin access required')
  }
}

export function requireAuth(user: SessionUser | null): SessionUser {
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}
