import { useAppLogo } from '../lib/appLogo'

/**
 * The mark at the top-left of every signed-in page.
 *
 * The church's own logo when the owner has uploaded one, and the drawn
 * "RIM" tile when they have not — or when they have taken it down again,
 * or when the signed URL could not be had. The drawn one is not a
 * placeholder to be ashamed of: it is the app's own mark, and it is what
 * every church sees on the day they install this before they have
 * thought about a logo at all.
 *
 * Both stand exactly 36 pixels tall. That is what keeps the mark level
 * with everything else in the header: a logo is whatever shape its owner
 * drew, so pinning the height and letting the width follow is the only
 * measurement that holds for all of them. Fitting a wide wordmark into a
 * 36-pixel *square* instead — which is what this did — shrank it to a
 * ten-pixel strip floating in the middle of a box, which is the "it
 * doesn't line up" that was reported.
 *
 * The upload is trimmed of its blank margin before it is ever stored
 * (see lib/logoImage), so the edges of the picture are the edges of the
 * mark and this height means the same thing for every logo.
 */
export function AppMark({ className = '' }: { className?: string }) {
  const { url } = useAppLogo()

  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden="true"
        // Height fixed, width free to whatever the shape needs, up to a
        // point — a banner of a logo must not push the search box off
        // the header, and a phone has less room to give than a desk. The
        // ceiling is wide enough for a wordmark of about five to one at
        // full height; anything longer than that gives up a little
        // height rather than the search box. `contain` so nothing is
        // ever cropped, `block` so no baseline gap creeps in under it.
        className={`block h-9 w-auto max-w-[7rem] shrink-0 rounded-[10px] object-contain object-left sm:max-w-[11rem] ${className}`}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[linear-gradient(160deg,var(--color-accent-blue),color-mix(in_oklab,var(--color-accent-blue)_55%,black))] font-mono text-[11px] text-white ${className}`}
    >
      RIM
    </span>
  )
}
