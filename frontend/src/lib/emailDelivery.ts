/**
 * What became of a registration's email (0283).
 *
 * The ticket is its page; the email only carries the link — but the email
 * is how most people get back to the page, and one typed with a slip goes
 * nowhere without anybody knowing. So every email the church sends about
 * a registration carries a reference, Resend says what became of it, and
 * the order keeps the story of its latest: `email_status`, when, and — for
 * one that did not arrive — why, in the receiving server's own words.
 *
 * This is the reading of that for the pages: one word for a tag, one
 * sentence for the row, and whether it wants somebody to do something.
 * The statuses are the database's (the check on
 * registration_orders.email_status); a status this build has never heard
 * of reads as "nothing known", not as a crash.
 */

export const EMAIL_STATUSES = ['sent', 'delayed', 'delivered', 'complained', 'bounced', 'suppressed', 'failed'] as const
export type EmailStatus = (typeof EMAIL_STATUSES)[number]

/** What the pages make of it. `unknown` is an email sent before any of this was kept. */
export type DeliveryKind = 'none' | 'unknown' | 'waiting' | 'delivered' | 'bounced' | 'failed'

export interface Delivery {
  kind: DeliveryKind
  /** For a tag on the row: "Email bounced". */
  label: string
  tone: 'neutral' | 'green' | 'orange' | 'red'
  /** For the line under it: what happened, and what it means. */
  says: string
  /** Did not arrive, and somebody should do something: correct the address, or send it again. */
  wants: boolean
}

/** What an order tells about its email; every field as the database sends it. */
export interface EmailFacts {
  email: string | null
  email_sent_at?: string | null
  email_status?: string | null
  anonymised_at?: string | null
}

const isStatus = (s: string | null | undefined): s is EmailStatus => !!s && (EMAIL_STATUSES as readonly string[]).includes(s)

/**
 * What became of the latest email to this order — or null when there is
 * nothing to say: no address on it (a walk-in), or an order whose details
 * the retention job has blanked.
 */
export function deliveryOf(order: EmailFacts): Delivery | null {
  if (!order.email || order.anonymised_at) return null
  const status = isStatus(order.email_status) ? order.email_status : null
  switch (status) {
    case 'delivered':
      return { kind: 'delivered', label: 'Email delivered', tone: 'green', says: 'Their email arrived.', wants: false }
    case 'complained':
      return { kind: 'delivered', label: 'Email delivered', tone: 'green', says: 'Their email arrived, and was then marked as spam.', wants: false }
    case 'sent':
      return { kind: 'waiting', label: 'Email sent', tone: 'neutral', says: 'Sent. Waiting to hear whether it arrived.', wants: false }
    case 'delayed':
      return { kind: 'waiting', label: 'Email delayed', tone: 'orange', says: 'Their mail server has not taken it yet. It is still being tried.', wants: false }
    case 'bounced':
      return { kind: 'bounced', label: 'Email bounced', tone: 'red', says: 'It could not be delivered. The address is probably wrong.', wants: true }
    case 'suppressed':
      return {
        kind: 'bounced',
        label: 'Email bounced',
        tone: 'red',
        says: 'Not sent: an earlier email to this address bounced, so the email service is holding it back. The address is probably wrong.',
        wants: true,
      }
    case 'failed':
      return { kind: 'failed', label: 'Email not sent', tone: 'orange', says: 'The email service did not send it. Send it again.', wants: true }
    default:
      return order.email_sent_at
        ? { kind: 'unknown', label: 'Emailed', tone: 'neutral', says: 'Emailed before delivery was being recorded, so whether it arrived is not known.', wants: false }
        : { kind: 'none', label: 'Not emailed', tone: 'neutral', says: 'No email has gone to this address yet.', wants: false }
  }
}

/** A live registration whose email did not arrive: what the filter and the count go by. */
export function emailWantsDoing(order: EmailFacts & { status: string }): boolean {
  return order.status === 'confirmed' && (deliveryOf(order)?.wants ?? false)
}

/** One word for the spreadsheet. */
export function deliveryWord(order: EmailFacts): string {
  const d = deliveryOf(order)
  if (!d) return ''
  return { none: 'Not emailed', unknown: 'Emailed (not tracked)', waiting: order.email_status === 'delayed' ? 'Delayed' : 'Sent', delivered: 'Delivered', bounced: 'Bounced', failed: 'Not sent' }[d.kind]
}

/* ------------------------------------------------------------------ */
/* A slip in an address, caught before it is sent                      */
/* ------------------------------------------------------------------ */

/** Looks like an address: the same rule the database checks with. */
export const looksLikeEmail = (address: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address.trim())

/**
 * Well-known mail domains as fingers commonly mistype them. Only a domain
 * typed exactly as one of these is questioned — a small company's own
 * domain that happens to look like a slip is left alone.
 */
const DOMAIN_SLIPS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmail.comm': 'gmail.com',
  'googlemail.con': 'googlemail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.couk': 'hotmail.co.uk',
  'hotmail.co.um': 'hotmail.co.uk',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlook.co': 'outlook.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.couk': 'yahoo.co.uk',
  'iclod.com': 'icloud.com',
  'icloud.con': 'icloud.com',
  'icloud.co': 'icloud.com',
  'iclould.com': 'icloud.com',
}

/** The address they probably meant — or null: nothing about it looks like a slip. */
export function suggestEmail(address: string): string | null {
  const typed = address.trim()
  const at = typed.lastIndexOf('@')
  if (at < 1) return null
  const meant = DOMAIN_SLIPS[typed.slice(at + 1).toLowerCase()]
  return meant ? `${typed.slice(0, at)}@${meant}` : null
}

/* ------------------------------------------------------------------ */
/* The ticket page, waiting to hear                                    */
/* ------------------------------------------------------------------ */

/** How long an open ticket page keeps asking whether its email arrived, and how often. */
export const EMAIL_WATCH_MS = 3 * 60_000
export const EMAIL_WATCH_EVERY_MS = 5_000
/** A registration this new has an email still to be sent or just sent. */
const JUST_MADE_MS = 2 * 60_000

/**
 * Whether a ticket page should read its order again soon: a bounce comes
 * back within seconds to a minute, and the attendee who has just
 * registered is still looking at this page — the one moment they can be
 * told their address is wrong. So for a few minutes after the page opens,
 * or after it last asked for an email (a corrected address, "Email me
 * this ticket"), it asks again while the email is on its way — or, moments
 * after a registration or such an ask, about to be. Then it stops: an
 * email delayed for hours is not worth a request every five seconds.
 */
export function watchesEmail(
  order: { email: string | null; email_state: string; created_at: string } | null | undefined,
  page: { openedAt: number; askedAt: number | null },
  nowMs: number,
): boolean {
  if (!order?.email || nowMs - (page.askedAt ?? page.openedAt) > EMAIL_WATCH_MS) return false
  if (order.email_state === 'waiting') return true
  if (order.email_state !== 'none') return false
  const justMade = nowMs - new Date(order.created_at).getTime() < JUST_MADE_MS
  const justAsked = page.askedAt !== null && nowMs - page.askedAt < JUST_MADE_MS
  return justMade || justAsked
}
