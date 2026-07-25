import { describe, it, expect } from 'vitest'
import {
  BAND_SIZE, defaultFormSource, resolveSourceForRow, sheetRowFor, pkFor,
  colMapFor, writeColsFor, buildFormAnswers, type FormSource,
} from '../form-sources'
import { LEAD_COLUMN_MAP, LEAD_WRITE_COLUMNS } from '@/config/client'

function src(overrides: Partial<FormSource>): FormSource {
  return { ...defaultFormSource(), ...overrides }
}

describe('form-sources band resolution', () => {
  const primary = src({ id: 1, row_offset: 0, tab_name: 'AI Campaign Leads' })
  const second = src({ id: 2, row_offset: BAND_SIZE, tab_name: 'Form V2' })
  const third = src({ id: 3, row_offset: 2 * BAND_SIZE, tab_name: 'Form V3' })
  const sources = [primary, second, third]

  it('routes existing lead keys to the primary band', () => {
    expect(resolveSourceForRow(sources, 2)?.tab_name).toBe('AI Campaign Leads')
    expect(resolveSourceForRow(sources, 5197)?.tab_name).toBe('AI Campaign Leads')
    expect(resolveSourceForRow(sources, BAND_SIZE - 1)?.tab_name).toBe('AI Campaign Leads')
  })

  it('routes offset bands to their own source', () => {
    expect(resolveSourceForRow(sources, BAND_SIZE)?.tab_name).toBe('Form V2')
    expect(resolveSourceForRow(sources, BAND_SIZE + 42)?.tab_name).toBe('Form V2')
    expect(resolveSourceForRow(sources, 2 * BAND_SIZE + 7)?.tab_name).toBe('Form V3')
  })

  it('returns null beyond every band', () => {
    expect(resolveSourceForRow(sources, 3 * BAND_SIZE)).toBeNull()
    expect(resolveSourceForRow([], 5)).toBeNull()
  })

  it('pkFor and sheetRowFor are exact inverses', () => {
    for (const s of sources) {
      for (const sheetRow of [2, 999, 43210]) {
        const pk = pkFor(s, sheetRow)
        expect(sheetRowFor(s, pk)).toBe(sheetRow)
        expect(resolveSourceForRow(sources, pk)?.id).toBe(s.id)
      }
    }
  })

  it('a second-band lead never collides with a primary-band lead', () => {
    // Sheet row 2 exists in BOTH tabs — keys must differ.
    expect(pkFor(primary, 2)).not.toBe(pkFor(second, 2))
  })
})

describe('form-sources column maps', () => {
  it('falls back to the built-in maps (pre-registry behavior)', () => {
    const s = defaultFormSource()
    expect(colMapFor(s)).toBe(LEAD_COLUMN_MAP)
    expect(writeColsFor(s)).toBe(LEAD_WRITE_COLUMNS)
    expect(s.row_offset).toBe(0)
  })

  it('uses per-source maps when provided', () => {
    const s = src({
      col_map: { full_name: 3, phone: 4 },
      write_cols: { lead_status: 'Q' },
    })
    expect(colMapFor(s).full_name).toBe(3)
    expect(writeColsFor(s).lead_status).toBe('Q')
  })
})

describe('buildFormAnswers', () => {
  const row = ['x', 'x', 'x', 'x', 'x', 'x', 'x', 'x', 'f:123', 'Form V2', 'false', 'fb',
    'Rs 4-6L', 'Yes — running an outlet', 'within_30_days', 'Test Name']

  it('captures declared questions verbatim as JSON', () => {
    const s = src({
      questions: { 'Investment?': 12, 'Experience?': 13, 'When?': 14 },
    })
    const parsed = JSON.parse(buildFormAnswers(row, s))
    expect(parsed).toEqual({
      'Investment?': 'Rs 4-6L',
      'Experience?': 'Yes — running an outlet',
      'When?': 'within_30_days',
    })
  })

  it('drops blank answers and returns empty string when nothing captured', () => {
    const s = src({ questions: { 'Missing col': 25, 'Blank col': 20 } })
    expect(buildFormAnswers([...row, ''], s)).toBe('')
  })

  it('returns empty string when the source declares no questions', () => {
    expect(buildFormAnswers(row, src({ questions: null }))).toBe('')
  })
})
