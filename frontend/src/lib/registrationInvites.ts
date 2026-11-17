import { z } from 'zod'
import { supabase } from './supabaseClient'
import { looksLikeEmail } from './emailDelivery'
import { parsePounds, pounds } from './money'
import { REGISTRATIONS_KEY, localIso, type InviteDiscount, type OrderRow } from './registrations'

/*
 * Invitation links to a registration event (0295).
 *
 * A promo code has to be told, and whoever is told it can tell anybody.
 * An invitation is a link — /register/<slug>?invite=<token> — that carries
 * its discount itself: the page asks the database what the token is worth
 * and shows the total, and nobody is ever shown a code, because there is
 * none. Two kinds: *personal* (one email address, used once) and *group*
 * (whoever holds it, a set number of times).
 *
 * Two halves live here. The public page's: what the link it was opened
 * with is worth (`checkInvite`), in words (`inviteOffer`). And the
 * office's: the list on an event's page, the form that makes one, and
 * what each has come to. How many times a link has been used is counted
 * from the orders — the database does the same — so a cancelled order
 * gives its use back without anybody keeping a number right.
 */

/** The name of the token in the link: /register/<slug>?invite=<token>. Links already sent say it. */
export const INVITE_PARAM = 'invite'

/** A group link that makes tickets free can be used this many times at most (the database's rule too). */
export const FREE_GROUP_MAX = 20
export const INVITE_LABEL_MAX = 80
const MAX_USES = 10000
const MAX_COVERED = 100

/* ------------------------------------------------------------------ */
/* The public page                                                      */
/* ------------------------------------------------------------------ */

const discountSchema = z.object({
  kind: z.enum(['amount', 'percent']),
  value: z.number(),
  ticket_type_ids: z.array(z.string()),
  tickets_covered: z.number(),
})

/**
 * What the form is told about its link. `ended` is turned off or past its
 * date, `used` is used up; a reason this build does not know reads as a
 * link that leads nowhere. Never who it was for.
 */
export const inviteCheckSchema = z.union([
  z.object({ ok: z.literal(false), reason: z.enum(['not_found', 'ended', 'used']).catch('not_found') }),
  z.object({
    ok: z.literal(true),
    /** Kept to one address: registering with another is refused. The address itself is never sent. */
    email_locked: z.boolean().nullish().transform((v) => v === true),
    /** Null: the link takes nothing off; it only records who came by it. */
    discount: discountSchema.nullable(),
  }),
])
export type InviteCheck = z.infer<typeof inviteCheckSchema>
export type LiveInvite = Extract<InviteCheck, { ok: true }>

export async function checkInvite(slug: string, token: string): Promise<InviteCheck> {
  const { data, error } = await supabase.rpc('registration_invite_check', { p_slug: slug, p_token: token })
  if (error) throw error
  return inviteCheckSchema.parse(data ?? { ok: false, reason: 'not_found' })
}

/** A token as a link carries it: twelve letters and digits. Anything else is not asked about. */
export function inviteTokenFrom(search: string): string | null {
  const raw = new URLSearchParams(search).get(INVITE_PARAM)?.trim().toUpperCase() ?? ''
  return /^[A-Z0-9]{12}$/.test(raw) ? raw : null
}

const ticketCount = (n: number) => `${n} ${n === 1 ? 'ticket' : 'tickets'}`

/** What a discount gives, in a few words: "1 free ticket", "50% off up to 2 tickets", "£10.00 off". */
export function discountWords(d: InviteDiscount): string {
  const some = d.ticket_type_ids.length > 0
  if (d.kind === 'amount') return `${pounds(d.value)} off${some ? ' some tickets' : ''}`
  const n = Math.max(1, d.tickets_covered)
  if (d.value >= 100) return `${n} free ${n === 1 ? 'ticket' : 'tickets'}${some ? ' (some kinds)' : ''}`
  return `${d.value}% off ${n === 1 ? '1 ticket' : `up to ${ticketCount(n)}`}${some ? ' (some kinds)' : ''}`
}

/** The line under "You're invited" on the form. */
export function inviteOffer(invite: LiveInvite): string {
  if (!invite.discount) return 'Register below as usual.'
  return `${discountWords(invite.discount)}, taken off for you below. There is no code to type.`
}

/** What a link that no longer works says, by why. */
export const INVITE_GONE: Record<Extract<InviteCheck, { ok: false }>['reason'], { title: string; body: string }> = {
  used: {
    title: 'This invitation has already been used.',
    body: 'If you used it, your ticket was emailed to you; “Get your ticket again” below sends it once more. You can still register here at the usual price.',
  },
  ended: {
    title: 'This invitation is no longer open.',
    body: 'You can still register here at the usual price, or ask whoever sent it for a new link.',
  },
  not_found: {
    title: 'This invitation link isn’t one we know.',
    body: 'It may have been cut short when it was copied. You can still register here at the usual price, or ask whoever sent it to send it again.',
  },
}

