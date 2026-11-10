import { describe, expect, it } from 'vitest'
import { registerFormSteps, registrationSteps, stepNumber, type StepsOrder } from './registrationSteps'

const pounds = (p: number) => `£${(p / 100).toFixed(2)}`
const order = (over: Partial<StepsOrder> = {}): StepsOrder => ({
  status: 'confirmed',
  total_pence: 3000,
  payment_status: 'awaiting',
  payment_method: null,
  event: { cancelled_at: null, allow_pay_at_reception: true },
  payment: { links: [{}], accounts: [] },
  ...over,
})
const shape = (o: StepsOrder) => registrationSteps(o, pounds)?.steps.map((s) => `${s.label}:${s.state}`).join(' ')

describe('the steps of a registration', () => {
  it('puts an unpaid order on Pay, with the receipt and the ticket still ahead', () => {
    expect(shape(order())).toBe('Register:done Pay:current Receipt:todo Ticket:todo')
    expect(registrationSteps(order(), pounds)?.caption).toBe('Step 2 of 4: pay £30.00, then send your receipt.')
  })

  it('says reception, and that online is still open, to somebody who chose to pay at reception', () => {
    const o = order({ payment_method: 'reception' })
    expect(shape(o)).toBe('Register:done Pay:current Receipt:todo Ticket:todo')
    expect(registrationSteps(o, pounds)?.caption).toBe('Step 2 of 4: pay £30.00 at reception — or pay online now, below.')
  })

  it('has no receipt step where the event takes no payment online', () => {
    const o = order({ payment: { links: [], accounts: [] } })
    expect(shape(o)).toBe('Register:done Pay:current Ticket:todo')
    expect(registrationSteps(o, pounds)?.caption).toBe('Step 2 of 3: pay £30.00 at reception.')
    const nowhere = order({ payment: { links: [], accounts: [] }, event: { cancelled_at: null, allow_pay_at_reception: false } })
    expect(registrationSteps(nowhere, pounds)?.caption).toBe('Step 2 of 3: pay £30.00.')
  })

  it('counts a bank account as a way to pay online', () => {
    expect(shape(order({ payment: { links: [], accounts: [{}] } }))).toBe('Register:done Pay:current Receipt:todo Ticket:todo')
  })

  it('moves to Ticket, being checked, once the receipt is sent', () => {
    const o = order({ payment_status: 'reported', payment_method: 'bank' })
    expect(shape(o)).toBe('Register:done Pay:done Receipt:done Ticket:current')
    expect(registrationSteps(o, pounds)?.caption).toMatch(/^Step 4 of 4: your receipt is being checked/)
  })

  it('goes back to Pay when the church could not match the payment', () => {
    // "Not received, ask again" puts it back to awaiting and keeps how they said they paid.
    expect(shape(order({ payment_status: 'awaiting', payment_method: 'bank' }))).toBe('Register:done Pay:current Receipt:todo Ticket:todo')
  })

  it('is all done once paid online, and says nothing more', () => {
    const o = order({ payment_status: 'received', payment_method: 'paypal' })
    expect(shape(o)).toBe('Register:done Pay:done Receipt:done Ticket:done')
    expect(registrationSteps(o, pounds)?.caption).toBeNull()
  })

  it('shows no receipt step for money taken at reception, or waived', () => {
    expect(shape(order({ payment_status: 'received', payment_method: 'reception' }))).toBe('Register:done Pay:done Ticket:done')
    expect(shape(order({ payment_status: 'waived', payment_method: null }))).toBe('Register:done Pay:done Ticket:done')
    expect(shape(order({ payment_status: 'waived', payment_method: 'bank' }))).toBe('Register:done Pay:done Receipt:done Ticket:done')
  })

  it('shows nothing for a free order, a cancelled one, or a cancelled event', () => {
    expect(registrationSteps(order({ total_pence: 0, payment_status: 'not_needed' }), pounds)).toBeNull()
    expect(registrationSteps(order({ payment_status: 'not_needed' }), pounds)).toBeNull()
    expect(registrationSteps(order({ status: 'cancelled' }), pounds)).toBeNull()
    expect(registrationSteps(order({ event: { cancelled_at: '2026-11-01T10:00:00Z', allow_pay_at_reception: true } }), pounds)).toBeNull()
  })

  it('never has two current steps, and never a done step after one that is not', () => {
    const methods = [null, 'paypal', 'bank', 'reception'] as const
    const statuses = ['awaiting', 'reported', 'received', 'waived'] as const
    for (const payment_method of methods)
      for (const payment_status of statuses)
        for (const links of [[], [{}]]) {
          const view = registrationSteps(order({ payment_method, payment_status, payment: { links, accounts: [] } }), pounds)!
          const states = view.steps.map((s) => s.state)
          expect(states.filter((s) => s === 'current').length).toBeLessThanOrEqual(1)
          expect(states.join(',')).toMatch(/^(done,?)*(current,?)?(todo,?)*$/)
          expect(states[0]).toBe('done')
          expect(view.caption === null).toBe(!states.includes('current'))
        }
  })

  it('gives the pay box the same numbers the bar shows', () => {
    const four = registrationSteps(order(), pounds)!
    expect([stepNumber(four, 'pay'), stepNumber(four, 'receipt')]).toEqual([2, 3])
    const three = registrationSteps(order({ payment: { links: [], accounts: [] } }), pounds)!
    expect([stepNumber(three, 'pay'), stepNumber(three, 'receipt')]).toEqual([2, null])
  })

  it('starts the form on Register', () => {
    const view = registerFormSteps('£30.00')
    expect(view.steps.map((s) => `${s.label}:${s.state}`).join(' ')).toBe('Register:current Pay:todo Ticket:todo')
    expect(view.caption).toBe('Step 1 of 3: register. Next you pay £30.00, and then it is your ticket.')
  })
})
