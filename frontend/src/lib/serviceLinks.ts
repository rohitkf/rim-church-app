import { useSearchParams } from 'react-router-dom'
import { defaultNavLabel } from './navNames'

/*
 * One service, across the pages that are about it.
 *
 * A service has a running order, answers, a rota, checklists, a set list,
 * a stage plan, and afterwards debriefs and issues: eight pages, each of
 * which lists every service and lets you find yours again. Going from one
 * to the next meant the menu, then the list, then the service (the Owner,
 * November 2026). So a service's own pages link straight to each other,
 * and each list page opens on the service it was asked for.
 */

/** The address says which service a list page should open on: `/rota?service=<id>`. */
export const SERVICE_PARAM = 'service'

/** The id a service's card carries on a list page, so the page can be scrolled to it. */
export const serviceAnchor = (serviceId: string) => `service-${serviceId}`

/** The service the address asks for, or null. */
export function useServiceFocus(): string | null {
  const [params] = useSearchParams()
  return params.get(SERVICE_PARAM)
}

export interface ServiceLink {
  /** The page it opens, as the menu and the page rules know it. */
  page: string
  to: string
  label: string
}

const onList = (page: string) => (id: string) => `${page}?${SERVICE_PARAM}=${id}`

const PAGES: { page: string; label?: string; to: (id: string) => string; afterItBegins?: true }[] = [
  { page: '/service-planner', label: 'Running order', to: (id) => `/service-planner/${id}` },
  { page: '/availability', to: onList('/availability') },
  { page: '/rota', to: onList('/rota') },
  { page: '/checklists', to: onList('/checklists') },
  { page: '/set-lists', to: onList('/set-lists') },
  { page: '/stage', to: (id) => `/stage/${id}` },
  // Nothing can be written about a service that has not happened, and
  // neither page lists one until its day.
  { page: '/debriefs', to: onList('/debriefs'), afterItBegins: true },
  { page: '/issues', to: onList('/issues'), afterItBegins: true },
]

/**
 * The other pages about one service, for this person: only the ones they
 * may open, under the names the church has given them, and not the page
 * they are already on.
 */
export function serviceLinks(
  serviceId: string,
  opts: {
    canOpen: (path: string) => boolean
    /** The page these are drawn on. */
    here: string
    /** Its day has come: there is something to say about it afterwards. */
    begun: boolean
    names?: Record<string, string>
  },
): ServiceLink[] {
  return PAGES.filter((p) => p.page !== opts.here && opts.canOpen(p.page) && (!p.afterItBegins || opts.begun)).map((p) => ({
    page: p.page,
    to: p.to(serviceId),
    label: p.label ?? opts.names?.[p.page] ?? defaultNavLabel(p.page) ?? p.page,
  }))
}
