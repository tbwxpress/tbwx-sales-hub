// All TBWX users + customers are in India. Time formatting is locked to IST
// regardless of where the JS runtime lives (UTC on the VPS, anywhere in the
// browser). Day-boundary comparisons also use IST so "today" / "yesterday"
// roll over at IST midnight, not UTC midnight.

export const IST = 'Asia/Kolkata'

// Returns today's date as YYYY-MM-DD in IST.
export function istToday(): string {
  return istDate(new Date())
}

// Returns the IST date (YYYY-MM-DD) for any Date or ISO string.
export function istDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  // en-CA's short date format is YYYY-MM-DD — convenient for string compares.
  return date.toLocaleDateString('en-CA', { timeZone: IST })
}

export function timeAgo(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: IST })
}

export function followupLabel(dateStr: string): { text: string; urgent: boolean } {
  if (!dateStr) return { text: '-', urgent: false }
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return { text: dateStr, urgent: false }
  // Compare IST dates, not raw timestamps — handles day boundaries correctly.
  const todayIST = istToday()
  const dIST = istDate(d)
  const diffDays = Math.round(
    (new Date(dIST).getTime() - new Date(todayIST).getTime()) / (1000 * 60 * 60 * 24)
  )
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, urgent: true }
  if (diffDays === 0) return { text: 'Today', urgent: true }
  if (diffDays === 1) return { text: 'Tomorrow', urgent: false }
  return { text: `${diffDays}d`, urgent: false }
}

export function formatTime(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const todayIST = istToday()
  const dIST = istDate(d)
  const yesterdayDate = new Date()
  yesterdayDate.setDate(yesterdayDate.getDate() - 1)
  const yesterdayIST = istDate(yesterdayDate)
  const time = d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST,
  })
  if (dIST === todayIST) return time
  if (dIST === yesterdayIST) return `Yesterday ${time}`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: IST }) + ' ' + time
}
