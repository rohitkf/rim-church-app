import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { useNow } from '../lib/useNow'
import {
  NOTICES_KEY,
  closureWords,
  dismissKey,
  fetchNotices,
  noticesToShow,
  readDismissed,
  rememberDismissed,
  type Notice,
  type NoticeKind,
} from '../lib/appNotices'
import { CloseIcon, MegaphoneIcon, SettingsIcon, WarningIcon } from './icons'

/**
 * The church's notices, at the top of every page (lib/appNotices).
 *
 * Three looks for three weights: information is quiet and can be put
 * away, a warning is orange and stays, maintenance says when the app
 * closes and opens. They sit above the page rather than over it: a notice
 * is something to know, not something to answer, and it must never stand
 * between somebody and the rota on a Sunday morning.
 */

const LOOK: Record<NoticeKind, { box: string; ink: string; icon: typeof WarningIcon; says: string }> = {
  info: {
    box: 'bg-[color-mix(in_oklab,var(--color-accent-blue)_9%,var(--color-surface-lowest))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-blue)_26%,transparent)]',
    ink: 'text-accent-blue-soft',
    icon: MegaphoneIcon,
    says: 'Notice',
  },
  warning: {
    box: 'bg-[color-mix(in_oklab,var(--color-accent-orange)_11%,var(--color-surface-lowest))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_32%,transparent)]',
    ink: 'text-accent-orange-soft',
    icon: WarningIcon,
    says: 'Warning',
  },
  maintenance: {
    box: 'bg-[color-mix(in_oklab,var(--color-accent-orange)_11%,var(--color-surface-lowest))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_32%,transparent)]',
    ink: 'text-accent-orange-soft',
    icon: SettingsIcon,
    says: 'Maintenance',
  },
}

export function AppNoticeBanner() {
  const { session } = useAuth()
  const [dismissed, setDismissed] = useState(readDismissed)
  const query = useQuery({
    queryKey: NOTICES_KEY,
    queryFn: fetchNotices,
    enabled: !!session,
    // A notice scheduled for ten o'clock has to appear at ten, and one that
    // ends has to go, without anybody changing a row: ask again now and then.
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
  })

  // The clock, ticking: a notice starts and stops by the time, not by a row changing.
  const now = useNow()
  const showing = noticesToShow(query.data ?? [], now, dismissed)
  if (showing.length === 0) return null

  const putAway = (notice: Notice) => {
    const next = new Set(dismissed).add(dismissKey(notice))
    setDismissed(next)
    rememberDismissed(next)
  }

  return (
    <div className="mb-4 flex flex-col gap-2" data-tour="notices">
      {showing.map((notice) => {
        const look = LOOK[notice.kind]
        const Icon = look.icon
        const closure = closureWords(notice, now)
        return (
          <div
            key={notice.id}
            // A warning is announced to a screen reader when it arrives; information waits its turn.
            role={notice.kind === 'info' ? 'note' : 'alert'}
            className={`flex items-start gap-3 rounded-[var(--radius-row)] px-4 py-3 ${look.box}`}
          >
            <Icon className={`mt-0.5 shrink-0 ${look.ink}`} width={18} height={18} />
            <div className="min-w-0 flex-1">
              <p className={`font-mono text-eyebrow uppercase ${look.ink}`}>{look.says}</p>
              <p className="mt-0.5 break-words text-body-md font-medium text-on-surface">{notice.title}</p>
              {notice.body && (
                <p className="mt-0.5 whitespace-pre-line break-words text-body-sm text-on-surface-variant">{notice.body}</p>
              )}
              {closure && <p className="mt-1 text-body-sm font-medium text-on-surface">{closure}</p>}
            </div>
            {notice.dismissible && (
              <button
                type="button"
                onClick={() => putAway(notice)}
                aria-label={`Dismiss: ${notice.title}`}
                className="tap-square -mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-on-surface-faint hover:text-on-surface"
              >
                <CloseIcon width={16} height={16} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
