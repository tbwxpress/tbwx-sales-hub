import { describe, it, expect } from 'vitest'
import {
  addDays,
  buildLeaderboard,
  computeStreak,
  evaluateBadges,
  followupOnTime,
  istDayOfMs,
  istMinutesOfMs,
  parseDbTime,
  statusAward,
  streakMilestones,
  tallyByDay,
  utcBoundForIstDay,
  weekStartOf,
  type BadgeFacts,
} from '../points'
import { POINTS } from '../config'

// 2026-10-07 is a Wednesday. 2026-10-04 is a Sunday.
const WED = '2026-10-07'

describe('IST helpers', () => {
  it('parses SQLite datetime(now) strings as UTC', () => {
    expect(parseDbTime('2026-10-07 04:30:00')).toBe(Date.parse('2026-10-07T04:30:00Z'))
    expect(parseDbTime('2026-10-07T04:30:00.000Z')).toBe(Date.parse('2026-10-07T04:30:00Z'))
    expect(Number.isNaN(parseDbTime('not a date'))).toBe(true)
    expect(Number.isNaN(parseDbTime(''))).toBe(true)
  })

  it('rolls the IST day over at 18:30 UTC', () => {
    expect(istDayOfMs(parseDbTime('2026-10-06 18:29:59'))).toBe('2026-10-06')
    expect(istDayOfMs(parseDbTime('2026-10-06 18:30:00'))).toBe('2026-10-07')
    expect(istMinutesOfMs(parseDbTime('2026-10-07 04:30:00'))).toBe(10 * 60) // 10:00 IST
  })

  it('builds SQL lower bounds in the same format datetime(now) stores', () => {
    expect(utcBoundForIstDay(WED)).toBe('2026-10-06 18:30:00')
  })

  it('starts the week on Monday', () => {
    expect(weekStartOf(WED)).toBe('2026-10-05')
    expect(weekStartOf('2026-10-05')).toBe('2026-10-05')
    expect(weekStartOf('2026-10-04')).toBe('2026-09-28') // Sunday belongs to the week before
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  })
})

describe('statusAward', () => {
  it('scores forward moves +5', () => {
    expect(statusAward('NEW', 'DECK_SENT')?.points).toBe(POINTS.MOVED_FORWARD)
    expect(statusAward('DECK_SENT', 'REPLIED')?.points).toBe(POINTS.MOVED_FORWARD)
    expect(statusAward('HOT', 'FINAL_NEGOTIATION')?.kind).toBe('forward')
  })

  it('scores HOT +15 and CONVERTED +100 instead of +5', () => {
    expect(statusAward('REPLIED', 'HOT')).toMatchObject({ kind: 'hot', points: 15 })
    expect(statusAward('FINAL_NEGOTIATION', 'CONVERTED')).toMatchObject({ kind: 'converted', points: 100 })
    expect(statusAward('NEW', 'CONVERTED')?.points).toBe(100)
  })

  it('gives nothing for backward, sideways or lost moves', () => {
    expect(statusAward('HOT', 'REPLIED')).toBeNull()
    expect(statusAward('FINAL_NEGOTIATION', 'HOT')).toBeNull()
    expect(statusAward('REPLIED', 'LOST')).toBeNull()
    expect(statusAward('REPLIED', 'NO_RESPONSE')).toBeNull()
    expect(statusAward('DECK_SENT', 'DELAYED')).toBeNull()
    expect(statusAward('HOT', 'HOT')).toBeNull()
    expect(statusAward('CONVERTED', 'CONVERTED')).toBeNull()
  })

  it('rewards reviving a parked or lost lead', () => {
    expect(statusAward('DELAYED', 'REPLIED')?.points).toBe(5)
    expect(statusAward('NO_RESPONSE', 'HOT')?.points).toBe(15)
    expect(statusAward('LOST', 'CALL_DONE_INTERESTED')?.points).toBe(5)
    expect(statusAward('DELAYED', 'DECK_SENT')).toBeNull() // same level, not forward
  })
})

describe('followupOnTime', () => {
  const tenAmWed = parseDbTime('2026-10-07 04:30:00')
  it('counts a follow-up edited on its due day', () => {
    expect(followupOnTime('2026-10-07', tenAmWed)).toBe(true)
    expect(followupOnTime('2026-10-07T15:00', tenAmWed)).toBe(true)
  })
  it('does not count overdue, future or empty dates', () => {
    expect(followupOnTime('2026-10-06', tenAmWed)).toBe(false)
    expect(followupOnTime('2026-10-09', tenAmWed)).toBe(false)
    expect(followupOnTime('', tenAmWed)).toBe(false)
  })
})

