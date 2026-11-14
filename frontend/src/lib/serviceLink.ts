import { webAddress } from './links'

/**
 * The link that goes with a service (0289): the livestream, the slides, the
 * shared folder. One address and, if the planner gave it one, a name.
 */
export interface ServiceLink {
  url: string
  label: string
}

/** The longest name the database keeps for a service's link. */
export const LINK_LABEL_MAX = 40

/** What the link is called where nobody named it. */
export const UNNAMED_LINK = 'Open link'

/**
 * A service's link as it is drawn, or null when it has none. The address is
 * checked again on the way out: a field typed by one person is read by the
 * whole church, so nothing but http(s) is ever made tappable.
 */
export function serviceLink(
  service: { link?: string | null; link_label?: string | null } | null | undefined,
): ServiceLink | null {
  const url = webAddress(service?.link ?? '')
  if (typeof url !== 'string') return null
  return { url, label: service?.link_label?.trim() || UNNAMED_LINK }
}

/**
 * What was typed, as the columns to save. `false` when the address is not
 * one, so the form can say so; an empty address clears both columns, since
 * a name with nothing behind it is not a link.
 */
export function serviceLinkPatch(
  typedUrl: string,
  typedLabel: string,
): { link: string | null; link_label: string | null } | false {
  const url = webAddress(typedUrl)
  if (url === false) return false
  if (url === null) return { link: null, link_label: null }
  return { link: url, link_label: typedLabel.trim().slice(0, LINK_LABEL_MAX) || null }
}
