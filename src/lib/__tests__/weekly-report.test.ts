import { describe, it, expect } from 'vitest'
import { buildWindow, buildInsights, renderWeeklyReportHtml, type WeeklyReportData } from '../weekly-report'

const win = buildWindow(new Date('2026-07-25T13:30:00Z'), new Date('2026-08-01T13:30:00Z'))
const prior = buildWindow(new Date('2026-07-18T13:30:00Z'), new Date('2026-07-25T13:30:00Z'))

function fixture(over: Partial<WeeklyReportData> = {}): WeeklyReportData {
  return {
    window: win,
    prior,
    headline: {
      converted: 8, prior_converted: 3,
      qualified: 28, prior_qualified: 12,
      new_leads: 279, prior_new_leads: 210,
      lost: 41, inbound_conversations: 152,
    },
    sources: [{ name: 'WA Organic (Website)', count: 159 }],
    agents: [{
      name: 'Anmol', msgs_sent: 288, leads_messaged: 262, calls: 8,
      qualified: 28, converted: 3, lost: 10, notes: 40,
      first_activity: '2026-07-28T05:26:00.000Z', last_activity: '2026-07-28T11:58:00.000Z',
    }],
    engagement: [{ owner: 'Anmol', messaged_in: 79, answered: 22, called_instead: 7, ignored: 50 }],
    prior_engagement: [{ owner: 'Anmol', messaged_in: 60, answered: 10, called_instead: 5, ignored: 45 }],
    telecaller: { sent_to_queue: 0, handed_back: 0, queue_size: 1768 },
    formAnswers: [{ question: 'When do you plan to start?', answer: 'Within 30 days', count: 12 }],
    automation: { opt_ins: 120, decks: 96, intros: 4, capi_sent: 45, capi_failed: 4, wa_click_leads: 38, dedupe_folds: 36 },
    system: {
      failed_sends: 32, prior_failed_sends: 76,
      failures_by_code: [{ code: '131049', count: 17 }],
      lead_edits: 1044, notes: 464, nudges: 413,
    },
    insights: [],
    pending: [],
    ...over,
  }
}

describe('buildWindow', () => {
  it('produces both timestamp shapes and a day count', () => {
    expect(win.sinceIso).toBe('2026-07-25T13:30:00.000Z')
    expect(win.sinceSql).toBe('2026-07-25 13:30:00')
    expect(win.days).toBe(7)
    expect(win.label).toContain('→')
  })

  it('never reports zero days for a sub-day window', () => {
    const tiny = buildWindow(new Date('2026-08-01T10:00:00Z'), new Date('2026-08-01T12:00:00Z'))
    expect(tiny.days).toBe(1)
  })
})

describe('buildInsights', () => {
  it('leads with the ignored-conversation count and trend', () => {
    const out = buildInsights(fixture())
    expect(out[0]).toContain('50 of 79')
    expect(out[0]).toContain('%')
  })

  it('flags conversions up and failures down', () => {
    const out = buildInsights(fixture()).join(' ')
    expect(out).toContain('Conversions up')
    expect(out).toContain('Send failures down')
  })

  it('congratulates a real drop in ignored conversations', () => {
    const out = buildInsights(fixture({
      engagement: [{ owner: 'Happy', messaged_in: 70, answered: 55, called_instead: 8, ignored: 5 }],
      prior_engagement: [{ owner: 'Happy', messaged_in: 73, answered: 7, called_instead: 8, ignored: 58 }],
    })).join(' ')
    expect(out).toContain('Happy cut ignored conversations from 58 to 5')
  })

  it('stays quiet when there is no inbound traffic', () => {
    const out = buildInsights(fixture({ engagement: [], prior_engagement: [] }))
    expect(out.every(line => !line.includes('of 0 leads'))).toBe(true)
  })
})

describe('renderWeeklyReportHtml', () => {
  it('renders every numbered section', () => {
    const html = renderWeeklyReportHtml(fixture())
    for (const heading of ['1. Scorecard', '2. Lead engagement', '3. Agent performance',
      '4. Telecaller loop', '7. Automation health', '10. Waiting on you']) {
      expect(html).toContain(heading)
    }
  })

  it('shows the preview banner only in preview mode', () => {
    expect(renderWeeklyReportHtml(fixture(), { preview: true })).toContain('PREVIEW')
    expect(renderWeeklyReportHtml(fixture())).not.toContain('PREVIEW')
  })

  it('escapes agent-supplied text so a stray character cannot break the email', () => {
    const html = renderWeeklyReportHtml(fixture({
      sources: [{ name: 'Ads <script>alert(1)</script> & co', count: 3 }],
    }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp; co')
  })

  it('surfaces the headline conversion number', () => {
    expect(renderWeeklyReportHtml(fixture())).toContain('<strong>8</strong>')
  })
})
