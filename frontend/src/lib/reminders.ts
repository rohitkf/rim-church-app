import { z } from 'zod'
import { supabase } from './supabaseClient'
import { formatServiceDay } from './sunday'
import { untilText } from './expiry'
import { notificationHref } from './notificationLink'

/**
 * What is waiting on me, for the dashboard's reminders.
 *
 * The bell tells you once; a reminder stays until the thing is done. The
 * database works out the list from the things themselves
 * (my_open_requests, 0178), so a reminder goes the moment it is answered.
 *
 * A new kind of request is one branch in that function and one entry in
 * REMINDER_KINDS below: what it is called, where it goes, and what the
 * button says. The banner itself (components/ReminderBanner) knows nothing
 * about any of them.
 */

export const REMINDERS_KEY = ['my-requests']

const requestSchema = z.object({
  kind: z.string(),
  ref_id: z.string().nullable(),
  title: z.string(),
  detail: z.string().nullable(),
  on_date: z.string().nullable(),
  due_at: z.string().nullable(),
  created_at: z.string().nullable(),
})
export type OpenRequest = z.infer<typeof requestSchema>

export async function fetchOpenRequests(): Promise<OpenRequest[]> {
  const { data, error } = await supabase.rpc('my_open_requests')
  if (error) throw error
  return z.array(requestSchema).parse(data ?? [])
}

/** One reminder, ready to show: everything the banner needs and nothing else. */
export interface Reminder {
  key: string
  kind: string
  refId: string | null
  eyebrow: string
  title: string
  detail?: string
  href?: string
  actionLabel?: string
  tone: 'accent' | 'warning'
  /** Done by opening it, as with a mention: opening marks this kind of notification read. */
  readsOnOpen?: string
  /** Soonest due first; nothing due sorts last. */
  dueMs: number
}

type KindEntry = {
  eyebrow: string
  action: string
  href: (r: OpenRequest) => string
  detail: (r: OpenRequest, now: number) => string | undefined
  readsOnOpen?: string
}

export const REMINDER_KINDS: Record<string, KindEntry> = {
  poll: {
    eyebrow: 'A poll for you',
    action: 'Answer',
    href: (r) => (r.ref_id ? `/polls?poll=${r.ref_id}` : '/polls'),
    detail: (r, now) => (r.due_at ? `Closes ${untilText(r.due_at, now)}` : 'Open until you answer'),
  },
  availability: {
    eyebrow: 'Can you serve?',
    action: 'Give availability',
    href: () => '/availability',
    detail: (r, now) =>
      [r.on_date ? formatServiceDay(r.on_date) : null, r.detail, r.due_at ? `answers close ${untilText(r.due_at, now)}` : null]
        .filter(Boolean)
        .join(' · '),
  },
  mention: {
    eyebrow: 'You were mentioned',
    action: 'Open',
    href: (r) => notificationHref('mention', r.ref_id),
    detail: () => undefined,
    readsOnOpen: 'mention',
  },
}

/** The rows as reminders, soonest due first; a kind the app does not know is left out. */
export function toReminders(rows: OpenRequest[], now: number): Reminder[] {
  const out: Reminder[] = []
  for (const r of rows) {
    const k = REMINDER_KINDS[r.kind]
    if (!k) continue
    const dueMs = r.due_at ? new Date(r.due_at).getTime() : Number.POSITIVE_INFINITY
    out.push({
      key: `${r.kind}:${r.ref_id ?? r.title}`,
      kind: r.kind,
      eyebrow: k.eyebrow,
      refId: r.ref_id,
      title: r.title,
      detail: k.detail(r, now),
      href: k.href(r),
      actionLabel: k.action,
      // Due within a day is the one worth colouring.
      tone: dueMs - now < 24 * 3_600_000 ? 'warning' : 'accent',
      readsOnOpen: k.readsOnOpen,
      dueMs,
    })
  }
  return out.sort((a, b) => a.dueMs - b.dueMs)
}
