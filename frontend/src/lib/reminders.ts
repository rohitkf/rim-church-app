import { z } from 'zod'
import { supabase } from './supabaseClient'
import { shortServiceDay } from './sunday'
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
  /** The day it is about, short ("Sun 25 Oct") — shown as a tag, not buried in the detail. */
  day?: string
  /** The teams it is asked for, each a tag of its own. */
  teams?: string[]
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
  day?: (r: OpenRequest) => string | undefined
  teams?: (r: OpenRequest) => string[]
  readsOnOpen?: string
}

/**
 * The teams still waiting on an answer. Somebody on two teams who has
 * answered for one is asked only for the other, so the reminder names
 * exactly the ones left — as tags, beside the day, because which day and
 * which team is what tells one "Can you serve?" from the next.
 */
function teamsLeft(teams: string | null): string[] {
  return (teams ?? '').split(', ').filter(Boolean)
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
    detail: (r, now) => (r.due_at ? `Answers close ${untilText(r.due_at, now)}` : undefined),
    day: (r) => (r.on_date ? shortServiceDay(r.on_date) : undefined),
    teams: (r) => teamsLeft(r.detail),
  },
  mention: {
    eyebrow: 'You were mentioned',
    action: 'Open',
    href: (r) => notificationHref('mention', r.ref_id),
    detail: () => undefined,
    readsOnOpen: 'mention',
  },
}

/**
 * The open requests once I have answered for one team at one service.
 *
 * The dashboard keeps its last copy of the list, and that copy is what
 * shows the moment it is opened again — before the fresh one arrives, and
 * for as long as that takes on a slow phone. So an answer takes its team
 * off the cached request at once: the service's reminder goes when no
 * team is left on it, and the server's own list follows behind.
 */
export function withoutAnswered(rows: OpenRequest[], serviceId: string, teamName: string): OpenRequest[] {
  const out: OpenRequest[] = []
  for (const r of rows) {
    if (r.kind !== 'availability' || r.ref_id !== serviceId) {
      out.push(r)
      continue
    }
    const left = (r.detail ?? '').split(', ').filter((t) => t && t !== teamName)
    if (left.length > 0) out.push({ ...r, detail: left.join(', ') })
  }
  return out
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
      day: k.day?.(r),
      teams: k.teams?.(r),
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
