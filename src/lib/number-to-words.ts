/**
 * Convert a number to Indian English words.
 * Uses the Indian numbering system (lakhs, crores — not millions).
 *
 * Examples:
 *   150000 → "One Lakh Fifty Thousand"
 *   90000  → "Ninety Thousand"
 *   25000  → "Twenty Five Thousand"
 *   1500000 → "Fifteen Lakh"
 */

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']

const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ones[n]
  const t = Math.floor(n / 10)
  const o = n % 10
  return tens[t] + (o ? ' ' + ones[o] : '')
}

function threeDigits(n: number): string {
  if (n === 0) return ''
  const h = Math.floor(n / 100)
  const rest = n % 100
  if (h > 0 && rest > 0) return ones[h] + ' Hundred ' + twoDigits(rest)
  if (h > 0) return ones[h] + ' Hundred'
  return twoDigits(rest)
}

export function numberToWords(num: number): string {
  if (num === 0) return 'Zero'
  if (num < 0) return 'Minus ' + numberToWords(-num)

  num = Math.floor(num)

  const parts: string[] = []

  // Crores (1,00,00,000+)
  const crores = Math.floor(num / 10000000)
  if (crores > 0) {
    parts.push(threeDigits(crores) + ' Crore')
    num %= 10000000
  }

  // Lakhs (1,00,000+)
  const lakhs = Math.floor(num / 100000)
  if (lakhs > 0) {
    parts.push(twoDigits(lakhs) + ' Lakh')
    num %= 100000
  }

  // Thousands (1,000+)
  const thousands = Math.floor(num / 1000)
  if (thousands > 0) {
    parts.push(twoDigits(thousands) + ' Thousand')
    num %= 1000
  }

  // Hundreds and below
  const rest = threeDigits(num)
  if (rest) parts.push(rest)

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Format a rupee amount for legal documents.
 *
 * Examples:
 *   150000  → "Rs. One Lakh Fifty Thousand (Rs 1,50,000)"
 *   90000   → "Rs. Ninety Thousand (Rs 90,000)"
 *   20000   → "Rs. Twenty Thousand (Rs 20,000)"
 *   1500000 → "Rs. Fifteen Lakh (Rs 15,00,000)"
 */
export function formatRupeesLegal(amount: number): string {
  const words = numberToWords(amount)
  const formatted = formatIndianNumber(amount)
  return `Rs. ${words} (Rs ${formatted})`
}

/**
 * Format a number in Indian comma style: 1,50,000 (not 150,000)
 */
export function formatIndianNumber(n: number): string {
  const s = Math.floor(n).toString()
  if (s.length <= 3) return s

  const last3 = s.slice(-3)
  const rest = s.slice(0, -3)

  // Add commas every 2 digits for the part before last 3
  const withCommas = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return withCommas + ',' + last3
}
