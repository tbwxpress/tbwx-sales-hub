import { describe, it, expect } from 'vitest'
import { normalizePhone } from '../db'

describe('normalizePhone', () => {
  it('normalizes a 10-digit number to 91XXXXXXXXXX', () => {
    expect(normalizePhone('9876543210')).toBe('919876543210')
  })

  it('normalizes a 12-digit number starting with 91', () => {
    expect(normalizePhone('919876543210')).toBe('919876543210')
  })

  it('strips non-digit characters', () => {
    expect(normalizePhone('+91-98765-43210')).toBe('919876543210')
    expect(normalizePhone('+91 9876 543210')).toBe('919876543210')
  })

  it('handles phone with p: prefix (from Sheets)', () => {
    expect(normalizePhone('p:9876543210')).toBe('919876543210')
  })

  it('returns digits as-is if less than 10', () => {
    expect(normalizePhone('12345')).toBe('12345')
  })

  it('handles empty string', () => {
    expect(normalizePhone('')).toBe('')
  })
})
