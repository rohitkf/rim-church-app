import { describe, expect, it } from 'vitest'
import { STAGE_ICONS, stageIcon } from './stageIcons'

describe('the stage pictures', () => {
  it('have distinct keys the database accepts, and a name each', () => {
    const keys = STAGE_ICONS.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const i of STAGE_ICONS) {
      expect(i.key).toMatch(/^[a-z][a-z0-9-]{0,31}$/)
      expect(i.name.trim().length).toBeGreaterThan(0)
    }
  })
  it('are drawn with only what the PDF writer understands: absolute M, L, H, V, C and Z, inside the 24 box', () => {
    for (const i of STAGE_ICONS) {
      expect(i.d).toMatch(/^[MLHVCZ0-9 .-]+$/)
      for (const n of i.d.match(/-?\d*\.?\d+/g) ?? []) {
        expect(Number(n)).toBeGreaterThanOrEqual(0)
        expect(Number(n)).toBeLessThanOrEqual(24)
      }
    }
  })
  it('finds a picture by key, and nothing for a key it does not know', () => {
    expect(stageIcon('camera')?.name).toBe('Camera')
    expect(stageIcon('hovercraft')).toBeNull()
    expect(stageIcon(null)).toBeNull()
  })
})
