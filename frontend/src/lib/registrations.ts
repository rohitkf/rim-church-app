import { z } from 'zod'
import { supabase } from './supabaseClient'
import { registerUrl } from './registrationLinks'

/*
 * Registration events (0244): events anybody can sign up for from a link.
 *
 * Whoever runs registrations (`reg.manage`: the Owner, and whoever the
 * grid adds) reads and writes the tables directly; the public pages go
 * through functions anyone may call, each answering only about a
 * published event or the order whose code the caller holds.
 */

export const REGISTRATIONS_KEY = ['registrations'] as const
export const REGISTRATION_IMAGES_BUCKET = 'registration-images'

/* ------------------------------------------------------------------ */
/* The rows, as whoever runs registrations reads them                   */
/* ------------------------------------------------------------------ */

export const paymentLinkSchema = z.object({ label: z.string(), url: z.string() })
export type PaymentLink = z.infer<typeof paymentLinkSchema>

export const paymentAccountSchema = z.object({
  label: z.string(),
  account_name: z.string(),
  bank_name: z.string().nullable().optional(),
  sort_code: z.string().nullable().optional(),
  account_number: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  bic: z.string().nullable().optional(),
})
export type PaymentAccount = z.infer<typeof paymentAccountSchema>

export const registrationEventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  image_path: z.string().nullable(),
  status: z.enum(['draft', 'published', 'closed']),
  date_mode: z.enum(['all', 'choose']),
  location_name: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  registration_opens_at: z.string().nullable(),
  registration_closes_at: z.string().nullable(),
  min_per_order: z.number(),
  max_per_order: z.number(),
  payment_links: z.array(paymentLinkSchema),
  payment_accounts: z.array(paymentAccountSchema),
  payment_use_church_giving: z.boolean(),
  payment_note: z.string().nullable(),
  allow_pay_at_reception: z.boolean(),
  add_to_diary: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type RegistrationEvent = z.infer<typeof registrationEventSchema>
export type EventStatus = RegistrationEvent['status']
export type DateMode = RegistrationEvent['date_mode']

/** What an event's status says on its pill, and the pill's colour. */
export const STATUS_WORDS: Record<EventStatus, string> = { draft: 'Draft', published: 'Taking registrations', closed: 'Closed' }
export const STATUS_TONE: Record<EventStatus, 'neutral' | 'green' | 'orange'> = { draft: 'neutral', published: 'green', closed: 'orange' }

export const eventDateSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  label: z.string().nullable(),
  sort_order: z.number(),
  diary_event_id: z.string().nullable(),
})
export type EventDate = z.infer<typeof eventDateSchema>

export const ticketKinds = ['free', 'paid', 'donation'] as const
export type TicketKind = (typeof ticketKinds)[number]

export const ticketTypeSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  kind: z.enum(ticketKinds),
  price_pence: z.number(),
  min_donation_pence: z.number().nullable(),
  quantity: z.number().nullable(),
  sort_order: z.number(),
})
export type TicketType = z.infer<typeof ticketTypeSchema>

export const promoCodeSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  code: z.string(),
  kind: z.enum(['amount', 'percent']),
  value: z.number(),
  ticket_type_ids: z.array(z.string()),
  max_uses: z.number().nullable(),
  uses: z.number(),
  active: z.boolean(),
})
export type PromoCode = z.infer<typeof promoCodeSchema>

export interface RegistrationEventFull {
  event: RegistrationEvent
  dates: EventDate[]
  ticketTypes: TicketType[]
  promoCodes: PromoCode[]
}

const EVENT_COLUMNS =
  'id, slug, title, description, image_path, status, date_mode, location_name, address, latitude, longitude, registration_opens_at, registration_closes_at, min_per_order, max_per_order, payment_links, payment_accounts, payment_use_church_giving, payment_note, allow_pay_at_reception, add_to_diary, created_at, updated_at'

/** Every event, newest first, with how its orders stand. */
export interface EventSummary extends RegistrationEvent {
  /** Confirmed orders, and the tickets on them. */
  orders: number
  tickets: number
  /** Pence: what confirmed orders come to, and what has been received or waived. */
  expected_pence: number
  received_pence: number
  awaiting: number
  first_starts_at: string | null
}

