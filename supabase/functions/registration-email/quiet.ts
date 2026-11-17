/*
 * The quiet ten minutes.
 *
 * The attendee's own two kinds — the ticket just made (`confirm`) and
 * "get my tickets again" (`resend`) — can be asked for by anybody who
 * holds the public key, so they are held back: an address is not written
 * to twice inside ten minutes, however often the button is pressed.
 *
 * What is held is an email that would say nothing new. So the quiet holds
 * only when *every* ticket the email would carry has itself been emailed
 * in the last ten minutes. It used to hold when *any* of them had — which
 * kept back a ticket that had never been sent at all, whenever another
 * registration under the same address had gone out a moment before. For
 * most tickets that only delayed a copy of a page they were already
 * looking at; for a personal invitation's (0297), which is handed to
 * nobody's screen and reaches its holder by this email alone, it meant
 * no ticket until they came back and asked again.
 *
 * It cannot be used to write to an address more often: the email that
 * goes stamps every ticket it carried, so the very next ask is quiet. A
 * new ticket under an address has always sent one email; it still sends
 * one.
 *
 * In a file of its own so the app's tests can run it (the function runs
 * in Deno, where none of them do).
 */

export const QUIET_MINUTES = 10

/** Whether an email carrying these tickets is held back: every one of them was emailed inside the quiet period. */
export function heldByQuiet(orders: readonly { email_sent_at: string | null }[], nowMs: number, minutes: number = QUIET_MINUTES): boolean {
  const quietFrom = nowMs - minutes * 60_000
  return orders.length > 0 && orders.every((o) => o.email_sent_at !== null && new Date(o.email_sent_at).getTime() > quietFrom)
}
