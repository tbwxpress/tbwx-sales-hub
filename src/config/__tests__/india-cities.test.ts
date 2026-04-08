import { describe, it, expect } from 'vitest'
import { findCity, projectLatLng } from '../india-cities'

describe('findCity', () => {
  it('returns null for empty/null/whitespace input', () => {
    expect(findCity('')).toBeNull()
    expect(findCity('   ')).toBeNull()
  })

  it('finds a city by exact case-insensitive match', () => {
    expect(findCity('Mumbai')?.name).toBe('Mumbai')
    expect(findCity('mumbai')?.name).toBe('Mumbai')
    expect(findCity('MUMBAI')?.name).toBe('Mumbai')
  })

  it('resolves known aliases', () => {
    expect(findCity('vizag')?.name).toBe('Visakhapatnam')
    expect(findCity('calcutta')?.name).toBe('Kolkata')
    expect(findCity('blr')?.name).toBe('Bangalore')
    expect(findCity('madras')?.name).toBe('Chennai')
    expect(findCity('baroda')?.name).toBe('Vadodara')
  })

  it('handles misspellings via partial alias', () => {
    expect(findCity('banglore')?.name).toBe('Bangalore')
    expect(findCity('gurgoan')?.name).toBe('Gurgaon')
  })

  it('handles area names within cities', () => {
    expect(findCity('whitefield')?.name).toBe('Bangalore')
    expect(findCity('hinjewadi')?.name).toBe('Pune')
    expect(findCity('ncr')?.name).toBe('Delhi')
  })

  it('returns null for unknown cities', () => {
    expect(findCity('Xanadu City')).toBeNull()
    expect(findCity('zzzzz')).toBeNull()
  })

  it('handles "New Delhi" and "Delhi" variants', () => {
    // "New Delhi" is a separate entry that matches first via exact match
    const nd = findCity('new delhi')
    expect(nd).not.toBeNull()
    expect(['Delhi', 'New Delhi']).toContain(nd!.name)
    expect(findCity('delhi ncr')?.name).toBe('Delhi')
    expect(findCity('south delhi')?.name).toBe('Delhi')
  })
})

describe('projectLatLng', () => {
  it('maps southern India below northern India', () => {
    const south = projectLatLng(8.08, 77.5, 500, 600)
    const north = projectLatLng(34, 74, 500, 600)
    expect(south.y).toBeGreaterThan(north.y) // south = larger y in SVG
  })

  it('maps western India left of eastern India', () => {
    const west = projectLatLng(23, 68, 500, 600)
    const east = projectLatLng(23, 95, 500, 600)
    expect(west.x).toBeLessThan(east.x)
  })
})
