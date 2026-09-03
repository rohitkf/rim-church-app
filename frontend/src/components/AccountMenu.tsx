import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../lib/useTheme'
import { useTeamStyle } from '../lib/useTeamStyle'
import type { ThemePreference } from '../lib/theme'
import type { TeamStylePreference } from '../lib/teamStyle'
import { SettingsIcon, UserCircleIcon } from './icons'
import { ageFrom } from '../lib/celebrations'

const THEME_CHOICES: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
]

// How a team's colour is drawn everywhere it appears. Same colour either
// way — this only decides how much of the row it is allowed to use.
const TEAM_STYLE_CHOICES: { value: TeamStylePreference; label: string }[] = [
  { value: 'dot', label: 'Dot' },
  { value: 'gradient', label: 'Gradient' },
]

interface AccountMenuProps {
  initials: string
  onSignOut: () => void
}

/**
 * The avatar in the top bar, and what sits behind it: your name, your
 * profile settings, and signing out. Closes on a click anywhere else or on
 * Escape, the way a menu is expected to.
 */
/**
 * The one role a person is described by, most senior first.
 *
 * Roles are undefined for the moment between mount and the profile
 * landing, so this must not assume the list is there — an avatar menu is
 * not worth a crash.
 */
function primaryRoleLabel(isAdmin: boolean, roles?: { role_type: string }[]): string {
  if (isAdmin) return 'Admin'
  if (roles?.some((r) => r.role_type === 'department_head')) return 'Department Head'
  if (roles?.some((r) => r.role_type === 'assisting_head')) return 'Assisting Head'
  return 'Team Member'
}

export function AccountMenu({ initials, onSignOut }: AccountMenuProps) {
  const { profile, roles, isAdmin } = useAuth()
  const age = ageFrom(profile?.dob)
  const { preference, choose } = useTheme()
  const { teamStyle, choose: chooseTeamStyle } = useTeamStyle()
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const itemClasses =
    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-body-sm text-on-surface hover:bg-surface-container'

  return (
    <div ref={wrapper} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account"
        className="flex h-10 w-10 items-center justify-center rounded-full sm:h-9 sm:w-9 bg-surface-container font-mono text-label-sm text-on-surface hover:bg-surface-high"
      >
        {initials || <UserCircleIcon width={18} height={18} />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-[var(--radius-card)] bg-surface-lowest hairline py-1 shadow-lg"
        >
          <div className="border-b border-border-subtle px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="break-words text-body-sm font-medium text-on-surface">
                {profile ? `${profile.first_name} ${profile.last_name}` : 'Signed in'}
              </span>
              {/* What you are allowed to do here. The sidebar used to say it
                  under the church's name; this is where it lives now. */}
              <span className="ml-auto shrink-0 rounded-full bg-raised-strong px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">
                {primaryRoleLabel(isAdmin, roles)}
              </span>
            </div>
            {profile?.email && (
              <div className="mt-0.5 break-all text-label-sm text-on-surface-faint">
                {profile.email}
              </div>
            )}
            {/* Only once a birthday is on file, and only the number: the
                date itself is on the profile page, and this is a menu. */}
            {age !== null && (
              <div className="mt-0.5 font-mono text-label-sm text-on-surface-faint">
                {age} years old
              </div>
            )}
          </div>

          <div className="border-b border-border-subtle px-3 py-2.5">
            <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
              Appearance
            </div>
            <div className="mt-2 flex rounded-full hairline p-0.5">
              {THEME_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => choose(choice.value)}
                  aria-pressed={preference === choice.value}
                  className={`flex-1 rounded-sm px-2 py-1 text-label-sm transition-colors ${
                    preference === choice.value
                      ? 'bg-primary font-medium text-on-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>

            <div className="mt-3 font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
              Teams
            </div>
            <div className="mt-2 flex rounded-full hairline p-0.5">
              {TEAM_STYLE_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => chooseTeamStyle(choice.value)}
                  aria-pressed={teamStyle === choice.value}
                  className={`flex-1 rounded-sm px-2 py-1 text-label-sm transition-colors ${
                    teamStyle === choice.value
                      ? 'bg-primary font-medium text-on-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>

          <Link to="/settings/profile" role="menuitem" onClick={() => setOpen(false)} className={itemClasses}>
            <SettingsIcon width={16} height={16} className="shrink-0" />
            Settings
          </Link>

          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className={`${itemClasses} text-error hover:bg-error-container/40`}
          >
            <LogOutIcon />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

function LogOutIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}
