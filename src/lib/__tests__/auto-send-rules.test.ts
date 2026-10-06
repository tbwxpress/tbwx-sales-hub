import { describe, it, expect } from 'vitest'
import {
  isAutoSendEligible,
  templateAlreadySent,
  waMessageIdToWrite,
  isRealWaMessageId,
} from '../auto-send-rules'

/**
 * Auto-send fires the first WhatsApp touch on a fresh lead. Getting these
 * rules wrong either spams someone (a second opt-in) or rewrites an agent's
 * pipeline (a custom stage reset to DECK_SENT).
 */

describe('isAutoSendEligible', () => {
  it('takes NEW leads, and blank status on the legacy tab', () => {
    expect(isAutoSendEligible({ lead_status: 'NEW' })).toBe(true)
    expect(isAutoSendEligible({ lead_status: 'new' })).toBe(true)
    expect(isAutoSendEligible({ lead_status: '' })).toBe(true)
  })

  it('skips every handled status, ARCHIVED included', () => {
    for (const s of ['DECK_SENT', 'REPLIED', 'NO_RESPONSE', 'CALL_DONE_INTERESTED', 'HOT',
      'FINAL_NEGOTIATION', 'CONVERTED', 'DELAYED', 'LOST', 'ARCHIVED', 'contacted', 'calling']) {
      expect(isAutoSendEligible({ lead_status: s })).toBe(false)
    }
  })

  it('skips admin-created custom stages (they used to be reset to DECK_SENT)', () => {
    expect(isAutoSendEligible({ lead_status: 'SITE_VISIT_BOOKED' })).toBe(false)
  })

  it('skips merged duplicates even when they say NEW', () => {
    expect(isAutoSendEligible({ lead_status: 'NEW', merged_into: 4200 })).toBe(false)
  })
})

describe('templateAlreadySent', () => {
  const now = new Date('2026-12-10T12:00:00Z')
  const optin = (timestamp: string, status = 'sent') => ({ template_used: 'optin_v1', status, timestamp })

  it('a second enquiry 2 days after the first does NOT get a second opt-in', () => {
    // Opt-in went out for enquiry #1, BEFORE enquiry #2 was made.
    const sent = [optin('2026-12-08T09:00:00Z')]
    expect(templateAlreadySent(sent, 'optin_v1', { enquiryCutoff: '2026-12-10T08:00:00Z', now })).toBe(true)
  })

  it('a comeback months later DOES get the opt-in again', () => {
    const sent = [optin('2026-08-01T09:00:00Z')]
    expect(templateAlreadySent(sent, 'optin_v1', { enquiryCutoff: '2026-12-10T08:00:00Z', now })).toBe(false)
  })

  it('counts a send after the enquiry, however old the enquiry', () => {
    const sent = [optin('2026-11-01T09:05:00Z')]
    expect(templateAlreadySent(sent, 'optin_v1', { enquiryCutoff: '2026-11-01T09:00:00Z', now })).toBe(true)
  })

  it('compares instants, not strings, when the enquiry time carries an offset', () => {
    // 14:00 IST = 08:30 UTC; the send at 09:00 UTC is AFTER it.
    const sent = [optin('2026-11-01T09:00:00Z')]
    expect(templateAlreadySent(sent, 'optin_v1', { enquiryCutoff: '2026-11-01T14:00:00+05:30', now })).toBe(true)
  })

  it('with no enquiry cutoff, any earlier send counts', () => {
    expect(templateAlreadySent([optin('2025-01-01T00:00:00Z')], 'optin_v1', { now })).toBe(true)
  })

  it('ignores other templates, and failed sends when asked', () => {
    const sent = [{ template_used: 'deck_v2', status: 'failed', timestamp: '2026-12-09T00:00:00Z' }]
    expect(templateAlreadySent(sent, 'optin_v1', { now })).toBe(false)
    expect(templateAlreadySent(sent, 'deck_v2', { now, ignoreFailed: true })).toBe(false)
    expect(templateAlreadySent(sent, 'deck_v2', { now })).toBe(true)
  })
})

describe('waMessageIdToWrite', () => {
  it('never replaces a real WhatsApp id with a placeholder', () => {
    expect(waMessageIdToWrite('wamid.HBgM123', 'already-sent')).toBeUndefined()
    expect(waMessageIdToWrite('wamid.HBgM123', 'deck-already-sent')).toBeUndefined()
  })

  it('writes a placeholder when there is no real id yet', () => {
    expect(waMessageIdToWrite('', 'already-sent')).toBe('already-sent')
    expect(waMessageIdToWrite(undefined, 'deck-already-sent')).toBe('deck-already-sent')
  })

  it('always writes a fresh real id', () => {
    expect(waMessageIdToWrite('wamid.OLD', 'wamid.NEW')).toBe('wamid.NEW')
  })

  it('recognises real ids by their wamid. prefix', () => {
    expect(isRealWaMessageId('wamid.X')).toBe(true)
    expect(isRealWaMessageId('already-sent')).toBe(false)
    expect(isRealWaMessageId(null)).toBe(false)
  })
})
