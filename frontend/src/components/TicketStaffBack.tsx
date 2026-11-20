import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { usePageAccess } from '../lib/usePageAccess'
import { fetchPublicEvent, ticketEventKey } from '../lib/registrations'
import { ActionLink } from './Surface'

/**
 * The way back, on somebody else's ticket, for the people who run
 * registrations (the Owner, November 2026).
 *
 * A ticket is a public page: no menu, nothing of the app's. That is right
 * for the attendee and a dead end for whoever opened it from the list of
 * registrations — in the installed app there is no back button, and the
 * only way out was to close the app, open it, and find the event again.
 *
 * So the ticket carries a bar its attendee never sees: back to this
 * event's registrations for whoever may open Registrations, to Reception
 * for whoever may open that. Who that is, is the same answer the menu
 * gives (usePageAccess), so a preview narrows it the way it narrows the
 * menu. Somebody not signed in is asked nothing at all: the questions
 * behind that answer are never put for a visitor.
 */
export function TicketStaffBack({ slug }: { slug: string }) {
  const { session } = useAuth()
  if (!session) return null
  return <StaffBack slug={slug} />
}

function StaffBack({ slug }: { slug: string }) {
  const { canOpen, settled } = usePageAccess()
  const office = settled && canOpen('/registrations')
  const door = settled && canOpen('/door')
  // Which event this is, by the link the ticket carries: the ticket itself
  // asks the same thing for its agenda, but not for a cancelled one, and a
  // cancelled registration is one somebody running the event does open.
  const eventPage = useQuery({
    queryKey: ticketEventKey(slug),
    queryFn: () => fetchPublicEvent(slug),
    enabled: office || door,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  if (!office && !door) return null
  const id = eventPage.data?.id
  return (
    <nav aria-label="For the team" className="mb-4 mt-1 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] bg-surface-lowest p-3 hairline">
      {office && (
        <ActionLink as={Link} to={id ? `/registrations/${id}` : '/registrations'} size="sm" tone="accent-quiet">
          <span aria-hidden="true">←</span>
          Back to registrations
        </ActionLink>
      )}
      {door && (
        <ActionLink as={Link} to={id ? `/door?event=${id}` : '/door'} size="sm" tone={office ? 'quiet' : 'accent-quiet'}>
          {!office && <span aria-hidden="true">←</span>}
          {office ? 'Reception' : 'Back to Reception'}
        </ActionLink>
      )}
      <span className="text-label-sm text-on-surface-faint">Only the team sees this bar.</span>
    </nav>
  )
}
