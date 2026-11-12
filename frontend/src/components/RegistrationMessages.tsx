import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionButton, Pill } from './Surface'
import { REGISTRATIONS_KEY, fetchRegistrationMessages, markRegistrationMessage, sortMessages, type RegistrationMessage } from '../lib/registrations'
import { useErrorText } from '../lib/useErrorText'

/**
 * What people have written to the organisers of one event (0287), on the
 * event's own page: who, when, what, and a way to answer.
 *
 * Answering is by email — the address is a link that opens a reply with
 * the event in its subject — because the person who wrote has no account
 * and nowhere else to read an answer. "Dealt with" puts a message below
 * the ones still waiting and can be undone; nothing here deletes one.
 * They go when the event does.
 *
 * Draws nothing at all while there are none: most events never get one,
 * and an empty box on every event's page would be furniture.
 */
export function RegistrationMessages({
  eventId,
  eventTitle,
  codeOf,
}: {
  eventId: string
  eventTitle: string
  /** The code of a registration, for a message that came from its ticket. */
  codeOf: (orderId: string) => string | null
}) {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { hash } = useLocation()
  const section = useRef<HTMLElement | null>(null)
  const key = [...REGISTRATIONS_KEY, 'messages', eventId]
  const messages = useQuery({ queryKey: key, queryFn: () => fetchRegistrationMessages(eventId) })
  const mark = useMutation({
    mutationFn: ({ id, handled }: { id: string; handled: boolean }) => markRegistrationMessage(id, handled),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })

  const list = sortMessages(messages.data ?? [])
  const waiting = list.filter((m) => !m.handled_at).length

  // The bell's line lands here (#messages), once they have been read in.
  const arrived = list.length > 0
  useEffect(() => {
    if (hash === '#messages' && arrived) section.current?.scrollIntoView?.({ block: 'start' })
  }, [hash, arrived])

  if (list.length === 0) return null

  return (
    <section ref={section} id="messages" aria-labelledby="messages-heading" className="mt-8 scroll-mt-4">
      <h2 id="messages-heading" className="flex flex-wrap items-center gap-2 text-headline-md text-on-surface">
        Messages
        {waiting > 0 ? <Pill tone="orange">{waiting} waiting</Pill> : <Pill tone="green">All dealt with</Pill>}
      </h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        Sent from the event’s page or from a ticket. Answer by email; they are deleted with the event.
      </p>
      {mark.error && (
        <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {errorText(mark.error, 'That could not be saved.')}
        </p>
      )}
      <ul aria-label="Messages to the organisers" className="mt-3 flex flex-col gap-2">
        {list.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            eventTitle={eventTitle}
            code={m.order_id ? codeOf(m.order_id) : null}
            busy={mark.isPending && mark.variables?.id === m.id}
            onMark={(handled) => mark.mutate({ id: m.id, handled })}
          />
        ))}
      </ul>
    </section>
  )
}

const sentWords = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function MessageRow({
  message,
  eventTitle,
  code,
  busy,
  onMark,
}: {
  message: RegistrationMessage
  eventTitle: string
  code: string | null
  busy: boolean
  onMark: (handled: boolean) => void
}) {
  const done = message.handled_at !== null
  const reply = `mailto:${message.email}?subject=${encodeURIComponent(`Re: ${eventTitle}`)}`
  return (
    <li className={`rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline ${done ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-body-md font-semibold text-on-surface [overflow-wrap:anywhere]">{message.name}</p>
          <p className="mt-0.5 text-body-sm [overflow-wrap:anywhere]">
            <a href={reply} className="tap font-medium text-accent-blue-soft hover:underline">
              {message.email}
            </a>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {done && <Pill tone="green">Dealt with</Pill>}
          <ActionButton size="sm" tone="quiet" onClick={() => onMark(!done)} disabled={busy} aria-label={`${done ? 'Put back as waiting' : 'Mark as dealt with'}: message from ${message.name}`}>
            {done ? 'Put back' : 'Dealt with'}
          </ActionButton>
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-body-md text-on-surface [overflow-wrap:anywhere]">{message.message}</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-label-sm text-on-surface-faint">
        <span>{sentWords(message.created_at)}</span>
        {code && <span>From ticket {code}</span>}
      </p>
    </li>
  )
}
