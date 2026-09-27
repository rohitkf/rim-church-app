import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth, type ViewAs } from '../auth/AuthContext'
import { fetchDepartments } from '../lib/queries'
import { viewAsLabel } from '../lib/viewAs'
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
function primaryRoleLabel(
  isAdmin: boolean,
  roles?: { role_type: string }[],
  viewAs?: ViewAs | null,
): string {
  if (viewAs?.as === 'church') return 'Church Member'
  if (isAdmin) return 'Admin'
  if (roles?.some((r) => r.role_type === 'department_head')) return 'Department Head'
  if (roles?.some((r) => r.role_type === 'assisting_head')) return 'Assisting Head'
  return 'Team Member'
}

export function AccountMenu({ initials, onSignOut }: AccountMenuProps) {
  const { profile, roles, isAdmin, canPreview, viewAs } = useAuth()
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
                {primaryRoleLabel(isAdmin, roles, viewAs)}
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

          {canPreview && <ViewAsSection onChosen={() => setOpen(false)} />}

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

/**
 * Seeing the app as somebody else sees it — an Admin checking what a
 * Church Member is offered, or what a Head of Media can press, without
 * borrowing their phone. Admins and the owner only; the preview is of the
 * pages and buttons, and the banner it raises says the data is not.
 */
function ViewAsSection({ onChosen }: { onChosen: () => void }) {
  const { viewAs, setViewAs } = useAuth()
  const navigate = useNavigate()
  const [picking, setPicking] = useState<'member' | 'head' | null>(null)
  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: picking !== null,
  })

  function choose(next: ViewAs | null) {
    setViewAs(next)
    setPicking(null)
    onChosen()
    // Wherever the Admin was may be a page the preview cannot open.
    navigate('/')
  }

  const chip =
    'tap rounded-full hairline px-2.5 py-1 text-label-sm text-on-surface hover:bg-surface-container'

  return (
    <div className="border-b border-border-subtle px-3 py-2.5">
      <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
        View as
      </div>
      {viewAs ? (
        <div className="mt-2">
          <p className="text-label-sm text-on-surface-variant">
            Previewing as {viewAsLabel(viewAs)}.
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(null)}
            className="tap mt-2 w-full rounded-full bg-primary px-3 py-1.5 text-label-md font-medium text-on-primary"
          >
            Exit preview
          </button>
        </div>
      ) : picking ? (
        <div className="mt-2">
          <p className="text-label-sm text-on-surface-variant">
            {picking === 'head' ? 'Head of which team?' : 'Member of which team?'}
          </p>
          <ul className="mt-1.5 flex max-h-40 flex-col gap-1 overflow-y-auto">
            {(departmentsQuery.data ?? []).map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() =>
                    choose({ as: picking, departmentId: d.id, departmentName: d.name })
                  }
                  className="w-full rounded-sm px-2 py-1 text-left text-label-md text-on-surface hover:bg-surface-container"
                >
                  {d.name}
                </button>
              </li>
            ))}
            {departmentsQuery.isLoading && (
              <li className="px-2 text-label-sm text-on-surface-faint">Loading…</li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => setPicking(null)}
            className="tap mt-1 text-label-sm text-on-surface-faint hover:text-on-surface"
          >
            Back
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" role="menuitem" onClick={() => choose({ as: 'church' })} className={chip}>
            Church Member
          </button>
          <button type="button" role="menuitem" onClick={() => setPicking('member')} className={chip}>
            Team Member…
          </button>
          <button type="button" role="menuitem" onClick={() => setPicking('head')} className={chip}>
            Team Head…
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
