import { Link } from 'react-router-dom'
import { todayIso } from '../lib/monthGrid'
import { useNavNames } from '../lib/navNames'
import { serviceLinks } from '../lib/serviceLinks'
import { usePageAccess } from '../lib/usePageAccess'

/**
 * A service's other pages, as a row of links under its name.
 *
 * On the running order: this service's answers, rota, checklists, set
 * list and stage plan, and once its day has come its debriefs and issues.
 * Each opens on this service, not on a list to find it in again. Only the
 * pages this person may open are offered, so for somebody with the
 * running order alone there is no row.
 */
export function ServiceLinks({
  serviceId,
  date,
  here,
  className = '',
}: {
  serviceId: string
  /** The service's day, which decides whether there is an afterwards yet. */
  date: string | undefined
  /** The page this row is on, which is left out of it. */
  here: string
  className?: string
}) {
  const { canOpen } = usePageAccess()
  const names = useNavNames()
  const links = serviceLinks(serviceId, { canOpen, here, names, begun: !!date && date <= todayIso() })
  if (links.length === 0) return null

  return (
    <nav aria-label="This service’s other pages" data-tour="service-links" className={className}>
      <ul className="flex flex-wrap gap-1.5">
        {links.map((link) => (
          <li key={link.page}>
            <Link
              to={link.to}
              className="tap inline-flex items-center rounded-full bg-raised px-3 py-1 text-label-md text-on-surface-variant hairline transition-colors duration-200 hover:text-on-surface"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
