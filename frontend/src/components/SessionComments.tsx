import { useId, useState } from 'react'
import { ActionButton, inputClasses } from './Surface'
import { COMMENT_MAX, commentProblem, writerName, type SessionComment } from '../lib/sessionComments'
import { formatRelativeTime } from '../lib/relativeTime'

/**
 * The comments on one session of the running order (0308), inside its
 * card: what a Pastor said about it, and the place to say something more.
 *
 * It is given only what this viewer may see (lib/sessionComments `seenBy`)
 * and draws nothing at all when there is nothing to read and nothing being
 * written — a session nobody has commented on looks as it always did, to
 * everybody.
 *
 * **It says that it is private every time it is on screen**, because the
 * card it sits in is the one the whole team reads: whoever writes here
 * should never have to wonder who will see it, and whoever reads it should
 * know it is not on the team's sheet.
 *
 * A comment is not edited, only deleted by whoever wrote it, and the page
 * asks before it goes.
 */
export function SessionComments({
  sessionName,
  comments,
  myId,
  mayWrite,
  writing,
  onWriting,
  onAdd,
  onDelete,
  busy = false,
}: {
  sessionName: string
  /** Oldest first, already narrowed to what the viewer may read. */
  comments: SessionComment[]
  myId: string | null
  /** Whether the viewer may add one (`svc.comment`). */
  mayWrite: boolean
  /** Whether the box to write in is open: the session's menu opens it too. */
  writing: boolean
  onWriting: (open: boolean) => void
  /** Resolves once it is saved. A refusal rejects with the words to show, and what was typed stays in the box. */
  onAdd: (body: string) => Promise<unknown>
  onDelete: (comment: SessionComment) => void
  busy?: boolean
}) {
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const boxId = useId()
  const composing = mayWrite && writing
  if (comments.length === 0 && !composing) return null

  const left = COMMENT_MAX - draft.trim().length
  const send = async () => {
    const wrong = commentProblem(draft)
    setProblem(wrong)
    if (wrong) return
    try {
      await onAdd(draft)
      setDraft('')
      onWriting(false)
    } catch (err) {
      // Said here, beside what was typed, which stays to be sent again.
      setProblem(err instanceof Error && err.message ? err.message : 'Could not save the comment.')
    }
  }

  return (
    <div role="group" aria-label={`Comments on ${sessionName}`} className="mt-3 rounded-[var(--radius-chip)] bg-raised px-3 py-2.5 hairline">
      <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
        {comments.length === 1 ? 'Comment' : 'Comments'}
        <span className="font-sans normal-case tracking-normal text-on-surface-faint">Private — not shown to the team</span>
      </p>

      {comments.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2.5">
          {comments.map((comment) => {
            const who = writerName(comment, myId)
            return (
              <li key={comment.id}>
                {/* The words get the whole width: on a phone the card is narrow, and Delete beside them left a column four words wide. */}
                <p className="whitespace-pre-wrap break-words text-body-sm text-on-surface">{comment.body}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1">
                  <p className="text-label-sm text-on-surface-faint">
                    {who} · <time dateTime={comment.created_at}>{formatRelativeTime(comment.created_at)}</time>
                  </p>
                  {comment.author !== null && comment.author === myId && (
                    <ActionButton size="sm" tone="ghost" className="-my-1.5 -ml-2.5" onClick={() => onDelete(comment)} disabled={busy} aria-label={`Delete your comment on ${sessionName}`}>
                      Delete
                    </ActionButton>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {composing ? (
        <div className={comments.length > 0 ? 'mt-3' : 'mt-2'}>
          <label htmlFor={boxId} className="sr-only">{`Comment on ${sessionName}`}</label>
          <textarea
            id={boxId}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              if (problem) setProblem(null)
            }}
            rows={3}
            autoFocus
            placeholder="What you want said about this session"
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? `${boxId}-problem` : undefined}
            className={`${inputClasses} resize-y px-3 py-2 text-body-sm ${problem ? 'field-error' : ''}`}
          />
          {problem && (
            <p id={`${boxId}-problem`} role="alert" className="mt-1 text-label-sm text-error">
              {problem}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ActionButton size="sm" tone="quiet" onClick={() => void send()} disabled={busy}>
              {busy ? 'Saving…' : 'Add comment'}
            </ActionButton>
            <ActionButton
              size="sm"
              tone="ghost"
              onClick={() => {
                setDraft('')
                setProblem(null)
                onWriting(false)
              }}
              disabled={busy}
            >
              Cancel
            </ActionButton>
            {/* Said only when it is close: a counter on every comment is a form, not a note. */}
            {left <= 100 && (
              <span className={`ml-auto font-mono text-label-sm ${left < 0 ? 'text-error' : 'text-on-surface-faint'}`}>
                {left < 0 ? `${-left} too many` : `${left} left`}
              </span>
            )}
          </div>
        </div>
      ) : (
        mayWrite && (
          <ActionButton size="sm" tone="ghost" className="-ml-2 mt-1.5" onClick={() => onWriting(true)}>
            Add a comment
          </ActionButton>
        )
      )}
    </div>
  )
}
