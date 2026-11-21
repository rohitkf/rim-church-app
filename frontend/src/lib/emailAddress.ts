import { DOMAIN_ENDINGS } from './domainEndings'
import { suggestEmail } from './emailDelivery'

/**
 * Whether what was typed can be an email address at all.
 *
 * The rule used to be "something, an @, something, a dot, something",
 * which is the database's own and lets through anything shaped like an
 * address. "ama@gmail.con" is shaped like one. It was taken, the
 * registration went through, and the email service then refused to send
 * to it — so the person got a ticket page and no email, and the office
 * got a red mark to chase. The Owner, November 2026: "People are typing
 * .con in the end instead of .com and since it's going through, Resend
 * fails."
 *
 * So an address is checked the way a mail server would check it before
 * trying: one @, a name before it made of the characters a name may be
 * made of, a domain after it made of labels, and an ending that exists
 * (lib/domainEndings, the root zone's own list). There is no .con, so
 * that is the reason given, and where the ending is one slip from a
 * common one the address they meant is offered with it.
 *
 * What this does not do is guess about addresses that could exist.
 * "ama@gmial.com" is a real ending on a domain somebody could own; it is
 * questioned (`suggestEmail`, lib/emailDelivery) and not refused.
 *
 * This is asked of an account's address only: signing up, a reset link,
 * and (said, not enforced) signing in. It was on the registration and
 * Reception forms for an hour, and the Owner had it taken off them: "Don't
 * touch registration and reception for email issues." Those take whatever
 * is shaped like an address (`looksLikeEmail`, lib/emailDelivery).
 */

export interface EmailProblem {
  /** Why it cannot be an address, in words for whoever typed it. */
  text: string
  /** The address they probably meant, when it can be worked out. */
  meant: string | null
}

const SHAPE = 'That email address doesn’t look right. It should be like name@example.com.'

/** What may come before the @: letters, digits and these, with single dots between runs of them. */
const LOCAL = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i
/** One part of a domain: letters, digits and hyphens, neither first nor last a hyphen. */
const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * The endings an ending is most often a slip for, commonest first. Only
 * asked about an ending that does not exist, so it never talks anybody
 * out of a real one: .co, .cm and .om are all one key from .com, and all
 * three are countries.
 */
const COMMON_ENDINGS = ['com', 'net', 'org', 'uk', 'info', 'edu', 'gov', 'in', 'io', 'me']

/** A two-part ending typed without its dot: name@hotmail.couk. */
const JOINED_ENDINGS: Record<string, string> = {
  couk: 'co.uk',
  orguk: 'org.uk',
  acuk: 'ac.uk',
  comau: 'com.au',
  conz: 'co.nz',
  coza: 'co.za',
  coin: 'co.in',
}

/** Whether `a` is `b` with one slip: a key missed, one too many, a wrong one, or two the wrong way round. */
function oneSlipApart(a: string, b: string): boolean {
  if (a === b) return false
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const differ = [...a].map((ch, i) => (ch === b[i] ? -1 : i)).filter((i) => i >= 0)
    if (differ.length === 1) return true
    return differ.length === 2 && differ[1] === differ[0] + 1 && a[differ[0]] === b[differ[1]] && a[differ[1]] === b[differ[0]]
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a]
  for (let i = 0; i < long.length; i += 1) if (long.slice(0, i) + long.slice(i + 1) === short) return true
  return false
}

/** The real ending an unreal one was most likely meant to be. */
function endingMeant(ending: string): string | null {
  if (JOINED_ENDINGS[ending]) return JOINED_ENDINGS[ending]
  return COMMON_ENDINGS.find((common) => oneSlipApart(ending, common)) ?? null
}

/** Before and after the @, or null when there is not exactly one of them with something either side. */
function halves(address: string): { local: string; domain: string } | null {
  const at = address.indexOf('@')
  if (at < 1 || at !== address.lastIndexOf('@') || at === address.length - 1) return null
  return { local: address.slice(0, at), domain: address.slice(at + 1).toLowerCase() }
}

/** The check itself, without the mending: what is wrong, and the ending at fault if that is what it is. */
function fault(address: string): { text: string; ending?: string } | null {
  if (/\s/.test(address) || address.length > 254) return { text: SHAPE }
  const parts = halves(address)
  if (!parts) return { text: SHAPE }
  if (parts.local.length > 64 || !LOCAL.test(parts.local)) return { text: SHAPE }
  const labels = parts.domain.split('.')
  if (labels.length < 2 || parts.domain.length > 253 || !labels.every((label) => LABEL.test(label))) return { text: SHAPE }
  const ending = labels[labels.length - 1]
  if (!DOMAIN_ENDINGS.has(ending)) return { text: `Email addresses do not end in “.${ending}”. Check the end of yours.`, ending }
  return null
}

/**
 * The slips a keyboard makes around an address, taken back out: spaces,
 * a comma where a dot was meant, dots doubled or left on the end.
 */
function tidied(address: string): string {
  return address
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/@\./, '@')
    .replace(/\.+$/, '')
}

/**
 * What is wrong with an address, or null: it can be one.
 *
 * Empty is a problem here too, said plainly; a form that has its own
 * words for an empty box asks about that first.
 */
export function emailProblem(address: string): EmailProblem | null {
  const typed = address.trim()
  if (!typed) return { text: 'Enter an email address.', meant: null }
  const wrong = fault(typed)
  if (!wrong) return null

  // The address with the slip mended, offered only when the mended one stands.
  let meant: string | null = null
  if (wrong.ending) {
    const real = endingMeant(wrong.ending)
    if (real) meant = `${typed.slice(0, typed.length - wrong.ending.length)}${real}`
  } else {
    const mended = tidied(typed)
    if (mended !== typed) {
      const still = fault(mended)
      if (!still) meant = mended
      else if (still.ending) {
        const real = endingMeant(still.ending)
        if (real) meant = `${mended.slice(0, mended.length - still.ending.length)}${real}`
      }
    }
  }
  if (meant && fault(meant)) meant = null
  return { text: wrong.text, meant }
}

/** A problem as one line, the address they meant on the end of it: for a form that lists what is wrong. */
export const emailProblemWords = (problem: EmailProblem): string =>
  problem.meant ? `${problem.text} Did you mean ${problem.meant}?` : problem.text

/** Can be an address: the check every form that takes a new one asks. */
export const isEmailAddress = (address: string): boolean => emailProblem(address) === null

/**
 * The address they probably meant, whether what they typed cannot be one
 * (the mended address) or can but looks like a slip for a well-known
 * domain (`suggestEmail`). Null when nothing about it looks wrong.
 */
export function emailMeant(address: string): string | null {
  const problem = emailProblem(address)
  return problem ? problem.meant : suggestEmail(address)
}
