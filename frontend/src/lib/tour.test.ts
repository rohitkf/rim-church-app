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
import { ruleFor } from './pageAccess'
import { sectionFor } from './settingsSections'

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
    expect(chaptersFor('church').map((c) => c.key)).toEqual(['welcome', 'around', 'church'])
    expect(chaptersFor('member').map((c) => c.key)).toEqual(['welcome', 'around', 'church', 'serving', 'team', 'talk'])
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
    expect(dueChapters(chapters, seen, null).map((c) => c.key)).toEqual(['serving', 'team', 'talk'])
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
    expect(currentTour()?.chapters.map((c) => c.key)).toEqual(['welcome', 'around', 'church'])
    endTour()
    expect(currentTour()).toBeNull()
  })

  it('does not start on nothing', () => {
    startTour([], 'manual')
    expect(currentTour()).toBeNull()
  })
})
