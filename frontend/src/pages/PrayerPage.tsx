import { useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ActionButton, Overlay, PageHeader, Pill, SectionTile, SegmentedControl, inputClasses } from '../components/Surface'
import { QueryState } from '../components/QueryState'
import { Switch } from '../components/SettingRows'
import { useConfirmAction } from '../components/ConfirmAction'
import { useErrorText } from '../lib/useErrorText'
import { useAuth } from '../auth/AuthContext'
import { formatRelativeTime } from '../lib/relativeTime'
import { fetchDepartments } from '../lib/queries'
import { AudienceEditor } from '../components/AudienceEditor'
import { Select } from '../components/Select'
import {
  PRAYER_KEY,
  RESPONSES,
  RESPONSE_WORDS,
  addPrayerUpdate,
  addToPrayerList,
  askForPrayer,
  assignPrayer,
  deletePrayerList,
  removeFromPrayerList,
  savePrayerList,
  unassignPrayer,
  closePrayer,
  countsLine,
  editPrayer,
  fetchPrayerBoard,
  markPrayerAnswered,
  prayerSections,
  previewedBoard,
  removePrayer,
  removePrayerUpdate,
  reopenPrayer,
  respondToPrayer,
  whoAsked,
  type PrayerBoard,
  type PrayerList,
  type PrayerRequest,
} from '../lib/prayer'

type Tab = 'requests' | 'mine' | 'testimonies' | 'assigned' | 'lists' | 'inbox'

/**
 * Prayer Requests (0197).
 *
 * Ask the pastors privately, or the whole church — with or without your
 * name. Pray for each other with one response each. Mark your own answered,
 * and it becomes a testimony of what God has done; or close it when it is
 * no longer needed. The pastors read the private requests in their inbox.
 */