const orderStatSchema = z.object({
  event_id: z.string(),
  status: z.enum(['confirmed', 'cancelled']),
  quantity: z.number(),
  total_pence: z.number(),
  payment_status: z.enum(['not_needed', 'awaiting', 'reported', 'received', 'waived']),
})

export async function fetchRegistrationEvents(): Promise<EventSummary[]> {
  const [events, orders, dates] = await Promise.all([
    supabase.from('registration_events').select(EVENT_COLUMNS).order('created_at', { ascending: false }),
    supabase.from('registration_orders').select('event_id, status, quantity, total_pence, payment_status'),
    supabase.from('registration_event_dates').select('event_id, starts_at').order('starts_at'),
  ])
  if (events.error) throw events.error
  if (orders.error) throw orders.error
  if (dates.error) throw dates.error
  const stats = z.array(orderStatSchema).parse(orders.data ?? [])
  const firstDate = new Map<string, string>()
  for (const d of (dates.data ?? []) as { event_id: string; starts_at: string }[]) {
    if (!firstDate.has(d.event_id)) firstDate.set(d.event_id, d.starts_at)
  }
  return z
    .array(registrationEventSchema)
    .parse(events.data ?? [])
    .map((event) => {
      const mine = stats.filter((o) => o.event_id === event.id && o.status === 'confirmed')
      return {
        ...event,
        orders: mine.length,
        tickets: mine.reduce((n, o) => n + o.quantity, 0),
        expected_pence: mine.reduce((n, o) => n + o.total_pence, 0),
        received_pence: mine.filter((o) => o.payment_status === 'received' || o.payment_status === 'waived').reduce((n, o) => n + o.total_pence, 0),
        awaiting: mine.filter((o) => o.payment_status === 'awaiting' || o.payment_status === 'reported').length,
        first_starts_at: firstDate.get(event.id) ?? null,
      }
    })
}

export async function fetchRegistrationEvent(id: string): Promise<RegistrationEventFull | null> {
  const [event, dates, types, promos] = await Promise.all([
    supabase.from('registration_events').select(EVENT_COLUMNS).eq('id', id).maybeSingle(),
    supabase.from('registration_event_dates').select('id, event_id, starts_at, ends_at, label, sort_order, diary_event_id').eq('event_id', id).order('starts_at'),
    supabase
      .from('registration_ticket_types')
      .select('id, event_id, name, description, kind, price_pence, min_donation_pence, quantity, sort_order')
      .eq('event_id', id)
      .order('sort_order'),
    supabase.from('registration_promo_codes').select('id, event_id, code, kind, value, ticket_type_ids, max_uses, uses, active').eq('event_id', id).order('code'),
  ])
  if (event.error) throw event.error
  if (!event.data) return null
  if (dates.error) throw dates.error
  if (types.error) throw types.error
  if (promos.error) throw promos.error
  return {
    event: registrationEventSchema.parse(event.data),
    dates: z.array(eventDateSchema).parse(dates.data ?? []),
    ticketTypes: z.array(ticketTypeSchema).parse(types.data ?? []),
    promoCodes: z.array(promoCodeSchema).parse(promos.data ?? []),
  }
}

/* ------------------------------------------------------------------ */
/* The editor's draft, and saving it                                    */
/* ------------------------------------------------------------------ */

export interface DateDraft {
  id: string | null
  /** "YYYY-MM-DD" and "HH:MM", in the church's own clock (the browser's). */
  date: string
  start: string
  endDate: string
  end: string
  label: string
}

export interface TicketTypeDraft {
  id: string | null
  name: string
  description: string
  kind: TicketKind
  /** As typed: "12.50". */
  price: string
  minDonation: string
  /** As typed; "" is no limit. */
  quantity: string
}

export interface PromoDraft {
  id: string | null
  code: string
  kind: 'amount' | 'percent'
  /** As typed: pounds off, or percent off. */
  value: string
  ticketTypeIds: string[]
  maxUses: string
  active: boolean
}

