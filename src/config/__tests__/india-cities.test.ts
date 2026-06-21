import { describe, it, expect } from 'vitest'
import {
  findCity,
  projectLatLng,
  isKnownForeign,
  isJunkCityValue,
  isLikelyPhoneOrPincode,
  isNonLatinScript,
  unicodeNormalize,
} from '../india-cities'

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

  it('matches a broad set of fifth-round drain-pass additions', () => {
    expect(findCity('Proddatur')?.name).toBe('Proddatur')
    expect(findCity('Baramulla')?.name).toBe('Baramulla')
    expect(findCity('Lonavala')?.name).toBe('Lonavala')
    expect(findCity('Vasai')?.name).toBe('Vasai')
    expect(findCity('Haldwani')?.name).toBe('Haldwani')
    expect(findCity('Mount Abu')?.name).toBe('Mount Abu')
    expect(findCity('Darjeeling')?.name).toBe('Darjeeling')
    expect(findCity('Hospet')?.name).toBe('Hospet')
    expect(findCity('Rameswaram')?.name).toBe('Rameswaram')
    expect(findCity('Hanmakonda')?.name).toBe('Hanamkonda')
    expect(findCity('hanumakonda')?.name).toBe('Hanamkonda')
    expect(findCity('Diu')?.name).toBe('Diu')
    expect(findCity('Kurukshetra')?.name).toBe('Kurukshetra')
    expect(findCity('Chittorgarh')?.name).toBe('Chittorgarh')
    expect(findCity('Azamgarh')?.name).toBe('Azamgarh')
    expect(findCity('Beed')?.name).toBe('Beed')
    expect(findCity('Jalpaiguri')?.name).toBe('Jalpaiguri')
    expect(findCity('Hanamkonda')?.name).toBe('Hanamkonda')
    expect(findCity('Bidar')?.name).toBe('Bidar')
    expect(findCity('Gadchiroli')?.name).toBe('Gadchiroli')
  })

  it('resolves a wide pool of fifth-round typos via aliases', () => {
    expect(findCity('Bngalore')?.name).toBe('Bangalore')
    expect(findCity('Hyedrabad')?.name).toBe('Hyderabad')
    expect(findCity('Gurgram')?.name).toBe('Gurgaon')
    expect(findCity('Bhubneswar')?.name).toBe('Bhubaneswar')
    expect(findCity('Ahmedbad')?.name).toBe('Ahmedabad')
    expect(findCity('Cawnpore')?.name).toBe('Kanpur')
    expect(findCity('Bhir')?.name).toBe('Beed')
    expect(findCity('Bidare')?.name).toBe('Bidar')
    expect(findCity('Gadchoroli')?.name).toBe('Gadchiroli')
    expect(findCity('Manchireya')?.name).toBe('Mancherial')
    expect(findCity('Nehtour')?.name).toBe('Nehtaur')
    expect(findCity('Himmatnagar')?.name).toBe('Himatnagar')
    expect(findCity('Dehri on sone')?.name).toBe('Dehri')
    expect(findCity('Purnea')?.name).toBe('Purnia')
    expect(findCity('Begusaria')?.name).toBe('Begusarai')
    expect(findCity('Miraroad')?.name).toBe('Mira Road')
    expect(findCity('Mira road')?.name).toBe('Mira Road')
    expect(findCity('Palava dombiwali')?.name).toBe('Dombivli')
    expect(findCity('Gurgram')?.name).toBe('Gurgaon')
    expect(findCity('Mussafah sahbyia 9')?.name).toBeUndefined()  // foreign → should NOT match
  })

  it('strips parenthetical descriptors before matching', () => {
    const m = findCity('Anaval (unai)')
    // If Anaval is unknown the result is null — but it must NOT include parens in name
    if (m) expect(m.name.toLowerCase()).not.toContain('(')
  })

  it('matches the sixth-batch (2026-06-21) tier-2/3 towns', () => {
    expect(findCity('Jaunpur')?.name).toBe('Jaunpur')
    expect(findCity('Sitamarhi')?.name).toBe('Sitamarhi')
    expect(findCity('Tonk')?.name).toBe('Tonk')
    expect(findCity('Balotra')?.name).toBe('Balotra')
    expect(findCity('Chhatarpur')?.name).toBe('Chhatarpur')
    expect(findCity('Washim')?.name).toBe('Washim')
    expect(findCity('Morbi')?.name).toBe('Morbi')
    expect(findCity('Silvassa')?.name).toBe('Silvassa')
    expect(findCity('Ropar')?.name).toBe('Ropar')
    expect(findCity('Malda')?.name).toBe('Malda')
    expect(findCity('Tinsukia')?.name).toBe('Tinsukia')
    expect(findCity('Raichur')?.name).toBe('Raichur')
    expect(findCity('Tandur')?.name).toBe('Tandur')
    expect(findCity('Piduguralla')?.name).toBe('Piduguralla')
    expect(findCity('Thanjavur')?.name).toBe('Thanjavur')
    expect(findCity('Ballari')?.name).toBe('Ballari')
    expect(findCity('Nalgonda')?.name).toBe('Nalgonda')
    expect(findCity('Kot Ise Khan')?.name).toBe('Kot Ise Khan')
    expect(findCity('Bhiwani')?.name).toBe('Bhiwani')
    expect(findCity('Kargil')?.name).toBe('Kargil')
    expect(findCity('Leh')?.name).toBe('Leh')
  })

  it('resolves sixth-batch misspellings and renamed names via alias', () => {
    expect(findCity('Ludhina')?.name).toBe('Ludhiana')
    expect(findCity('Benguluru')?.name).toBe('Bengaluru')
    expect(findCity('Bangaluru')?.name).toBe('Bengaluru')
    expect(findCity('bellari')?.name).toBe('Ballari')
    expect(findCity('bhubneshwar')?.name).toBe('Bhubaneswar')
    expect(findCity('ujjian')?.name).toBe('Ujjain')
    expect(findCity('Muradabad Patti')?.name).toBe('Moradabad')
    expect(findCity('sonepat')?.name).toBe('Sonipat')
    expect(findCity('Sambhajinagar')?.name).toBe('Aurangabad')  // renamed Aurangabad
    expect(findCity('Godhara')?.name).toBe('Godhra')
    expect(findCity('shikohibed')?.name).toBe('Shikohabad')
    expect(findCity('Davenger')?.name).toBe('Davanagere')
    expect(findCity('Davangere')?.name).toBe('Davanagere')
    expect(findCity('Parabhani')?.name).toBe('Parbhani')
    expect(findCity('Nalginda')?.name).toBe('Nalgonda')
    expect(findCity('Bhiwnai')?.name).toBe('Bhiwani')
    expect(findCity('Rajauri')?.name).toBe('Rajouri')
    expect(findCity('Badaun')?.name).toBe('Budaun')
    expect(findCity('Bulandshahar')?.name).toBe('Bulandshahr')
  })

  it('handles sixth-batch localities, compound inputs and stylized text', () => {
    expect(findCity('Kurla')?.name).toBe('Mumbai')
    expect(findCity('Najafgarh')?.name).toBe('Delhi')
    expect(findCity('Krpuram')?.name).toBe('Bangalore')
    expect(findCity('Mansrovar')?.name).toBe('Jaipur')
    expect(findCity('Magarpatta')?.name).toBe('Pune')
    expect(findCity('Gandimaisamma')?.name).toBe('Hyderabad')
    expect(findCity('Dombivali')?.name).toBe('Dombivli')
    expect(findCity('Wayanad')?.name).toBe('Kozhikode')
    expect(findCity('Kalahandi')?.name).toBe('Bhawanipatna')
    expect(findCity('Tonk todaraisingh')?.name).toBe('Tonk')
    expect(findCity('Nagaur Marwar')?.name).toBe('Nagaur')
    expect(findCity('Ahore/jalore')?.name).toBe('Bhinmal')
    expect(findCity('Kot-Ise-Khan')?.name).toBe('Kot Ise Khan')
    expect(findCity('Gallops hotel')?.name).toBe('Ahmedabad')
    expect(findCity('𝔻𝕒𝕣𝕪𝕡𝕦𝕣'.normalize('NFKD'))?.name).toBe('Daryapur')
  })

  it('routes sixth-batch state-name misspellings to a capital', () => {
    expect(findCity('mahareshtra')?.name).toBe('Mumbai')
    expect(findCity('rajesthan')?.name).toBe('Jaipur')
  })

  it('resolves foreign cities to their own entry (state = country)', () => {
    expect(findCity('Paris')?.name).toBe('Paris')
    expect(findCity('Paris')?.state).toBe('France')
    expect(findCity('Bangkok')?.name).toBe('Bangkok')
    expect(findCity('Bangkok')?.state).toBe('Thailand')
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
  it('flags fifth-round junk values', () => {
    expect(isJunkCityValue('Jjjj')).toBe(true)
    expect(isJunkCityValue('goksj')).toBe(true)
    expect(isJunkCityValue('Gyrgson')).toBe(true)
    expect(isJunkCityValue('Pu e')).toBe(true)
    expect(isJunkCityValue('Yes')).toBe(true)
    expect(isJunkCityValue('Shashi')).toBe(true)
    expect(isJunkCityValue('Rehan')).toBe(true)
  })
})

