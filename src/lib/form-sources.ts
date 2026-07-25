/**
 * Form-source registry — makes lead forms a first-class concept.
 *
 * Each Meta lead form writes into its own tab of the leads spreadsheet
 * (Meta's Sheets integration creates one tab per form — see tabs F2/F3/F4
 * for retired forms). The Hub historically hardcoded ONE tab and used the
 * sheet row number as the lead primary key everywhere. This registry lets
 * any number of form tabs feed the Hub at once:
 *
 *  - every source (tab) owns a disjoint row-number BAND of 100k
 *    (source A: 0-99,999 · source B: 100,000-199,999 · …), so sheet row
 *    numbers restarting at 1 in a new tab can never collide as lead keys
 *  - every source carries its own column map (different forms ask
 *    different questions → different layouts)
 *  - every source can declare its question columns, captured verbatim per
 *    lead into leads.form_answers (JSON) so the UI shows exactly what THAT
 *    lead's form asked, labeled — regardless of which form it was
 *
 * The registry lives in the form_sources table. When it's empty (or the DB
 * is unreachable) everything falls back to a synthetic default source that
 * reproduces the pre-registry behavior exactly: env-configured tab, offset
 * 0, the built-in column maps. Deploying this module changes NOTHING until
 * a second source is registered.
 */

import { LEAD_COLUMN_MAP, LEAD_WRITE_COLUMNS, SHEETS } from '@/config/client'
import { ensureInit } from './db'

export const BAND_SIZE = 100_000

export interface FormSource {
  id: number
  tab_name: string
  sheet_gid: number
  form_id: string
  form_name: string
  row_offset: number
  /** How far right the tab's data extends, e.g. 'AC'. */
  range_end: string
  /** Lead field name → 0-based column index. null = built-in LEAD_COLUMN_MAP. */
  col_map: Record<string, number> | null
  /** Lead field name → column letter for mirror writes. null = built-in LEAD_WRITE_COLUMNS. */
  write_cols: Record<string, string> | null
  /** Question label → 0-based column index (captured into form_answers JSON). */
  questions: Record<string, number> | null
  active: boolean
}

// The current form's questions — used by the synthetic default source so
// newly-synced leads on the original tab also carry per-lead form answers.
const DEFAULT_QUESTIONS: Record<string, number> = {
  'What TBWX model interests you?': 12,
  'Do you have food business experience?': 13,
  'When do you plan to start?': 14,
}

/** Pre-registry behavior, byte for byte: env tab, offset 0, built-in maps. */
export function defaultFormSource(): FormSource {
  return {
    id: 0,
    tab_name: process.env.LEADS_TAB_NAME || SHEETS.tabs.leads,
    sheet_gid: 0,
    form_id: '',
    form_name: '',
    row_offset: 0,
    range_end: SHEETS.ranges.leadsEnd,
    col_map: null,
    write_cols: null,
    questions: DEFAULT_QUESTIONS,
    active: true,
  }
}

function parseJsonOrNull<T>(raw: unknown): T | null {
  const s = raw === null || raw === undefined ? '' : String(raw)
  if (!s.trim()) return null
  try { return JSON.parse(s) as T } catch { return null }
}

function rowToSource(r: Record<string, unknown>): FormSource {
  return {
    id: Number(r.id),
    tab_name: String(r.tab_name || ''),
    sheet_gid: Number(r.sheet_gid ?? 0),
    form_id: String(r.form_id || ''),
    form_name: String(r.form_name || ''),
    row_offset: Number(r.row_offset ?? 0),
    range_end: String(r.range_end || SHEETS.ranges.leadsEnd),
    col_map: parseJsonOrNull<Record<string, number>>(r.col_map),
    write_cols: parseJsonOrNull<Record<string, string>>(r.write_cols),
    questions: parseJsonOrNull<Record<string, number>>(r.questions),
    active: Number(r.active ?? 1) === 1,
  }
}

// 60s registry cache — sources change rarely (only when a new form launches).
let _sourcesCache: { list: FormSource[]; ts: number } | null = null
const SOURCES_CACHE_TTL_MS = 60_000

export function invalidateFormSourcesCache(): void {
  _sourcesCache = null
}

/**
 * Active sources, offset-ascending. Never throws and never returns [] —
 * on an empty registry or a DB error it returns the synthetic default so
 * lead sync can never stall.
 */
