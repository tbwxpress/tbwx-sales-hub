// The lead `notes` column is the only place website attribution lives
// (`src:<component> | page:<path> | …`, written by the website's /api/lead and
// by website-wa-lead.ts). Every automated write to notes MUST go through
// prependNote so a status marker is added in front of the existing text rather
// than replacing it. Between Jul and Sep 2026 the WhatsApp webhook replaced
// notes wholesale on every button tap, which silently erased attribution on
// ~313 website leads — including 10 of the 12 conversions we could still trace.
export const NOTES_CAP = 1500

export function prependNote(existingNotes: string, marker: string): string {
  const cur = String(existingNotes || '').trim()
  if (!cur) return marker.slice(0, NOTES_CAP)
  if (cur.includes(marker)) return cur
  return `${marker} | ${cur}`.slice(0, NOTES_CAP)
}