export function PrayerPage() {
  const { viewAs } = useAuth()
  const query = useQuery({ queryKey: PRAYER_KEY, queryFn: fetchPrayerBoard, refetchInterval: 60_000 })
  const [params, setParams] = useSearchParams()
  // Previewing a role: only what that role would be shown (lib/prayer).
  const board = query.data ? previewedBoard(query.data, viewAs) : undefined
  const sections = board ? prayerSections(board) : null
  const lists = board?.lists ?? []
  const showAssigned = (sections?.assigned.length ?? 0) > 0
  const showLists = lists.length > 0 || !!board?.may_run_lists
  const wanted = (params.get('tab') as Tab | null) ?? 'requests'
  const tab: Tab =
    (wanted === 'inbox' && !board?.pastoral) || (wanted === 'lists' && !showLists) || (wanted === 'assigned' && !showAssigned)
      ? 'requests'
      : wanted

  const tabs: { value: Tab; label: string }[] = [
    { value: 'requests', label: `Requests${sections ? ` · ${sections.requests.length}` : ''}` },
    { value: 'mine', label: `Mine${sections ? ` · ${sections.mine.length}` : ''}` },
    { value: 'testimonies', label: `Testimonies${sections ? ` · ${sections.testimonies.length}` : ''}` },
    ...(showAssigned ? [{ value: 'assigned' as Tab, label: `Asked of me · ${sections!.assigned.length}` }] : []),
    ...(showLists ? [{ value: 'lists' as Tab, label: `Lists · ${lists.length}` }] : []),
    ...(board?.pastoral
      ? [{ value: 'inbox' as Tab, label: `Pastors${sections ? ` · ${sections.inbox.filter((r) => r.status === 'open').length}` : ''}` }]
      : []),
  ]
  const shown = sections && tab !== 'lists' ? sections[tab] : []

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <PageHeader
        eyebrow="Pray for one another"
        title="Prayer Requests"
        description="Ask the pastors privately, or ask the whole church. Pray for each other, and see what God has done."
      />
      <div className="flex flex-col gap-5">
        <AskCard />
        <QueryState isLoading={query.isLoading} error={query.error}>
          {board && sections && (
            <>
              {/* Up to six tabs: each as wide as its label, the row sliding
                  sideways on a phone rather than cutting the labels short. */}
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <SegmentedControl
                  label="Which requests"
                  kind="tab"
                  value={tab}
                  onChange={(next) => setParams(next === 'requests' ? {} : { tab: next }, { replace: true })}
                  options={tabs}
                  className="w-max min-w-full auto-cols-max!"
                />
              </div>
              {tab === 'lists' ? (
                <ListsView board={board} />
              ) : shown.length === 0 ? (
                <p className="rounded-[var(--radius-row)] bg-surface-lowest px-4 py-6 text-center text-body-sm text-on-surface-variant hairline">
                  {EMPTY[tab]}
                </p>
              ) : (
                <ul aria-label={tabs.find((t) => t.value === tab)?.label} className="flex flex-col gap-3">
                  {shown.map((r) => (
                    <li key={r.id}>
                      {tab === 'testimonies' ? (
                        <TestimonyCard request={r} board={board} />
                      ) : (
                        <RequestCard request={r} board={board} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </QueryState>
      </div>
    </div>
  )
}

const EMPTY: Record<Tab, string> = {
  requests: 'No requests at the moment. Be the first to ask.',
  mine: 'You have not asked for prayer yet.',
  testimonies: 'No testimonies yet. When a prayer is answered, it is shared here.',
  assigned: 'Nobody has asked you to pray for anything just now.',
  lists: '',
  inbox: 'No private requests.',
}

function usePrayerMutation<T>(run: (arg: T) => Promise<unknown>, onDone?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PRAYER_KEY })
      onDone?.()
    },
  })
}

function AskCard() {
  const errorText = useErrorText()
  const [kind, setKind] = useState<'general' | 'private'>('general')
  const [body, setBody] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const ask = usePrayerMutation(
    () => askForPrayer(kind, body, kind === 'general' && anonymous),
    () => {
      setSent(kind === 'private' ? 'Sent to the pastors. Only they and the Owner can read it.' : 'Shared with the church.')
      setBody('')
      setAnonymous(false)
    },
  )

  return (
    <SectionTile title="Ask for prayer" hint="Everybody here can pray with you — or only the pastors, if you prefer.">
      <form
        aria-label="Ask for prayer"
        className="flex flex-col gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (body.trim()) ask.mutate(undefined)
        }}
      >
        <SegmentedControl
          label="Who it is for"
          value={kind}
          onChange={(next) => {
            setKind(next)
            setSent(null)
          }}
          options={[
            { value: 'general', label: 'The church' },
            { value: 'private', label: 'Only the pastors' },
          ]}
        />
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value.slice(0, 2000))
            setSent(null)
          }}
          rows={3}
          aria-label="What to pray for"
          placeholder={kind === 'private' ? 'What would you like the pastors to pray about?' : 'What can the church pray for?'}
          className={inputClasses}
        />
        {kind === 'general' ? (
          <label className="flex items-center justify-between gap-3 text-body-sm text-on-surface">
            <span>
              Post anonymously
              <span className="block text-label-sm text-on-surface-variant">
                Your name is hidden from everyone except the Owner and the pastors.
              </span>
            </span>
            <Switch label="Post anonymously" checked={anonymous} onChange={setAnonymous} />
          </label>
        ) : (
          <p className="text-label-sm text-on-surface-variant">Only the pastors and the Owner can read it.</p>
        )}
        {ask.error && (
          <p role="alert" className="text-body-sm text-accent-red-soft">
            {errorText(ask.error, 'Could not send it.')}
          </p>
        )}
        {sent && (
          <p role="status" className="text-body-sm text-accent-green-soft">
            {sent}
          </p>
        )}
        <div>
          <ActionButton type="submit" disabled={ask.isPending || !body.trim()}>
            {ask.isPending ? 'Sending…' : kind === 'private' ? 'Send to the pastors' : 'Ask the church'}
          </ActionButton>
        </div>
      </form>
    </SectionTile>
  )
}