export interface EventDraft {
  title: string
  slug: string
  slugTouched: boolean
  description: string
  imagePath: string | null
  dateMode: DateMode
  /** One start and end time for every date, rather than each its own. */
  sameTimes: boolean
  start: string
  end: string
  dates: DateDraft[]
  ticketTypes: TicketTypeDraft[]
  promoCodes: PromoDraft[]
  locationName: string
  address: string
  latitude: number | null
  longitude: number | null
  opensAt: { date: string; time: string }
  closesAt: { date: string; time: string }
  minPerOrder: string
  maxPerOrder: string
  paymentLinks: PaymentLink[]
  paymentAccounts: PaymentAccount[]
  useChurchGiving: boolean
  paymentNote: string
  allowPayAtReception: boolean
  addToDiary: boolean
}

export const newDateDraft = (): DateDraft => ({ id: null, date: '', start: '', endDate: '', end: '', label: '' })
export const newTicketTypeDraft = (): TicketTypeDraft => ({ id: null, name: '', description: '', kind: 'free', price: '', minDonation: '', quantity: '' })
export const newPromoDraft = (): PromoDraft => ({ id: null, code: '', kind: 'percent', value: '', ticketTypeIds: [], maxUses: '', active: true })

export function emptyDraft(): EventDraft {
  return {
    title: '',
    slug: '',
    slugTouched: false,
    description: '',
    imagePath: null,
    dateMode: 'all',
    sameTimes: true,
    start: '',
    end: '',
    dates: [newDateDraft()],
    ticketTypes: [{ ...newTicketTypeDraft(), name: 'General admission' }],
    promoCodes: [],
    locationName: '',
    address: '',
    latitude: null,
    longitude: null,
    opensAt: { date: '', time: '' },
    closesAt: { date: '', time: '' },
    minPerOrder: '1',
    maxPerOrder: '10',
    paymentLinks: [],
    paymentAccounts: [],
    useChurchGiving: true,
    paymentNote: '',
    allowPayAtReception: true,
    addToDiary: false,
  }
}

/** "Pastors & Leaders Conference 2026" → "pastors-leaders-conference-2026". */
export function slugify(title: string): string {
  return slugTyping(title).replace(/-+$/g, '')
}

/**
 * The link as it is being typed: the same letters, digits and dashes, but
 * a dash at the end is left — it is how the next word gets typed. Finished
 * links go through slugify().
 */
export function slugTyping(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, 80)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A moment as the two boxes hold it, in the browser's clock. */
export function localParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

/** The two boxes as a moment, or null when either is empty or wrong. */
export function localIso(date: string, time: string): string | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function draftFromEvent(full: RegistrationEventFull): EventDraft {
  const { event, dates, ticketTypes, promoCodes } = full
  const dateDrafts: DateDraft[] = dates.map((d) => {
    const s = localParts(d.starts_at)
    const e = localParts(d.ends_at)
    return { id: d.id, date: s.date, start: s.time, endDate: e.date === s.date ? '' : e.date, end: e.time, label: d.label ?? '' }
  })
  const sameTimes =
    dateDrafts.length > 0 && dateDrafts.every((d) => d.start === dateDrafts[0].start && d.end === dateDrafts[0].end && !d.endDate)
  return {
    title: event.title,
    slug: event.slug,
    slugTouched: true,
    description: event.description ?? '',
    imagePath: event.image_path,
    dateMode: event.date_mode,
    sameTimes,
    start: sameTimes ? dateDrafts[0].start : '',
    end: sameTimes ? dateDrafts[0].end : '',
    dates: dateDrafts.length ? dateDrafts : [newDateDraft()],
    ticketTypes: ticketTypes.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      kind: t.kind,
      price: t.price_pence ? (t.price_pence / 100).toFixed(2) : '',
      minDonation: t.min_donation_pence ? (t.min_donation_pence / 100).toFixed(2) : '',
      quantity: t.quantity === null ? '' : String(t.quantity),
    })),
    promoCodes: promoCodes.map((p) => ({
      id: p.id,
      code: p.code,
      kind: p.kind,
      value: p.kind === 'amount' ? (p.value / 100).toFixed(2) : String(p.value),
      ticketTypeIds: p.ticket_type_ids,
      maxUses: p.max_uses === null ? '' : String(p.max_uses),
      active: p.active,
    })),
    locationName: event.location_name ?? '',
    address: event.address ?? '',
    latitude: event.latitude,
    longitude: event.longitude,
    opensAt: localParts(event.registration_opens_at),
    closesAt: localParts(event.registration_closes_at),
    minPerOrder: String(event.min_per_order),
    maxPerOrder: String(event.max_per_order),
    paymentLinks: event.payment_links,
    paymentAccounts: event.payment_accounts,
    useChurchGiving: event.payment_use_church_giving,
    paymentNote: event.payment_note ?? '',
    allowPayAtReception: event.allow_pay_at_reception,
    addToDiary: event.add_to_diary,
  }
}

