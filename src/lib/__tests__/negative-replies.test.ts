import { describe, it, expect } from 'vitest'
import { isNegativeReply, NEGATIVE_REPLY_PHRASES } from '../negative-replies'

describe('isNegativeReply', () => {
  it('matches clear opt-out / disinterest phrases', () => {
    const positives = [
      'Not interested',
      'I am no longer interested in this',
      'please do not call me again',
      "don't call me",
      'STOP CALLING',
      'stop messaging me',
      'unsubscribe',
      'remove me from your list',
      'remove my number please',
      'wrong number',
      'no thanks',
      'already bought one elsewhere',
      'already purchased',
      'leave me alone',
      'not required',
      'no need',
      'please stop sending these',
      'I want to opt out',
    ]
    for (const text of positives) {
      expect(isNegativeReply(text), `expected positive: "${text}"`).toBe(true)
    }
  })

  it('is case-insensitive and whitespace-tolerant', () => {
    expect(isNegativeReply('NoT InTeReStEd')).toBe(true)
    expect(isNegativeReply('stop    calling   me')).toBe(true)
    expect(isNegativeReply('  do not call  ')).toBe(true)
  })

  it('does NOT match positive or neutral replies (conservative)', () => {
    const negatives = [
      "I'm interested",
      'yes, tell me more',
      'no problem',
      'no worries',
      'ok sounds good',
      'sure, send the details',
      'can you call me tomorrow',
      'what is the investment',
      'thanks a lot',
      'no', // bare "no" must NOT match
      '',
      '   ',
    ]
    for (const text of negatives) {
      expect(isNegativeReply(text), `expected negative: "${text}"`).toBe(false)
    }
  })

  it('exports a non-empty curated phrase list', () => {
    expect(Array.isArray(NEGATIVE_REPLY_PHRASES)).toBe(true)
    expect(NEGATIVE_REPLY_PHRASES.length).toBeGreaterThan(0)
  })
})
