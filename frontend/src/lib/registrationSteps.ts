/**
 * Where a registration stands, as steps: Register → Pay → Receipt → Ticket.
 *
 * People registered and stopped, taking the page they landed on for a
 * ticket (the Owner, November 2026). A row of numbered steps says at a
 * glance what is done, what is theirs to do now, and what is still ahead —
 * on the ticket page, and (shorter) on the form before they start.
 *
 * Pure, so every state an order can be in is pinned by a test rather than
 * found on a phone at the door. The pay box under the bar numbers its two
 * parts with the same numbers (stepNumber), so the two never disagree.
 */

export type StepKey = 'register' | 'pay' | 'receipt' | 'ticket'
export type StepState = 'done' | 'current' | 'todo'

export interface Step {
  key: StepKey
  label: string
  state: StepState
}

export interface StepsView {
  steps: Step[]
  /** The current step said in words, under the bar. Null once everything is done. */
  caption: string | null
}

/** What the steps are read from: an order as the ticket page has it. */
export interface StepsOrder {
  status: 'confirmed' | 'cancelled' | string
  total_pence: number
  payment_status: 'not_needed' | 'awaiting' | 'reported' | 'received' | 'waived'
  payment_method: 'paypal' | 'bank' | 'reception' | null
  event: { cancelled_at?: string | null; allow_pay_at_reception: boolean }
  payment: { links: unknown[]; accounts: unknown[] }
}

const LABEL: Record<StepKey, string> = { register: 'Register', pay: 'Pay', receipt: 'Receipt', ticket: 'Ticket' }

const build = (keys: StepKey[], current: StepKey | null): Step[] => {
  const at = current ? keys.indexOf(current) : keys.length
  return keys.map((key, i) => ({ key, label: LABEL[key], state: i < at ? 'done' : i === at ? 'current' : 'todo' }))
}

/** An event with a link or a bank account to pay by: paying has a receipt to send. */
export function paysOnline(order: Pick<StepsOrder, 'payment'>): boolean {
  return order.payment.links.length > 0 || order.payment.accounts.length > 0
}

/**
 * The steps for an order, or null where steps would say nothing: a free
 * order (registering is all of it), a cancelled one, a cancelled event.
 */
export function registrationSteps(order: StepsOrder, pounds: (pence: number) => string): StepsView | null {
  if (order.status !== 'confirmed' || order.event.cancelled_at) return null
  if (order.total_pence <= 0 || order.payment_status === 'not_needed') return null

  const online = paysOnline(order)
  const withReceipt: StepKey[] = ['register', 'pay', 'receipt', 'ticket']
  const withoutReceipt: StepKey[] = ['register', 'pay', 'ticket']
  const total = pounds(order.total_pence)

  if (order.payment_status === 'received' || order.payment_status === 'waived') {
    // Money taken by hand, or waived, had no receipt to send.
    const sentReceipt = order.payment_method === 'paypal' || order.payment_method === 'bank'
    return { steps: build(sentReceipt ? withReceipt : withoutReceipt, null), caption: null }
  }

  if (order.payment_status === 'reported') {
    // Their part is done; the church matching it is what turns it into a ticket.
    const steps = build(withReceipt, 'ticket')
    return { steps, caption: `Step 4 of 4: your receipt is being checked. It becomes your ticket once the church matches the payment.` }
  }

  // Awaiting payment.
  const keys = online ? withReceipt : withoutReceipt
  const steps = build(keys, 'pay')
  const reception = order.event.allow_pay_at_reception
  const caption = online
    ? order.payment_method === 'reception'
      ? `Step 2 of ${keys.length}: pay ${total} at reception — or pay online now, below.`
      : `Step 2 of ${keys.length}: pay ${total}, then send your receipt.`
    : `Step 2 of ${keys.length}: pay ${total}${reception ? ' at reception' : ''}.`
  return { steps, caption }
}

/** The form, before anybody has registered: Register is the step they are on. */
export function registerFormSteps(pounds: string): StepsView {
  return { steps: build(['register', 'pay', 'ticket'], 'register'), caption: `Step 1 of 3: register. Next you pay ${pounds}, and then it is your ticket.` }
}

/** The number a step wears in the bar, for the pay box to wear the same. */
export function stepNumber(view: StepsView, key: StepKey): number | null {
  const i = view.steps.findIndex((s) => s.key === key)
  return i < 0 ? null : i + 1
}