/* ------------------------------------------------------------------ */
/* The office                                                            */
/* ------------------------------------------------------------------ */

export const inviteSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  token: z.string(),
  label: z.string(),
  kind: z.enum(['personal', 'group']),
  locked_email: z.string().nullable(),
  discount_kind: z.enum(['amount', 'percent']).nullable(),
  discount_value: z.number().nullable(),
  ticket_type_ids: z.array(z.string()),
  tickets_covered: z.number(),
  max_uses: z.number().nullable(),
  expires_at: z.string().nullable(),
  active: z.boolean(),
  anonymised_at: z.string().nullable(),
  created_at: z.string(),
})
export type Invite = z.infer<typeof inviteSchema>
export type InviteKind = Invite['kind']

const INVITE_COLUMNS =
  'id, event_id, token, label, kind, locked_email, discount_kind, discount_value, ticket_type_ids, tickets_covered, max_uses, expires_at, active, anonymised_at, created_at'

export const invitesKey = (eventId: string) => [...REGISTRATIONS_KEY, 'invites', eventId] as const

/** An event's invitation links, newest first. */
export async function fetchInvites(eventId: string): Promise<Invite[]> {
  const { data, error } = await supabase
    .from('registration_invites')
    .select(INVITE_COLUMNS)
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return z.array(inviteSchema).parse(data ?? [])
}

/** The discount an invitation carries, in the shape the sums take; null when it carries none. */
export function discountOf(invite: Pick<Invite, 'discount_kind' | 'discount_value' | 'ticket_type_ids' | 'tickets_covered'>): InviteDiscount | null {
  if (!invite.discount_kind || invite.discount_value === null) return null
  return { kind: invite.discount_kind, value: invite.discount_value, ticket_type_ids: invite.ticket_type_ids, tickets_covered: invite.tickets_covered }
}

/** How many live orders came by each invitation: what the database counts too. */
export function inviteUses(orders: readonly Pick<OrderRow, 'invite_id' | 'status'>[]): Record<string, number> {
  const uses: Record<string, number> = {}
  for (const o of orders) {
    if (o.invite_id && o.status === 'confirmed') uses[o.invite_id] = (uses[o.invite_id] ?? 0) + 1
  }
  return uses
}

/**
 * Where a link stands. `off` was turned off by hand, `ended` is past its
 * date, `used` has no uses left, `removed` was blanked with its event's
 * orders. Only `live` still takes a registration.
 */
export type InviteState = 'live' | 'off' | 'ended' | 'used' | 'removed'

export function inviteState(invite: Pick<Invite, 'active' | 'expires_at' | 'max_uses' | 'anonymised_at'>, uses: number, now: Date = new Date()): InviteState {
  if (invite.anonymised_at) return 'removed'
  if (!invite.active) return 'off'
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= now.getTime()) return 'ended'
  if (invite.max_uses !== null && uses >= invite.max_uses) return 'used'
  return 'live'
}

/** "Not used yet", "Used", "14 of 20 used", "9 used". */
export function usesWords(invite: Pick<Invite, 'kind' | 'max_uses'>, uses: number): string {
  if (invite.kind === 'personal') return uses > 0 ? 'Used' : 'Not used yet'
  return invite.max_uses !== null ? `${uses} of ${invite.max_uses} used` : `${uses} used`
}

/** What a link gives, for its row: the discount in words, or that it has none. */
export function inviteGives(invite: Pick<Invite, 'discount_kind' | 'discount_value' | 'ticket_type_ids' | 'tickets_covered'>): string {
  const d = discountOf(invite)
  return d ? discountWords(d) : 'No discount'
}

/* ---- making one ---------------------------------------------------- */

export interface InviteDraft {
  kind: InviteKind
  /** Who it is for, in the church's own words. Never shown to whoever opens the link. */
  label: string
  /** Personal: the one address that may use it. */
  email: string
  discount: 'none' | 'percent' | 'amount'
  /** As typed: a percentage, or pounds. */
  value: string
  ticketsCovered: string
  /** Only the ticket types ticked, not every paid one. */
  limited: boolean
  ticketTypeIds: string[]
  /** Group: how many times it can be used. As typed; blank is no limit. */
  maxUses: string
  /** The last day it works, yyyy-mm-dd; blank is no end. */
  until: string
}

export const newInviteDraft = (): InviteDraft => ({
  kind: 'personal',
  label: '',
  email: '',
  discount: 'percent',
  value: '100',
  ticketsCovered: '1',
  limited: false,
  ticketTypeIds: [],
  maxUses: '',
  until: '',
})

export type InviteField = 'label' | 'email' | 'value' | 'covered' | 'tickets' | 'uses' | 'until'
export interface InviteProblem {
  field: InviteField
  text: string
}

