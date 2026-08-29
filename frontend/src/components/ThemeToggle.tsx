import { useTheme } from '../lib/useTheme'
import { MoonIcon, SunIcon } from './icons'

/**
 * Top-bar light/dark switch. It shows where a click will take you — a sun
 * when the next state is light — and settles "Auto" to whichever it
 * currently resolves to. Auto itself stays available in the account menu,
 * since a toggle can only hold two states honestly.
 */
export function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  const goingTo = resolved === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${goingTo} mode`}
      aria-label={`Switch to ${goingTo} mode`}
      className="flex h-10 w-10 items-center justify-center rounded-full sm:h-9 sm:w-9 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
    >
      {resolved === 'dark' ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
    </button>
  )
}
