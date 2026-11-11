import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_DRAFT,
  closureState,
  closureWords,
  dismissKey,
  draftOf,
  draftProblem,
  endNotice,
  noticeState,
  noticesToShow,
  readDismissed,
  rememberDismissed,
  rowOf,
  toLocalField,
  type Notice,
} from './appNotices'

/*
 * A notice is a line at the top of every page for as long as it is true,
 * and for maintenance a window in which the app is closed (0278). What is
 * tested here is the arithmetic of when: what shows, what a closure says
 * of itself, and what ending one has to change.
 */

const updates = vi.hoisted(() => vi.fn())
vi.mock('./supabaseClient', () => ({
  supabase: {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => ({
          select: () => {
            updates(id, patch)
            return Promise.resolve({ data: [{ id }], error: null })
          },
        }),
      }),
    }),
  },
}))

const NOW = new Date('2026-11-11T12:00:00Z').getTime()
const at = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString()

const notice = (over: Partial<Notice> = {}): Notice => ({
  id: 'n1',
  kind: 'info',
  title: 'Carol service rehearsal',
  body: '',
  starts_at: at(-1),
  ends_at: null,
  dismissible: true,
  closes_app: false,
  closed_from: null,
  closed_until: null,
  created_at: at(-1),
  updated_at: at(-1),
  ...over,
})

const closing = (from: number, until: number, over: Partial<Notice> = {}) =>
  notice({ id: 'm1', kind: 'maintenance', title: 'App maintenance', dismissible: false, closes_app: true, closed_from: at(from), closed_until: at(until), ...over })

// A block, not an expression: a hook that returns a function is handing vitest a clean-up to call.
beforeEach(() => {
  updates.mockReset()
})

describe('when a notice shows', () => {
  it('is scheduled before it starts, showing until it ends, and over after', () => {
    expect(noticeState(notice({ starts_at: at(2) }), NOW)).toBe('scheduled')
    expect(noticeState(notice(), NOW)).toBe('showing')
    expect(noticeState(notice({ ends_at: at(3) }), NOW)).toBe('showing')
    expect(noticeState(notice({ ends_at: at(-0.5) }), NOW)).toBe('over')
  })

  it('with no end shows until somebody ends it', () => {
    expect(noticeState(notice({ starts_at: at(-24 * 90) }), NOW)).toBe('showing')
  })

  it('draws the weightiest first: maintenance, then a warning, then information, newest first among equals', () => {
    const list = [
      notice({ id: 'a', kind: 'info', starts_at: at(-5) }),
      notice({ id: 'b', kind: 'warning', dismissible: false }),
      closing(24, 48, { id: 'c' }),
      notice({ id: 'd', kind: 'info', starts_at: at(-1) }),
      notice({ id: 'later', starts_at: at(1) }),
      notice({ id: 'gone', ends_at: at(-1) }),
    ]
    expect(noticesToShow(list, NOW).map((n) => n.id)).toEqual(['c', 'b', 'd', 'a'])
  })
})

describe('putting a notice away', () => {
  it('hides it on this device, and only if it may be put away', () => {
    const info = notice()
    const warning = notice({ id: 'w', kind: 'warning', dismissible: false })
    const away = new Set([dismissKey(info), dismissKey(warning)])
    expect(noticesToShow([info, warning], NOW, away).map((n) => n.id)).toEqual(['w'])
  })

  it('shows it again once its words have changed', () => {
    const before = notice()
    const away = new Set([dismissKey(before)])
    const after = notice({ title: 'Carol service rehearsal: now Thursday', updated_at: at(0) })
    expect(noticesToShow([after], NOW, away)).toHaveLength(1)
  })

  it('is remembered across visits, and a store that will not answer is not a crash', () => {
    const kept = new Map<string, string>()
    const store = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) }
    rememberDismissed(new Set(['n1@x']), store)
    expect([...readDismissed(store)]).toEqual(['n1@x'])
    const broken = { getItem: () => { throw new Error('private mode') }, setItem: () => { throw new Error('full') } }
    expect([...readDismissed(broken)]).toEqual([])
    expect(() => rememberDismissed(new Set(['a']), broken)).not.toThrow()
    expect([...readDismissed({ getItem: () => '{"not":"a list"}' })]).toEqual([])
  })
})

