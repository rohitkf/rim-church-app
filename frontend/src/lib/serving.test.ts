import { describe, expect, it } from 'vitest'
import { servingStep } from './serving'

const all = () => true
const base = {
  canOpen: all,
  nextDayServiceIds: ['en', 'ml'],
  myTeamIds: ['media', 'sound'],
  answered: [] as { service_id: string; department_id: string }[],
  onRota: [] as string[],
}
const every = [
  { service_id: 'en', department_id: 'media' },
  { service_id: 'ml', department_id: 'media' },
  { service_id: 'en', department_id: 'sound' },
  { service_id: 'ml', department_id: 'sound' },
]

describe('servingStep', () => {
  it('asks for answers until every team has answered for every service that day', () => {
    expect(servingStep(base)).toBe('/availability')
    expect(servingStep({ ...base, answered: every.slice(0, 3) })).toBe('/availability')
    expect(servingStep({ ...base, answered: every })).toBe('/rota')
  })

  it('goes to the checklists once on the rota, answered or not', () => {
    expect(servingStep({ ...base, onRota: ['ml'] })).toBe('/checklists')
    expect(servingStep({ ...base, answered: every, onRota: ['en'] })).toBe('/checklists')
  })

  it('ignores rota places on other days', () => {
    expect(servingStep({ ...base, answered: every, onRota: ['last-week'] })).toBe('/rota')
  })

  it('starts somebody on no team on the rota, with nothing to answer', () => {
    expect(servingStep({ ...base, myTeamIds: [] })).toBe('/rota')
  })

  it('with no service ahead, there is nothing waiting but the rota', () => {
    expect(servingStep({ ...base, nextDayServiceIds: [] })).toBe('/rota')
  })

  it('passes over a step this person may not open', () => {
    const rotaOnly = (p: string) => p === '/rota'
    expect(servingStep({ ...base, canOpen: rotaOnly })).toBe('/rota')
    expect(servingStep({ ...base, canOpen: () => false })).toBe('/')
  })
})
