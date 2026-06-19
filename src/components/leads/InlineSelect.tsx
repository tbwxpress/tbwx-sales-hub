'use client'

/**
 * InlineSelect — a native <select> disguised as an inline editable chip,
 * reusing the global `.status-select` utility (a select styled to look like a
 * status badge). Generalizes the existing priority-cell pattern so the SAME
 * affordance powers priority + assignee inline editing in both the leads table
 * row cells and the record side-panel.
 *
 * It does NOT own the network call — the parent supplies `onChange` which is
 * responsible for the optimistic update + PATCH + toast + rollback. This keeps
 * the save logic in one place per consumer (table page / side panel).
 */

export interface InlineSelectOption {
  /** Stored value sent on change ('' = the placeholder/clear option) */
  value: string
  /** Human label shown in the dropdown + trigger */
  label: string
}

interface InlineSelectColors {
  bg: string
  text: string
  border: string
}

interface InlineSelectProps {
  value: string
  options: readonly InlineSelectOption[]
  onChange: (next: string) => void
  /** Visual colors for the closed chip — defaults to a neutral elevated chip */
  colors?: InlineSelectColors
  /** Label for the empty/placeholder option (default '—') */
  placeholder?: string
  /** Stop click/change bubbling to a clickable parent row */
  stopPropagation?: boolean
  disabled?: boolean
  /** Accessible label for screen readers (icon-only context) */
  ariaLabel?: string
  className?: string
}

const NEUTRAL: InlineSelectColors = {
  bg: 'var(--color-elevated)',
  text: 'var(--color-muted)',
  border: 'var(--color-border)',
}

// Native <option> elements can't use CSS vars reliably across browsers for
// their own background, so we pin the dropdown list to the theme option tokens.
const OPTION_STYLE: React.CSSProperties = {
  backgroundColor: 'var(--color-option-bg)',
  color: 'var(--color-option-text)',
}

export default function InlineSelect({
  value,
  options,
  onChange,
  colors = NEUTRAL,
  placeholder = '—',
  stopPropagation = false,
  disabled = false,
  ariaLabel,
  className = '',
}: InlineSelectProps) {
  return (
    <select
      value={value || ''}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={(e) => { if (stopPropagation) e.stopPropagation() }}
      onChange={(e) => {
        if (stopPropagation) e.stopPropagation()
        const next = e.target.value
        if (next !== value) onChange(next)
      }}
      className={`status-select focus-ring ${className}`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
    >
      <option value="" style={OPTION_STYLE}>{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value} style={OPTION_STYLE}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