const parsePence = (text: string): number | null => {
  const cleaned = text.replace(/[£,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, frac = ''] = cleaned.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

/** The dates a draft means, each with its own start and end; a problem instead when one is not a date. */
export function datesOf(draft: EventDraft): { starts: string; ends: string | null; label: string | null }[] | string {
  const out: { starts: string; ends: string | null; label: string | null }[] = []
  for (const [i, d] of draft.dates.entries()) {
    const start = draft.sameTimes ? draft.start : d.start
    const end = draft.sameTimes ? draft.end : d.end
    const starts = localIso(d.date, start)
    if (!starts) return `Date ${i + 1} needs a day and a start time.`
    const endDay = draft.sameTimes ? d.date : d.endDate || d.date
    const ends = end ? localIso(endDay, end) : null
    if (end && !ends) return `Date ${i + 1} has an end time that is not a time.`
    if (ends && ends <= starts) return `Date ${i + 1} ends before it starts.`
    out.push({ starts, ends, label: d.label.trim() || null })
  }
  return out
}

/** Everything that stops a draft being saved, in the order the form shows it. */
export function draftProblems(draft: EventDraft): string[] {
  const problems: string[] = []
  if (!draft.title.trim()) problems.push('Give the event a title.')
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(draft.slug) || draft.slug.length < 3) problems.push('The link needs at least three letters or digits, joined by dashes.')
  if (draft.dates.length === 0) problems.push('Add at least one date.')
  const dates = datesOf(draft)
  if (typeof dates === 'string') problems.push(dates)
  if (draft.ticketTypes.length === 0) problems.push('Add at least one ticket type.')
  for (const [i, t] of draft.ticketTypes.entries()) {
    const n = i + 1
    if (!t.name.trim()) problems.push(`Ticket ${n} needs a name.`)
    if (t.kind === 'paid' && !(parsePence(t.price) ?? 0)) problems.push(`Ticket ${n} needs a price.`)
    if (t.kind === 'donation' && t.minDonation && parsePence(t.minDonation) === null) problems.push(`Ticket ${n}: the least to give is not a price.`)
    if (t.quantity && !/^\d+$/.test(t.quantity)) problems.push(`Ticket ${n}: the quantity is not a number.`)
  }
  const codes = new Set<string>()
  for (const [i, p] of draft.promoCodes.entries()) {
    const n = i + 1
    const code = p.code.trim().toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(code)) problems.push(`Promo code ${n} needs 2 to 30 letters, digits or dashes.`)
    if (codes.has(code)) problems.push(`Promo code ${code} is listed twice.`)
    codes.add(code)
    const value = p.kind === 'amount' ? parsePence(p.value) : /^\d+$/.test(p.value) ? Number(p.value) : null
    if (!value || value <= 0 || (p.kind === 'percent' && value > 100)) problems.push(`Promo code ${n} needs ${p.kind === 'amount' ? 'an amount off' : 'a percentage from 1 to 100'}.`)
    if (p.maxUses && !/^\d+$/.test(p.maxUses)) problems.push(`Promo code ${n}: the number of uses is not a number.`)
  }
  const min = Number(draft.minPerOrder)
  const max = Number(draft.maxPerOrder)
  if (!Number.isInteger(min) || min < 1 || min > 100) problems.push('The fewest tickets per order must be from 1 to 100.')
  if (!Number.isInteger(max) || max < 1 || max > 100) problems.push('The most tickets per order must be from 1 to 100.')
  if (Number.isInteger(min) && Number.isInteger(max) && max < min) problems.push('The most tickets per order is fewer than the fewest.')
  if (draft.opensAt.date && !localIso(draft.opensAt.date, draft.opensAt.time || '00:00')) problems.push('Registration opens on a day that is not a date.')
  if (draft.closesAt.date && !localIso(draft.closesAt.date, draft.closesAt.time || '23:59')) problems.push('Registration closes on a day that is not a date.')
  for (const l of draft.paymentLinks) {
    if (!/^https:\/\/\S+$/i.test(l.url.trim())) problems.push(`The payment link "${l.label || l.url}" must start with https://`)
  }
  return problems
}

