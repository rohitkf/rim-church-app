import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useWhereAmI, whereAmIWords } from '../lib/whereAmI'
import { ActionButton, StatusDot } from './Surface'

/**
 * Under the date on the Dashboard: whether this phone is at church now
 * (0195). Green, red or a grey ring, always with a word, and the distance
 * and what to do behind a tap.
 */
export function WhereAmIDot() {
  const { session } = useAuth()
  const { status, check } = useWhereAmI(!!session)
  const [open, setOpen] = useState(false)
  const detailId = useId()
  const words = whereAmIWords(status)
  const checkedAt = status.at === 'answered' ? status.checkedAt : null

  return (
    <div className="text-label-md">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={detailId}
        className="tap -mx-1 inline-flex items-center gap-2 rounded-full px-1 py-0.5 font-medium text-on-surface-variant hover:text-on-surface"
      >
        <StatusDot tone={words.tone} />
        <span aria-live="polite">{words.label}</span>
      </button>
      {open && (
        <div id={detailId} className="mt-1 max-w-md text-label-md text-on-surface-variant">
          {words.detail && <p>{words.detail}</p>}
          {/* Asking again brings the phone's own Allow message back when it
              can; a phone that was told Block cannot be asked by the app,
              so the page with its steps is one tap away. */}
          {status.at === 'blocked' && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <ActionButton size="sm" onClick={check}>
                Allow location
              </ActionButton>
              <Link to="/location" className="tap text-label-md text-accent-blue-soft hover:underline">
                How to allow it
              </Link>
            </div>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-label-sm text-on-surface-faint">
            {checkedAt && (
              <span>
                Checked {new Date(checkedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              onClick={check}
              disabled={status.at === 'checking'}
              className="tap text-accent-blue-soft hover:underline disabled:opacity-50"
            >
              {status.at === 'checking' ? 'Checking…' : 'Check again'}
            </button>
          </p>
        </div>
      )}
    </div>
  )
}
