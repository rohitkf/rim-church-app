/**
 * Whether anything can receive email at the domain of an address, asked
 * of the server before an account is made (`/api/mail-domain`,
 * api/_mailDomain.js).
 *
 * `lib/emailAddress` says whether what was typed *can* be an address:
 * its shape, and an ending that exists. That lets "ama@gmaill.co.uk"
 * through, because it could be one — and if nobody owns gmaill.co.uk the
 * confirmation email goes nowhere and the account can never be confirmed.
 * This asks the one further thing that can be asked without sending an
 * email: does that domain take mail at all.
 *
 * Only the part after the @ is sent, never the address. And only a
 * definite no is a no: no signal, a slow answer, a server that could not
 * ask — each is "not known", and nobody is turned away on it. The check
 * is a net under the form, not a gate in front of it.
 */

/** How long the answer is waited for before signing up carries on without it. */
export const MAIL_DOMAIN_WAIT_MS = 4000

/** The part of an address after its @, lower case; null when there is not exactly that. */
export function domainOfAddress(address: string): string | null {
  const typed = address.trim()
  const at = typed.lastIndexOf('@')
  if (at < 1 || at === typed.length - 1) return null
  return typed.slice(at + 1).toLowerCase()
}

/**
 * True when the domain takes mail, false when it certainly does not, null
 * when that could not be found out. Never throws.
 */
export async function mailDomainAccepts(address: string, get: typeof fetch = fetch): Promise<boolean | null> {
  const domain = domainOfAddress(address)
  if (!domain) return null
  try {
    const res = await get(`/api/mail-domain?domain=${encodeURIComponent(domain)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(MAIL_DOMAIN_WAIT_MS),
    })
    if (!res.ok) return null
    const body: unknown = await res.json()
    const accepts = body && typeof body === 'object' ? (body as { accepts?: unknown }).accepts : undefined
    return accepts === true || accepts === false ? accepts : null
  } catch {
    // No signal, too slow, or an answer that was not JSON (a host with no such function).
    return null
  }
}

/** What is said under the box when the domain takes no mail. */
export const mailDomainProblem = (address: string): string =>
  `Nothing can receive email at “${domainOfAddress(address) ?? address.trim()}”. Check the part after the @.`
