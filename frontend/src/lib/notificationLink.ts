/**
 * What a notification says, and where it goes.
 *
 * A notification that cannot be opened is a dead end: it tells you
 * something happened and leaves you to find it yourself. Every type the
 * database can produce is listed here with both its sentence and its
 * destination, so adding a type without answering "where does this take
 * me?" is a compile error rather than a silent dead end.
 */
export const NOTIFICATION_TYPES = [
  'message',
  'rota_release_request',
  'rota_release_approved',
  'rota_release_denied',
  'team_join_requested',
  'team_join_approved',
  'team_join_declined',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

const NOTIFICATIONS: Record<NotificationType, { label: string; href: string }> = {
  message: { label: 'New message board post', href: '/messages' },
  rota_release_request: {
    label: 'A team has asked to borrow one of your volunteers',
    href: '/rota',
  },
  rota_release_approved: { label: 'Your rota release request was approved', href: '/rota' },
  rota_release_denied: { label: 'Your rota release request was denied', href: '/rota' },
  team_join_requested: { label: 'Someone has asked to join your team', href: '/departments' },
  team_join_approved: { label: 'You have been added to a team', href: '/departments' },
  team_join_declined: { label: 'Your request to join a team was declined', href: '/departments' },
}

function known(type: string): NotificationType | null {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type) ? (type as NotificationType) : null
}

/**
 * The sentence shown in the bell. An unrecognised type — a newer database
 * than this build — falls back to its own name rather than to nothing.
 */
export function notificationLabel(type: string): string {
  const t = known(type)
  return t ? NOTIFICATIONS[t].label : type
}

/**
 * Where clicking it goes. A `reference_id` deep-links where the route can
 * take one; otherwise the type's own page is the answer. An unknown type
 * goes to the dashboard, which is somewhere rather than nowhere.
 */
export function notificationHref(type: string, referenceId?: string | null): string {
  const t = known(type)
  if (!t) return '/'
  if (t === 'team_join_approved' && referenceId) return `/departments/${referenceId}`
  return NOTIFICATIONS[t].href
}
