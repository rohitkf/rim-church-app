import { useId, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ActionButton, Eyebrow, Overlay, inputClasses } from './Surface'
import { ContactRefused, MESSAGE_MAX, sendRegistrationMessage } from '../lib/registrations'
import { useErrorText } from '../lib/useErrorText'

/**
 * "Need help?" on an event's public page and on a ticket (0287).
 *
 * Until this there was nothing on either page that reached the church:
 * somebody whose payment had gone wrong, or who could not tell which
 * ticket to pick, had to know somebody. This is a button, and behind it
 * three boxes — who, where to answer, and what — sent to the people who
 * run the event, who read them on the event's own page and are told in
 * the bell.
 *
 * It is a form, so it follows the form rule (AGENTS.md §5): Send is never
 * greyed out for something missing. Pressing it with something wrong
 * says what, in red, beside the button and under the box.
 *
 * From a ticket the name and address are already known and the order
 * rides along, so the office sees whose registration it is about.
 */
export function ContactOrganisers({
  slug,
  eventTitle,
  code,
  name = '',
  email = '',
  className = '',
}: {
  slug: string
  eventTitle: string
  /** The ticket's code, when this is on a ticket. */
  code?: string | null
  name?: string
  email?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  return (
    <div className={className}>
      <ActionButton tone="quiet" size="sm" onClick={() => setOpen(true)} aria-label={`Need help? Message the organisers of ${eventTitle}`}>
        Need help? Message the organisers
      </ActionButton>
      {sent && !open && (
        <p role="status" className="mt-2 text-body-sm text-accent-green-soft">
          Your message has been sent. They will answer by email.
        </p>
      )}
      {open && (
        <ContactForm
          slug={slug}
          eventTitle={eventTitle}
          code={code ?? null}
          name={name}
          email={email}
          onClose={() => setOpen(false)}
          onSent={() => {
            setSent(true)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

type Spot = 'name' | 'email' | 'message'

function ContactForm({
  slug,
  eventTitle,
  code,
  name: nameAtFirst,
  email: emailAtFirst,
  onClose,
  onSent,
}: {
  slug: string
  eventTitle: string
  code: string | null
  name: string
  email: string
  onClose: () => void
  onSent: () => void
}) {
  const errorText = useErrorText()
  const ids = useId()
  const [name, setName] = useState(nameAtFirst)
  const [email, setEmail] = useState(emailAtFirst)
  const [message, setMessage] = useState('')
  const [tried, setTried] = useState(false)
  const boxes = useRef<Partial<Record<Spot, HTMLInputElement | HTMLTextAreaElement | null>>>({})

  const send = useMutation({
    mutationFn: () => sendRegistrationMessage(slug, { name: name.trim(), email: email.trim(), message: message.trim(), code }),
    onSuccess: onSent,
  })

  const problems: { spot: Spot; text: string }[] = []
  if (!name.trim()) problems.push({ spot: 'name', text: 'Your name is missing.' })
  if (!email.trim()) problems.push({ spot: 'email', text: 'Your email address is missing — it is how they answer you.' })
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) problems.push({ spot: 'email', text: 'That email address doesn’t look right. It should be like name@example.com.' })
  if (!message.trim()) problems.push({ spot: 'message', text: 'Your message is empty.' })
  else if (message.trim().length > MESSAGE_MAX) problems.push({ spot: 'message', text: `Your message is too long: ${MESSAGE_MAX.toLocaleString('en-GB')} characters at most.` })

  const of = (spot: Spot) => (tried ? (problems.find((p) => p.spot === spot) ?? null) : null)
  const errorId = (spot: Spot) => `${ids}-${spot}-error`
  const marked = (spot: Spot) => (of(spot) ? { 'aria-invalid': true as const, 'aria-describedby': errorId(spot) } : {})
  const under = (spot: Spot) => {
    const p = of(spot)
    return p ? (
      <p id={errorId(spot)} className="text-label-md font-medium text-accent-red-soft">
        {p.text}
      </p>
    ) : null
  }
  const goTo = (spot: Spot) => boxes.current[spot]?.focus()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (problems.length > 0) {
      goTo(problems[0].spot)
      return
    }
    send.mutate()
  }

  return (
    <Overlay label="Message the organisers" onDismiss={onClose}>
      <form
        onSubmit={submit}
        noValidate
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
      >
        <div>
          <h2 className="text-headline-md text-on-surface">Message the organisers</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            About <span className="font-medium text-on-surface [overflow-wrap:anywhere]">{eventTitle}</span>. They answer by email.
          </p>
        </div>

        {/* The reason sits outside the <label>: inside it, a screen reader reads it as part of the box's name. */}
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-2">
            <Eyebrow>Your name</Eyebrow>
            <input
              ref={(el) => void (boxes.current.name = el)}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={120}
              className={`${inputClasses} ${of('name') ? 'field-error' : ''}`}
              {...marked('name')}
            />
          </label>
          {under('name')}
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-2">
            <Eyebrow>Your email</Eyebrow>
            <input
              ref={(el) => void (boxes.current.email = el)}
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={254}
              className={`${inputClasses} ${of('email') ? 'field-error' : ''}`}
              {...marked('email')}
            />
          </label>
          {under('email')}
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-2">
            <Eyebrow>Your message</Eyebrow>
            <textarea
              ref={(el) => void (boxes.current.message = el)}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className={`${inputClasses} resize-y ${of('message') ? 'field-error' : ''}`}
              {...marked('message')}
            />
          </label>
          {under('message')}
          {message.length > MESSAGE_MAX - 200 && !of('message') && (
            <p className="text-label-sm text-on-surface-faint">
              {message.trim().length.toLocaleString('en-GB')} of {MESSAGE_MAX.toLocaleString('en-GB')} characters
            </p>
          )}
        </div>

        {tried && problems.length > 0 && (
          <div role="alert" aria-label="What to put right" className="rounded-[var(--radius-chip)] bg-error-container px-3.5 py-3 text-body-sm text-on-error-container">
            <p className="font-semibold">Not sent yet:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {problems.map((p) => (
                <li key={p.spot}>
                  <button type="button" onClick={() => goTo(p.spot)} className="inline text-left font-medium underline underline-offset-2">
                    {p.text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {send.error && (
          <p role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {send.error instanceof ContactRefused ? send.error.message : errorText(send.error, 'That could not be sent. Please try again.')}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <ActionButton type="submit" disabled={send.isPending}>
            {send.isPending ? 'Sending…' : 'Send message'}
          </ActionButton>
          <ActionButton tone="quiet" onClick={onClose} disabled={send.isPending}>
            Cancel
          </ActionButton>
        </div>
      </form>
    </Overlay>
  )
}
