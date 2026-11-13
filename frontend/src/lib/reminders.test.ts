import { describe, expect, it } from 'vitest'
import { toReminders, withoutAnswered, type OpenRequest } from './reminders'

const now = new Date('2026-10-23T12:00:00Z').getTime()
const row = (over: Partial<OpenRequest>): OpenRequest => ({
  kind: 'poll',
  ref_id: 'p1',
  title: 'Which Sunday suits the picnic?',
  detail: null,
  on_date: null,
  due_at: null,
  created_at: '2026-10-22T12:00:00Z',
  ...over,
})

describe('what the dashboard reminds somebody of (0178)', () => {
  it('turns each kind into words and a deep link', () => {
    const [poll, avail, mention] = toReminders(
      [
        row({ kind: 'poll', ref_id: 'p1', due_at: '2026-10-25T12:00:00Z' }),
        row({ kind: 'availability', ref_id: 's1', title: 'English Service', detail: 'Media', on_date: '2026-10-25', due_at: '2026-10-26T12:00:00Z' }),
        row({ kind: 'mention', ref_id: 'm1', title: 'Can you bring the cables?' }),
      ],
      now,
    )
    expect(poll).toMatchObject({ eyebrow: 'A poll for you', href: '/polls?poll=p1', actionLabel: 'Answer', detail: 'Closes in 2 days' })
    expect(avail).toMatchObject({ eyebrow: 'Can you serve?', href: '/availability', title: 'English Service' })
    // The day and the team are tags of their own, not words in the small print.
    expect(avail.day).toMatch(/25/)
    expect(avail.teams).toEqual(['Media'])
    expect(avail.detail).toBe('Answers close in 3 days')
    const [two] = toReminders([row({ kind: 'availability', ref_id: 's2', detail: 'Audio, Media, Worship', on_date: '2026-10-25' })], now)
    expect(two.teams).toEqual(['Audio', 'Media', 'Worship'])
    expect(two.detail).toBeUndefined()
    expect(mention).toMatchObject({ eyebrow: 'You were mentioned', readsOnOpen: 'mention' })
  })

  it('puts the soonest due first and colours what is due within a day', () => {
    const list = toReminders(
      [
        row({ ref_id: 'later', due_at: '2026-10-30T12:00:00Z' }),
        row({ ref_id: 'none', due_at: null }),
        row({ ref_id: 'soon', due_at: '2026-10-23T18:00:00Z' }),
      ],
      now,
    )
    expect(list.map((r) => r.refId)).toEqual(['soon', 'later', 'none'])
    expect(list.map((r) => r.tone)).toEqual(['warning', 'accent', 'accent'])
  })

  it('leaves out a kind the app does not know yet', () => {
    expect(toReminders([row({ kind: 'something_new' })], now)).toEqual([])
  })
})

/*
 * Answering takes the reminder off the dashboard at once, rather than
 * leaving the cached "Give availability" up until the next fetch lands.
 */
describe('withoutAnswered', () => {
  const ask = (ref: string, teams: string): OpenRequest => ({
    kind: 'availability',
    ref_id: ref,
    title: 'English Service',
    detail: teams,
    on_date: '2026-11-15',
    due_at: null,
    created_at: null,
  })
  const poll: OpenRequest = { ...ask('s1', ''), kind: 'poll', detail: null }

  it('drops the service once its only team is answered', () => {
    expect(withoutAnswered([ask('s1', 'Media')], 's1', 'Media')).toEqual([])
  })

  it('keeps it for the teams still to answer', () => {
    expect(withoutAnswered([ask('s1', 'Audio, Media')], 's1', 'Media')).toEqual([ask('s1', 'Audio')])
  })

  it('leaves other services and other kinds alone', () => {
    const rows = [ask('s2', 'Media'), poll]
    expect(withoutAnswered(rows, 's1', 'Media')).toEqual(rows)
  })
})
