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
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function followupLabel(dateStr: string): { text: string; urgent: boolean } {
  if (!dateStr) return { text: '-', urgent: false }
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return { text: dateStr, urgent: false }
  const now = new Date()
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, urgent: true }
  if (diffDays === 0) return { text: 'Today', urgent: true }
  if (diffDays === 1) return { text: 'Tomorrow', urgent: false }
  return { text: `${diffDays}d`, urgent: false }
}

export function formatTime(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  if (isToday) return time
  if (isYesterday) return `Yesterday ${time}`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + time
}