/**
 * Save the draft: the event row, then its dates, ticket types and promo
 * codes brought into step (rows gone from the draft are deleted, which the
 * database refuses for a date or a ticket type with orders). Returns the
 * event's id. The status is left as it is; publishing is its own step.
 */
export async function saveRegistrationEvent(draft: EventDraft, existing: RegistrationEventFull | null): Promise<string> {
  const problems = draftProblems(draft)
  if (problems.length) throw new Error(problems[0])
  const dates = datesOf(draft)
  if (typeof dates === 'string') throw new Error(dates)

  const row = {
    slug: draft.slug,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    image_path: draft.imagePath,
    date_mode: draft.dateMode,
    location_name: draft.locationName.trim() || null,
    address: draft.address.trim() || null,
    latitude: draft.latitude,
    longitude: draft.longitude,
    registration_opens_at: draft.opensAt.date ? localIso(draft.opensAt.date, draft.opensAt.time || '00:00') : null,
    registration_closes_at: draft.closesAt.date ? localIso(draft.closesAt.date, draft.closesAt.time || '23:59') : null,
    min_per_order: Number(draft.minPerOrder),
    max_per_order: Number(draft.maxPerOrder),
    payment_links: draft.paymentLinks.map((l) => ({ label: l.label.trim() || 'Pay online', url: l.url.trim() })),
    payment_accounts: draft.paymentAccounts,
    payment_use_church_giving: draft.useChurchGiving,
    payment_note: draft.paymentNote.trim() || null,
    allow_pay_at_reception: draft.allowPayAtReception,
    add_to_diary: draft.addToDiary,
  }

  let eventId: string
  if (existing) {
    const { error } = await supabase.from('registration_events').update(row).eq('id', existing.event.id)
    if (error) throw error
    eventId = existing.event.id
  } else {
    const { data, error } = await supabase
      .from('registration_events')
      .insert({ ...row, created_by: (await supabase.auth.getUser()).data.user?.id ?? null })
      .select('id')
      .single()
    if (error) throw error
    eventId = (data as { id: string }).id
  }

  // Dates.
  const keptDates = new Set(draft.dates.map((d) => d.id).filter((id): id is string => !!id))
  for (const d of existing?.dates ?? []) {
    if (!keptDates.has(d.id)) {
      const { error } = await supabase.from('registration_event_dates').delete().eq('id', d.id)
      if (error) throw error
    }
  }
  for (const [i, d] of draft.dates.entries()) {
    const values = { event_id: eventId, starts_at: dates[i].starts, ends_at: dates[i].ends, label: dates[i].label, sort_order: i }
    const { error } = d.id
      ? await supabase.from('registration_event_dates').update(values).eq('id', d.id)
      : await supabase.from('registration_event_dates').insert(values)
    if (error) throw error
  }

  // Ticket types. New ones get ids now, so promo codes below can name them.
  const keptTypes = new Set(draft.ticketTypes.map((t) => t.id).filter((id): id is string => !!id))
  for (const t of existing?.ticketTypes ?? []) {
    if (!keptTypes.has(t.id)) {
      const { error } = await supabase.from('registration_ticket_types').delete().eq('id', t.id)
      if (error) throw error
    }
  }
  const typeIds: string[] = []
  for (const [i, t] of draft.ticketTypes.entries()) {
    const values = {
      event_id: eventId,
      name: t.name.trim(),
      description: t.description.trim() || null,
      kind: t.kind,
      price_pence: t.kind === 'paid' ? (parsePence(t.price) ?? 0) : 0,
      min_donation_pence: t.kind === 'donation' && t.minDonation ? parsePence(t.minDonation) : null,
      quantity: t.quantity.trim() === '' ? null : Number(t.quantity),
      sort_order: i,
    }
    if (t.id) {
      const { error } = await supabase.from('registration_ticket_types').update(values).eq('id', t.id)
      if (error) throw error
      typeIds.push(t.id)
    } else {
      const { data, error } = await supabase.from('registration_ticket_types').insert(values).select('id').single()
      if (error) throw error
      typeIds.push((data as { id: string }).id)
    }
  }

  // Promo codes.
  const keptPromos = new Set(draft.promoCodes.map((p) => p.id).filter((id): id is string => !!id))
  for (const p of existing?.promoCodes ?? []) {
    if (!keptPromos.has(p.id)) {
      const { error } = await supabase.from('registration_promo_codes').delete().eq('id', p.id)
      if (error) throw error
    }
  }
  const knownTypes = new Set(typeIds)
  for (const p of draft.promoCodes) {
    const values = {
      event_id: eventId,
      code: p.code.trim().toUpperCase(),
      kind: p.kind,
      value: p.kind === 'amount' ? (parsePence(p.value) ?? 0) : Number(p.value),
      ticket_type_ids: p.ticketTypeIds.filter((id) => knownTypes.has(id)),
      max_uses: p.maxUses.trim() === '' ? null : Number(p.maxUses),
      active: p.active,
    }
    const { error } = p.id
      ? await supabase.from('registration_promo_codes').update(values).eq('id', p.id)
      : await supabase.from('registration_promo_codes').insert(values)
    if (error) throw error
  }

  return eventId
}

