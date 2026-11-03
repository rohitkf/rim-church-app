import { LABEL_ORIGIN } from './qrLink'

/*
 * Where a registration event and a ticket live (0244) — and, once a link
 * has been shared or a QR code printed, a promise.
 *
 * /register/<slug> is what goes on a poster and in a WhatsApp group;
 * /ticket/<code> is what every ticket's QR code says. Moving either turns
 * what people already hold into a dead link, silently, so both are pinned
 * by a test (registrationLinks.test.ts). A page that has to move keeps
 * these routes and sends them on.
 */

export const REGISTER_PATH = '/register'
export const TICKET_PATH = '/ticket'

/** The public page for an event, at the lasting address (see qrLink's LABEL_ORIGIN). */
export function registerUrl(slug: string, origin: string = LABEL_ORIGIN): string {
  return `${origin.replace(/\/+$/, '')}${REGISTER_PATH}/${slug}`
}

/** An order's ticket page: what its QR code says. */
export function ticketUrl(code: string, origin: string = LABEL_ORIGIN): string {
  return `${origin.replace(/\/+$/, '')}${TICKET_PATH}/${code}`
}

const CODE = /^[A-Z0-9]{12}$/

/**
 * The order code inside a scanned string, or null: a ticket URL from any
 * address it was printed with, or the bare code typed in.
 */
export function codeFromScan(scanned: string): string | null {
  const text = scanned.trim().toUpperCase()
  if (!text) return null
  if (CODE.test(text)) return text
  const marker = `${TICKET_PATH.toUpperCase()}/`
  const at = text.indexOf(marker)
  if (at < 0) return null
  const rest = text.slice(at + marker.length).split(/[/?#]/)[0]
  return CODE.test(rest) ? rest : null
}
