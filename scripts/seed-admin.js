/**
 * Seed the first admin user into the SQLite/Turso database.
 * Run once: npm run seed-admin
 *
 * Reads all config from .env.local — including:
 *   ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
 */

const { createClient } = require('@libsql/client')
const bcrypt = require('bcryptjs')
const fs = require('fs')
const path = require('path')

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const [key, ...vals] = trimmed.split('=')
    env[key.trim()] = vals.join('=').trim()
  }
}

// Admin details from env
const ADMIN_NAME = env.ADMIN_NAME || 'Admin'
const ADMIN_EMAIL = env.ADMIN_EMAIL
const ADMIN_PASSWORD = env.ADMIN_PASSWORD

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('ERROR: ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env.local')
  console.error('See .env.example for the full list of required variables.')
  process.exit(1)
}

async function main() {
  const dbUrl = env.TURSO_DATABASE_URL || 'file:data/inbox.db'
  const authToken = env.TURSO_AUTH_TOKEN || undefined

  // Ensure data directory exists for local file mode
  if (dbUrl.startsWith('file:')) {
    const filePath = dbUrl.replace('file:', '')
    const dir = path.dirname(path.resolve(path.join(__dirname, '..'), filePath))
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }

  const db = createClient({ url: dbUrl, authToken })

  // Ensure users table exists
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent' CHECK(role IN ('admin', 'agent')),
      can_assign INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `)

  // Check if admin already exists
  const existing = await db.execute({
    sql: 'SELECT id FROM users WHERE role = ?',
    args: ['admin'],
  })

  if (existing.rows.length > 0) {
    console.log('Admin user already exists. Skipping.')
    return
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 12)

  await db.execute({
    sql: `INSERT INTO users (id, name, email, password_hash, role, can_assign, active)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: ['u_admin_1', ADMIN_NAME, ADMIN_EMAIL, hash, 'admin', 1, 1],
  })

  console.log('Admin user created!')
  console.log(`Email: ${ADMIN_EMAIL}`)
  console.log('IMPORTANT: Change this password after first login!')
}

main().catch(console.error)
