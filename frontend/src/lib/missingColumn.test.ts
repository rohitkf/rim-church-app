import { describe, expect, it } from 'vitest'
import { isMissingColumnError } from './missingColumn'

const undefinedColumn = {
  code: '42703',
  message: 'column profiles.anniversary does not exist',
}

describe('isMissingColumnError', () => {
  it('recognises an undefined-column rejection', () => {
    expect(isMissingColumnError(undefinedColumn)).toBe(true)
    expect(isMissingColumnError(undefinedColumn, 'anniversary')).toBe(true)
  })

  it('does not confuse it with another missing column', () => {
    expect(isMissingColumnError(undefinedColumn, 'dob')).toBe(false)
  })

  it('leaves every other failure alone', () => {
    expect(isMissingColumnError({ code: '42P01', message: 'relation does not exist' })).toBe(false)
    expect(isMissingColumnError(new Error('network'))).toBe(false)
    expect(isMissingColumnError(null)).toBe(false)
  })
})
