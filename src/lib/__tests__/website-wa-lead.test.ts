import { describe, it, expect } from 'vitest'
import { isFranchiseIntent, parsePrefill } from '../website-wa-lead'

describe('isFranchiseIntent', () => {
  it('matches every website prefill family', () => {
    // InlineLeadCTA / ApplyForm style structured prefill
    expect(isFranchiseIntent(
      "Hi TBWX! I'm interested in learning more about the franchise.\nName: Rahul Sharma\nCity: Jaipur\n(via Franchise Page)",
    )).toBe(true)
    // Footer / international CTA
    expect(isFranchiseIntent('Hello, I want to discuss a TBWX partnership opportunity')).toBe(true)
    // Bare "interested in learning more" prefill
    expect(isFranchiseIntent("Hi! I'm Interested in Learning More")).toBe(true)
    // Organic opener typed by hand
    expect(isFranchiseIntent('FRANCHISE details please')).toBe(true)
  })

  it('never fires on ordinary customer chats', () => {
    expect(isFranchiseIntent('Where is my waffle order?')).toBe(false)
    expect(isFranchiseIntent('Hi, do you deliver in Sector 70?')).toBe(false)
    expect(isFranchiseIntent('Yes')).toBe(false)
    expect(isFranchiseIntent('')).toBe(false)
    expect(isFranchiseIntent(undefined as unknown as string)).toBe(false)
  })
})

describe('parsePrefill', () => {
  it('extracts name, city and via from structured prefills', () => {
    const p = parsePrefill(
      "Hi TBWX! I'm interested in learning more about the franchise.\nName: Rahul Sharma\nCity: Jaipur\n(via Franchise Page)",
    )
    expect(p.name).toBe('Rahul Sharma')
    expect(p.city).toBe('Jaipur')
    expect(p.via).toBe('Franchise Page')
  })

  it('handles partial and unstructured messages', () => {
    expect(parsePrefill('franchise info please')).toEqual({})
    const partial = parsePrefill('Name: Asha\nfranchise please')
    expect(partial.name).toBe('Asha')
    expect(partial.city).toBeUndefined()
  })

  it('is case-insensitive and trims values', () => {
    const p = parsePrefill('NAME:  Vikram Singh \nCITY:  Ludhiana ')
    expect(p.name).toBe('Vikram Singh')
    expect(p.city).toBe('Ludhiana')
  })
})