describe('isLikelyPhoneOrPincode', () => {
  it('detects pincodes and phone numbers', () => {
    expect(isLikelyPhoneOrPincode('400066')).toBe(true)
    expect(isLikelyPhoneOrPincode('500008')).toBe(true)
    expect(isLikelyPhoneOrPincode('312001')).toBe(true)
    expect(isLikelyPhoneOrPincode('403513')).toBe(true)
    expect(isLikelyPhoneOrPincode('91755 21737')).toBe(true)
    expect(isLikelyPhoneOrPincode('+91 9755 21737')).toBe(true)
  })
  it('passes real city names', () => {
    expect(isLikelyPhoneOrPincode('Mumbai')).toBe(false)
    expect(isLikelyPhoneOrPincode('Delhi')).toBe(false)
    expect(isLikelyPhoneOrPincode(null)).toBe(false)
    expect(isLikelyPhoneOrPincode('')).toBe(false)
  })
})

describe('isNonLatinScript', () => {
  it('detects Devanagari and other Indian scripts', () => {
    expect(isNonLatinScript('लखनऊ और बरेली')).toBe(true)
    expect(isNonLatinScript('इंडसइंड बैंक जयपुर न्यू इनकम टैक्स कॉलोनी')).toBe(true)
  })
  it('passes Latin-script inputs', () => {
    expect(isNonLatinScript('Mumbai')).toBe(false)
    expect(isNonLatinScript('')).toBe(false)
    expect(isNonLatinScript(null)).toBe(false)
  })
})

describe('unicodeNormalize', () => {
  it('converts mathematical blackboard-bold text to ASCII', () => {
    // 𝔻𝕒𝕣𝕪𝕡𝕦𝕣 → "Darypur" after NFKD normalization
    const result = unicodeNormalize('𝔻𝕒𝕣𝕪𝕡𝕦𝕣')
    expect(result.toLowerCase()).toMatch(/dary/)
  })
  it('leaves plain ASCII unchanged', () => {
    expect(unicodeNormalize('Mumbai')).toBe('Mumbai')
    expect(unicodeNormalize('')).toBe('')
  })
})
