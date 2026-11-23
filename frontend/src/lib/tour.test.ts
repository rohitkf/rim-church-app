import { describe, expect, it } from 'vitest'
import {
  TOUR_CHAPTERS,
  chaptersFor,
  currentTour,
  dueChapters,
  endTour,
  startTour,
  stepsOf,
  tourStandingOf,
  type TourContext,
} from './tour'
import { PAGE_RULES, ruleFor } from './pageAccess'
import { SETTINGS_SECTIONS, sectionFor } from './settingsSections'
import { ROLE_NAME } from './roleNames'
import type { ViewAs } from '../auth/AuthContext'

/*
 * The tour's content is data, so it can be held to the app: every step
 * on a page that exists, pointing at an anchor that exists.
 */

const sources = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>
const allSource = Object.values(sources).join('\n')

const everyone: TourContext = {
  firstName: 'Ada',
  onATeam: true,
  canOpen: () => true,
  roomOpen: () => true,
}

describe('the chapters', () => {
  it('each point at a page the app has', () => {
    for (const chapter of TOUR_CHAPTERS) {
      for (const step of chapter.steps) {
        const known = step.path === '/settings' || !!ruleFor(step.path) || !!sectionFor(step.path)
        expect(known, `${chapter.key}: ${step.path}`).toBe(true)
      }
    }
  })

  it('each point at an anchor somebody has written into the app', () => {
    for (const chapter of TOUR_CHAPTERS) {
      for (const step of chapter.steps) {
        if (!step.target) continue
        if (step.target.startsWith('settings:')) {
          expect(sectionFor(step.target.slice('settings:'.length)), `${chapter.key}: ${step.target}`).toBeTruthy()
          continue
        }
        expect(allSource.includes(`data-tour="${step.target}"`), `${chapter.key}: ${step.target}`).toBe(true)
      }
    }
  })

  it('climb the ladder: each standing gets its own chapters and every one below', () => {
    expect(chaptersFor('church').map((c) => c.key)).toEqual(['welcome', 'around', 'church', 'events'])
    expect(chaptersFor('member').map((c) => c.key)).toEqual([
      'welcome',
      'around',
      'church',
      'serving',
      'team',
      'talk',
      'events',
    ])
    expect(chaptersFor('lead').map((c) => c.key)).toContain('leading')
    expect(chaptersFor('lead').map((c) => c.key)).not.toContain('running')
    expect(chaptersFor('admin').map((c) => c.key)).toContain('running')
    expect(chaptersFor('admin').map((c) => c.key)).not.toContain('owner')
    expect(chaptersFor('owner').map((c) => c.key)).toContain('owner')
  })

  it('put the Owner above an Admin, and everybody else where the pages do', () => {
    expect(tourStandingOf({ isOwner: true, standing: 'admin' })).toBe('owner')
    expect(tourStandingOf({ isOwner: false, standing: 'admin' })).toBe('admin')
    expect(tourStandingOf({ isOwner: false, standing: 'church' })).toBe('church')
  })
})

/*
 * Kept up to date by the tests, not by remembering (the Owner's standing
 * instruction, November 2026): a page added to the app, a room added to
 * Settings or a preview added to View as fails here until the tour says
 * something about it — or until it is named below as left out on purpose.
 */
describe('the tour keeps up with the app', () => {
  const steps = TOUR_CHAPTERS.flatMap((c) => c.steps)

  it('has a step on every page the app has', () => {
    const toured = new Set(steps.map((s) => s.path))
    for (const path of Object.keys(PAGE_RULES)) {
      expect(toured.has(path), `no step in lib/tour.ts is on ${path}`).toBe(true)
    }
  })

  /*
   * Rooms the tour walks past, and why: your own two are found from Your
   * account's step and need no telling; the rest set one page's rules, and
   * that page's own step or Page by Page's covers them. A new room is not
   * in this list, so it needs a step or a line here.
   */
  const ROOMS_LEFT_OUT = [
    '/settings/appearance',
    '/settings/notifications',
    '/settings/overwatch',
    '/settings/rota',
    '/settings/giving',
    '/settings/stage',
    '/settings/prayer',
    '/settings/feedback',
  ]

  it('has a step for every room of Settings, bar the ones left out on purpose', () => {
    const toured = new Set(
      steps.map((s) => (s.target?.startsWith('settings:') ? s.target.slice('settings:'.length) : s.path)),
    )
    for (const room of SETTINGS_SECTIONS) {
      const leftOut = ROOMS_LEFT_OUT.includes(room.to)
      expect(toured.has(room.to) !== leftOut, `${room.to}: a step in lib/tour.ts, or a line in ROOMS_LEFT_OUT — one, not both`).toBe(true)
    }
    for (const room of ROOMS_LEFT_OUT) expect(sectionFor(room), room).toBeTruthy()
  })

  /*
   * Every preview View as offers, in the words the tour must use for it.
   * The record is exhaustive over the type, so a new preview is a compile
   * error here before it is a preview the tour never mentions.
   */
  const PREVIEW_WORDS: Record<ViewAs['as'], string> = {
    church: ROLE_NAME.newcomer,
    member: ROLE_NAME.member,
    coordinator: ROLE_NAME.coordinator,
    assistant: ROLE_NAME.assistant,
    head: 'Head',
    overwatch: ROLE_NAME.overwatch,
    pastor: ROLE_NAME.pastor,
    admin: ROLE_NAME.admin,
  }

  it('names every preview View as offers: an Admin’s in Running the app, the Owner’s own in the Owner’s keys', () => {
    const running = TOUR_CHAPTERS.find((c) => c.key === 'running')!.steps.find((s) => s.title === 'Preview as')!
    const owners = TOUR_CHAPTERS.find((c) => c.key === 'owner')!.steps.find((s) => s.title === 'Preview as an Admin')!
    for (const [as, word] of Object.entries(PREVIEW_WORDS)) {
      // Previewing an Admin is the Owner's alone (AuthContext), so it is the Owner's step that says it.
      const step = as === 'admin' ? owners : running
      expect(step.body, `View as ${as}`).toContain(word)
    }
    expect(running.body).not.toContain(ROLE_NAME.admin)
  })
})

