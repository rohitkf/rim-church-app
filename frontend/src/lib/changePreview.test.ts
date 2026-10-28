import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './appSettings'
import { capabilitiesIn, changeEffects, namesOf } from './changePreview'
import type { PersonEntry } from './peopleFacts'
import type { PersonFacts } from './personAccess'

const W = 'worship'
const M = 'media'
const facts = (id: string, over: Partial<PersonFacts> = {}): PersonFacts => ({
  id,
  owner: false,
  admin: false,
  overwatch: false,
  pastor: false,
  headTeams: [],
  assistTeams: [],
  memberTeams: [],
  coordinatorTeams: [],
  ...over,
})
const entry = (id: string, name: string, over: Partial<PersonFacts> = {}): PersonEntry => ({ id, name, facts: facts(id, over) })

const asha = entry('a', 'Asha Mathew', { memberTeams: [W] })
const ben = entry('b', 'Ben Joseph', { headTeams: [M], memberTeams: [M] })
const owner = entry('o', 'Rohit K', { owner: true })
const admin = entry('d', 'Dee Admin', { admin: true })
const everyone = [asha, ben, owner, admin]
const none = { church: {}, teams: {}, grants: [] }

describe('what saving would do', () => {
  it('names who could do more, and leaves out whoever already could and the Owner', () => {
    const after = { ...none, church: { 'rota.assign': { member: 'team' as const } } }
    const [effect] = changeEffects(everyone, none, after, ['rota.assign'], [W, M], DEFAULT_SETTINGS)
    expect(effect.capability).toBe('rota.assign')
    expect(effect.more.map((p) => p.name)).toEqual(['Asha Mathew'])
    expect(effect.less).toEqual([])
  })

  it('names who would lose it', () => {
    const after = { ...none, church: { 'rota.assign': { admin: 'none' as const } } }
    const [effect] = changeEffects(everyone, none, after, ['rota.assign'], [W, M], DEFAULT_SETTINGS)
    expect(effect.less.map((p) => p.name)).toEqual(['Dee Admin'])
    expect(effect.more).toEqual([])
  })

  it('counts a team’s own rule on that team alone', () => {
    // Worship keeps its rota to its Head; Ben heads Media, so nothing moves for him.
    const after = { ...none, teams: { [W]: { 'rota.assign': { member: 'team' as const } } } }
    const [effect] = changeEffects(everyone, none, after, ['rota.assign'], [W, M], DEFAULT_SETTINGS)
    expect(effect.more.map((p) => p.name)).toEqual(['Asha Mathew'])
  })

  it('says a page opened to Church Members lets in the people on no team', () => {
    const plain = entry('p', 'Pat Lee')
    const after = { ...none, church: { 'page.rota': { newcomer: 'all' as const } } }
    const [effect] = changeEffects([...everyone, plain], none, after, ['page.rota'], [W, M], DEFAULT_SETTINGS)
    expect(effect.more.map((p) => p.name)).toEqual(['Pat Lee'])
  })

  it('names Overwatch as losing a team’s board when its own board stays, not as gaining', () => {
    // Overwatch posts church-wide only; on its team's board it posted as a Team Member.
    const sam = entry('s', 'Sam Paul', { overwatch: true, memberTeams: [W] })
    const after = { ...none, church: { 'msg.board_post': { member: 'none' as const } } }
    const [effect] = changeEffects([sam], none, after, ['msg.board_post'], [W, M], DEFAULT_SETTINGS)
    expect(effect.more).toEqual([])
    expect(effect.less.map((p) => p.name)).toEqual(['Sam Paul'])
  })

  it('reads a grant given, or taken back', () => {
    // Ben heads Media; a grant lets him assign on Worship's rota too.
    const given = { ...none, grants: [{ capability: 'rota.assign', userId: 'b', departmentId: null, reach: 'all' as const, leadsOnly: false }] }
    const [more] = changeEffects(everyone, none, given, ['rota.assign'], [W, M], DEFAULT_SETTINGS)
    expect(more.more.map((p) => p.name)).toEqual(['Ben Joseph'])
    const [less] = changeEffects(everyone, given, none, ['rota.assign'], [W, M], DEFAULT_SETTINGS)
    expect(less.less.map((p) => p.name)).toEqual(['Ben Joseph'])
  })

  it('lists each action once, and a handful of names', () => {
    expect(capabilitiesIn([
      { role: 'member', capability: 'rota.assign', reach: 'team' },
      { role: 'head', capability: 'rota.assign', reach: 'all' },
      { role: 'head', capability: 'rota.tag', reach: 'all' },
    ])).toEqual(['rota.assign', 'rota.tag'])
    expect(namesOf([asha])).toBe('Asha Mathew')
    expect(namesOf([asha, ben])).toBe('Asha Mathew and Ben Joseph')
    expect(namesOf([asha, ben, owner, admin, asha])).toBe('Asha Mathew, Ben Joseph, Rohit K and 2 more')
  })
})
