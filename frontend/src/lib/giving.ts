import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * How to give (0108): the church's bank accounts, and links to wherever
 * it takes card payments. Read by every signed-in member; kept by an Admin
 * in App settings.
 *
 * No payment passes through the app. A link opens the provider's page —
 * a Stripe Payment Link offers Apple Pay and Google Pay there by itself —
 * so no card number or provider key ever touches this code.
 */

export const GIVING_BUCKET = 'giving'
export const GIVING_KEY = ['giving']

export const givingPageSchema = z.object({
  intro: z.string().nullable(),
  qr_image_path: z.string().nullable(),
  qr_image_caption: z.string().nullable(),
})
export type GivingPage = z.infer<typeof givingPageSchema>

export const givingLinkSchema = z.object({
  id: z.string(),
  label: z.string(),
  url: z.string(),
  note: z.string().nullable(),
  show_qr: z.boolean(),
  sort_order: z.number(),
})
export type GivingLink = z.infer<typeof givingLinkSchema>

export const bankAccountSchema = z.object({
  id: z.string(),
  label: z.string(),
  account_name: z.string(),
  bank_name: z.string().nullable(),
  sort_code: z.string().nullable(),
  account_number: z.string().nullable(),
  iban: z.string().nullable(),
  bic: z.string().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  sort_order: z.number(),
})
export type BankAccount = z.infer<typeof bankAccountSchema>

export interface Giving {
  page: GivingPage
  links: GivingLink[]
  accounts: BankAccount[]
}

const EMPTY_PAGE: GivingPage = { intro: null, qr_image_path: null, qr_image_caption: null }

export async function fetchGiving(): Promise<Giving> {
  const [page, links, accounts] = await Promise.all([
    supabase.from('giving_page').select('intro, qr_image_path, qr_image_caption').maybeSingle(),
    supabase
      .from('giving_links')
      .select('id, label, url, note, show_qr, sort_order')
      .order('sort_order')
      .order('created_at'),
    supabase
      .from('giving_bank_accounts')
      .select(
        'id, label, account_name, bank_name, sort_code, account_number, iban, bic, reference, notes, sort_order',
      )
      .order('sort_order')
      .order('created_at'),
  ])
  if (page.error) throw page.error
  if (links.error) throw links.error
  if (accounts.error) throw accounts.error
  return {
    page: page.data ? givingPageSchema.parse(page.data) : EMPTY_PAGE,
    links: z.array(givingLinkSchema).parse(links.data),
    accounts: z.array(bankAccountSchema).parse(accounts.data),
  }
}

export function useGiving() {
  return useQuery({ queryKey: GIVING_KEY, queryFn: fetchGiving })
}

/** Nothing set up yet: the page says so rather than showing empty boxes. */
export function isEmptyGiving(g: Giving): boolean {
  return g.links.length === 0 && g.accounts.length === 0 && !g.page.qr_image_path
}

/** The uploaded QR picture, signed for an hour — the bucket is private. */
export function useGivingQrImage(path: string | null | undefined) {
  return useQuery({
    queryKey: ['giving-qr', path],
    enabled: !!path,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(GIVING_BUCKET).createSignedUrl(path!, 3600)
      if (error) return null
      return data.signedUrl
    },
  })
}

/* ---- the rules the database holds, said before it is asked ------- */

/** "401162" or "40 11 62" → "40-11-62". Anything else is returned as typed. */
export function formatSortCode(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length === 6 ? `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}` : value.trim()
}

/** An IBAN in groups of four, the way it is printed on a statement. */
export function formatIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1 ')
}

/** https only — the same rule as the database's check on giving_links. */
export function isSafeLink(url: string): boolean {
  return /^https:\/\/\S+$/i.test(url.trim()) && url.trim().length <= 2000
}

/**
 * What is wrong with an account form, in words, or null when it will
 * save. Mirrors 0108's checks so the form says it before the database
 * refuses it.
 */
export function bankAccountProblem(a: {
  label: string
  account_name: string
  sort_code: string
  account_number: string
  iban: string
  bic: string
}): string | null {
  if (!a.label.trim()) return 'Say what the account is for — “Tithes and offerings”, say.'
  if (!a.account_name.trim()) return 'The account name is what the bank checks the payment against.'
  const sort = a.sort_code.replace(/\D/g, '')
  const number = a.account_number.replace(/\D/g, '')
  const iban = a.iban.replace(/\s+/g, '')
  if (a.sort_code.trim() && sort.length !== 6) return 'A sort code is six digits.'
  if (a.account_number.trim() && (number.length < 6 || number.length > 10))
    return 'An account number is six to ten digits.'
  if (iban && !/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/i.test(iban)) return 'That IBAN is not the right shape.'
  if (a.bic.trim() && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/i.test(a.bic.trim()))
    return 'A BIC is eight or eleven letters and numbers.'
  if (!((sort && number) || iban)) return 'Give a sort code and account number, or an IBAN.'
  return null
}

/** What goes to the database: blanks as nulls, digits as digits. */
export function accountRow(d: {
  label: string
  account_name: string
  bank_name: string
  sort_code: string
  account_number: string
  iban: string
  bic: string
  reference: string
  notes: string
  sort_order: number
}) {
  const digits = (v: string) => v.replace(/\D/g, '') || null
  const sort = digits(d.sort_code)
  return {
    label: d.label.trim(),
    account_name: d.account_name.trim(),
    bank_name: d.bank_name.trim() || null,
    sort_code: sort ? `${sort.slice(0, 2)}-${sort.slice(2, 4)}-${sort.slice(4)}` : null,
    account_number: digits(d.account_number),
    iban: d.iban.replace(/\s+/g, '').toUpperCase() || null,
    bic: d.bic.trim().toUpperCase() || null,
    reference: d.reference.trim() || null,
    notes: d.notes.trim() || null,
    sort_order: d.sort_order,
  }
}