describe('a closure', () => {
  it('is ahead, running or over, and none where the notice closes nothing', () => {
    expect(closureState(notice(), NOW)).toBe('none')
    expect(closureState(closing(24, 48), NOW)).toBe('ahead')
    expect(closureState(closing(-1, 5), NOW)).toBe('running')
    expect(closureState(closing(-48, -24), NOW)).toBe('over')
  })

  it('says when the app will close, to somebody reading before it does', () => {
    expect(closureWords(closing(24, 48), NOW)).toMatch(/^The app will be closed from .+ until .+\.$/)
  })

  it('says it is closed to everybody else, to somebody let in while it runs', () => {
    expect(closureWords(closing(-1, 5), NOW)).toMatch(/^The app is closed to everybody else until .+\.$/)
  })

  it('says nothing once it is over, or where there is none', () => {
    expect(closureWords(closing(-48, -24), NOW)).toBeNull()
    expect(closureWords(notice(), NOW)).toBeNull()
  })
})

describe('writing a notice', () => {
  const draft = (over = {}) => ({ ...EMPTY_DRAFT, title: 'App maintenance', ...over })

  it('needs a title, and an end after its start', () => {
    expect(draftProblem(EMPTY_DRAFT)).toBe('Give it a title.')
    expect(draftProblem(draft({ title: '   ' }))).toBe('Give it a title.')
    expect(draftProblem(draft({ startsAt: '2026-11-15T09:00', endsAt: '2026-11-15T08:00' }))).toMatch(/stop showing after it starts/)
    expect(draftProblem(draft())).toBeNull()
  })

  it('needs both of a closure’s times, the second after the first', () => {
    const closes = draft({ kind: 'maintenance', closesApp: true })
    expect(draftProblem(closes)).toMatch(/when the app closes and when it opens again/)
    expect(draftProblem({ ...closes, closedFrom: '2026-11-15T09:00', closedUntil: '2026-11-15T09:00' })).toMatch(/open again after it closes/)
    expect(draftProblem({ ...closes, closedFrom: '2026-11-15T09:00', closedUntil: '2026-11-16T09:00' })).toBeNull()
  })

  it('starts now when no start is given', () => {
    expect(rowOf(draft(), NOW).starts_at).toBe(new Date(NOW).toISOString())
  })

  it('lets only maintenance close the app: a warning with the box left ticked closes nothing', () => {
    const row = rowOf(draft({ kind: 'warning', closesApp: true, closedFrom: '2026-11-15T09:00', closedUntil: '2026-11-16T09:00' }), NOW)
    expect(row).toMatchObject({ closes_app: false, closed_from: null, closed_until: null })
  })

  it('stops a closing notice showing when the app opens again, unless told otherwise', () => {
    const row = rowOf(draft({ kind: 'maintenance', closesApp: true, closedFrom: '2026-11-15T09:00', closedUntil: '2026-11-16T09:00' }), NOW)
    expect(row.closes_app).toBe(true)
    expect(row.ends_at).toBe(row.closed_until)
    expect(new Date(row.closed_until as string).getTime()).toBeGreaterThan(new Date(row.closed_from as string).getTime())
  })

  it('makes only information something to put away', () => {
    expect(rowOf(draft({ kind: 'info', dismissible: true }), NOW).dismissible).toBe(true)
    expect(rowOf(draft({ kind: 'warning', dismissible: true }), NOW).dismissible).toBe(false)
    expect(rowOf(draft({ kind: 'maintenance', dismissible: true }), NOW).dismissible).toBe(false)
  })

  it('opens a notice for changing with the times it was given, in this device’s clock', () => {
    const made = draftOf(closing(24, 48, { ends_at: at(48) }))
    expect(made.closesApp).toBe(true)
    expect(made.closedFrom).toBe(toLocalField(at(24)))
    // And back again is the same moment.
    expect(new Date(made.closedFrom).toISOString()).toBe(at(24))
  })
})

describe('ending a notice now', () => {
  it('stops an ordinary one showing', async () => {
    await endNotice(notice(), NOW)
    expect(updates).toHaveBeenCalledWith('n1', { ends_at: new Date(NOW).toISOString() })
  })

  it('opens the app, when it is the one closing it', async () => {
    await endNotice(closing(-1, 5), NOW)
    expect(updates.mock.calls[0][1]).toEqual({ ends_at: new Date(NOW).toISOString(), closed_until: new Date(NOW).toISOString() })
  })

  it('cancels a closure still to come, so nothing closes with no notice to say why', async () => {
    await endNotice(closing(24, 48), NOW)
    expect(updates.mock.calls[0][1]).toEqual({ ends_at: new Date(NOW).toISOString(), closes_app: false, closed_from: null, closed_until: null })
  })

  it('ends one that has not started by bringing its start back, since nothing ends before it starts', async () => {
    await endNotice(notice({ starts_at: at(24) }), NOW)
    const patch = updates.mock.calls[0][1] as { starts_at: string; ends_at: string }
    expect(new Date(patch.starts_at).getTime()).toBeLessThan(new Date(patch.ends_at).getTime())
  })
})
