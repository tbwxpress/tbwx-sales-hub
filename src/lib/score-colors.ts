export function scoreColor(score: number): string {
  if (score >= 80) return 'var(--color-score-great)'
  if (score >= 60) return 'var(--color-score-good)'
  if (score >= 40) return 'var(--color-score-fair)'
  if (score >= 20) return 'var(--color-score-low)'
  return 'var(--color-score-poor)'
}

export function scoreBg(score: number): string {
  return `color-mix(in srgb, ${scoreColor(score)} 15%, transparent)`
}

export function scoreBorder(score: number): string {
  return `color-mix(in srgb, ${scoreColor(score)} 30%, transparent)`
}
