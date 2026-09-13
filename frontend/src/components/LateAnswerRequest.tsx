import { useState } from 'react'
import type { AvailabilityRequest } from '../lib/availabilityRequests'
import type { AvailabilityStatus } from '../lib/types'

/**
 * The door with a bell on it.
 *
 * Answers close the night before, and that deadline is real — the database
 * refuses a late one, so no button here could sneak past it. What used to
 * be on the other side of it was a sentence: "Ask your team head or an
 * Admin if this needs putting right", which is an app telling somebody to
 * go and find a person.
 *
 * Now they ask here. A head or assisting head answers, and only their yes
 * changes the answer — so the rota a head built the night before cannot
 * move underneath them without their say-so, which is the reason the
 * deadline exists in the first place.
 */

const ASK_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'available', label: 'Yes, I can serve' },
  { value: 'tentative', label: 'Maybe' },
  { value: 'unavailable', label: "No, I can't make it" },
]

const STATUS_WORD: Record<AvailabilityStatus, string> = {
  available: 'available',
  tentative: 'tentative',
  unavailable: 'unavailable',
}

/** What a member sees once the window has shut. */
export function AskToChangeAnswer({
  answered,
  pending,
  settled,
  onAsk,
  onWithdraw,
  busy,
}: {
  /** Their current answer, if they gave one before the deadline. */
  answered: AvailabilityStatus | null
  pending: AvailabilityRequest | null
  settled: AvailabilityRequest | null
  onAsk: (status: AvailabilityStatus, reason: string) => void
  onWithdraw: (id: string) => void
  busy?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<AvailabilityStatus>(answered === 'available' ? 'unavailable' : 'available')
  const [reason, setReason] = useState('')

  if (pending) {
    return (
      <div className="mt-3 rounded-[var(--radius-card)] bg-[color-mix(in_oklab,var(--color-accent-orange)_10%,transparent)] px-3.5 py-3">
        <p className="text-label-md text-accent-orange-soft">
          Waiting on your team head — you asked to be marked{' '}
          <strong className="font-semibold">{STATUS_WORD[pending.requested_status]}</strong>.
        </p>
        {pending.reason && (
          <p className="mt-1 text-label-sm text-on-surface-faint">“{pending.reason}”</p>
        )}
        <p className="mt-1 text-label-sm text-on-surface-faint">
          Your answer stays as it is until they approve it.
        </p>
        <button
          type="button"
          onClick={() => onWithdraw(pending.id)}
          disabled={busy}
          className="tap mt-2 rounded-full px-3 py-1.5 text-label-md text-on-surface hairline hover:border-secondary disabled:opacity-60"
        >
          Take it back
        </button>
      </div>
    )
  }

  return (
    <div className="mt-3">
      {settled && (
        <p
          className={`mb-2 text-label-sm ${
            settled.status === 'approved' ? 'text-accent-green' : 'text-on-surface-faint'
          }`}
        >
          {settled.status === 'approved'
            ? `Your late change to ${STATUS_WORD[settled.requested_status]} was approved.`
            : `Your last request was not approved${
                settled.decision_note ? ` — “${settled.decision_note}”` : ''
              }.`}
        </p>
      )}

      {!open ? (
        <>
          <p className="text-label-sm text-on-surface-faint">
            {answered
              ? `Answers have closed — you said ${STATUS_WORD[answered]}.`
              : 'Answers have closed and you did not answer.'}
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="tap mt-2 rounded-full bg-raised-strong px-3.5 py-2 text-label-md text-on-surface hairline hover:border-secondary"
          >
            Ask to change it
          </button>
        </>
      ) : (
        <div className="rounded-[var(--radius-card)] bg-inset p-3.5">
          <p className="text-label-md text-on-surface">
            Ask your team head to change your answer
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {ASK_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2.5 text-body-sm text-on-surface"
              >
                <input
                  type="radio"
                  name="late-answer"
                  checked={status === opt.value}
                  onChange={() => setStatus(opt.value)}
                  className="h-4 w-4 accent-[var(--color-secondary)]"
                />
                {opt.label}
              </label>
            ))}
          </div>
          <label className="mt-3 block">
            <span className="text-label-sm text-on-surface-faint">
              Why — this is what they are deciding on
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="My daughter is ill this morning"
              aria-label="Why you need to change your answer"
              className="mt-1 w-full rounded-[var(--radius-chip)] bg-raised px-3 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onAsk(status, reason)
                setOpen(false)
                setReason('')
              }}
              disabled={busy}
              className="rounded-full bg-primary px-4 py-2 text-label-md font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
            >
              Send the request
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-4 py-2 text-label-md text-on-surface hairline hover:border-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * What a head sees: the asks waiting on them.
 *
 * Approving is the thing that writes the answer, so this is not a
 * formality — it is the head deciding whether their own rota changes.
 */
export function LateAnswerQueue({
  requests,
  onDecide,
  busy,
}: {
  requests: AvailabilityRequest[]
  onDecide: (id: string, approve: boolean, note: string) => void
  busy?: boolean
}) {
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState('')

  if (requests.length === 0) return null

  return (
    <div className="mt-3 rounded-[var(--radius-card)] bg-[color-mix(in_oklab,var(--color-accent-orange)_10%,transparent)] p-3.5">
      <p className="font-mono text-label-sm uppercase tracking-wide text-accent-orange-soft">
        {requests.length} late {requests.length === 1 ? 'change' : 'changes'} to approve
      </p>
      <ul className="mt-2 flex flex-col gap-3">
        {requests.map((request) => (
          <li key={request.id}>
            <p className="text-body-sm text-on-surface">
              <strong className="font-semibold">
                {request.asker ? `${request.asker.first_name} ${request.asker.last_name}` : 'Somebody'}
              </strong>{' '}
              asks to be marked {STATUS_WORD[request.requested_status]}.
            </p>
            {request.reason && (
              <p className="mt-0.5 text-label-sm text-on-surface-faint">“{request.reason}”</p>
            )}

            {noteFor === request.id && (
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why not — they will see this"
                aria-label={`Why this is not approved`}
                className="mt-2 w-full rounded-[var(--radius-chip)] bg-raised px-3 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary"
              />
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onDecide(request.id, true, '')}
                disabled={busy}
                className="rounded-full bg-accent-green px-3.5 py-1.5 text-label-md font-medium text-accent-green-ink hover:opacity-90 disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => {
                  if (noteFor !== request.id) {
                    setNoteFor(request.id)
                    setNote('')
                    return
                  }
                  onDecide(request.id, false, note)
                  setNoteFor(null)
                  setNote('')
                }}
                disabled={busy}
                className="rounded-full px-3.5 py-1.5 text-label-md text-on-surface hairline hover:border-secondary disabled:opacity-60"
              >
                {noteFor === request.id ? 'Send the no' : 'Reject'}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-label-sm text-on-surface-faint">
        Approving is what changes their answer — and frees their rota role if they can no longer
        make it.
      </p>
    </div>
  )
}
