import { describe, it, expect } from 'vitest'
import { findCity, projectLatLng, isKnownForeign, isJunkCityValue } from '../india-cities'

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

  it('handles internal-space variants of single-word canonical names', () => {
    expect(findCity('Dehra Dun')?.name).toBe('Dehradun')
    expect(findCity('Dehra  Dun')?.name).toBe('Dehradun')  // multiple spaces
    expect(findCity('DEHRA DUN')?.name).toBe('Dehradun')
  })

  it('matches newly-added tier-2 cities', () => {
    expect(findCity('Chandrapur')?.name).toBe('Chandrapur')
    expect(findCity('Darbhanga')?.name).toBe('Darbhanga')
    expect(findCity('Latur')?.name).toBe('Latur')
    expect(findCity('Bhilai')?.name).toBe('Bhilai')
  })

  it('routes Puducherry to its own coordinates, not Chennai', () => {
    expect(findCity('Puducherry')?.name).toBe('Puducherry')
    expect(findCity('Pondicherry')?.name).toBe('Puducherry')
  })

  it('handles "New Delhi" and "Delhi" variants', () => {
    // "New Delhi" is a separate entry that matches first via exact match
    const nd = findCity('new delhi')
    expect(nd).not.toBeNull()
    expect(['Delhi', 'New Delhi']).toContain(nd!.name)
    expect(findCity('delhi ncr')?.name).toBe('Delhi')
    expect(findCity('south delhi')?.name).toBe('Delhi')
  })

  it('matches all the missing tier-2 cities from the latest unmapped list', () => {
    expect(findCity('Amravati')?.name).toBe('Amravati')
    expect(findCity('Gurdaspur')?.name).toBe('Gurdaspur')
    expect(findCity('Muzaffarnagar')?.name).toBe('Muzaffarnagar')
    expect(findCity('Panvel')?.name).toBe('Panvel')
    expect(findCity('Ulhasnagar')?.name).toBe('Ulhasnagar')
    expect(findCity('Dharwad')?.name).toBe('Dharwad')
    expect(findCity('Banswara')?.name).toBe('Banswara')
    expect(findCity('Valsad')?.name).toBe('Valsad')
    expect(findCity('Roorkee')?.name).toBe('Roorkee')
    expect(findCity('Malegaon')?.name).toBe('Malegaon')
    expect(findCity('Bhiwandi')?.name).toBe('Bhiwandi')
    expect(findCity('Gohana')?.name).toBe('Gohana')
  })

  it('resolves common misspellings of existing cities', () => {
    expect(findCity('Gauhati')?.name).toBe('Guwahati')
    expect(findCity('ahemdabad')?.name).toBe('Ahmedabad')
    expect(findCity('amdavad')?.name).toBe('Ahmedabad')
  })

  it('matches the third-batch tier-2/3 cities', () => {
    expect(findCity('Modasa')?.name).toBe('Modasa')
    expect(findCity('Kangra')?.name).toBe('Kangra')
    expect(findCity('Pinjore')?.name).toBe('Pinjore')
    expect(findCity('Hardoi')?.name).toBe('Hardoi')
    expect(findCity('Jind')?.name).toBe('Jind')
    expect(findCity('Gulbarga')?.name).toBe('Gulbarga')
    expect(findCity('Kalaburagi')?.name).toBe('Gulbarga')  // modern name alias
    expect(findCity('Balangir')?.name).toBe('Balangir')
    expect(findCity('Manali')?.name).toBe('Manali')
    expect(findCity('Mau')?.name).toBe('Mau')
    expect(findCity('Maunath Bhanjan')?.name).toBe('Mau')
    expect(findCity('Palwal')?.name).toBe('Palwal')
    expect(findCity('Khandwa')?.name).toBe('Khandwa')
    expect(findCity('Anantnag')?.name).toBe('Anantnag')
    expect(findCity('Lko')?.name).toBe('Lucknow')
  })

  it('routes state names to their capital city', () => {
    expect(findCity('Bihar')?.name).toBe('Patna')
    expect(findCity('Maharashtra')?.name).toBe('Mumbai')
    expect(findCity('Karnataka')?.name).toBe('Bangalore')
    expect(findCity('Tamil Nadu')?.name).toBe('Chennai')
    expect(findCity('Uttar Pradesh')?.name).toBe('Lucknow')
    expect(findCity('UP')?.name).toBe('Lucknow')
  })

  it('matches the fourth-batch tier-2/3 cities', () => {
    expect(findCity('Sambhal')?.name).toBe('Sambhal')
    expect(findCity('Amroha')?.name).toBe('Amroha')
    expect(findCity('Shamli')?.name).toBe('Shamli')
    expect(findCity('Mundra')?.name).toBe('Mundra')
    expect(findCity('Pilani')?.name).toBe('Pilani')
    expect(findCity('Jhunjhunu')?.name).toBe('Jhunjhunu')
    expect(findCity('Gandhidham')?.name).toBe('Gandhidham')
    expect(findCity('Haflong')?.name).toBe('Haflong')
    expect(findCity('Ambajogai')?.name).toBe('Ambajogai')
    expect(findCity('Pinarayi')?.name).toBe('Pinarayi')
    expect(findCity('Tumkunta')?.name).toBe('Tumkunta')
  })

  it('resolves Panjim and bangluru via alias', () => {
    expect(findCity('Panjim')?.name).toBe('Panaji')
    expect(findCity('bangluru')?.name).toBe('Bangalore')
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

describe('isKnownForeign', () => {
  it('returns true for known foreign cities (case-insensitive)', () => {
    expect(isKnownForeign('Dubai')).toBe(true)
    expect(isKnownForeign('dubai')).toBe(true)
    expect(isKnownForeign('  DUBAI  ')).toBe(true)
    expect(isKnownForeign('Singapore')).toBe(true)
  })
  it('returns false for Indian cities and unknowns', () => {
    expect(isKnownForeign('Mumbai')).toBe(false)
    expect(isKnownForeign('Xanadu')).toBe(false)
    expect(isKnownForeign('')).toBe(false)
    expect(isKnownForeign(null)).toBe(false)
  })
})

describe('isJunkCityValue', () => {
  it('returns true for placeholder values', () => {
    expect(isJunkCityValue('Others')).toBe(true)
    expect(isJunkCityValue('NA')).toBe(true)
    expect(isJunkCityValue('-')).toBe(true)
    expect(isJunkCityValue('Pan India')).toBe(true)
  })
  it('returns true for empty / null input', () => {
    expect(isJunkCityValue(null)).toBe(true)
    expect(isJunkCityValue('')).toBe(true)
  })
  it('returns false for real city names', () => {
    expect(isJunkCityValue('Mumbai')).toBe(false)
    expect(isJunkCityValue('Dehradun')).toBe(false)
  })
  it('flags new junk values', () => {
    expect(isJunkCityValue('Call me')).toBe(true)
    expect(isJunkCityValue('Bhat gam')).toBe(true)
    expect(isJunkCityValue('bhatgam')).toBe(true)
  })
})
