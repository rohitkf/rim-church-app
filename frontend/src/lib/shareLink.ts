/**
 * Handing somebody a link to something in the app (November 2026).
 *
 * On a phone "share" means the system's own sheet — WhatsApp, Messages,
 * whatever they use — and that is what is opened. On a desk the same call
 * opens a sheet almost nobody wants; there the link is copied, which is
 * what people do with a link at a desk. Where neither can be done (an old
 * browser, a clipboard the page may not write to) the answer is `failed`,
 * and the page shows the link itself to be copied by hand.
 */

export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed'

/**
 * Where a poll lives: the Polls page, with the poll named. The same form
 * its notification opens (`notificationHref`), so the page already goes
 * to it and marks it.
 *
 * A link is not a way in. The database shows a poll only to the people it
 * was asked of; anybody else who opens the link is told it is not on their
 * list.
 */
export const pollLink = (id: string, origin: string = window.location.origin) =>
  `${origin}/polls?poll=${encodeURIComponent(id)}`

/** A phone or a tablet, as far as a browser will say: the thing in the hand is a finger. */
const inTheHand = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

type Sharer = Pick<Navigator, 'share'> & { clipboard?: Pick<Clipboard, 'writeText'> }

export async function shareLink(
  what: { title: string; text: string; url: string },
  options: { nav?: Partial<Sharer>; touch?: boolean } = {},
): Promise<ShareOutcome> {
  const nav = options.nav ?? (navigator as Partial<Sharer>)
  const touch = options.touch ?? inTheHand()

  if (touch && typeof nav.share === 'function') {
    try {
      await nav.share(what)
      return 'shared'
    } catch (error) {
      // They closed the sheet. That is an answer, not a failure.
      if ((error as { name?: unknown } | null)?.name === 'AbortError') return 'dismissed'
      // Anything else — not allowed here, nothing to share with — and the link is copied instead.
    }
  }

  try {
    if (typeof nav.clipboard?.writeText !== 'function') return 'failed'
    await nav.clipboard.writeText(what.url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