describe('tallyByDay', () => {
  it('applies the full formula for a day', () => {
    const tally = tallyByDay({
      calls: [
        { day: WED, key: 'p:919800000001', count: 1 },
        { day: WED, key: 'r:42', count: 2 },
      ],
      statuses: [
        { at: '2026-10-07 05:00:00', leadRow: 1, oldStatus: 'NEW', newStatus: 'DECK_SENT' },
        { at: '2026-10-07 06:00:00', leadRow: 2, oldStatus: 'REPLIED', newStatus: 'HOT' },
        { at: '2026-10-07 07:00:00', leadRow: 3, oldStatus: 'FINAL_NEGOTIATION', newStatus: 'CONVERTED' },
        { at: '2026-10-07 07:30:00', leadRow: 4, oldStatus: 'HOT', newStatus: 'LOST' },
      ],
      followups: [{ at: '2026-10-07 08:00:00', leadRow: 5, oldValue: WED }],
    }).get(WED)!
    expect(tally.calls).toBe(3)
    expect(tally.moved).toBe(1)
    expect(tally.hot).toBe(1)
    expect(tally.converted).toBe(1)
    expect(tally.followups).toBe(1)
    expect(tally.points).toBe(3 * 2 + 5 + 15 + 100 + 3)
  })

  it('caps call points at 3 per lead per day but still counts the calls', () => {
    const t = tallyByDay({ calls: [{ day: WED, key: 'p:1', count: 10 }], statuses: [], followups: [] }).get(WED)!
    expect(t.calls).toBe(10)
    expect(t.points).toBe(3 * POINTS.CALL)
  })

  it('scores each (lead, stage) once per day — no HOT flip-flop farming', () => {
    const t = tallyByDay({
      calls: [],
      statuses: [
        { at: '2026-10-07 05:00:00', leadRow: 9, oldStatus: 'REPLIED', newStatus: 'HOT' },
        { at: '2026-10-07 05:10:00', leadRow: 9, oldStatus: 'HOT', newStatus: 'REPLIED' },
        { at: '2026-10-07 05:20:00', leadRow: 9, oldStatus: 'REPLIED', newStatus: 'HOT' },
      ],
      followups: [],
    }).get(WED)!
    expect(t.hot).toBe(1)
    expect(t.points).toBe(15)
  })

  it('buckets by IST day (late-night UTC rows belong to the next IST day)', () => {
    const m = tallyByDay({
      calls: [],
      statuses: [{ at: '2026-10-06 19:00:00', leadRow: 1, oldStatus: 'NEW', newStatus: 'DECK_SENT' }],
      followups: [{ at: '2026-10-06 19:00:00', leadRow: 2, oldValue: '2026-10-06' }], // edited 00:30 IST on the 7th → late
    })
    expect(m.get(WED)?.moved).toBe(1)
    expect(m.get(WED)?.followups).toBe(0)
    expect(m.has('2026-10-06')).toBe(false)
  })
})

describe('computeStreak', () => {
  it('counts consecutive working days ending today', () => {
    const s = computeStreak(['2026-10-05', '2026-10-06', WED], WED)
    expect(s).toEqual({ days: 3, todayDone: true, atRisk: false })
  })

  it('keeps yesterday\'s streak alive (at risk) before today\'s first call', () => {
    const s = computeStreak(['2026-10-05', '2026-10-06'], WED)
    expect(s).toEqual({ days: 2, todayDone: false, atRisk: true })
  })

  it('skips Sundays without breaking the streak', () => {
    // Sat 3 Oct, (Sun 4 Oct off), Mon 5 Oct, Tue 6 Oct
    const s = computeStreak(['2026-10-03', '2026-10-05', '2026-10-06'], '2026-10-06')
    expect(s.days).toBe(3)
  })

  it('breaks on a missed working day', () => {
    const s = computeStreak(['2026-10-02', '2026-10-05', '2026-10-06'], '2026-10-06') // Sat 3rd missed
    expect(s.days).toBe(2)
  })

  it('is zero with no calls and never at risk', () => {
    expect(computeStreak([], WED)).toEqual({ days: 0, todayDone: false, atRisk: false })
  })
})

