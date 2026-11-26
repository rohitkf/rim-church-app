import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * What the church says about itself on /privacy (0334).
 *
 * The page that tells people what is kept about them is the app's own
 * account of what it does. Who to ask, where to write and anything the
 * church wants said in its own words are not the app's to know, so they
 * are four pieces of text the church sets in Settings › General, and the
 * page shows whichever of them have been filled in.
 *
 * /privacy is open to anybody, signed in or not, and `app_settings` is
 * not: the four are read through `privacy_details()`, which gives out
 * this one thing, and written through `set_privacy_details()`, which
 * trims them, checks their length and keeps nothing else.
 */

export const privacyDetailsSchema = z.object({
  contact_name: z.string().optional(),
  contact_email: z.string().optional(),
  postal_address: z.string().optional(),
  note: z.string().optional(),
})
export type PrivacyDetails = z.infer<typeof privacyDetailsSchema>
export type PrivacyField = keyof PrivacyDetails

/** The most the database will take for each: the page has to be able to show it. */
export const PRIVACY_LIMITS: Record<PrivacyField, number> = {
  contact_name: 120,
  contact_email: 254,
  postal_address: 500,
  note: 4000,
}

export const PRIVACY_DETAILS_KEY = ['privacy-details']

export async function fetchPrivacyDetails(): Promise<PrivacyDetails> {
  const { data, error } = await supabase.rpc('privacy_details')
  if (error) throw error
  const read = privacyDetailsSchema.safeParse(data ?? {})
  return read.success ? read.data : {}
}

export async function savePrivacyDetails(details: PrivacyDetails): Promise<PrivacyDetails> {
  const { data, error } = await supabase.rpc('set_privacy_details', { p_details: details })
  if (error) throw error
  const read = privacyDetailsSchema.safeParse(data ?? {})
  return read.success ? read.data : {}
}

/** Trimmed, with the blanks left out: what would be kept if this were saved. */
export function tidyPrivacyDetails(details: PrivacyDetails): PrivacyDetails {
  const out: PrivacyDetails = {}
  for (const key of Object.keys(PRIVACY_LIMITS) as PrivacyField[]) {
    const value = (details[key] ?? '').trim()
    if (value) out[key] = value
  }
  return out
}

/** Whether the church has said anything at all. */
export function hasPrivacyDetails(details: PrivacyDetails | null | undefined): boolean {
  return !!details && Object.keys(tidyPrivacyDetails(details)).length > 0
}

/** What is wrong with a draft, if anything, in the order the form shows the fields. */
export function privacyDetailsFault(details: PrivacyDetails): string | null {
  const tidy = tidyPrivacyDetails(details)
  for (const key of Object.keys(PRIVACY_LIMITS) as PrivacyField[]) {
    if ((tidy[key] ?? '').length > PRIVACY_LIMITS[key]) return `That is longer than the page can show (${PRIVACY_LIMITS[key]} characters at most).`
  }
  if (tidy.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(tidy.contact_email)) return 'That does not look like an email address.'
  return null
}

export function samePrivacyDetails(a: PrivacyDetails, b: PrivacyDetails): boolean {
  const x = tidyPrivacyDetails(a)
  const y = tidyPrivacyDetails(b)
  return (Object.keys(PRIVACY_LIMITS) as PrivacyField[]).every((key) => (x[key] ?? '') === (y[key] ?? ''))
}
