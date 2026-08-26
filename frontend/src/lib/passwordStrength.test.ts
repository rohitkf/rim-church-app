import { describe, expect, it } from 'vitest'
import { passwordChecks, passwordScore, strengthColorClass, strengthLabel } from './passwordStrength'

describe('passwordChecks', () => {
  it('flags each requirement independently', () => {
    expect(passwordChecks('abcdefgh')).toEqual({
      minLength: true,
      hasUpperLower: false,
      hasNumber: false,
      hasSymbol: false,
    })
    expect(passwordChecks('Ab1!')).toEqual({
      minLength: false,
      hasUpperLower: true,
      hasNumber: true,
      hasSymbol: true,
    })
  })
})

describe('passwordScore', () => {
  it('is 0 for an empty password', () => {
    expect(passwordScore('')).toBe(0)
  })

  it('counts one point per satisfied check', () => {
    expect(passwordScore('abcdefgh')).toBe(1)
    expect(passwordScore('Abcdefgh')).toBe(2)
    expect(passwordScore('Abcdefg1')).toBe(3)
    expect(passwordScore('Abcdefg1!')).toBe(4)
  })
})

describe('strength presentation', () => {
  it('labels every score', () => {
    expect(strengthLabel[0]).toBe('Too weak')
    expect(strengthLabel[4]).toBe('Strong')
  })

  it('colors weak red, fair yellow, good and strong green', () => {
    expect(strengthColorClass(1)).toBe('bg-error')
    expect(strengthColorClass(2)).toBe('bg-warning')
    expect(strengthColorClass(3)).toBe('bg-success')
    expect(strengthColorClass(4)).toBe('bg-success')
  })
})
