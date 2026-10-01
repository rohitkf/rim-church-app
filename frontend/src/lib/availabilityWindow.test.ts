import { describe, expect, it } from 'vitest'
import {
  AVAILABILITY_WINDOW_DAYS,
  availabilityHorizon,
  availabilityWindowDays,
  opensByDefault,
} from './availabilityWindow'

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
