import { Resolver } from 'node:dns/promises'
import { DNS_DEADLINE_MS, domainOf, mailDomain, mailDomainAnswer } from './_mailDomain.js'

/*
 * /api/mail-domain?domain=example.com: can anything receive email there?
 * (See _mailDomain.js.) Asked by the sign-up form before an account is
 * made; only ever given a domain, never an address.
 */
export async function GET(request) {
  const domain = domainOf(new URL(request.url).searchParams.get('domain'))
  const answer = domain ? await mailDomain(domain, new Resolver({ timeout: DNS_DEADLINE_MS, tries: 1 })) : null
  const { status, body, cache } = mailDomainAnswer(domain, answer)
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  })
}
