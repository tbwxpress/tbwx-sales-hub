import { describe, it, expect } from 'vitest'
import { numberToWords, formatRupeesLegal, formatIndianNumber } from '../number-to-words'

describe('numberToWords', () => {
  it('converts common franchise fee amounts', () => {
    expect(numberToWords(150000)).toBe('One Lakh Fifty Thousand')
    expect(numberToWords(90000)).toBe('Ninety Thousand')
    expect(numberToWords(500000)).toBe('Five Lakh')
    expect(numberToWords(1500000)).toBe('Fifteen Lakh')
    expect(numberToWords(20000)).toBe('Twenty Thousand')
    expect(numberToWords(25000)).toBe('Twenty Five Thousand')
  })

  it('returns "Zero" for 0', () => {
    expect(numberToWords(0)).toBe('Zero')
  })

  it('handles negative numbers', () => {
    expect(numberToWords(-25000)).toBe('Minus Twenty Five Thousand')
  })

  it('truncates decimals', () => {
    expect(numberToWords(90000.99)).toBe('Ninety Thousand')
  })

  it('handles crore values', () => {
    expect(numberToWords(10000000)).toBe('One Crore')
    expect(numberToWords(15000000)).toBe('One Crore Fifty Lakh')
  })

  it('handles small numbers', () => {
    expect(numberToWords(1)).toBe('One')
    expect(numberToWords(19)).toBe('Nineteen')
    expect(numberToWords(100)).toBe('One Hundred')
    expect(numberToWords(999)).toBe('Nine Hundred Ninety Nine')
  })
})

describe('formatIndianNumber', () => {
  it('formats in Indian comma style', () => {
    expect(formatIndianNumber(150000)).toBe('1,50,000')
    expect(formatIndianNumber(10000000)).toBe('1,00,00,000')
    expect(formatIndianNumber(999)).toBe('999')
    expect(formatIndianNumber(1000)).toBe('1,000')
    expect(formatIndianNumber(100000)).toBe('1,00,000')
  })
})

describe('formatRupeesLegal', () => {
  it('produces correct legal format for franchise agreements', () => {
    expect(formatRupeesLegal(150000)).toBe('Rs. One Lakh Fifty Thousand (Rs 1,50,000)')
    expect(formatRupeesLegal(90000)).toBe('Rs. Ninety Thousand (Rs 90,000)')
  })
})
