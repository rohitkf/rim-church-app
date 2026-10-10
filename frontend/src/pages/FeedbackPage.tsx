import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAppSettings } from '../lib/appSettings'
import { feedbackGoneAt, untilText } from '../lib/expiry'
import { useNow } from '../lib/useNow'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { formatRelativeTime } from '../lib/relativeTime'
import {
  FEEDBACK_KEY,
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  MAX_BODY,
  MAX_REPLY,
  deleteFeedback,
  fetchFeedback,
  groupByKind,
  isOpen,
  kindOf,
  markFeedback,
  statusOf,
  submitFeedback,
  type Feedback,
  type FeedbackKind,
  type FeedbackStatus,
} from '../lib/feedback'
import { Lifespan } from '../components/Lifespan'
import { QueryState } from '../components/QueryState'
import { useConfirmAction } from '../components/ConfirmAction'
import { ActionButton, IconBadge, PageHeader, Pill, SectionTile, Tile, inputClasses } from '../components/Surface'

/**
 * Feedback about the app, from the people who use it every Sunday.
 *
 * Anybody on a team can send it (Church Members cannot — the database
 * refuses them too, 0124): pick what kind it is, say it, send. It goes to
 * the Owner's bell and phone. Your own stay listed underneath, with
 * where each one stands and any reply.
 *
 * The Owner alone sees everybody's (0125 — Admins see only their own),
 * grouped by kind in a fixed order — what is broken first — and answers
 * each one: a status, and a line back to the person who sent it, who is
 * told.
 *
 * This is about the app. A broken projector at a service is an Issue.
 */
