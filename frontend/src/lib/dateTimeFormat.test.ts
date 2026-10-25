import { describe, expect, it } from 'vitest'
import { parseTypedTime } from './dateTimeFormat'

describe('a time as it is typed', () => {
  it('reads it however it is written', () => {
    for (const typed of ['09.29', '9.29', '09:29', '9:29', '0929', '929', '9 29', ' 9,29 ', '9h29'])
      expect(parseTypedTime(typed), typed).toBe('09:29')
    expect(parseTypedTime('21.45')).toBe('21:45')
    expect(parseTypedTime('9')).toBe('09:00')
    expect(parseTypedTime('0')).toBe('00:00')
  })

  it('reads am and pm', () => {
    expect(parseTypedTime('9.29pm')).toBe('21:29')
    expect(parseTypedTime('9:29 AM')).toBe('09:29')
    expect(parseTypedTime('12am')).toBe('00:00')
    expect(parseTypedTime('12.15 p.m.')).toBe('12:15')
  })

  it('will not read what is not a time', () => {
    for (const typed of ['', '24', '24:00', '9:60', '13pm', '0am', '9:2', '09:299', 'nine', '9:29x'])
      expect(parseTypedTime(typed), typed).toBeNull()
  })
})