function Meta({ request: r }: { request: PrayerRequest }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label-md text-on-surface-variant">
      <span className="font-medium text-on-surface">{whoAsked(r)}</span>
      <span aria-hidden="true">·</span>
      <span>{formatRelativeTime(r.created_at)}</span>
      {r.kind === 'private' && <Pill tone="indigo">Private</Pill>}
      {r.status === 'answered' && <Pill tone="green">Answered</Pill>}
      {r.status === 'closed' && <Pill>Closed</Pill>}
    </p>
  )
}

function RequestCard({
  request: r,
  board,
  onList,
}: {
  request: PrayerRequest
  board: PrayerBoard
  /** Shown on a prayer list: its runners can take it off. */
  onList?: PrayerList
}) {
  const errorText = useErrorText()
  const confirm = useConfirmAction()
  const [assigning, setAssigning] = useState(false)
  const [listing, setListing] = useState(false)
  const unassign = usePrayerMutation((person: string) => unassignPrayer(r.id, person))
  const unlist = usePrayerMutation(() => removeFromPrayerList(onList!.id, r.id))
  const [editing, setEditing] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [text, setText] = useState('')
  const respond = usePrayerMutation((next: PrayerRequest['my_response']) => respondToPrayer(r.id, next))
  const update = usePrayerMutation(() => addPrayerUpdate(r.id, text), () => {
    setText('')
    setUpdating(false)
  })
  const close = usePrayerMutation(() => closePrayer(r.id))
  const reopen = usePrayerMutation(() => reopenPrayer(r.id))
  const remove = usePrayerMutation(() => removePrayer(r.id))
  const removeUpdate = usePrayerMutation((id: string) => removePrayerUpdate(id))
  const error =
    respond.error ?? update.error ?? close.error ?? reopen.error ?? remove.error ?? removeUpdate.error ?? unassign.error ?? unlist.error
  const counts = countsLine(r.counts)
  const open = r.status === 'open'
  const mayRemove = r.mine || board.pastoral || (board.moderator && r.kind === 'general')

  return (
    <article className="rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline sm:p-5">
      {r.assigned_to_me && (
        <p className="mb-2 rounded-[var(--radius-row)] bg-[color-mix(in_oklab,var(--color-accent-indigo)_12%,transparent)] px-3 py-2 text-label-md text-on-surface">
          {r.assigned_to_me.by ? `${r.assigned_to_me.by.first_name} ${r.assigned_to_me.by.last_name}` : 'A pastor'} asked you to
          pray for this{r.assigned_to_me.note ? `: “${r.assigned_to_me.note}”` : '.'}
        </p>
      )}
      <Meta request={r} />
      {editing ? (
        <EditForm request={r} onDone={() => setEditing(false)} />
      ) : (
        <p className="mt-2 whitespace-pre-line break-words text-body-md text-on-surface">{r.body}</p>
      )}

      {r.status === 'answered' && r.testimony && (
        <blockquote className="mt-3 border-l-2 border-accent-green pl-3 text-body-sm text-on-surface">“{r.testimony}”</blockquote>
      )}

      {r.updates.length > 0 && (
        <ul aria-label="Updates" className="mt-3 flex flex-col gap-2">
          {r.updates.map((u) => (
            <li key={u.id} className="rounded-[var(--radius-row)] bg-raised px-3 py-2 text-body-sm text-on-surface">
              <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                Update · {formatRelativeTime(u.created_at)}
              </span>
              <span className="block whitespace-pre-line break-words">{u.body}</span>
              {r.mine && (
                <button
                  type="button"
                  onClick={() => removeUpdate.mutate(u.id)}
                  className="tap mt-1 text-label-sm text-on-surface-faint hover:text-accent-red-soft"
                >
                  Remove update
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {counts && <p className="mt-3 text-label-md text-on-surface-variant">{counts}</p>}

      {open && !r.mine && (
        <div className="mt-3">
          <SegmentedControl
            label="Your response"
            kind="pressed"
            value={r.my_response}
            onChange={(next) => respond.mutate(next === r.my_response ? null : next)}
            options={RESPONSES.map((k) => ({ value: k, label: RESPONSE_WORDS[k].button }))}
          />
        </div>
      )}

      {r.responders && r.responders.length > 0 && (
        <details className="mt-3 text-label-md text-on-surface-variant">
          <summary className="tap cursor-pointer">Who is praying</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {r.responders.map((p, i) => (
              <li key={i}>
                {p.first_name} {p.last_name} — {RESPONSE_WORDS[p.kind].counted}
              </li>
            ))}
          </ul>
        </details>
      )}

      {r.assignees && r.assignees.length > 0 && (
        <div className="mt-3 text-label-md text-on-surface-variant">
          <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">Asked to pray</span>
          <ul aria-label="Asked to pray" className="mt-1 flex flex-wrap gap-1.5">
            {r.assignees.map((p) => (
              <li key={p.id} className="flex items-center gap-1 rounded-full bg-raised px-3 py-1">
                <span className="text-on-surface">
                  {p.first_name} {p.last_name}
                </span>
                <span>· {p.response ? RESPONSE_WORDS[p.response].counted : 'not yet'}</span>
                {board.may_assign && (
                  <button
                    type="button"
                    onClick={() => unassign.mutate(p.id)}
                    aria-label={`No longer ask ${p.first_name} ${p.last_name}`}
                    className="tap -mr-1 rounded-full px-1.5 text-on-surface-faint hover:text-accent-red-soft"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {updating && (
        <form
          aria-label="Add an update"
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) update.mutate(undefined)
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            rows={2}
            aria-label="The update"
            placeholder="How are things now?"
            className={inputClasses}
          />
          <div className="flex gap-2">
            <ActionButton type="submit" size="sm" disabled={update.isPending || !text.trim()}>
              Post update
            </ActionButton>
            <ActionButton tone="quiet" size="sm" onClick={() => setUpdating(false)}>
              Cancel
            </ActionButton>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 text-body-sm text-accent-red-soft">
          {errorText(error, 'Could not do that.')}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {r.mine && open && !editing && !updating && (
          <>
            <ActionButton size="sm" tone="success" onClick={() => setAnswering(true)}>
              Mark answered
            </ActionButton>
            <ActionButton size="sm" tone="quiet" onClick={() => setUpdating(true)}>
              Add an update
            </ActionButton>
            <ActionButton size="sm" tone="ghost" onClick={() => setEditing(true)}>
              Edit
            </ActionButton>
            <ActionButton
              size="sm"
              tone="ghost"
              onClick={() =>
                confirm.ask({
                  title: 'Close this request?',
                  body: 'For when it is no longer needed. It leaves the list, and is deleted after the days set in Data & Retention. You can reopen it until then.',
                  confirmLabel: 'Close it',
                  onConfirm: () => close.mutate(undefined),
                })
              }
            >
              Close
            </ActionButton>
          </>
        )}
        {r.mine && r.status === 'answered' && (
          <ActionButton size="sm" tone="quiet" onClick={() => setAnswering(true)}>
            Change testimony
          </ActionButton>
        )}
        {r.mine && !open && (
          <ActionButton size="sm" tone="ghost" onClick={() => reopen.mutate(undefined)} disabled={reopen.isPending}>
            Reopen
          </ActionButton>
        )}
        {open && board.may_assign && !r.mine && (
          <ActionButton size="sm" tone="quiet" onClick={() => setAssigning(true)}>
            Ask someone to pray
          </ActionButton>
        )}
        {open && board.may_run_lists && board.lists.length > 0 && !onList && (
          <ActionButton size="sm" tone="quiet" onClick={() => setListing(true)}>
            Add to a list
          </ActionButton>
        )}
        {onList && board.may_run_lists && (
          <ActionButton size="sm" tone="ghost" onClick={() => unlist.mutate(undefined)} disabled={unlist.isPending}>
            Take off this list
          </ActionButton>
        )}
        {mayRemove && !onList && (
          <ActionButton
            size="sm"
            tone="ghost"
            onClick={() =>
              confirm.ask({
                title: r.mine ? 'Delete your request?' : 'Take this request down?',
                body: r.mine
                  ? 'It is gone for everybody, with its updates and who prayed.'
                  : 'It is deleted for everybody, with its updates and who prayed. The person who asked is not told.',
                confirmLabel: r.mine ? 'Delete' : 'Take it down',
                onConfirm: () => remove.mutate(undefined),
              })
            }
          >
            {r.mine ? 'Delete' : 'Take down'}
          </ActionButton>
        )}
      </div>
      {answering && <AnswerDialog request={r} onClose={() => setAnswering(false)} />}
      {assigning && <AssignDialog request={r} onClose={() => setAssigning(false)} />}
      {listing && <AddToListDialog request={r} lists={board.lists} onClose={() => setListing(false)} />}
      {confirm.dialog}
    </article>
  )
}

function EditForm({ request: r, onDone }: { request: PrayerRequest; onDone: () => void }) {
  const errorText = useErrorText()
  const [body, setBody] = useState(r.body)
  const [anonymous, setAnonymous] = useState(r.anonymous)
  const save = usePrayerMutation(() => editPrayer(r.id, body, anonymous), onDone)
  return (
    <form
      aria-label="Edit your request"
      className="mt-2 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (body.trim()) save.mutate(undefined)
      }}
    >
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, 2000))}
        rows={3}
        aria-label="What to pray for"
        className={inputClasses}
      />
      {r.kind === 'general' && (
        <label className="flex items-center justify-between gap-3 text-body-sm text-on-surface">
          Post anonymously
          <Switch label="Post anonymously" checked={anonymous} onChange={setAnonymous} />
        </label>
      )}
      {save.error && (
        <p role="alert" className="text-body-sm text-accent-red-soft">
          {errorText(save.error, 'Could not save it.')}
        </p>
      )}
      <div className="flex gap-2">
        <ActionButton type="submit" size="sm" disabled={save.isPending || !body.trim()}>
          Save
        </ActionButton>
        <ActionButton tone="quiet" size="sm" onClick={onDone}>
          Cancel
        </ActionButton>
      </div>
    </form>
  )
}

/**
 * Marking it answered: in their own words if they like; their name only
 * if they tick it; a private request shared with everybody only if they
 * say so.
 */
function AnswerDialog({ request: r, onClose }: { request: PrayerRequest; onClose: () => void }) {
  const errorText = useErrorText()
  const [words, setWords] = useState(r.testimony ?? '')
  const [named, setNamed] = useState(r.testimony_named)
  const [share, setShare] = useState(r.shared)
  const answer = usePrayerMutation(() => markPrayerAnswered(r.id, words, named, share), onClose)
  const goesPublic = r.kind === 'general' || share

  return (
    <Overlay label="Mark answered" align="sheet" onDismiss={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          answer.mutate(undefined)
        }}
        className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-6 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]"
      >
        <h2 className="text-headline-md">Praise God — answered</h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          {r.kind === 'general'
            ? 'It moves to Testimonies, for everybody to see what God has done.'
            : 'It stays with the pastors, unless you share it as a testimony.'}
        </p>
        <textarea
          value={words}
          onChange={(e) => setWords(e.target.value.slice(0, 2000))}
          rows={3}
          aria-label="What happened"
          placeholder="What happened? (optional)"
          className={`${inputClasses} mt-4`}
        />
        {r.kind === 'private' && (
          <label className="mt-4 flex items-center justify-between gap-3 text-body-sm text-on-surface">
            <span>
              Share as a testimony
              <span className="block text-label-sm text-on-surface-variant">Everybody sees what you wrote and the request.</span>
            </span>
            <Switch label="Share as a testimony" checked={share} onChange={setShare} />
          </label>
        )}
        {goesPublic && (
          <label className="mt-4 flex items-center justify-between gap-3 text-body-sm text-on-surface">
            <span>
              Show my name
              <span className="block text-label-sm text-on-surface-variant">Off: it is shared anonymously.</span>
            </span>
            <Switch label="Show my name" checked={named} onChange={setNamed} />
          </label>
        )}
        {answer.error && (
          <p role="alert" className="mt-3 text-body-sm text-accent-red-soft">
            {errorText(answer.error, 'Could not mark it answered.')}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <ActionButton tone="quiet" onClick={onClose} disabled={answer.isPending}>
            Cancel
          </ActionButton>
          <ActionButton type="submit" tone="success" disabled={answer.isPending}>
            {answer.isPending ? 'Saving…' : 'Mark answered'}
          </ActionButton>
        </div>
      </form>
    </Overlay>
  )
}

function TestimonyCard({ request: r, board }: { request: PrayerRequest; board: PrayerBoard }) {
  const confirm = useConfirmAction()
  const errorText = useErrorText()
  const remove = usePrayerMutation(() => removePrayer(r.id))
  const counts = countsLine(r.counts)
  const mayRemove = r.mine || board.moderator
  return (
    <article className="rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline sm:p-5">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label-md text-on-surface-variant">
        <Pill tone="green">Answered</Pill>
        <span className="font-medium text-on-surface">{whoAsked(r)}</span>
        {r.answered_at && (
          <>
            <span aria-hidden="true">·</span>
            <span>{formatRelativeTime(r.answered_at)}</span>
          </>
        )}
      </p>
      {r.testimony && <p className="mt-2 whitespace-pre-line break-words text-body-lg text-on-surface">“{r.testimony}”</p>}
      <p className="mt-2 whitespace-pre-line break-words text-body-sm text-on-surface-variant">
        <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">Asked · </span>
        {r.body}
      </p>
      {counts && <p className="mt-2 text-label-md text-on-surface-variant">Prayed for: {counts}</p>}
      {remove.error && (
        <p role="alert" className="mt-2 text-body-sm text-accent-red-soft">
          {errorText(remove.error, 'Could not do that.')}
        </p>
      )}
      {mayRemove && (
        <div className="mt-3">
          <ActionButton
            size="sm"
            tone="ghost"
            onClick={() =>
              confirm.ask({
                title: r.mine ? 'Delete your testimony?' : 'Take this testimony down?',
                body: 'It is deleted for everybody.',
                confirmLabel: r.mine ? 'Delete' : 'Take it down',
                onConfirm: () => remove.mutate(undefined),
              })
            }
          >
            {r.mine ? 'Delete' : 'Take down'}
          </ActionButton>
        </div>
      )}
      {confirm.dialog}
    </article>
  )
}

function Sheet({ label, children, onClose, onSubmit }: { label: string; children: ReactNode; onClose: () => void; onSubmit: () => void }) {
  return (
    <Overlay label={label} align="sheet" onDismiss={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
        className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-6 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]"
      >
        {children}
      </form>
    </Overlay>
  )
}

/** Shown when a private request is passed on: whether the people it goes to learn who asked. */
function ShowNameSwitch({ request: r, on, onChange }: { request: PrayerRequest; on: boolean; onChange: (on: boolean) => void }) {
  if (r.kind !== 'private') {
    return r.anonymous ? (
      <p className="mt-4 text-label-md text-on-surface-variant">It was asked anonymously, so they will not see who asked.</p>
    ) : null
  }
  return (
    <label className="mt-4 flex items-center justify-between gap-3 text-body-sm text-on-surface">
      <span>
        Show who asked
        <span className="block text-label-sm text-on-surface-variant">Only if they are happy to be named. Off: just the request.</span>
      </span>
      <Switch label="Show who asked" checked={on} onChange={onChange} />
    </label>
  )
}

/** Asking members to pray on the pastors' behalf (0198). */
function AssignDialog({ request: r, onClose }: { request: PrayerRequest; onClose: () => void }) {
  const errorText = useErrorText()
  const [people, setPeople] = useState<string[]>([])
  const [showName, setShowName] = useState(false)
  const [note, setNote] = useState('')
  const assign = usePrayerMutation(() => assignPrayer(r.id, people, showName, note), onClose)
  return (
    <Sheet label="Ask someone to pray" onClose={onClose} onSubmit={() => people.length > 0 && assign.mutate(undefined)}>
      <h2 className="text-headline-md">Ask someone to pray</h2>
      <p className="mt-2 line-clamp-3 text-body-sm text-on-surface-variant">“{r.body}”</p>
      <div className="mt-4">
        <AudienceEditor
          label="Who to ask"
          teams={[]}
          people={people}
          allTeams={[]}
          withPeople
          withTeams={false}
          editable
          empty="Nobody chosen yet."
          onChange={(next) => setPeople(next.people)}
        />
      </div>
      <ShowNameSwitch request={r} on={showName} onChange={setShowName} />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        placeholder="A word for them (optional)"
        aria-label="A word for them"
        className={`${inputClasses} mt-4`}
      />
      {assign.error && (
        <p role="alert" className="mt-3 text-body-sm text-accent-red-soft">
          {errorText(assign.error, 'Could not ask them.')}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <ActionButton tone="quiet" onClick={onClose} disabled={assign.isPending}>
          Cancel
        </ActionButton>
        <ActionButton type="submit" disabled={assign.isPending || people.length === 0}>
          {assign.isPending ? 'Asking…' : people.length > 1 ? `Ask ${people.length} people` : 'Ask them'}
        </ActionButton>
      </div>
    </Sheet>
  )
}

function AddToListDialog({ request: r, lists, onClose }: { request: PrayerRequest; lists: PrayerList[]; onClose: () => void }) {
  const errorText = useErrorText()
  const free = lists.filter((l) => !l.items.some((i) => i.request_id === r.id))
  const [listId, setListId] = useState(free[0]?.id ?? '')
  const [showName, setShowName] = useState(false)
  const add = usePrayerMutation(() => addToPrayerList(listId, r.id, showName), onClose)
  return (
    <Sheet label="Add to a prayer list" onClose={onClose} onSubmit={() => listId && add.mutate(undefined)}>
      <h2 className="text-headline-md">Add to a prayer list</h2>
      <p className="mt-2 line-clamp-3 text-body-sm text-on-surface-variant">“{r.body}”</p>
      {free.length === 0 ? (
        <p className="mt-4 text-body-sm text-on-surface-variant">It is on every list already.</p>
      ) : (
        <div className="mt-4">
          <Select value={listId} onChange={setListId} options={free.map((l) => ({ value: l.id, label: l.name }))} aria-label="Which list" />
        </div>
      )}
      <ShowNameSwitch request={r} on={showName} onChange={setShowName} />
      <p className="mt-3 text-label-sm text-on-surface-faint">Everybody on the list is told.</p>
      {add.error && (
        <p role="alert" className="mt-3 text-body-sm text-accent-red-soft">
          {errorText(add.error, 'Could not add it.')}
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <ActionButton tone="quiet" onClick={onClose} disabled={add.isPending}>
          Cancel
        </ActionButton>
        <ActionButton type="submit" disabled={add.isPending || !listId}>
          {add.isPending ? 'Adding…' : 'Add'}
        </ActionButton>
      </div>
    </Sheet>
  )
}

/**
 * Prayer lists (0198): a name, the people and teams on it, and the
 * requests on it, for praying through together. Runners make and fill
 * them; everybody on one sees it here.
 */
function ListsView({ board }: { board: PrayerBoard }) {
  const [making, setMaking] = useState(false)
  const byId = new Map(board.requests.map((r) => [r.id, r]))
  return (
    <div className="flex flex-col gap-4">
      {board.may_run_lists &&
        (making ? (
          <ListForm onDone={() => setMaking(false)} />
        ) : (
          <div>
            <ActionButton tone="quiet" glyph="+" onClick={() => setMaking(true)}>
              New prayer list
            </ActionButton>
          </div>
        ))}
      {board.lists.length === 0 && (
        <p className="rounded-[var(--radius-row)] bg-surface-lowest px-4 py-6 text-center text-body-sm text-on-surface-variant hairline">
          No prayer lists yet. Make one for a chain prayer, then add requests to it from Requests or the Pastors tab.
        </p>
      )}
      {board.lists.map((l) => (
        <ListSection key={l.id} list={l} board={board} requests={l.items.flatMap((i) => byId.get(i.request_id) ?? [])} />
      ))}
    </div>
  )
}

function ListSection({ list: l, board, requests }: { list: PrayerList; board: PrayerBoard; requests: PrayerRequest[] }) {
  const confirm = useConfirmAction()
  const [editing, setEditing] = useState(false)
  const remove = usePrayerMutation(() => deletePrayerList(l.id))
  const count = (l.members?.teams.length ?? 0) + (l.members?.people.length ?? 0)
  return (
    <SectionTile
      title={l.name}
      hint={`${requests.length === 1 ? '1 request' : `${requests.length} requests`}${
        l.members ? ` · ${count === 0 ? 'nobody on it yet' : count === 1 ? '1 team or person on it' : `${count} teams and people on it`}` : ''
      }`}
      collapsible
      defaultOpen={false}
    >
      {editing && <ListForm list={l} onDone={() => setEditing(false)} />}
      {board.may_run_lists && !editing && (
        <div className="mb-3 flex flex-wrap gap-2">
          <ActionButton size="sm" tone="quiet" onClick={() => setEditing(true)}>
            Edit list
          </ActionButton>
          <ActionButton
            size="sm"
            tone="ghost"
            onClick={() =>
              confirm.ask({
                title: `Delete ${l.name}?`,
                body: 'The list goes. The requests on it stay where they are.',
                confirmLabel: 'Delete list',
                onConfirm: () => remove.mutate(undefined),
              })
            }
          >
            Delete list
          </ActionButton>
        </div>
      )}
      {requests.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">Nothing on this list yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((r) => (
            <li key={r.id}>
              <RequestCard request={r} board={board} onList={l} />
            </li>
          ))}
        </ul>
      )}
      {confirm.dialog}
    </SectionTile>
  )
}

function ListForm({ list, onDone }: { list?: PrayerList; onDone: () => void }) {
  const errorText = useErrorText()
  const teamsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const [name, setName] = useState(list?.name ?? '')
  const [members, setMembers] = useState(list?.members ?? { teams: [], people: [] })
  const save = usePrayerMutation(() => savePrayerList(list?.id ?? null, name, members), onDone)
  return (
    <form
      aria-label={list ? `Edit ${list.name}` : 'New prayer list'}
      className="mb-3 flex flex-col gap-3 rounded-[var(--radius-row)] bg-raised p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) save.mutate(undefined)
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 80))}
        placeholder="Name, e.g. Friday chain prayer"
        aria-label="List name"
        className={inputClasses}
      />
      <AudienceEditor
        label="Who is on it"
        teams={members.teams}
        people={members.people}
        allTeams={(teamsQuery.data ?? []).map((d) => ({ id: d.id, name: d.name }))}
        withPeople
        editable
        empty="Nobody yet — add teams or people."
        onChange={setMembers}
      />
      {save.error && (
        <p role="alert" className="text-body-sm text-accent-red-soft">
          {errorText(save.error, 'Could not save the list.')}
        </p>
      )}
      <div className="flex gap-2">
        <ActionButton type="submit" size="sm" disabled={save.isPending || !name.trim()}>
          {save.isPending ? 'Saving…' : list ? 'Save list' : 'Make list'}
        </ActionButton>
        <ActionButton tone="quiet" size="sm" onClick={onDone}>
          Cancel
        </ActionButton>
      </div>
    </form>
  )
}
