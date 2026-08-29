import { describe, expect, it } from 'vitest'
import { optionShare, pollIsOpen, tallyVotes, timeLeft } from './polls'

describe('tallyVotes', () => {
  const options = ['a', 'b', 'c']

  it('counts each option and remembers which are mine', () => {
    const { counts, mine } = tallyVotes(
      options,
      [
        { option_id: 'a', user_id: 'u1' },
        { option_id: 'a', user_id: 'u2' },
        { option_id: 'b', user_id: 'u1' },
      ],
      'u1',
    )
    expect(counts).toEqual({ a: 2, b: 1, c: 0 })
    expect([...mine].sort()).toEqual(['a', 'b'])
  })

  // The point of counting people rather than votes: in a multiple-choice
  // poll one person on three options is still one person who answered.
  it('counts people, not votes, as the turnout', () => {
    const { voters } = tallyVotes(
      options,
      [
        { option_id: 'a', user_id: 'u1' },
        { option_id: 'b', user_id: 'u1' },
        { option_id: 'c', user_id: 'u1' },
      ],
      null,
    )
    expect(voters).toBe(1)
  })

  it('ignores a vote for an option that is no longer there', () => {
    const { counts } = tallyVotes(options, [{ option_id: 'gone', user_id: 'u1' }], null)
    expect(counts).toEqual({ a: 0, b: 0, c: 0 })
  })
})

describe('optionShare', () => {
  it('measures against the leader, so multi-choice bars still compare', () => {
    const counts = { a: 4, b: 2, c: 0 }
    expect(optionShare(4, counts)).toBe(100)
    expect(optionShare(2, counts)).toBe(50)
    expect(optionShare(0, counts)).toBe(0)
  })

  it('draws nothing rather than dividing by zero before anyone answers', () => {
    expect(optionShare(0, { a: 0, b: 0 })).toBe(0)
  })
})

describe('pollIsOpen', () => {
  const now = Date.parse('2026-08-29T12:00:00Z')

  it('stays open with no deadline', () => {
    expect(pollIsOpen(null, now)).toBe(true)
  })

  it('closes the moment the deadline passes', () => {
    expect(pollIsOpen('2026-08-29T12:00:01Z', now)).toBe(true)
    expect(pollIsOpen('2026-08-29T11:59:59Z', now)).toBe(false)
  })
})

describe('timeLeft', () => {
  const now = Date.parse('2026-08-29T12:00:00Z')
  const at = (s: string) => timeLeft(s, now)

  it('drops to the unit that still means something', () => {
    expect(at('2026-09-02T12:00:00Z')).toBe('4d 0h left')
    expect(at('2026-08-29T15:30:00Z')).toBe('3h 30m left')
    expect(at('2026-08-29T12:02:05Z')).toBe('2m 05s left')
    expect(at('2026-08-29T12:00:09Z')).toBe('9s left')
  })

  it('says so once the deadline is behind us', () => {
    expect(at('2026-08-29T11:00:00Z')).toBe('closed')
  })
})