describe('the chapter cut by a right', () => {
  const events = TOUR_CHAPTERS.find((c) => c.key === 'events')!

  /** The four pages that open by a right and by nothing else. */
  const BY_RIGHT = ['/registrations', '/door', '/families', '/dbs']
  const opens = (...pages: string[]) => ({ ...everyone, canOpen: (p: string) => !BY_RIGHT.includes(p) || pages.includes(p), roomOpen: () => false })

  it('is shown to nobody who cannot open any of its pages', () => {
    expect(stepsOf(events, opens())).toEqual([])
  })

  it('shows somebody given the door Reception, and not the office or its room in Settings', () => {
    expect(stepsOf(events, opens('/door')).map((s) => s.title)).toEqual(['Reception'])
  })

  // Families and DBS Checks are the Owner's and a Pastor's out of the box (0327): a
  // Pastor is on no rung of the ladder that would show them, so they are here.
  it('shows a Pastor Families and DBS Checks, and none of the door', () => {
    expect(stepsOf(events, opens('/families', '/dbs')).map((s) => s.title)).toEqual(['Families', 'DBS Checks'])
  })

  it('shows somebody given only one of the two that one', () => {
    expect(stepsOf(events, opens('/dbs')).map((s) => s.title)).toEqual(['DBS Checks'])
  })

  it('shows whoever opens all of them all of it', () => {
    expect(stepsOf(events, everyone).map((s) => s.title)).toEqual(['Registrations', 'Reception', 'Who works the door', 'Families', 'DBS Checks'])
  })
})

describe('the steps somebody sees', () => {
  const church = TOUR_CHAPTERS.find((c) => c.key === 'church')!
  const running = TOUR_CHAPTERS.find((c) => c.key === 'running')!

  it('leave out pages the church has shut to them', () => {
    const noPolls = { ...everyone, canOpen: (p: string) => p !== '/polls' }
    expect(stepsOf(church, noPolls).map((s) => s.path)).not.toContain('/polls')
    expect(stepsOf(church, everyone).map((s) => s.path)).toContain('/polls')
  })

  it('tell somebody on no team to find one, and nobody else', () => {
    expect(stepsOf(church, { ...everyone, onATeam: false }).map((s) => s.title)).toContain('Find your team')
    expect(stepsOf(church, everyone).map((s) => s.title)).not.toContain('Find your team')
  })

  it('leave out Settings rooms that are shut to them', () => {
    const noMenu = { ...everyone, roomOpen: (p: string) => p !== '/settings/menu' }
    expect(stepsOf(running, noMenu).map((s) => s.title)).not.toContain('Menu')
    expect(stepsOf(running, everyone).map((s) => s.title)).toContain('Menu')
  })
})

describe('what is due', () => {
  const chapters = chaptersFor('member')

  it('is everything, for somebody the tour has never touched', () => {
    expect(dueChapters(chapters, {}, null).map((c) => c.key)).toEqual(chapters.map((c) => c.key))
  })

  it('is only what has not been seen: the team chapters for a new Team Member', () => {
    const seen = { welcome: '2026-10-01T10:00:00Z', around: '2026-10-01T10:01:00Z', church: '2026-10-01T10:02:00Z' }
    // 'events' is owed to everybody and shown only to whoever has a step in it (stepsOf).
    expect(dueChapters(chapters, seen, null).map((c) => c.key)).toEqual(['serving', 'team', 'talk', 'events'])
  })

  it('is everything again once the tour was sent after it was seen', () => {
    const seen = Object.fromEntries(chapters.map((c) => [c.key, '2026-10-01T10:00:00Z']))
    expect(dueChapters(chapters, seen, '2026-10-05T09:00:00Z')).toHaveLength(chapters.length)
    expect(dueChapters(chapters, seen, '2026-09-01T09:00:00Z')).toHaveLength(0)
  })

  it('is nothing for somebody who has seen it all', () => {
    const seen = Object.fromEntries(chapters.map((c) => [c.key, '2026-10-01T10:00:00Z']))
    expect(dueChapters(chapters, seen, null)).toEqual([])
  })
})

describe('the one tour running', () => {
  it('starts, is there, and ends', () => {
    endTour()
    expect(currentTour()).toBeNull()
    startTour(chaptersFor('church'), 'manual')
    expect(currentTour()?.mode).toBe('manual')
    expect(currentTour()?.chapters.map((c) => c.key)).toEqual(['welcome', 'around', 'church', 'events'])
    endTour()
    expect(currentTour()).toBeNull()
  })

  it('does not start on nothing', () => {
    endTour()
    startTour([], 'manual')
    expect(currentTour()).toBeNull()
  })
})
