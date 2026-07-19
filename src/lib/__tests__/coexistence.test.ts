import { describe, it, expect } from 'vitest'
import {
  isMainLineId,
  extractMessageText,
  waTsToIso,
  historyDirection,
  buildEsDialogUrl,
} from '../coexistence'

describe('isMainLineId', () => {
  it('treats the configured main number as main', () => {
    expect(isMainLineId('940321572508130', '940321572508130')).toBe(true)
  })
  it('treats a different (coexistence) line as NOT main', () => {
    expect(isMainLineId('111111111111111', '940321572508130')).toBe(false)
  })
  it('falls back to main when metadata is missing (legacy payloads)', () => {
    expect(isMainLineId('', '940321572508130')).toBe(true)
  })
  it('falls back to main when env is unset (never disables prod automations)', () => {
    expect(isMainLineId('111111111111111', undefined)).toBe(true)
    expect(isMainLineId('111111111111111', '')).toBe(true)
  })
})

describe('extractMessageText', () => {
  it('extracts text body', () => {
    expect(extractMessageText({ type: 'text', text: { body: 'hello' } })).toBe('hello')
  })
  it('extracts image caption', () => {
    expect(extractMessageText({ type: 'image', image: { caption: 'menu card' } })).toBe('[Image] menu card')
  })
  it('extracts document filename', () => {
    expect(extractMessageText({ type: 'document', document: { filename: 'deck.pdf' } })).toBe('[Document] deck.pdf')
  })
  it('extracts button reply', () => {
    expect(extractMessageText({ type: 'button', button: { text: 'Call me back' } })).toBe('Call me back')
  })
  it('extracts interactive list reply', () => {
    expect(extractMessageText({ type: 'interactive', interactive: { list_reply: { title: 'Franchise info' } } })).toBe('Franchise info')
  })
  it('degrades gracefully on unknown types and garbage', () => {
    expect(extractMessageText({ type: 'ephemeral' })).toBe('[ephemeral message]')
    expect(extractMessageText({})).toBe('[Unknown message]')
    expect(extractMessageText(null)).toBe('[Unknown message]')
  })
})

describe('waTsToIso', () => {
  it('converts epoch seconds', () => {
    expect(waTsToIso('1752900000')).toBe(new Date(1752900000 * 1000).toISOString())
  })
  it('passes through epoch millis', () => {
    expect(waTsToIso(1752900000000)).toBe(new Date(1752900000000).toISOString())
  })
  it('returns a valid date for garbage instead of Invalid Date', () => {
    const iso = waTsToIso('not-a-number')
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false)
  })
})

describe('historyDirection', () => {
  it('marks messages FROM the customer as received', () => {
    expect(historyDirection('919876543210', '919876543210')).toBe('received')
  })
  it('marks messages from the business line as sent', () => {
    expect(historyDirection('917973933630', '919876543210')).toBe('sent')
  })
  it('survives +91 / 91 / bare formatting drift (last-10-digit match)', () => {
    expect(historyDirection('+91 98765 43210', '919876543210')).toBe('received')
    expect(historyDirection('09876543210', '919876543210')).toBe('received')
  })
  it('defaults to received when fields are missing (never fabricates agent sends)', () => {
    expect(historyDirection(undefined, '919876543210')).toBe('received')
    expect(historyDirection('919876543210', undefined)).toBe('received')
  })
})

describe('buildEsDialogUrl', () => {
  it('builds the coexistence oauth dialog with the right feature flags', () => {
    const url = buildEsDialogUrl('4336103659981071', '123456789')
    expect(url).toContain('https://www.facebook.com/v23.0/dialog/oauth')
    expect(url).toContain('client_id=4336103659981071')
    expect(url).toContain('config_id=123456789')
    expect(url).toContain('response_type=code')
    expect(url).toContain('override_default_response_type=true')
    const extras = decodeURIComponent(url.split('extras=')[1])
    expect(JSON.parse(extras)).toEqual({
      setup: {},
      featureType: 'whatsapp_business_app_onboarding',
      sessionInfoVersion: '3',
    })
  })
})
