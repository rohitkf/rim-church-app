import { describe, expect, it } from 'vitest'
import {
  AVAILABILITY_WINDOW_DAYS,
  availabilityHorizon,
  availabilityWindowDays,
  opensByDefault,
  splitAvailabilityGroups,
} from './availabilityWindow'

const service = (id: string, date: string, service_type = 'English Service') => ({
  id,
  date,
  service_type,
})

const none = () => false
const ids = (list: { id: string }[]) => list.map((s) => s.id)

describe('availabilityWindowDays', () => {
  it('is three weeks, whatever the rota is set to', () => {
    // The rota's week is right for assigning people and wrong for asking
    // in advance whether they are around.
    expect(availabilityWindowDays(7)).toBe(AVAILABILITY_WINDOW_DAYS)
    expect(AVAILABILITY_WINDOW_DAYS).toBe(21)
  })

  it('widens to the church’s own setting, never narrows below it', () => {
    // A church planning two months out has said so; the page asking "can
    // you serve" should not be the one hiding the question.
    expect(availabilityWindowDays(60)).toBe(60)
  })
})

describe('availabilityHorizon', () => {
  it('reaches three weeks past today', () => {
    expect(availabilityHorizon('2026-09-06', 7)).toBe('2026-09-27')
  })
})

describe('splitAvailabilityGroups', () => {
  const THREE_SUNDAYS = [
    service('a', '2026-09-06'),
    service('b', '2026-09-13'),
    service('c', '2026-09-20'),
  ]

  it('opens the soonest day and files the rest under upcoming', () => {
    const { now, later } = splitAvailabilityGroups(THREE_SUNDAYS, none)
    expect(ids(now)).toEqual(['a'])
    expect(ids(later)).toEqual(['b', 'c'])
  })

  it('keeps a day together, however many services are on it', () => {
    // An English service and a Malayalam service on one Sunday are one
    // occasion to answer for; opening one and folding the other is a
    // distinction the person answering does not have.
    const twoOnOneDay = [
      service('a', '2026-09-06', 'English Service'),
      service('b', '2026-09-06', 'Malayalam Service'),
      service('c', '2026-09-13'),
    ]
    const { now, later } = splitAvailabilityGroups(twoOnOneDay, none)
    expect(ids(now)).toEqual(['a', 'b'])
    expect(ids(later)).toEqual(['c'])
  })

  it('does not let a finished service decide where the line falls', () => {
    // Today's service is over; the next one that can still be answered
    // for is what the page is about.
    const finished = (id: string) => id === 'a'
    const { now, later } = splitAvailabilityGroups(THREE_SUNDAYS, finished)
    expect(ids(now)).toEqual(['a', 'b'])
    expect(ids(later)).toEqual(['c'])
  })

  it('keeps a finished service above the line, where its day puts it', () => {
    const finished = (id: string) => id === 'a'
    const { now } = splitAvailabilityGroups(THREE_SUNDAYS, finished)
    expect(ids(now)).toContain('a')
  })

  it('files nothing under upcoming when everything has finished', () => {
    // It is all a record. Reading it as "what is in front of you" is
    // wrong, but so is filing today's under "upcoming".
    const { now, later } = splitAvailabilityGroups(THREE_SUNDAYS, () => true)
    expect(ids(now)).toEqual(['a', 'b', 'c'])
    expect(later).toEqual([])
  })

  it('copes with nothing at all', () => {
    expect(splitAvailabilityGroups([], none)).toEqual({ now: [], later: [] })
  })
})

describe('opensByDefault', () => {
  it('opens what still needs an answer and is next', () => {
    expect(opensByDefault(true, false)).toBe(true)
  })

  it('folds a finished service, which is a record rather than a question', () => {
    expect(opensByDefault(true, true)).toBe(false)
  })

  it('folds anything three weeks out, which is not today’s problem', () => {
    expect(opensByDefault(false, false)).toBe(false)
  })
})