/** Draft → published → closed, and the diary brought into step. */
export async function setRegistrationStatus(event: Pick<RegistrationEvent, 'id' | 'slug'>, status: EventStatus): Promise<void> {
  const { error } = await supabase.from('registration_events').update({ status }).eq('id', event.id)
  if (error) throw error
  await syncRegistrationDiary(event)
}

export async function syncRegistrationDiary(event: Pick<RegistrationEvent, 'id' | 'slug'>): Promise<void> {
  const { error } = await supabase.rpc('registration_sync_diary', { p_event: event.id, p_register_url: registerUrl(event.slug) })
  if (error) throw error
}

export async function deleteRegistrationEvent(id: string): Promise<void> {
  const { error } = await supabase.from('registration_events').delete().eq('id', id)
  if (error) throw error
}

/** The picture's address, for an <img>: the bucket is public. */
export function registrationImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return supabase.storage.from(REGISTRATION_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function uploadRegistrationImage(file: File): Promise<string> {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `events/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(REGISTRATION_IMAGES_BUCKET).upload(path, file, { contentType: file.type })
  if (error) throw error
  return path
}

/* ------------------------------------------------------------------ */
/* The public pages                                                     */
/* ------------------------------------------------------------------ */

export const publicDateSchema = z.object({
  id: z.string(),
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  label: z.string().nullable(),
  open: z.boolean().optional(),
})
export type PublicDate = z.infer<typeof publicDateSchema>

export const publicTicketTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  kind: z.enum(ticketKinds),
  price_pence: z.number(),
  min_donation_pence: z.number().nullable(),
  quantity: z.number().nullable(),
  remaining: z.number().nullable(),
  remaining_by_date: z.record(z.string(), z.number()),
})
export type PublicTicketType = z.infer<typeof publicTicketTypeSchema>

export const locationSchema = z.object({
  name: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
})

export const publicEventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  image_path: z.string().nullable(),
  status: z.enum(['draft', 'published', 'closed']),
  date_mode: z.enum(['all', 'choose']),
  location: locationSchema,
  opens_at: z.string().nullable(),
  closes_at: z.string().nullable(),
  open: z.boolean(),
  closed_reason: z.enum(['draft', 'closed', 'not_yet', 'over']).nullable(),
  min_per_order: z.number(),
  max_per_order: z.number(),
  allow_pay_at_reception: z.boolean(),
  payment_note: z.string().nullable(),
  dates: z.array(publicDateSchema),
  ticket_types: z.array(publicTicketTypeSchema),
  logo_path: z.string().nullable(),
})
export type PublicEvent = z.infer<typeof publicEventSchema>

export async function fetchPublicEvent(slug: string): Promise<PublicEvent | null> {
  const { data, error } = await supabase.rpc('registration_public_event', { p_slug: slug })
  if (error) throw error
  if (!data) return null
  return publicEventSchema.parse(data)
}

export const promoCheckSchema = z.union([
  z.object({ ok: z.literal(false) }),
  z.object({
    ok: z.literal(true),
    code: z.string(),
    kind: z.enum(['amount', 'percent']),
    value: z.number(),
    ticket_type_ids: z.array(z.string()),
  }),
])
export type PromoCheck = z.infer<typeof promoCheckSchema>

export async function checkPromoCode(slug: string, code: string): Promise<PromoCheck> {
  const { data, error } = await supabase.rpc('registration_promo_check', { p_slug: slug, p_code: code })
  if (error) throw error
  return promoCheckSchema.parse(data ?? { ok: false })
}

export interface OrderLine {
  ticket_type_id: string
  quantity: number
  attendee_names: string[]
  donation_pence?: number
}

export interface OrderRequest {
  name: string
  email: string
  phone: string
  date_id: string | null
  promo_code: string
  lines: OrderLine[]
  /** The trap for bots: a person never sees it, so it stays empty. */
  website: string
}

export async function registerForEvent(slug: string, order: OrderRequest): Promise<string | null> {
  const { data, error } = await supabase.rpc('registration_register', { p_slug: slug, p_order: order })
  if (error) throw error
  const code = (data as { code?: string | null } | null)?.code
  return code ?? null
}

/** The tickets wanted, priced as the database will price them. */
export function orderTotals(
  types: PublicTicketType[],
  lines: OrderLine[],
  promo: PromoCheck | null,
): { quantity: number; subtotal: number; discount: number; total: number } {
  let quantity = 0
  let subtotal = 0
  let discountable = 0
  for (const line of lines) {
    const t = types.find((x) => x.id === line.ticket_type_id)
    if (!t || line.quantity <= 0) continue
    const unit = t.kind === 'free' ? 0 : t.kind === 'paid' ? t.price_pence : (line.donation_pence ?? 0)
    quantity += line.quantity
    subtotal += unit * line.quantity
    if (t.kind === 'paid' && promo?.ok && (promo.ticket_type_ids.length === 0 || promo.ticket_type_ids.includes(t.id))) {
      discountable += unit * line.quantity
    }
  }
  const discount = !promo?.ok ? 0 : promo.kind === 'amount' ? Math.min(promo.value, discountable) : Math.trunc((discountable * promo.value) / 100)
  return { quantity, subtotal, discount, total: subtotal - discount }
}

/** How many of a type are left, on a date or overall; null is no limit. */
export function remainingOf(type: PublicTicketType, dateMode: DateMode, dateId: string | null): number | null {
  if (type.quantity === null) return null
  if (dateMode === 'choose') return dateId ? (type.remaining_by_date[dateId] ?? type.quantity) : type.quantity
  return type.remaining ?? type.quantity
}

export const orderTicketSchema = z.object({
  type_name: z.string(),
  kind: z.enum(ticketKinds),
  attendee_name: z.string().nullable(),
  unit_price_pence: z.number(),
})

export const orderViewSchema = z.object({
  code: z.string(),
  status: z.enum(['confirmed', 'cancelled']),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  quantity: z.number(),
  subtotal_pence: z.number(),
  discount_pence: z.number(),
  total_pence: z.number(),
  promo_code: z.string().nullable(),
  payment_status: z.enum(['not_needed', 'awaiting', 'reported', 'received', 'waived']),
  payment_method: z.enum(['paypal', 'bank', 'reception']).nullable(),
  checked_in_at: z.string().nullable(),
  created_at: z.string(),
  can_cancel: z.boolean(),
  tickets: z.array(orderTicketSchema),
  date: publicDateSchema.nullable(),
  event: z.object({
    slug: z.string(),
    title: z.string(),
    image_path: z.string().nullable(),
    status: z.enum(['draft', 'published', 'closed']),
    date_mode: z.enum(['all', 'choose']),
    location: locationSchema,
    allow_pay_at_reception: z.boolean(),
    payment_note: z.string().nullable(),
    dates: z.array(publicDateSchema),
  }),
  payment: z.object({ links: z.array(paymentLinkSchema), accounts: z.array(paymentAccountSchema) }),
  logo_path: z.string().nullable(),
})
export type OrderView = z.infer<typeof orderViewSchema>
export type PaymentStatus = OrderView['payment_status']

export async function fetchOrder(code: string): Promise<OrderView | null> {
  const { data, error } = await supabase.rpc('registration_order_view', { p_code: code })
  if (error) throw error
  if (!data) return null
  return orderViewSchema.parse(data)
}

export async function reportPayment(code: string, method: 'paypal' | 'bank' | 'reception', done: boolean): Promise<void> {
  const { error } = await supabase.rpc('registration_order_payment', { p_code: code, p_method: method, p_done: done })
  if (error) throw error
}

export async function cancelOrder(code: string): Promise<void> {
  const { error } = await supabase.rpc('registration_order_cancel', { p_code: code })
  if (error) throw error
}

/** What a payment status says to the attendee and to reception. */
export const PAYMENT_WORDS: Record<PaymentStatus, string> = {
  not_needed: 'Nothing to pay',
  awaiting: 'Awaiting payment',
  reported: 'Payment reported — to be confirmed',
  received: 'Paid',
  waived: 'Paid (waived)',
}

/** "Sat 21 Nov 2026, 6:30 pm – 9:00 pm", in the reader's clock. */
export function whenWords(startsAt: string, endsAt: string | null): string {
  const s = new Date(startsAt)
  const day = s.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (!endsAt) return `${day}, ${time(s)}`
  const e = new Date(endsAt)
  const sameDay = s.toDateString() === e.toDateString()
  return sameDay
    ? `${day}, ${time(s)} – ${time(e)}`
    : `${day}, ${time(s)} – ${e.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time(e)}`
}

/* ------------------------------------------------------------------ */
/* The orders, as whoever runs registrations sees them                  */
/* ------------------------------------------------------------------ */

export const orderRowSchema = z.object({
  id: z.string(),
  code: z.string(),
  date_id: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  quantity: z.number(),
  subtotal_pence: z.number(),
  discount_pence: z.number(),
  total_pence: z.number(),
  promo_code: z.string().nullable(),
  payment_status: z.enum(['not_needed', 'awaiting', 'reported', 'received', 'waived']),
  payment_method: z.enum(['paypal', 'bank', 'reception']).nullable(),
  status: z.enum(['confirmed', 'cancelled']),
  checked_in_at: z.string().nullable(),
  notes: z.string().nullable(),
  anonymised_at: z.string().nullable(),
  created_at: z.string(),
  tickets: z.array(z.object({ ticket_type_id: z.string(), attendee_name: z.string().nullable(), unit_price_pence: z.number() })),
})
export type OrderRow = z.infer<typeof orderRowSchema>

export const ORDER_ROW_COLUMNS =
  'id, code, date_id, name, email, phone, quantity, subtotal_pence, discount_pence, total_pence, promo_code, payment_status, payment_method, status, checked_in_at, notes, anonymised_at, created_at, tickets:registration_order_tickets(ticket_type_id, attendee_name, unit_price_pence)'

/** Every order on an event, newest first. */
export async function fetchRegistrationOrders(eventId: string): Promise<OrderRow[]> {
  const { data, error } = await supabase
    .from('registration_orders')
    .select(ORDER_ROW_COLUMNS)
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return z.array(orderRowSchema).parse(data ?? [])
}
