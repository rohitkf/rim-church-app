import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { usePageAccess } from '../lib/usePageAccess'
import { fetchPublicEvent, ticketEventKey } from '../lib/registrations'
import { ActionLink } from './Surface'

/**
 * The way back from a public page, for the people who run registrations
 * (the Owner, November 2026).
 *
 * A ticket and an event's registration page are public: no menu, nothing
 * of the app's. That is right for the attendee and a dead end for
 * whoever opened one from the list of registrations — in the installed
 * app there is no back button, and the only way out was to close the
 * app, open it, and find the event again.
 *
 * So each carries a bar its visitor never sees: back to this event's
 * registrations for whoever may open Registrations, and Reception for
 * whoever may open that. Who that is, is the same answer the menu gives
 * (usePageAccess), so a preview narrows it the way it narrows the menu.
 * Somebody not signed in is asked nothing at all: the questions behind
 * that answer are never put for a visitor.
 *
 * On a ticket, somebody who only works the door gets "Back to Reception"
 * — a ticket is what a door opens. On the registration page
 * (`officeOnly`) the bar is for whoever runs registrations and nobody
 * else: it is the office that opens an event's link to see it as the
 * public does, and the Owner asked that it be theirs alone.
 */
export function StaffBackBar({ slug, eventId, officeOnly = false }: { slug: string; /** The event, where the page already knows it: nothing more is asked. */ eventId?: string; officeOnly?: boolean }) {
  const { session } = useAuth()
  if (!session) return null
  return <StaffBack slug={slug} eventId={eventId} officeOnly={officeOnly} />
}

function StaffBack({ slug, eventId, officeOnly }: { slug: string; eventId?: string; officeOnly: boolean }) {
  const { canOpen, settled } = usePageAccess()
  const office = settled && canOpen('/registrations')
  const door = settled && canOpen('/door')
  const shown = office || (door && !officeOnly)
  // Which event this is, by the link the page carries, where the page did
  // not say: a ticket asks the same thing for its agenda, but not for a
  // cancelled one, and a cancelled registration is one somebody running
  // the event does open.
  const eventPage = useQuery({
    queryKey: ticketEventKey(slug),
    queryFn: () => fetchPublicEvent(slug),
    enabled: shown && !eventId,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  if (!shown) return null
  const id = eventId ?? eventPage.data?.id
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
