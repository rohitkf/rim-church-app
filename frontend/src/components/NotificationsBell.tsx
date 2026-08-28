import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { formatRelativeTime } from '../lib/relativeTime'
import { BellIcon } from './icons'
import { notificationHref, notificationLabel } from '../lib/notificationLink'
import { showLocalNotification } from '../lib/push'
import { PushPermissionRow } from './PushPermission'
import { notificationRowSchema, type NotificationRow } from '../lib/types'

async function fetchNotifications(userId: string): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return z.array(notificationRowSchema).parse(data)
}

export function NotificationsBell() {
  const { session } = useAuth()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const notificationsQuery = useQuery({
    queryKey: ['notifications', myId],
    queryFn: () => fetchNotifications(myId!),
    enabled: !!myId,
  })
  const notifications = notificationsQuery.data ?? []
  const unreadCount = notifications.filter((n) => !n.read_boolean).length

  // FR15.2: live updates via Supabase Realtime rather than polling.
  useEffect(() => {
    if (!myId) return
    const channel = supabase
      .channel(`notifications-${myId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${myId}` },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['notifications', myId] })
          // Announce it to the system only when the app isn't being looked
          // at. Buzzing a phone whose screen already shows the bell going
          // red is how people turn notifications off.
          if (document.visibilityState !== 'visible') {
            const row = payload.new as { type?: string; reference_id?: string | null }
            if (row?.type) void showLocalNotification(row.type, row.reference_id)
          }
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [myId, queryClient])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  /** Opening one is reading it: there is no separate "mark read" to hunt for. */
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_boolean: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', myId] }),
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_boolean: true })
        .eq('user_id', myId)
        .eq('read_boolean', false)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', myId] }),
  })

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
        aria-label="Notifications"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-error ring-2 ring-surface-lowest" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-80 rounded-[var(--radius-card)] bg-surface-lowest hairline shadow-lg">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <span className="text-body-sm font-medium text-on-surface">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-body-sm text-secondary disabled:opacity-50"
              >
                Mark all as read
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <li className="px-4 py-6 text-center text-body-sm text-on-surface-variant">No notifications yet.</li>
            )}
            {notifications.map((n) => (
              <li key={n.id} className="border-b border-border-subtle last:border-0">
                <Link
                  to={notificationHref(n.type, n.reference_id)}
                  onClick={() => {
                    setOpen(false)
                    if (!n.read_boolean) markRead.mutate(n.id)
                  }}
                  className={`flex items-start gap-3 px-4 py-3 text-body-sm transition-colors duration-300 ease-[var(--ease-glide)] hover:bg-surface-container ${
                    n.read_boolean ? 'text-on-surface-variant' : 'bg-surface-container text-on-surface'
                  }`}
                >
                  {/* Unread is carried by a dot as well as by the fill, so it
                      survives for anyone who cannot see the tint. */}
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.read_boolean ? 'bg-transparent' : 'bg-primary'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block">{notificationLabel(n.type)}</span>
                    <span className="mt-1 block font-mono text-label-sm text-on-surface-variant">
                      {formatRelativeTime(n.created_at)}
                      {!n.read_boolean && <span className="sr-only"> · unread</span>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <PushPermissionRow />
        </div>
      )}
    </div>
  )
}
