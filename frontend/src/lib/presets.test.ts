import { describe, expect, it } from 'vitest'
import { PRESETS, presetOver } from './presets'
import { CAPABILITY_KEYS, GRANT_ROLES, changesBetween, reachOf, ruleFor } from './permissions'

describe('presets', () => {
  it('offers Strict, Balanced and Open', () => {
    expect(PRESETS.map((p) => p.label)).toEqual(['Strict', 'Balanced', 'Open'])
  })

  it('sets only reaches each row offers', () => {
    for (const preset of PRESETS) {
      const out = presetOver(preset.key, {})
      for (const cap of CAPABILITY_KEYS) {
        for (const role of GRANT_ROLES) {
          const chosen = out[cap]?.[role]
          if (chosen) expect(ruleFor(cap, role).reaches, `${preset.key} ${cap} ${role}`).toContain(chosen)
        }
      }
    }
  })

  it('never widens a cell when Strict, nor narrows one when Open', () => {
    const rank = { none: 0, own: 1, team: 2, all: 3 }
    const strict = presetOver('strict', {})
    const open = presetOver('open', {})
    for (const cap of CAPABILITY_KEYS) {
      for (const role of GRANT_ROLES) {
        const byDefault = ruleFor(cap, role).byDefault
        expect(rank[reachOf(strict, cap, role)], `strict ${cap} ${role}`).toBeLessThanOrEqual(rank[byDefault])
        expect(rank[reachOf(open, cap, role)], `open ${cap} ${role}`).toBeGreaterThanOrEqual(rank[byDefault])
      }
    }
    // Deleting a release request outright stays off for Heads, as out of the box.
    expect(reachOf(strict, 'rota.release_delete', 'head')).toBe('none')
  })

  it('is the app’s defaults when Balanced', () => {
    expect(changesBetween({}, presetOver('balanced', {}))).toEqual([])
    // A church that moved a cell gets it back.
    expect(changesBetween({ 'rota.assign': { member: 'team' } }, presetOver('balanced', { 'rota.assign': { member: 'team' } }))).toEqual([
      { role: 'member', capability: 'rota.assign', reach: 'none' },
    ])
  })

  it('keeps Heads to their own team, and everybody else to the least, when Strict', () => {
    const out = presetOver('strict', {})
    expect(reachOf(out, 'rota.assign', 'head')).toBe('team')
    expect(reachOf(out, 'rota.assign', 'assistant')).toBe('team')
    expect(reachOf(out, 'msg.chat', 'member')).toBe('none')
    expect(reachOf(out, 'svc.manage', 'head')).toBe('none')
  })

  it('lets a team’s people do what its Heads may on it, no further, when Open', () => {
    const out = presetOver('open', {})
    expect(reachOf(out, 'rota.assign', 'member')).toBe('team')
    expect(reachOf(out, 'rota.assign', 'coordinator')).toBe('team')
    // A row with no team reach is left at its default.
    expect(reachOf(out, 'prayer.pastoral', 'member')).toBe('none')
  })

  it('leaves Admins, Overwatch, Pastors and who opens which page alone', () => {
    const stored = { 'rota.assign': { admin: 'none' as const }, 'msg.chat': { overwatch: 'none' as const }, 'page.rota': { newcomer: 'all' as const } }
    for (const preset of PRESETS) {
      const out = presetOver(preset.key, stored)
      expect(reachOf(out, 'rota.assign', 'admin'), preset.key).toBe('none')
      expect(reachOf(out, 'msg.chat', 'overwatch'), preset.key).toBe('none')
      expect(reachOf(out, 'page.rota', 'newcomer'), preset.key).toBe('all')
      expect(changesBetween(stored, out).some((c) => c.capability.startsWith('page.') || c.role === 'admin' || c.role === 'overwatch' || c.role === 'pastor')).toBe(false)
    }
  })
})
