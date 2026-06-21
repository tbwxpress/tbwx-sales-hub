import { apiError } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { getSession, requireAuth } from '@/lib/auth'
import { getTablePrefs, setTablePrefs, type TableColumnPref } from '@/lib/db'

// GET /api/table-prefs?table=leads — the current user's column prefs for a table.
// Returns { columns: [...] | null } (null = no saved prefs yet).
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const tableKey = new URL(req.url).searchParams.get('table') || ''
    if (!tableKey) {
      return NextResponse.json({ error: 'table is required' }, { status: 400 })
    }
    const columns = await getTablePrefs(user.id, tableKey)
    return NextResponse.json({ columns })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to load table prefs') }, { status: 500 })
  }
}

// PUT /api/table-prefs — save column order + visibility.
// Body: { table: string, columns: { key, visible }[] }.
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession()
    const user = requireAuth(session)
    const body = await req.json()
    const tableKey = String(body?.table || '')
    if (!tableKey) {
      return NextResponse.json({ error: 'table is required' }, { status: 400 })
    }
    if (!Array.isArray(body?.columns)) {
      return NextResponse.json({ error: 'columns must be an array' }, { status: 400 })
    }
    const columns: TableColumnPref[] = body.columns.map((c: Record<string, unknown>) => ({
      key: String(c?.key || ''),
      visible: Boolean(c?.visible),
    }))
    await setTablePrefs(user.id, tableKey, columns)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: apiError(err, 'Failed to save table prefs') }, { status: 500 })
  }
}