const wholeNumber = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null)

/** Today as yyyy-mm-dd, in this device's own day. */
export function todayText(now: Date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`
}

/**
 * Everything standing between a draft and a link, in the order the form
 * asks — the database refuses the same things, in its own words; these are
 * so the form can say which box.
 */
export function inviteProblems(draft: InviteDraft, now: Date = new Date()): InviteProblem[] {
  const problems: InviteProblem[] = []
  const label = draft.label.trim()
  if (!label) problems.push({ field: 'label', text: draft.kind === 'personal' ? 'Say who it is for.' : 'Give the link a name, such as the group it is for.' })
  else if (label.length > INVITE_LABEL_MAX) problems.push({ field: 'label', text: `Keep the name to ${INVITE_LABEL_MAX} characters.` })

  if (draft.kind === 'personal') {
    if (!draft.email.trim()) problems.push({ field: 'email', text: 'Enter their email address: only that address can use the link.' })
    else if (!looksLikeEmail(draft.email)) problems.push({ field: 'email', text: 'That email address doesn’t look right. It should be like name@example.com.' })
  }

  let free = false
  if (draft.discount === 'percent') {
    const percent = wholeNumber(draft.value)
    if (percent === null || percent < 1 || percent > 100) problems.push({ field: 'value', text: 'Give a percentage from 1 to 100.' })
    else free = percent === 100
  } else if (draft.discount === 'amount') {
    const pence = parsePounds(draft.value)
    if (pence === null || pence <= 0) problems.push({ field: 'value', text: 'Say how many pounds to take off, such as 5.00.' })
  }
  if (draft.discount !== 'none') {
    const covered = wholeNumber(draft.ticketsCovered)
    if (covered === null || covered < 1 || covered > MAX_COVERED) problems.push({ field: 'covered', text: `Say how many tickets it covers, from 1 to ${MAX_COVERED}.` })
    if (draft.limited && draft.ticketTypeIds.length === 0) problems.push({ field: 'tickets', text: 'Tick at least one ticket, or choose every paid ticket.' })
  }

  if (draft.kind === 'group') {
    const typed = draft.maxUses.trim()
    const uses = wholeNumber(typed)
    if (!typed) {
      if (draft.discount !== 'none') problems.push({ field: 'uses', text: 'Say how many times the link can be used. A link with a discount needs a limit.' })
    } else if (uses === null || uses < 1 || uses > MAX_USES) problems.push({ field: 'uses', text: `Give a number of uses from 1 to ${MAX_USES.toLocaleString('en-GB')}.` })
    else if (free && uses > FREE_GROUP_MAX)
      problems.push({ field: 'uses', text: `A link that makes tickets free can be used ${FREE_GROUP_MAX} times at most. For more people, make each a personal link.` })
  }

  if (draft.until && draft.until < todayText(now)) problems.push({ field: 'until', text: 'Choose today or a later day, or leave it with no end.' })
  return problems
}

/** The row a draft becomes. The token is not here: the database makes it. */
export function inviteRow(eventId: string, draft: InviteDraft) {
  const discounted = draft.discount !== 'none'
  return {
    event_id: eventId,
    label: draft.label.trim(),
    kind: draft.kind,
    locked_email: draft.kind === 'personal' ? draft.email.trim().toLowerCase() : null,
    discount_kind: discounted ? draft.discount : null,
    discount_value: draft.discount === 'percent' ? wholeNumber(draft.value) : draft.discount === 'amount' ? parsePounds(draft.value) : null,
    ticket_type_ids: discounted && draft.limited ? draft.ticketTypeIds : [],
    tickets_covered: discounted ? (wholeNumber(draft.ticketsCovered) ?? 1) : 1,
    max_uses: draft.kind === 'personal' ? 1 : wholeNumber(draft.maxUses),
    // The whole of its last day, in this device's time.
    expires_at: draft.until ? localIso(draft.until, '23:59') : null,
  }
}

export async function createInvite(eventId: string, draft: InviteDraft): Promise<Invite> {
  const { data, error } = await supabase.from('registration_invites').insert(inviteRow(eventId, draft)).select(INVITE_COLUMNS).single()
  if (error) throw error
  return inviteSchema.parse(data)
}

/** Turn a link off, or back on. Off, it takes no more registrations; the ones it brought stay. */
export async function setInviteActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('registration_invites').update({ active }).eq('id', id)
  if (error) throw error
}

export async function deleteInvite(id: string): Promise<void> {
  const { error } = await supabase.from('registration_invites').delete().eq('id', id)
  if (error) throw error
}

/** Each link's name by its id, for the orders list and the export. */
export function inviteNames(invites: readonly Pick<Invite, 'id' | 'label'>[]): Record<string, string> {
  return Object.fromEntries(invites.map((i) => [i.id, i.label]))
}
