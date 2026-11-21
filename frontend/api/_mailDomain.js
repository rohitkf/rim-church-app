/*
 * Whether anything can receive email at a domain, asked of the DNS.
 *
 * An address can be shaped like one, end in a real ending, and still go
 * nowhere: "ama@gmaill.co.uk" if nobody owns gmaill.co.uk. Signing up with
 * it makes an account whose confirmation email can never arrive (the
 * Owner, November 2026: "it doesn't make sense to save that email to
 * database if the email itself is wrong or doesn't exist"). Whether a
 * *mailbox* exists cannot be asked without sending to it; whether the
 * *domain* takes mail at all can, and that is what this answers.
 *
 * Only the domain is looked up, never the name before the @, and it is
 * asked of the DNS from here — nobody's address is handed to a checking
 * service.
 *
 * The answer is one of three, and only "no" stops anybody:
 *
 *   yes      it publishes where its mail goes (MX), or has an address of
 *            its own, which is where mail goes when it publishes none
 *            (RFC 5321 §5.1)
 *   no       there is no such domain, or it says in so many words that it
 *            takes no mail (a "null MX", RFC 7505), or it has neither a
 *            mail server nor an address
 *   unknown  the question could not be answered: a timeout, a name server
 *            that failed. Never a reason to turn somebody away.
 */

/** How long the DNS is given before the answer is "unknown". */
export const DNS_DEADLINE_MS = 3000

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * A domain as it is looked up, or null when what was sent is not one:
 * lower case, at least two labels of letters, digits and hyphens.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function domainOf(raw) {
  if (typeof raw !== 'string') return null
  const domain = raw.trim().toLowerCase().replace(/\.$/, '')
  if (!domain || domain.length > 253) return null
  const labels = domain.split('.')
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null
  return domain
}

/** The DNS said the name does not exist. */
const noSuchName = (error) => error?.code === 'ENOTFOUND'
/** The name exists and has no record of the kind asked for. */
const noSuchRecord = (error) => error?.code === 'ENODATA'

/**
 * Ask whether `domain` takes mail. Never throws: every way of failing is
 * "unknown".
 * @param {string} domain as `domainOf` gives it
 * @param {{ resolveMx: (d: string) => Promise<{ exchange: string, priority: number }[]>, resolve4: (d: string) => Promise<string[]>, resolve6: (d: string) => Promise<string[]> }} dns
 * @returns {Promise<{ accepts: 'yes' | 'no' | 'unknown', why: string }>}
 */
export async function mailDomain(domain, dns) {
  try {
    const servers = await dns.resolveMx(domain)
    const real = servers.filter((mx) => mx.exchange && mx.exchange !== '.')
    if (real.length > 0) return { accepts: 'yes', why: 'It publishes a mail server.' }
    // Records, and none of them a server: "." is how a domain says it takes no mail.
    if (servers.length > 0) return { accepts: 'no', why: 'It says it takes no email.' }
  } catch (error) {
    if (noSuchName(error)) return { accepts: 'no', why: 'There is no such domain.' }
    if (!noSuchRecord(error)) return { accepts: 'unknown', why: 'The DNS could not be asked.' }
  }
  // No mail server published: mail then goes to the domain's own address, if it has one.
  let unknown = false
  for (const ask of [dns.resolve4, dns.resolve6]) {
    try {
      if ((await ask.call(dns, domain)).length > 0) return { accepts: 'yes', why: 'It has no mail server of its own, but it has an address.' }
    } catch (error) {
      if (noSuchName(error)) return { accepts: 'no', why: 'There is no such domain.' }
      if (!noSuchRecord(error)) unknown = true
    }
  }
  return unknown
    ? { accepts: 'unknown', why: 'The DNS could not be asked.' }
    : { accepts: 'no', why: 'It has no mail server and no address.' }
}

/**
 * The answer as the app is given it: the HTTP status, the body and how
 * long it may be kept. A definite answer is kept (an hour at the edge):
 * gmail.com is asked about by everybody, and whether it takes mail does
 * not change by the minute. "Unknown" is never kept.
 * @param {string | null} domain
 * @param {{ accepts: 'yes' | 'no' | 'unknown', why: string } | null} answer
 */
export function mailDomainAnswer(domain, answer) {
  if (!domain || !answer) {
    return { status: 400, body: { error: 'Ask about a domain: /api/mail-domain?domain=example.com' }, cache: 'no-store' }
  }
  const accepts = answer.accepts === 'yes' ? true : answer.accepts === 'no' ? false : null
  return {
    status: 200,
    body: { domain, accepts, why: answer.why },
    cache: accepts === null ? 'no-store' : 'public, max-age=300, s-maxage=3600',
  }
}
