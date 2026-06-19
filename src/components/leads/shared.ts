/**
 * Shared helpers for the leads inline-edit surfaces (table cells + side panel).
 * Keeps color tokens + the PATCH contract in one place so both consumers agree.
 */

import type { InlineSelectOption } from './InlineSelect'

export interface InlineColors {
  bg: string
  text: string
  border: string
}

/** Build a tinted chip from a single CSS color var (15% fill, 30% border). */
export function tintFrom(cssVar: string): InlineColors {
  return {
    bg: `color-mix(in srgb, ${cssVar} 15%, transparent)`,
    text: cssVar,
    border: `color-mix(in srgb, ${cssVar} 30%, transparent)`,
  }
}

export const NEUTRAL_CHIP: InlineColors = {
  bg: 'var(--color-elevated)',
  text: 'var(--color-muted)',
  border: 'var(--color-border)',
}

export const PRIORITY_CHIP: Record<string, InlineColors> = {
  HOT: tintFrom('var(--color-priority-hot)'),
  WARM: tintFrom('var(--color-priority-warm)'),
  COLD: tintFrom('var(--color-priority-cold)'),
}

export const PRIORITY_OPTIONS: readonly InlineSelectOption[] = [
  { value: 'HOT', label: 'HOT' },
  { value: 'WARM', label: 'WARM' },
  { value: 'COLD', label: 'COLD' },
]

export interface LeadUpdateResult {
  ok: boolean
  error?: string
}

/**
 * PATCH a single lead field via the existing /api/leads/[row] endpoint.
 * Returns a normalized result so callers can revert + toast on failure.
 */
export async function patchLead(
  rowNumber: number,
  body: Record<string, unknown>,
): Promise<LeadUpdateResult> {
  try {
    const res = await fetch(`/api/leads/${rowNumber}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data?.success) return { ok: true }
    return { ok: false, error: data?.error || 'Update failed' }
  } catch {
    return { ok: false, error: 'Network error' }
  }
}
