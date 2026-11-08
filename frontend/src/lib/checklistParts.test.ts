import { describe, expect, it } from 'vitest'
import { PART_KEYS, carriesAll, partsOf } from './checklistParts'

describe('which parts of a checklist an assignment carries', () => {
  it('runs in the order the morning does', () => {
    expect(PART_KEYS).toEqual(['pre', 'during', 'post'])
  })

  it('carries every part when it has not said, as every assignment did before 0260', () => {
    expect(partsOf({ include_pre: true, include_post: true })).toEqual({ pre: true, during: true, post: true })
    expect(carriesAll({})).toBe(true)
  })

  it('says when one part has been taken off', () => {
    expect(carriesAll({ include_during: false })).toBe(false)
    expect(partsOf({ include_during: false }).during).toBe(false)
  })
})
