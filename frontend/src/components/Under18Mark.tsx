/**
 * "Under 18", beside somebody's name (0321).
 *
 * Drawn only for a reader the database told (lib/minors `useMinors`), so
 * a page passes whether the person is in that set and nothing more. It
 * is words, not a colour alone, and it does not shrink or wrap: beside a
 * long name the name wraps and the mark stays whole.
 */
export function Under18Mark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-full bg-[color-mix(in_oklab,var(--color-accent-orange)_20%,transparent)] px-2 py-0.5 font-mono text-label-sm text-accent-orange-soft ${className}`}
    >
      Under 18
    </span>
  )
}
