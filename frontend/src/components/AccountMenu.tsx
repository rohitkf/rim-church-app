import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { SettingsIcon, UserCircleIcon } from './icons'

interface AccountMenuProps {
  initials: string
  onSignOut: () => void
}

/**
 * The avatar in the top bar, and what sits behind it: your name, your
 * profile settings, and signing out. Closes on a click anywhere else or on
 * Escape, the way a menu is expected to.
 */
export function AccountMenu({ initials, onSignOut }: AccountMenuProps) {
  const { profile } = useAuth()
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
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container font-mono text-label-sm text-on-surface hover:bg-surface-high"
      >
        {initials || <UserCircleIcon width={18} height={18} />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border-subtle bg-surface-lowest py-1 shadow-lg"
        >
          <div className="border-b border-border-subtle px-3 py-2">
            <div className="truncate text-body-sm font-medium text-on-surface">
              {profile ? `${profile.first_name} ${profile.last_name}` : 'Signed in'}
            </div>
            {profile?.email && (
              <div className="truncate text-label-sm text-on-surface-variant">{profile.email}</div>
            )}
          </div>

          <Link to="/profile" role="menuitem" onClick={() => setOpen(false)} className={itemClasses}>
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
