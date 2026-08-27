import { describe, expect, it } from 'vitest'
import { idOrNull } from './selectValue'

describe('idOrNull', () => {
  it("turns a select's empty choice into a real null", () => {
    expect(idOrNull('')).toBeNull()
    expect(idOrNull('   ')).toBeNull()
    expect(idOrNull(null)).toBeNull()
    expect(idOrNull(undefined)).toBeNull()
  })

  it('passes a real id through untouched', () => {
    expect(idOrNull('0c3a9b2e-1111-2222-3333-444455556666')).toBe('0c3a9b2e-1111-2222-3333-444455556666')
  })
})
