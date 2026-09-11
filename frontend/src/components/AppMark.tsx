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
 * Both are the same 36-pixel square with the same corner radius, so
 * nothing in the header moves when a logo arrives or goes.
 */
export function AppMark({ className = '' }: { className?: string }) {
  const { url } = useAppLogo()

  if (url) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden="true"
        // `contain` because a logo is whatever shape it is: a wordmark
        // must not be cropped to a square, and a square one loses
        // nothing by being fitted into one.
        className={`h-9 w-9 shrink-0 rounded-[12px] object-contain ${className}`}
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
