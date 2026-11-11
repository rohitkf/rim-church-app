import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * A notice: a line at the top of every page for as long as it is true.
 *
 * Not an alert. An alert (Send an Alert) interrupts people once, buzzes
 * their phone, and is gone when they press OK. A notice is for something
 * that stays true for a while and belongs to nobody in particular: the
 * carol service has moved, the car park is closed this Sunday, the app is
 * down for maintenance on the 15th. It is written in Settings › App
 * Notices by whoever holds `settings.notices` (the Owner, out of the box).
 *
 * A maintenance notice can also close the app between two times (0278).
 * The closing is the database's (see lib/standing); this file is the
 * words, and the arithmetic of what shows when.
 */

export const NOTICE_KINDS = [
  { value: 'info', label: 'Information', hint: 'Something people should know.' },
  { value: 'warning', label: 'Warning', hint: 'Something that changes what they do.' },
  { value: 'maintenance', label: 'Maintenance', hint: 'The app itself: work on it, and when it is closed.' },
] as const
export type NoticeKind = (typeof NOTICE_KINDS)[number]['value']

export const TITLE_MAX = 80
export const BODY_MAX = 600

export const noticeSchema = z.object({
  id: z.string(),
  kind: z.enum(['info', 'warning', 'maintenance']),
  title: z.string(),
  body: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  dismissible: z.boolean(),
  closes_app: z.boolean(),
  closed_from: z.string().nullable(),
  closed_until: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Notice = z.infer<typeof noticeSchema>

export const NOTICES_KEY = ['app-notices']

const COLUMNS = 'id, kind, title, body, starts_at, ends_at, dismissible, closes_app, closed_from, closed_until, created_at, updated_at'

/** What the database lets this person read: what is showing, and for whoever writes notices, the rest. */
export async function fetchNotices(): Promise<Notice[]> {
  const { data, error } = await supabase.from('app_notices').select(COLUMNS).order('starts_at', { ascending: false })
  if (error) throw error
  return z.array(noticeSchema).parse(data ?? [])
}

/** Where a notice is in its life. */
export type NoticeState = 'scheduled' | 'showing' | 'over'

export function noticeState(notice: Pick<Notice, 'starts_at' | 'ends_at'>, now: number): NoticeState {
  if (new Date(notice.starts_at).getTime() > now) return 'scheduled'
  if (notice.ends_at && new Date(notice.ends_at).getTime() <= now) return 'over'
  return 'showing'
}

/** Where a notice's closure is: there is none, it is still to come, it is running, or it is done. */
export type ClosureState = 'none' | 'ahead' | 'running' | 'over'

export function closureState(notice: Pick<Notice, 'closes_app' | 'closed_from' | 'closed_until'>, now: number): ClosureState {
  if (!notice.closes_app || !notice.closed_from || !notice.closed_until) return 'none'
  if (new Date(notice.closed_from).getTime() > now) return 'ahead'
  if (new Date(notice.closed_until).getTime() <= now) return 'over'
  return 'running'
}

const WEIGHT: Record<NoticeKind, number> = { maintenance: 0, warning: 1, info: 2 }

/**
 * The notices to draw at the top of the page: those showing now that this
 * device has not put away, the weightiest first and then the newest.
 */
export function noticesToShow(notices: readonly Notice[], now: number, dismissed: ReadonlySet<string> = new Set()): Notice[] {
  return notices
    .filter((n) => noticeState(n, now) === 'showing')
    .filter((n) => !(n.dismissible && dismissed.has(dismissKey(n))))
    .sort((a, b) => WEIGHT[a.kind] - WEIGHT[b.kind] || b.starts_at.localeCompare(a.starts_at))
}

/** "Sat 15 Nov, 9:00 am", in the reader's own clock; the year only when it is not this one. */
export function momentWords(iso: string, now: number = Date.now()): string {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
  return `${day}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

/**
 * What a closure says of itself on the notice, to somebody reading it
 * before, during (only those let in read it then) or after.
 */
export function closureWords(notice: Pick<Notice, 'closes_app' | 'closed_from' | 'closed_until'>, now: number): string | null {
  const state = closureState(notice, now)
  if (state === 'none' || state === 'over') return null
  const until = momentWords(notice.closed_until as string, now)
  if (state === 'running') return `The app is closed to everybody else until ${until}.`
  return `The app will be closed from ${momentWords(notice.closed_from as string, now)} until ${until}.`
}

/* ------------------------------------------------------------------ */
/* Putting a notice away, on this device                               */
/* ------------------------------------------------------------------ */

const DISMISSED = 'rim-notices-dismissed'

/** A notice changed after it was put away is a new thing to read. */
export function dismissKey(notice: Pick<Notice, 'id' | 'updated_at'>): string {
  return `${notice.id}@${notice.updated_at}`
}

export function readDismissed(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Set<string> {
  try {
    const raw = storage?.getItem(DISMISSED)
    const list: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function rememberDismissed(keys: ReadonlySet<string>, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  try {
    // The last fifty: a notice long gone does not need remembering.
    storage?.setItem(DISMISSED, JSON.stringify([...keys].slice(-50)))
  } catch {
    // Private mode, a full quota. It shows again next time, which is the safe way to be wrong.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Writing one                                                          */
/* ------------------------------------------------------------------ */

/** A notice as the form holds it. Times are "YYYY-MM-DDTHH:MM" in the writer's own clock, or "". */
export interface NoticeDraft {
  kind: NoticeKind
  title: string
  body: string
  startsAt: string
  endsAt: string
  dismissible: boolean
  closesApp: boolean
  closedFrom: string
  closedUntil: string
}

export const EMPTY_DRAFT: NoticeDraft = {
  kind: 'info',
  title: '',
  body: '',
  startsAt: '',
  endsAt: '',
  dismissible: true,
  closesApp: false,
  closedFrom: '',
  closedUntil: '',
}

/** "YYYY-MM-DDTHH:MM" in this device's clock, for the form's date-and-time fields. */
export function toLocalField(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fromLocalField = (value: string): string | null => (value ? new Date(value).toISOString() : null)

export function draftOf(notice: Notice): NoticeDraft {
  return {
    kind: notice.kind,
    title: notice.title,
    body: notice.body,
    startsAt: toLocalField(notice.starts_at),
    endsAt: toLocalField(notice.ends_at),
    dismissible: notice.dismissible,
    closesApp: notice.closes_app,
    closedFrom: toLocalField(notice.closed_from),
    closedUntil: toLocalField(notice.closed_until),
  }
}

/**
 * What is wrong with a draft, in words for the person writing it, or null.
 * The database holds the same lines (0278's constraints); this is so the
 * form can say which one before it is sent.
 */
export function draftProblem(draft: NoticeDraft): string | null {
  if (!draft.title.trim()) return 'Give it a title.'
  if (draft.title.trim().length > TITLE_MAX) return `Keep the title to ${TITLE_MAX} characters.`
  if (draft.body.length > BODY_MAX) return `Keep the message to ${BODY_MAX} characters.`
  if (draft.startsAt && draft.endsAt && new Date(draft.endsAt) <= new Date(draft.startsAt)) {
    return 'It has to stop showing after it starts.'
  }
  if (draft.kind === 'maintenance' && draft.closesApp) {
    if (!draft.closedFrom || !draft.closedUntil) return 'Say when the app closes and when it opens again.'
    if (new Date(draft.closedUntil) <= new Date(draft.closedFrom)) return 'The app has to open again after it closes.'
  }
  return null
}

/** The row a draft becomes. A closure is only a maintenance notice's to have. */
export function rowOf(draft: NoticeDraft, now: number = Date.now()) {
  const closes = draft.kind === 'maintenance' && draft.closesApp
  const closedUntil = closes ? fromLocalField(draft.closedUntil) : null
  return {
    kind: draft.kind,
    title: draft.title.trim(),
    body: draft.body.trim(),
    starts_at: fromLocalField(draft.startsAt) ?? new Date(now).toISOString(),
    // A notice that closes the app has nothing left to say once it has opened again.
    ends_at: fromLocalField(draft.endsAt) ?? closedUntil,
    // Something people must plan round is not theirs to put away.
    dismissible: draft.kind === 'info' ? draft.dismissible : false,
    closes_app: closes,
    closed_from: closes ? fromLocalField(draft.closedFrom) : null,
    closed_until: closedUntil,
  }
}

export async function saveNotice(draft: NoticeDraft, id?: string): Promise<void> {
  const row = rowOf(draft)
  const query = id ? supabase.from('app_notices').update(row).eq('id', id).select('id') : supabase.from('app_notices').insert(row).select('id')
  const { data, error } = await query
  if (error) throw error
  // RLS refuses a write by returning no row, not an error.
  if (!data || data.length === 0) throw new Error('That was not saved: writing notices is not open to you.')
}

/** Stop it now: it stops showing, and if it is closing the app, the app opens. */
export async function endNotice(notice: Notice, now: number = Date.now()): Promise<void> {
  const at = new Date(now).toISOString()
  const patch: Record<string, string | boolean | null> = { ends_at: at }
  const closure = closureState(notice, now)
  // Running: the app opens now. Still to come: it never closes, or ending
  // the notice would leave a closure waiting that nothing on screen warns of.
  if (closure === 'running') patch.closed_until = at
  if (closure === 'ahead') Object.assign(patch, { closes_app: false, closed_from: null, closed_until: null })
  // A notice not yet showing cannot end before it starts: bring its start back to now.
  if (new Date(notice.starts_at).getTime() >= now) patch.starts_at = new Date(now - 1000).toISOString()
  const { data, error } = await supabase.from('app_notices').update(patch).eq('id', notice.id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('That was not changed: writing notices is not open to you.')
}

export async function removeNotice(id: string): Promise<void> {
  const { data, error } = await supabase.from('app_notices').delete().eq('id', id).select('id')
  if (error) throw error
  if (!data || data.length === 0) throw new Error('That was not removed: writing notices is not open to you.')
}