describe('streakMilestones', () => {
  it('dates the day a run first reached 7 working days', () => {
    // Mon 28 Sep → Sat 3 Oct (6 days) + Mon 5 Oct = 7th working day
    const days = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05']
    const m = streakMilestones(days, '2026-09-20', WED, [7, 30])
    expect(m[7]).toBe('2026-10-05')
    expect(m[30]).toBeNull()
  })
})

describe('evaluateBadges', () => {
  const none: BadgeFacts = {
    firstConversionDay: null,
    comebackDay: null,
    hotLeadsByDay: {},
    callsByDay: {},
    firstCallMinByDay: {},
    streak7Day: null,
    streak30Day: null,
  }

  it('earns nothing from nothing', () => {
    expect(evaluateBadges(none)).toEqual([])
  })

  it('awards each badge on the first qualifying day', () => {
    const got = evaluateBadges({
      ...none,
      firstConversionDay: '2026-10-01',
      comebackDay: '2026-10-02',
      hotLeadsByDay: { '2026-10-03': 2, '2026-10-05': 3, '2026-10-06': 4 },
      callsByDay: { '2026-10-05': 39, '2026-10-06': 40 },
      firstCallMinByDay: { '2026-10-05': 10 * 60 + 45, '2026-10-06': 9 * 60 + 15 },
      streak7Day: '2026-10-06',
    })
    const byId = Object.fromEntries(got.map(b => [b.id, b.earnedAt]))
    expect(byId).toEqual({
      first_blood: '2026-10-01',
      comeback: '2026-10-02',
      hot_streak: '2026-10-05',
      marathon: '2026-10-06',
      early_bird: '2026-10-06',
      streak_7: '2026-10-06',
    })
  })

  it('needs the early call between 06:00 and 10:30', () => {
    const got = evaluateBadges({ ...none, firstCallMinByDay: { [WED]: 10 * 60 + 30 } })
    expect(got.find(b => b.id === 'early_bird')).toBeUndefined()
  })
})

describe('buildLeaderboard', () => {
  const team = [
    { id: 'a', name: 'Riya Sharma', points: 120, prevPoints: 60 },
    { id: 'b', name: 'Amit Kumar', points: 90, prevPoints: 80 },
    { id: 'c', name: 'Amit Singh', points: 90, prevPoints: 20 },
    { id: 'd', name: 'Neha', points: 40, prevPoints: 40 },
    { id: 'e', name: 'Karan', points: 30, prevPoints: 30 },
    { id: 'f', name: 'Pooja', points: 10, prevPoints: 0 },
    { id: 'g', name: 'Vikram', points: 0, prevPoints: 0 },
  ]

  it('shows first names, disambiguates duplicates, and shares ranks on ties', () => {
    const lb = buildLeaderboard(team, 'a')
    expect(lb.rows.map(r => `${r.rank}:${r.agent}`)).toEqual(['1:Riya', '2:Amit K.', '2:Amit S.', '4:Neha', '5:Karan'])
    expect(lb.myRank).toBe(1)
    expect(lb.gapToNext).toBeNull()
  })

  it('adds "you" below the top 5 and never lists anyone else beneath you', () => {
    const lb = buildLeaderboard(team, 'g')
    expect(lb.rows).toHaveLength(6)
    expect(lb.rows[5]).toMatchObject({ agent: 'Vikram', isMe: true, points: 0 })
    expect(lb.rows.some(r => r.agent === 'Pooja')).toBe(false)
    expect(lb.gapToNext).toBe(11) // Pooja has 10 → 11 to pass her
  })

  it('reports rank movement against yesterday', () => {
    const lb = buildLeaderboard(team, 'c')
    const amitS = lb.rows.find(r => r.agent === 'Amit S.')!
    expect(amitS.movement).toBeGreaterThan(0) // was 5th by yesterday's points, now 2nd
    const riya = lb.rows.find(r => r.agent === 'Riya')!
    expect(riya.movement).toBe(1) // was 2nd, now 1st
  })

  it('shows no movement when nobody had points before today (Monday)', () => {
    const lb = buildLeaderboard(team.map(t => ({ ...t, prevPoints: 0 })), 'a')
    expect(lb.rows.every(r => r.movement === 0)).toBe(true)
  })
})