export async function getActiveFormSources(): Promise<FormSource[]> {
  if (_sourcesCache && Date.now() - _sourcesCache.ts < SOURCES_CACHE_TTL_MS) {
    return _sourcesCache.list
  }
  try {
    const db = await ensureInit()
    const res = await db.execute(
      'SELECT * FROM form_sources WHERE active = 1 ORDER BY row_offset ASC',
    )
    let list = res.rows.map(r => rowToSource(r as unknown as Record<string, unknown>))
    const zero = list.find(s => s.row_offset === 0)
    if (!zero) {
      // Registry has no primary source (fresh table) — behave exactly as
      // before the registry existed.
      list = [defaultFormSource(), ...list]
    } else if (zero.tab_name !== defaultFormSource().tab_name) {
      // A DB row now owns the offset-0 band with a DIFFERENT tab than the
      // env default — deliberate override or a misconfiguration. Loud either way.
      console.warn(
        `[form-sources] registry overrides the primary tab: "${zero.tab_name}" (env default "${defaultFormSource().tab_name}")`,
      )
    }
    _sourcesCache = { list, ts: Date.now() }
    return list
  } catch (err) {
    console.error('[form-sources] registry read failed; using default source:', err)
    return [defaultFormSource()]
  }
}

/** Register a new form tab. Next free 100k band is assigned automatically. */
export async function addFormSource(input: {
  tab_name: string
  sheet_gid?: number
  form_id?: string
  form_name?: string
  range_end?: string
  col_map?: Record<string, number>
  write_cols?: Record<string, string>
  questions?: Record<string, number>
}): Promise<FormSource> {
  const db = await ensureInit()
  // Atomic offset assignment: computing MAX and inserting in ONE statement so
  // two concurrent registrations can never race to the same band (the UNIQUE
  // constraint on row_offset is the belt; this is the suspenders).
  await db.execute({
    sql: `INSERT INTO form_sources
            (tab_name, sheet_gid, form_id, form_name, row_offset, range_end, col_map, write_cols, questions, active)
          SELECT ?, ?, ?, ?, COALESCE(MAX(row_offset), 0) + ${BAND_SIZE}, ?, ?, ?, ?, 1 FROM form_sources`,
    args: [
      input.tab_name,
      input.sheet_gid ?? 0,
      input.form_id ?? '',
      input.form_name ?? '',
      input.range_end ?? SHEETS.ranges.leadsEnd,
      input.col_map ? JSON.stringify(input.col_map) : '',
      input.write_cols ? JSON.stringify(input.write_cols) : '',
      input.questions ? JSON.stringify(input.questions) : '',
    ],
  })
  invalidateFormSourcesCache()
  const res = await db.execute('SELECT * FROM form_sources ORDER BY row_offset DESC LIMIT 1')
  return rowToSource(res.rows[0] as unknown as Record<string, unknown>)
}

// ─── Pure helpers (unit-tested) ─────────────────────────────────────

/** Which source owns this lead primary key? (bands are disjoint 100k ranges) */
export function resolveSourceForRow(sources: FormSource[], rowNumber: number): FormSource | null {
  for (const s of sources) {
    if (rowNumber >= s.row_offset && rowNumber < s.row_offset + BAND_SIZE) return s
  }
  return null
}

/** Lead primary key → actual row number in the source's sheet tab. */
export function sheetRowFor(source: FormSource, rowNumber: number): number {
  return rowNumber - source.row_offset
}

/** Actual sheet row number → lead primary key. */
export function pkFor(source: FormSource, sheetRow: number): number {
  return source.row_offset + sheetRow
}

/** Effective column map for reading a source's rows. */
export function colMapFor(source: FormSource): Record<string, number> {
  return source.col_map ?? LEAD_COLUMN_MAP
}

/** Effective write-column letters for mirroring edits back to the tab. */
export function writeColsFor(source: FormSource): Record<string, string> {
  return source.write_cols ?? LEAD_WRITE_COLUMNS
}

/**
 * Capture the source's declared questions verbatim from a sheet row into a
 * compact JSON string ('' when the source declares none / all blank).
 */
export function buildFormAnswers(row: string[], source: FormSource): string {
  if (!source.questions) return ''
  const out: Record<string, string> = {}
  for (const [label, idx] of Object.entries(source.questions)) {
    const v = (row[idx] ?? '').trim()
    if (v) out[label] = v
  }
  return Object.keys(out).length ? JSON.stringify(out) : ''
}
