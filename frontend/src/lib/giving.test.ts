import { describe, expect, it } from 'vitest'
import { bankAccountProblem, formatIban, formatSortCode, isSafeLink } from './giving'
import { accountRow } from '../components/GivingSettingsCard'

const account = (over: Partial<Parameters<typeof bankAccountProblem>[0]> = {}) => ({
  label: 'Tithes and offerings',
  account_name: 'Rehoboth International Ministries',
  sort_code: '40-11-62',
  account_number: '12345678',
  iban: '',
  bic: '',
  ...over,
})

describe('a giving link', () => {
  it('has to be https — nothing else on a button every member presses', () => {
    expect(isSafeLink('https://buy.stripe.com/abc')).toBe(true)
    expect(isSafeLink('http://example.com')).toBe(false)
    expect(isSafeLink('javascript:alert(1)')).toBe(false)
    expect(isSafeLink('data:text/html,hi')).toBe(false)
    expect(isSafeLink('https://has a space')).toBe(false)
  })
})

describe('a bank account form', () => {
  it('takes UK details', () => {
    expect(bankAccountProblem(account())).toBeNull()
  })

  it('takes an IBAN on its own, for giving from abroad', () => {
    expect(bankAccountProblem(account({ sort_code: '', account_number: '', iban: 'GB29 NWBK 6016 1331 9268 19' }))).toBeNull()
  })

  it('needs one way to find the account', () => {
    expect(bankAccountProblem(account({ sort_code: '', account_number: '' }))).toMatch(/sort code and account number, or an IBAN/)
  })

  it('says what is wrong with a number in words', () => {
    expect(bankAccountProblem(account({ sort_code: '40-11' }))).toBe('A sort code is six digits.')
    expect(bankAccountProblem(account({ account_number: '123' }))).toMatch(/six to ten digits/)
    expect(bankAccountProblem(account({ bic: 'NOPE' }))).toMatch(/BIC/)
    expect(bankAccountProblem(account({ label: ' ' }))).toMatch(/what the account is for/)
  })

  it('saves the numbers in one spelling, whatever was typed', () => {
    const row = accountRow({
      label: ' Tithes ',
      account_name: 'RIM',
      bank_name: '',
      sort_code: '40 11 62',
      account_number: '1234 5678',
      iban: 'gb29 nwbk 6016 1331 9268 19',
      bic: 'nwbkgb2l',
      reference: '',
      notes: '',
      sort_order: 0,
    })
    expect(row).toMatchObject({
      label: 'Tithes',
      bank_name: null,
      sort_code: '40-11-62',
      account_number: '12345678',
      iban: 'GB29NWBK60161331926819',
      bic: 'NWBKGB2L',
      reference: null,
    })
  })
})

describe('how the numbers are shown', () => {
  it('prints a sort code with dashes and an IBAN in fours', () => {
    expect(formatSortCode('401162')).toBe('40-11-62')
    expect(formatIban('GB29NWBK60161331926819')).toBe('GB29 NWBK 6016 1331 9268 19')
  })
})