export function FeedbackPage() {
  const { isSuperAdmin: isOwner, session } = useAuth()
  const myId = session?.user.id
  const [params] = useSearchParams()
  const openedId = params.get('feedback')
  const query = useQuery({ queryKey: FEEDBACK_KEY, queryFn: fetchFeedback })
  const all = useMemo(() => query.data ?? [], [query.data])
  const mine = all.filter((f) => f.created_by === myId)
  const [view, setView] = useState<'everyone' | 'mine'>(isOwner ? 'everyone' : 'mine')

  // A tap on the notification lands on the feedback it was about.
  useEffect(() => {
    if (!openedId || !query.data) return
    document.getElementById(`feedback-${openedId}`)?.scrollIntoView?.({ block: 'center' })
  }, [openedId, query.data])

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        eyebrow="Help us make the app better"
        title="Feedback"
        description="Something broken, something missing, something you love — tell the people who run the app."
      />
      <Lifespan page="feedback" className="mb-4" />

      <Composer />

      {isOwner && (
        <div role="tablist" aria-label="Whose feedback" className="mt-8 flex gap-1 self-start rounded-full bg-inset p-1 hairline sm:inline-flex">
          {(
            [
              ['everyone', `Everyone’s (${all.filter((f) => isOpen(f.status)).length} open)`],
              ['mine', `Yours (${mine.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={`tap flex-1 rounded-full px-4 py-2 text-label-md transition-colors duration-300 sm:flex-none ${
                view === value ? 'bg-primary font-medium text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <QueryState isLoading={query.isLoading} error={query.error}>
        {isOwner && view === 'everyone' ? (
          <EveryonesFeedback items={all} openedId={openedId} />
        ) : (
          <YourFeedback items={mine} openedId={openedId} />
        )}
      </QueryState>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Composer() {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<FeedbackKind | null>(null)
  const [body, setBody] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chosen = kind ? kindOf(kind) : null

  const send = useMutation({
    mutationFn: () => submitFeedback(kind!, body.trim()),
    onSuccess: () => {
      setError(null)
      setSent(true)
      setBody('')
      setKind(null)
      queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not send your feedback.')),
  })

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (kind && body.trim()) send.mutate()
  }

  return (
    <SectionTile title="Send feedback" hint="Pick what kind it is, then say it in your own words.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Kind of feedback" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FEEDBACK_KINDS.map((k) => {
            const on = kind === k.value
            return (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setSent(false)
                  setKind(k.value)
                }}
                className={`tap flex items-start gap-2.5 rounded-[var(--radius-row)] p-3 text-left transition-[background-color,box-shadow] duration-300 ${
                  on
                    ? 'bg-secondary-container shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_70%,transparent)]'
                    : 'bg-raised hover:bg-raised-strong'
                }`}
              >
                <IconBadge icon={k.icon} tone={k.tone} size="sm" />
                <span className="min-w-0">
                  <span className="block text-body-sm font-medium text-on-surface">{k.label}</span>
                  <span className="block text-label-sm text-on-surface-variant">{k.hint}</span>
                </span>
              </button>
            )
          })}
        </div>

        <label className="flex flex-col gap-2">
          <span className="sr-only">Your feedback</span>
          <textarea
            value={body}
            onChange={(e) => {
              setSent(false)
              setBody(e.target.value.slice(0, MAX_BODY))
            }}
            rows={4}
            aria-label="Your feedback"
            placeholder={chosen?.prompt ?? 'Choose a kind above, then tell us about it.'}
            className={inputClasses}
          />
          <span className="self-end font-mono text-label-sm text-on-surface-faint">
            {body.length}/{MAX_BODY}
          </span>
        </label>

        {error && (
          <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <ActionButton type="submit" disabled={!kind || !body.trim() || send.isPending}>
            {send.isPending ? 'Sending…' : 'Send feedback'}
          </ActionButton>
          {!kind && body.trim() && (
            <span className="text-body-sm text-accent-orange-soft">Pick what kind it is first.</span>
          )}
          {sent && (
            <span role="status" className="text-body-sm text-accent-green">
              Thank you — it’s with the Owner. You’ll hear back here.
            </span>
          )}
        </div>
      </form>
    </SectionTile>
  )
}

/* ------------------------------------------------------------------ */

function YourFeedback({ items, openedId }: { items: Feedback[]; openedId: string | null }) {
  return (
    <section aria-labelledby="your-feedback" className="mt-8">
      <h2 id="your-feedback" className="text-headline-md text-on-surface">
        Your feedback
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-body-sm text-on-surface-variant">
          Nothing sent yet. Whatever you send shows here, with where it stands and any reply.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((f) => (
            <li key={f.id}>
              <FeedbackCard item={f} highlighted={f.id === openedId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const FILTERS = [
  { value: 'open', label: 'Open', test: (f: Feedback) => isOpen(f.status) },
  { value: 'settled', label: 'Done & won’t do', test: (f: Feedback) => !isOpen(f.status) },
  { value: 'all', label: 'All', test: () => true },
] as const

function EveryonesFeedback({ items, openedId }: { items: Feedback[]; openedId: string | null }) {
  // A link to one that is already settled opens on All, so it is there.
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>(() => {
    const opened = items.find((f) => f.id === openedId)
    return opened && !isOpen(opened.status) ? 'all' : 'open'
  })
  const test = FILTERS.find((f) => f.value === filter)!.test
  const groups = groupByKind(items.filter(test))

  return (
    <section aria-label="Everyone’s feedback" className="mt-5">
      <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`tap rounded-full px-4 py-2 text-label-md transition-colors duration-300 ${
              filter === f.value
                ? 'bg-on-surface text-background'
                : 'bg-raised text-on-surface-variant hairline hover:text-on-surface'
            }`}
          >
            {f.label} <span className="font-mono tabular opacity-70">{items.filter(f.test).length}</span>
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="mt-5 text-body-sm text-on-surface-variant">
          {filter === 'open' ? 'Nothing waiting — every piece of feedback has been answered.' : 'No feedback yet.'}
        </p>
      ) : (
        <div className="mt-5 flex flex-col gap-8">
          {groups.map(({ kind, items: inKind }) => (
            <section key={kind.value} aria-labelledby={`feedback-kind-${kind.value}`}>
              <h2 id={`feedback-kind-${kind.value}`} className="flex items-center gap-3">
                <IconBadge icon={kind.icon} tone={kind.tone} />
                <span className="text-headline-md text-on-surface">{kind.label}</span>
                <span className="font-mono text-label-sm text-on-surface-faint">{inKind.length}</span>
              </h2>
              <ul className="mt-3 flex flex-col gap-3">
                {inKind.map((f) => (
                  <li key={f.id}>
                    <FeedbackCard item={f} answerable highlighted={f.id === openedId} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */

function FeedbackCard({
  item,
  answerable = false,
  highlighted = false,
}: {
  item: Feedback
  answerable?: boolean
  highlighted?: boolean
}) {
  const { session } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const { ask, dialog } = useConfirmAction()
  const [answering, setAnswering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const kind = kindOf(item.kind)
  const status = statusOf(item.status)
  // Done and Won't do are cleared on the church's clock (0124, 0128).
  const keepDays = useAppSettings().feedback_retention_days
  const now = useNow(60_000)
  const goneAt = isOpen(item.status) ? null : feedbackGoneAt(item.status_changed_at ?? item.created_at, keepDays)
  const mine = item.created_by === session?.user.id
  const name = item.sender ? `${item.sender.first_name} ${item.sender.last_name}`.trim() : 'Somebody'

  const remove = useMutation({
    mutationFn: () => deleteFeedback(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY }),
    onError: (err: unknown) => setError(errorText(err, 'Could not take that back.')),
  })

  return (
    <Tile
      as="article"
      padded={false}
      className={`p-5 ${highlighted ? 'shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]' : ''}`}
    >
      <div id={`feedback-${item.id}`} className="scroll-mt-28">
        <div className="flex flex-wrap items-center gap-2">
          {!answerable && <IconBadge icon={kind.icon} tone={kind.tone} size="sm" />}
          {!answerable && <span className="text-body-sm font-medium text-on-surface">{kind.label}</span>}
          {answerable && <span className="text-body-sm font-medium text-on-surface">{mine ? 'You' : name}</span>}
          <Pill tone={status.tone}>{status.label}</Pill>
          {goneAt && (
            <span className="font-mono text-label-sm text-on-surface-faint" title={goneAt.toLocaleString()}>
              Cleared {untilText(goneAt, now)}
            </span>
          )}
          <span className="ml-auto font-mono text-label-sm text-on-surface-faint">
            {formatRelativeTime(item.created_at)}
          </span>
        </div>

        <p className="mt-3 whitespace-pre-wrap break-words text-body-md text-on-surface">{item.body}</p>

        {item.reply && (
          <div className="mt-4 rounded-[var(--radius-row)] bg-raised px-4 py-3">
            <p className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
              Reply{item.replier ? ` from ${item.replier.first_name}` : ''}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-body-sm text-on-surface">{item.reply}</p>
          </div>
        )}

        {error && <p className="mt-3 text-body-sm text-error">{error}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {answerable && !answering && (
            <ActionButton size="sm" tone="quiet" onClick={() => setAnswering(true)}>
              {item.reply || item.status !== 'new' ? 'Change answer' : 'Answer'}
            </ActionButton>
          )}
          {mine && item.status === 'new' && !answering && (
            <ActionButton
              size="sm"
              tone="ghost"
              onClick={() =>
                ask({
                  title: 'Take this feedback back?',
                  body: 'Nobody has picked it up yet, so it simply goes.',
                  confirmLabel: 'Take back',
                  onConfirm: () => remove.mutate(),
                })
              }
            >
              Take back
            </ActionButton>
          )}
        </div>

        {answering && <AnswerForm item={item} onDone={() => setAnswering(false)} />}
      </div>
      {dialog}
    </Tile>
  )
}

/** The Owner's answer: where it stands, and a line back to the sender. */
function AnswerForm({ item, onDone }: { item: Feedback; onDone: () => void }) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<FeedbackStatus>(item.status === 'new' ? 'looking' : item.status)
  const [reply, setReply] = useState(item.reply ?? '')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => markFeedback(item.id, status, reply),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FEEDBACK_KEY })
      onDone()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save that answer.')),
  })
  const unchanged = status === item.status && reply.trim() === (item.reply ?? '')

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-[var(--radius-row)] bg-raised p-4">
      <div role="radiogroup" aria-label="Where it stands" className="flex flex-wrap gap-1 rounded-[var(--radius-chip)] bg-inset p-1 hairline">
        {FEEDBACK_STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={status === s.value}
            onClick={() => setStatus(s.value)}
            className={`tap flex-1 rounded-full px-3 py-1.5 text-label-md transition-colors duration-300 ${
              status === s.value ? 'bg-primary font-medium text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value.slice(0, MAX_REPLY))}
        rows={3}
        aria-label="Reply to the sender"
        placeholder="A line back — what you found, or what happens next. Optional."
        className={inputClasses}
      />
      {error && <p className="text-body-sm text-error">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton size="sm" onClick={() => save.mutate()} disabled={unchanged || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save and tell them'}
        </ActionButton>
        <ActionButton size="sm" tone="ghost" onClick={onDone}>
          Cancel
        </ActionButton>
      </div>
    </div>
  )
}
