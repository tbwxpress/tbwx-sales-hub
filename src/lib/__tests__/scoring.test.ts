import { describe, it, expect } from 'vitest'
import { computeLeadScore, getScoreLabel } from '../scoring'
import type { Lead } from '../types'

function buildLead(overrides: Partial<Lead> = {}): Lead {
  return {
    row_number: 2,
    id: '',
    created_time: new Date().toISOString(),
    campaign_name: '',
    platform: '',
    full_name: 'Test Lead',
    phone: '919876543210',
    email: '',
    city: '',
    state: '',
    model_interest: '',
    experience: '',
    timeline: '',
    lead_status: 'NEW',
    lead_priority: 'WARM',
    attempted_contact: '',
    first_call_date: '',
    wa_message_id: '',
    assigned_to: '',
    next_followup: '',
    notes: '',
    ...overrides,
  }
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

describe('computeLeadScore', () => {
  it('returns a number between 0 and 100', () => {
    const score = computeLeadScore(buildLead({}))
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
    expect(Number.isInteger(score)).toBe(true)
  })

  it('scores a HOT tier-1 city lead higher than a LOST unknown-city lead', () => {
    const hot = computeLeadScore(buildLead({
      lead_status: 'HOT',
      city: 'Mumbai',
      timeline: 'immediately',
      model_interest: 'full store 7-8',
    }))
    const lost = computeLeadScore(buildLead({
      lead_status: 'LOST',
      city: 'Unknown Town',
    }))
    expect(hot).toBeGreaterThan(lost)
  })

  it('applies decay when a NEW lead is older than 7 days', () => {
    const fresh = computeLeadScore(buildLead({ lead_status: 'NEW', created_time: new Date().toISOString() }))
    const stale = computeLeadScore(buildLead({ lead_status: 'NEW', created_time: daysAgo(10) }))
    expect(stale).toBeLessThan(fresh)
  })

  it('does not apply decay to a HOT status lead', () => {
    const oldHot = computeLeadScore(buildLead({ lead_status: 'HOT', created_time: daysAgo(30) }))
    const freshHot = computeLeadScore(buildLead({ lead_status: 'HOT', created_time: new Date().toISOString() }))
    expect(oldHot).toBe(freshHot)
  })

  it('returns >= 0 even for very old leads', () => {
    const veryStale = computeLeadScore(buildLead({ lead_status: 'NEW', created_time: daysAgo(100) }))
    expect(veryStale).toBeGreaterThanOrEqual(0)
  })

  it('adds +5 for HOT priority, -5 for COLD priority', () => {
    const warm = computeLeadScore(buildLead({ lead_priority: 'WARM' }))
    const hot = computeLeadScore(buildLead({ lead_priority: 'HOT' }))
    const cold = computeLeadScore(buildLead({ lead_priority: 'COLD' }))
    expect(hot - warm).toBe(5)
    expect(warm - cold).toBe(5)
  })
})

describe('getScoreLabel', () => {
  it('returns correct label for each boundary', () => {
    expect(getScoreLabel(80)).toBe('excellent')
    expect(getScoreLabel(79)).toBe('good')
    expect(getScoreLabel(60)).toBe('good')
    expect(getScoreLabel(59)).toBe('average')
    expect(getScoreLabel(40)).toBe('average')
    expect(getScoreLabel(39)).toBe('low')
    expect(getScoreLabel(20)).toBe('low')
    expect(getScoreLabel(19)).toBe('cold')
    expect(getScoreLabel(0)).toBe('cold')
  })
})
