import { useTeamStyle } from '../lib/useTeamStyle'

/**
 * Top-bar switch between the two ways of drawing a team.
 *
 * It lives beside the theme toggle because it is the same kind of setting —
 * how the app looks to you, not what it holds — and because a preference
 * buried in a menu is a preference nobody finds. Like the theme toggle, the
 * icon shows where a click will take you: a swatch when the next state is
 * gradient, a dot when it is back to dots.
 */
export function TeamStyleToggle() {
  const { teamStyle, toggle } = useTeamStyle()
  const goingTo = teamStyle === 'gradient' ? 'dots' : 'gradients'

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Show teams as ${goingTo}`}
      aria-label={`Show teams as ${goingTo}`}
      className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
    >
      {teamStyle === 'gradient' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="team-style-toggle" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="currentColor" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5.5" fill="url(#team-style-toggle)" />
        </svg>
      )}
    </button>
  )
}
