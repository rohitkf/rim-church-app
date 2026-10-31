import { describe, expect, it } from 'vitest'
import { toReminders, type OpenRequest } from './reminders'

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
    expect(avail.detail).toContain('Not yet answered for Media')
    const [two] = toReminders([row({ kind: 'availability', ref_id: 's2', detail: 'Audio, Media, Worship', on_date: '2026-10-25' })], now)
    expect(two.detail).toContain('Not yet answered for Audio, Media and Worship')
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
