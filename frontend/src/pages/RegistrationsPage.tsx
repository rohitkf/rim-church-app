import { useState, type ReactNode } from 'react'
import { useRegistrationRights } from '../lib/registrationRights'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ActionButton, PageHeader, Pill, StackedBar, Statistic, Tile } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { Lifespan } from '../components/Lifespan'
import { pounds } from '../lib/money'
import { registerUrl } from '../lib/registrationLinks'
import { useNow } from '../lib/timeLeft'
import { REGISTRATIONS_KEY, STATUS_TONE, STATUS_WORDS, fetchRegistrationEvents, groupEvents, whenWords, type EventSummary } from '../lib/registrations'

/**
 * Registrations (0244): every event people can sign up for, and how each
 * stands. The Owner's page, and whoever the grid gives a registrations
 * right (0251). The events are grouped by where they are — taking
 * registrations, drafts, closed or past, cancelled — and each card says
 * what, if anything, wants doing on it: receipts to check, payments to
 * chase, refunds to send.
 */
export function RegistrationsPage() {
  const rights = useRegistrationRights()
  const navigate = useNavigate()
  const now = useNow(true, 60_000)
  const events = useQuery({ queryKey: [...REGISTRATIONS_KEY, 'events'], queryFn: fetchRegistrationEvents })
  const rows = events.data ?? []
  const totals = rows.reduce(
    (t, e) => ({
      orders: t.orders + e.orders,
      tickets: t.tickets + e.tickets,
      expected: t.expected + e.expected_pence,
      received: t.received + e.received_pence,
      attention: t.attention + e.reported + e.owed,
    }),
    { orders: 0, tickets: 0, expected: 0, received: 0, attention: 0 },
  )
  const groups = groupEvents(rows, now)

  return (
    <div>
      <PageHeader
        eyebrow="Sign-ups from a link"
        title="Registrations"
        description="Events anybody can register for from a link, no account needed: tickets, promo codes, a map, and who has paid."
        action={
          rights.edit ? (
            <ActionButton onClick={() => navigate('/registrations/new')} glyph={<span aria-hidden="true">+</span>}>
              New event
            </ActionButton>
          ) : undefined
        }
      />

      <Lifespan page="registrations" className="mb-4" />

      <QueryState isLoading={events.isLoading} error={events.error} isEmpty={rows.length === 0} emptyMessage="No events yet. Make one, publish it, and share its link.">
        {/* The word under the figure in all four. Left to wrap, "4 events"
            sat on one line and "£120.00 received" on two, at every width. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile>
            <Statistic className="flex-col" value={rows.length} unit={rows.length === 1 ? 'event' : 'events'} />
          </Tile>
          <Tile>
            <Statistic className="flex-col" value={totals.orders} unit={`${totals.orders === 1 ? 'order' : 'orders'} · ${totals.tickets} tickets`} />
          </Tile>
          <Tile>
            <Statistic className="flex-col" value={<Money>{pounds(totals.received)}</Money>} unit="received" />
          </Tile>
          <Tile tone={totals.attention > 0 ? 'warning' : 'plain'}>
            <Statistic className="flex-col" value={totals.attention} unit={totals.attention === 1 ? 'needs a look' : 'need a look'} />
          </Tile>
        </div>

        {groups.map((g) => (
          <section key={g.key} aria-labelledby={`events-${g.key}`} className="mt-8">
            <h2 id={`events-${g.key}`} className="flex items-baseline gap-2 text-headline-md text-on-surface">
              {g.title}
              <span className="font-mono text-label-sm text-on-surface-faint">{g.events.length}</span>
            </h2>
            <ul aria-label={g.title} className="mt-3 flex flex-col gap-3">
              {g.events.map((e) => (
                <EventCard key={e.id} event={e} past={g.key === 'done' && e.status === 'published'} />
              ))}
            </ul>
          </section>
        ))}
      </QueryState>
    </div>
  )
}

/** A sum of money is wider than a count: a step smaller on a phone, so the tile holds it. */
function Money({ children }: { children: ReactNode }) {
  return <span className="text-headline-lg sm:text-numeral">{children}</span>
}

function EventCard({ event, past }: { event: EventSummary; past: boolean }) {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const link = registerUrl(event.slug)
  const awaitingOnly = event.awaiting - event.reported
  const outstanding = Math.max(0, event.expected_pence - event.received_pence)
  return (
    <li aria-label={event.title} className="rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link to={`/registrations/${event.id}`} className="block text-headline-md text-on-surface hover:underline">
            {event.title}
          </Link>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">
            {event.first_starts_at ? whenWords(event.first_starts_at, null) : 'No date yet'}
            {event.location_name && ` · ${event.location_name}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-numeral tabular text-on-surface">{event.tickets}</p>
          <p className="font-mono text-label-sm text-on-surface-faint">{event.tickets === 1 ? 'ticket' : 'tickets'}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {event.cancelled_at ? <Pill tone="red">Cancelled</Pill> : past ? <Pill tone="neutral">Past</Pill> : <Pill tone={STATUS_TONE[event.status]}>{STATUS_WORDS[event.status]}</Pill>}
        {event.reported > 0 && (
          <Pill tone="blue" dot>
            {event.reported} {event.reported === 1 ? 'receipt' : 'receipts'} to check
          </Pill>
        )}
        {awaitingOnly > 0 && <Pill tone="orange">{awaitingOnly} awaiting payment</Pill>}
        {event.owed > 0 && (
          <Pill tone="orange" dot>
            {event.owed} {event.owed === 1 ? 'refund' : 'refunds'} owed
          </Pill>
        )}
      </div>

      <div className="mt-3">
        {event.expected_pence > 0 && (
          <StackedBar
            height={6}
            label={`${pounds(event.received_pence)} of ${pounds(event.expected_pence)} received`}
            segments={[
              { key: 'in', value: event.received_pence, className: 'bg-accent-green' },
              { key: 'out', value: outstanding, className: 'bg-transparent' },
            ]}
          />
        )}
        <p className="mt-1.5 font-mono text-label-sm text-on-surface-variant">
          {event.orders} {event.orders === 1 ? 'order' : 'orders'}
          {event.expected_pence > 0 && ` · ${pounds(event.received_pence)} of ${pounds(event.expected_pence)} received`}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ActionButton size="sm" tone="quiet" onClick={() => navigate(`/registrations/${event.id}`)}>
          Open
        </ActionButton>
        <ActionButton
          size="sm"
          tone="ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(link)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </ActionButton>
        <a href={link} target="_blank" rel="noopener noreferrer" className="tap min-w-0 truncate font-mono text-label-sm text-on-surface-faint hover:underline">
          register/{event.slug} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </li>
  )
}
