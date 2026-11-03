import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ActionButton, PageHeader, Pill, Statistic, Tile } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { pounds } from '../lib/money'
import { registerUrl } from '../lib/registrationLinks'
import { REGISTRATIONS_KEY, STATUS_TONE, STATUS_WORDS, fetchRegistrationEvents, whenWords, type EventSummary } from '../lib/registrations'

/**
 * Registrations (0244): every event people can sign up for, and how each
 * stands. The Owner's page, and whoever the grid gives "Run registrations".
 */
export function RegistrationsPage() {
  const navigate = useNavigate()
  const events = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'events'], queryFn: fetchRegistrationEvents })
  const rows = events.data ?? []
  const totals = rows.reduce(
    (t, e) => ({ orders: t.orders + e.orders, tickets: t.tickets + e.tickets, expected: t.expected + e.expected_pence, received: t.received + e.received_pence }),
    { orders: 0, tickets: 0, expected: 0, received: 0 },
  )

  return (
    <div>
      <PageHeader
        eyebrow="Sign-ups from a link"
        title="Registrations"
        description="Events anybody can register for from a link, no account needed: tickets, promo codes, a map, and who has paid."
        action={
          <ActionButton onClick={() => navigate('/registrations/new')} glyph={<span aria-hidden="true">+</span>}>
            New event
          </ActionButton>
        }
      />

      <QueryState isLoading={events.isLoading} error={events.error} isEmpty={rows.length === 0} emptyMessage="No events yet. Make one, publish it, and share its link.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile>
            <Statistic value={rows.length} unit={rows.length === 1 ? 'event' : 'events'} />
          </Tile>
          <Tile>
            <Statistic value={totals.orders} unit={`${totals.orders === 1 ? 'order' : 'orders'} · ${totals.tickets} tickets`} />
          </Tile>
          <Tile>
            <Statistic value={pounds(totals.received)} unit="received" />
          </Tile>
          <Tile>
            <Statistic value={pounds(totals.expected - totals.received)} unit="still to come" />
          </Tile>
        </div>

        <ul aria-label="Events" className="mt-6 flex flex-col gap-3">
          {rows.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </ul>
      </QueryState>
    </div>
  )
}

function EventCard({ event }: { event: EventSummary }) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const link = registerUrl(event.slug)
  return (
    <li aria-label={event.title} className="rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={STATUS_TONE[event.status]}>{STATUS_WORDS[event.status]}</Pill>
            {event.awaiting > 0 && <Pill tone="orange">{event.awaiting} awaiting payment</Pill>}
          </div>
          <Link to={`/registrations/${event.id}`} className="mt-2 block text-headline-md text-on-surface hover:underline">
            {event.title}
          </Link>
          <p className="text-body-sm text-on-surface-variant">
            {event.first_starts_at ? whenWords(event.first_starts_at, null) : 'No date yet'}
            {event.location_name && ` · ${event.location_name}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-numeral tabular text-on-surface">{event.tickets}</p>
          <p className="font-mono text-label-sm text-on-surface-faint">{event.tickets === 1 ? 'ticket' : 'tickets'}</p>
        </div>
      </div>
      <p className="mt-2 font-mono text-label-sm text-on-surface-variant">
        {event.orders} {event.orders === 1 ? 'order' : 'orders'}
        {event.expected_pence > 0 && ` · ${pounds(event.received_pence)} of ${pounds(event.expected_pence)} received`}
      </p>
      <p className="mt-3 min-w-0 break-all font-mono text-label-sm text-on-surface-faint">{link}</p>
      <div className="mt-2 flex items-center gap-2">
        <ActionButton
          size="sm"
          tone="quiet"
          onClick={() => {
            void navigator.clipboard?.writeText(link)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </ActionButton>
        <ActionButton size="sm" tone="ghost" onClick={() => navigate(`/registrations/${event.id}`)}>
          Open
        </ActionButton>
      </div>
    </li>
  )
}
