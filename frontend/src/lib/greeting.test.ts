import { describe, expect, it } from 'vitest'
import { greeting } from './greeting'

const at = (hour: number) => new Date(2026, 7, 28, hour, 30)

describe('greeting', () => {
  it('follows the clock rather than standing still at morning', () => {
    expect(greeting(at(0))).toBe('Good morning')
    expect(greeting(at(9))).toBe('Good morning')
    expect(greeting(at(13))).toBe('Good afternoon')
    expect(greeting(at(21))).toBe('Good evening')
  })

  it('turns over exactly at noon and at six', () => {
    expect(greeting(new Date(2026, 7, 28, 11, 59))).toBe('Good morning')
    expect(greeting(new Date(2026, 7, 28, 12, 0))).toBe('Good afternoon')
    expect(greeting(new Date(2026, 7, 28, 17, 59))).toBe('Good afternoon')
    expect(greeting(new Date(2026, 7, 28, 18, 0))).toBe('Good evening')
  })
})
