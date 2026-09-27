import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Lifespan } from '../components/Lifespan'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { fetchDepartments } from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { formatServiceDay } from '../lib/sunday'
import { POLLS_KEY, POLL_AUDIENCES, audienceLabel, type PollAudience } from '../lib/pollAudience'
import { QueryState } from '../components/QueryState'
import { Eyebrow, Field, PageHeader, Pill, Tile, inputClasses, type PillTone } from '../components/Surface'
import { Select } from '../components/Select'
import { useConfirmAction } from '../components/ConfirmAction'
import { optionShare, pollIsOpen, tallyVotes, timeLeft, type ChoiceMode } from '../lib/polls'

const pollSchema = z.object({
  id: z.string(),
  audience: z.enum(POLL_AUDIENCES).default('team'),
  department_id: z.string().nullable(),
  service_id: z.string().nullable().default(null),
  recipient_ids: z.array(z.string()).default([]),
  created_by: z.string(),
  question: z.string(),
  choice_mode: z.enum(['single', 'multiple']),
  closes_at: z.string().nullable(),
  created_at: z.string(),
  department: z.object({ name: z.string() }).nullable().default(null),
  service: z.object({ date: z.string(), service_type: z.string() }).nullable().default(null),
  options: z.array(z.object({ id: z.string(), label: z.string(), sort_order: z.number() })),
  votes: z.array(z.object({ option_id: z.string(), user_id: z.string() })),
})
type Poll = z.infer<typeof pollSchema>

// The database decides which of these come back: a poll is visible to
// exactly the people it was addressed to (0114), so this asks for all of
// them and gets only the caller's own.
async function fetchPolls(): Promise<Poll[]> {
  const { data, error } = await supabase
    .from('team_polls')
    .select(
      'id, audience, department_id, service_id, recipient_ids, created_by, question, choice_mode, closes_at, created_at, department:departments(name), service:services(date, service_type), options:team_poll_options(id, label, sort_order), votes:team_poll_votes(option_id, user_id)',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return z.array(pollSchema).parse(data)
}

const personSchema = z.object({ id: z.string(), first_name: z.string(), last_name: z.string() })
type Person = z.infer<typeof personSchema>

async function fetchPeople(): Promise<Person[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .order('first_name')
  if (error) throw error
  return z.array(personSchema).parse(data)
}

const upcomingSchema = z.object({ id: z.string(), date: z.string(), service_type: z.string() })

async function fetchUpcomingServices(from: string) {
  const { data, error } = await supabase
    .from('services')
    .select('id, date, service_type')
    .gte('date', from)
    .order('date')
    .limit(20)
  if (error) throw error
  return z.array(upcomingSchema).parse(data)
}

const AUDIENCE_TONE: Record<PollAudience, PillTone> = {
  everyone: 'blue',
  team: 'indigo',
  people: 'orange',
  service: 'green',
}

/** A ticking clock, so a deadline visibly runs down rather than just being a date. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

/**
 * Polls.
 *
 * They lived inside a team's chat, which meant the church could only ever
 * ask one team at a time. A poll now says who it is for — everyone, one
 * team, the people named, or whoever is serving at a service — and this
 * page shows each person the ones addressed to them. That is the
 * database's rule, not this page's: a poll somebody was not asked never
 * reaches their browser.
 *
 * Asking is a leadership act: an Admin may ask anybody, a Head their own
 * team, whole or at a service. Answering belongs to everyone asked. A
 * deadline stops the buttons here and the writes in the database, which
 * are two different promises and both are needed.
 */
export function PollsPage() {
  const { session, isAdmin, ledDepartmentIds } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const myId = session?.user.id ?? null
  const canAsk = isAdmin || ledDepartmentIds.length > 0
  const [params] = useSearchParams()
  const openedId = params.get('poll')

  const [composing, setComposing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pollsQuery = useQuery({ queryKey: POLLS_KEY, queryFn: fetchPolls, enabled: !!myId })
  const polls = useMemo(() => pollsQuery.data ?? [], [pollsQuery.data])

  // Only tick while something is actually counting down.
  const anyDeadline = polls.some((p) => p.closes_at)
  const now = useNow(anyDeadline)

  // A tap on the notification lands on the poll it was about.
  useEffect(() => {
    if (!openedId || !pollsQuery.data) return
    document.getElementById(`poll-${openedId}`)?.scrollIntoView?.({ block: 'center' })
  }, [openedId, pollsQuery.data])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: POLLS_KEY })

  const mayManage = (poll: Poll) =>
    isAdmin ||
    poll.created_by === myId ||
    (!!poll.department_id && ledDepartmentIds.includes(poll.department_id))

  const vote = useMutation({
    mutationFn: async ({ poll, optionId, on }: { poll: Poll; optionId: string; on: boolean }) => {
      if (on) {
        // The single-choice rule lives in a database trigger, so picking a
        // different option here is one insert, not a delete and an insert
        // that could fail between the two.
        const { error: e } = await supabase
          .from('team_poll_votes')
          .insert({ poll_id: poll.id, option_id: optionId, user_id: myId! })
        if (e) throw e
      } else {
        const { error: e } = await supabase
          .from('team_poll_votes')
          .delete()
          .eq('option_id', optionId)
          .eq('user_id', myId!)
        if (e) throw e
      }
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not record that answer.')),
  })

  const removePoll = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await supabase.from('team_polls').delete().eq('id', id)
      if (e) throw e
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that poll.')),
  })

  const { ask, dialog } = useConfirmAction()

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        eyebrow="Ask and answer"
        title="Polls"
        description="The questions put to you — by the church, your team, or for a service you are on."
        action={
          canAsk &&
          !composing && (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="tap rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90"
            >
              New poll
            </button>
          )
        }
      />
      <Lifespan page="polls" className="mb-4" />

      {error && (
        <p className="mb-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      {composing && canAsk && (
        <PollComposer
          onDone={() => {
            setComposing(false)
            invalidate()
          }}
          onCancel={() => setComposing(false)}
          onError={setError}
        />
      )}

      <QueryState
        isLoading={pollsQuery.isLoading}
        error={pollsQuery.error}
        isEmpty={polls.length === 0}
        emptyMessage={canAsk ? 'No polls yet — ask something.' : 'Nobody has asked you anything yet.'}
      >
        <ul className="mt-4 flex flex-col gap-4">
          {polls.map((poll) => {
            const open = pollIsOpen(poll.closes_at, now)
            const options = [...poll.options].sort((a, b) => a.sort_order - b.sort_order)
            const { counts, mine, voters } = tallyVotes(
              options.map((o) => o.id),
              poll.votes,
              myId,
            )

            return (
              <li key={poll.id} id={`poll-${poll.id}`}>
                <Tile className={openedId === poll.id ? 'ring-2 ring-primary/50' : ''}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Pill tone={AUDIENCE_TONE[poll.audience]} className="max-w-full">
                        <span className="truncate">{audienceLabel(poll)}</span>
                      </Pill>
                      <h2 className="mt-2 break-words text-body-lg font-medium text-on-surface">
                        {poll.question}
                      </h2>
                    </div>
                    {mayManage(poll) && (
                      <button
                        type="button"
                        onClick={() =>
                          ask({
                            title: 'Delete this poll?',
                            body: (
                              <>
                                <strong>{poll.question}</strong> and every answer given to it go
                                for good.
                              </>
                            ),
                            onConfirm: () => removePoll.mutate(poll.id),
                          })
                        }
                        aria-label={`Delete poll: ${poll.question}`}
                        className="tap shrink-0 text-label-sm text-on-surface-faint hover:text-error"
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-label-sm text-on-surface-faint">
                    <span>{poll.choice_mode === 'single' ? 'Pick one' : 'Pick any'}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {voters} {voters === 1 ? 'answer' : 'answers'}
                    </span>
                    {poll.closes_at && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className={open ? 'text-accent-orange' : 'text-on-surface-faint'}>
                          {open ? timeLeft(poll.closes_at, now) : 'Closed'}
                        </span>
                      </>
                    )}
                  </div>

                  <ul className="mt-3 flex flex-col gap-2">
                    {options.map((option) => {
                      const picked = mine.has(option.id)
                      const count = counts[option.id] ?? 0
                      return (
                        <li key={option.id}>
                          <button
                            type="button"
                            disabled={!open || vote.isPending}
                            aria-pressed={picked}
                            onClick={() => vote.mutate({ poll, optionId: option.id, on: !picked })}
                            className={`tap relative flex w-full items-center gap-3 overflow-hidden rounded-[var(--radius-chip)] px-3 py-2 text-left transition-colors duration-300 ${
                              picked ? 'hairline-strong' : 'hairline'
                            } ${open ? 'hover:bg-raised' : 'cursor-default opacity-90'}`}
                          >
                            {/* The bar is behind the label rather than beside
                                it, so a long option keeps the whole width. */}
                            <span
                              aria-hidden="true"
                              className={`absolute inset-y-0 left-0 transition-[width] duration-500 ease-[var(--ease-glide)] ${
                                picked ? 'bg-primary/25' : 'bg-raised-strong/60'
                              }`}
                              style={{ width: `${optionShare(count, counts)}%` }}
                            />
                            <span className="relative min-w-0 flex-1 text-body-sm text-on-surface">
                              {option.label}
                            </span>
                            <span className="relative shrink-0 font-mono text-label-sm tabular text-on-surface-variant">
                              {count}
                            </span>
                            {picked && (
                              <span className="relative shrink-0 font-mono text-label-sm text-primary">
                                ✓
                              </span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>

                  {!open && (
                    <p className="mt-2 text-label-sm text-on-surface-faint">
                      The deadline has passed — answers are final.
                    </p>
                  )}
                </Tile>
              </li>
            )
          })}
        </ul>
      </QueryState>

      {dialog}
    </div>
  )
}

const AUDIENCE_CHOICES: { value: PollAudience; label: string; blurb: string; adminOnly?: boolean }[] = [
  { value: 'everyone', label: 'Everyone', blurb: 'Everybody signed in, Church Members too.', adminOnly: true },
  { value: 'team', label: 'A team', blurb: 'Everyone on the team, and whoever leads it.' },
  { value: 'people', label: 'People', blurb: 'Only the names you pick.', adminOnly: true },
  { value: 'service', label: 'A service', blurb: 'Whoever the rota puts on that service.' },
]

/** Asking: who it is for, a question, two or more options, and a deadline. */
function PollComposer({
  onDone,
  onCancel,
  onError,
}: {
  onDone: () => void
  onCancel: () => void
  onError: (message: string | null) => void
}) {
  const { session, isAdmin, ledDepartmentIds } = useAuth()
  const errorText = useErrorText()
  const choices = AUDIENCE_CHOICES.filter((c) => isAdmin || !c.adminOnly)

  const [audience, setAudience] = useState<PollAudience>(isAdmin ? 'everyone' : 'team')
  const [teamId, setTeamId] = useState(isAdmin ? '' : (ledDepartmentIds[0] ?? ''))
  const [serviceId, setServiceId] = useState('')
  const [personIds, setPersonIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [question, setQuestion] = useState('')
  const [labels, setLabels] = useState<string[]>(['', ''])
  const [mode, setMode] = useState<ChoiceMode>('single')
  const [closesAt, setClosesAt] = useState('')

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const today = todayIso()
  const servicesQuery = useQuery({
    queryKey: ['poll-services', today],
    queryFn: () => fetchUpcomingServices(today),
    enabled: audience === 'service',
  })
  const peopleQuery = useQuery({
    queryKey: ['poll-people'],
    queryFn: fetchPeople,
    enabled: isAdmin && audience === 'people',
  })

  // A Head asks only their own teams; an Admin any.
  const teams = (departmentsQuery.data ?? []).filter(
    (d) => isAdmin || ledDepartmentIds.includes(d.id),
  )
  const people = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data])
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
  }, [people, search])
  const chosenPeople = people.filter((p) => personIds.includes(p.id))

  const create = useMutation({
    mutationFn: async () => {
      const kept = labels.map((l) => l.trim()).filter(Boolean)
      const { data, error } = await supabase
        .from('team_polls')
        .insert({
          audience,
          department_id:
            audience === 'team' || audience === 'service' ? teamId || null : null,
          service_id: audience === 'service' ? serviceId : null,
          recipient_ids: audience === 'people' ? personIds : [],
          created_by: session!.user.id,
          question: question.trim(),
          choice_mode: mode,
          // A local datetime-local value carries no zone; treating it as
          // local time is what the person typing it meant.
          closes_at: closesAt ? new Date(closesAt).toISOString() : null,
        })
        .select('id')
        .single()
      if (error) throw error

      const { error: optionError } = await supabase.from('team_poll_options').insert(
        kept.map((label, i) => ({ poll_id: (data as { id: string }).id, label, sort_order: i })),
      )
      if (optionError) throw optionError
    },
    onSuccess: () => {
      onError(null)
      onDone()
    },
    onError: (err: unknown) => onError(errorText(err, 'Could not create that poll.')),
  })

  const kept = labels.map((l) => l.trim()).filter(Boolean)
  const audienceReady =
    audience === 'everyone' ||
    (audience === 'team' && !!teamId) ||
    (audience === 'people' && personIds.length > 0) ||
    // A Head's service poll is for their own team's people on it.
    (audience === 'service' && !!serviceId && (isAdmin || !!teamId))
  const ready = audienceReady && question.trim().length > 0 && kept.length >= 2

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (ready) create.mutate()
  }

  const teamOptions = teams.map((d) => ({ value: d.id, label: d.name }))

  return (
    <Tile as="section" className="mb-4">
      <form onSubmit={handleSubmit} aria-label="New poll">
        <Eyebrow>Who it is for</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-1 rounded-[var(--radius-chip)] bg-inset p-1 hairline sm:rounded-full">
          {choices.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setAudience(c.value)}
              aria-pressed={audience === c.value}
              className={`tap flex-1 rounded-full px-3 py-2 text-label-md transition-colors duration-300 ${
                audience === c.value
                  ? 'bg-primary font-medium text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-label-sm text-on-surface-faint">
          {choices.find((c) => c.value === audience)?.blurb}
        </p>

        {audience === 'team' && (
          <div className="mt-3">
            <Field label="Team">
              <Select
                aria-label="Team"
                value={teamId}
                onChange={setTeamId}
                options={teamOptions}
                placeholder="Choose a team…"
              />
            </Field>
          </div>
        )}

        {audience === 'service' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Service">
              <Select
                aria-label="Service"
                value={serviceId}
                onChange={setServiceId}
                options={(servicesQuery.data ?? []).map((s) => ({
                  value: s.id,
                  label: `${s.service_type} · ${formatServiceDay(s.date)}`,
                }))}
                placeholder={servicesQuery.isLoading ? 'Loading…' : 'Choose a service…'}
              />
            </Field>
            <Field label="Who on it">
              <Select
                aria-label="Who on it"
                value={teamId}
                onChange={setTeamId}
                options={
                  isAdmin
                    ? [{ value: '', label: 'Everybody serving' }, ...teamOptions]
                    : teamOptions
                }
                placeholder="Choose a team…"
              />
            </Field>
          </div>
        )}

        {audience === 'people' && (
          <div className="mt-3">
            <Field label="Find somebody">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Start typing a name…"
                className={inputClasses}
              />
            </Field>
            {chosenPeople.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {chosenPeople.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPersonIds((ids) => ids.filter((x) => x !== p.id))}
                    aria-label={`Take ${p.first_name} ${p.last_name} off the list`}
                    className="tap rounded-full bg-secondary-container px-3 py-1 text-label-md text-on-surface"
                  >
                    {p.first_name} {p.last_name} ✕
                  </button>
                ))}
              </div>
            )}
            <QueryState isLoading={peopleQuery.isLoading} error={peopleQuery.error}>
              <ul className="mt-3 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                {matches.map((person) => (
                  <li key={person.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-row)] bg-raised px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={personIds.includes(person.id)}
                        onChange={() =>
                          setPersonIds((ids) =>
                            ids.includes(person.id)
                              ? ids.filter((x) => x !== person.id)
                              : [...ids, person.id],
                          )
                        }
                        className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-body-sm text-on-surface">
                        {person.first_name} {person.last_name}
                      </span>
                    </label>
                  </li>
                ))}
                {matches.length === 0 && (
                  <li className="text-label-sm text-on-surface-faint">Nobody by that name.</li>
                )}
              </ul>
            </QueryState>
          </div>
        )}

        <div className="mt-4">
          <Field label="Question">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              placeholder="Which Sunday suits the picnic?"
              className={inputClasses}
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <Eyebrow>Options</Eyebrow>
          {labels.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={label}
                onChange={(e) =>
                  setLabels((prev) => prev.map((l, j) => (j === i ? e.target.value : l)))
                }
                maxLength={120}
                placeholder={`Option ${i + 1}`}
                aria-label={`Option ${i + 1}`}
                className="min-w-0 flex-1 rounded-full hairline bg-transparent px-3 py-2 text-body-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              {labels.length > 2 && (
                <button
                  type="button"
                  onClick={() => setLabels((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove option ${i + 1}`}
                  className="tap-square shrink-0 rounded-full px-2 text-label-sm text-on-surface-faint hover:text-error"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLabels((prev) => [...prev, ''])}
            className="tap self-start text-label-md text-secondary hover:underline"
          >
            + Add option
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <Eyebrow>Answers</Eyebrow>
            <div className="flex gap-1 rounded-full bg-inset p-1 hairline">
              {(['single', 'multiple'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`tap rounded-full px-3 py-1.5 text-body-sm font-medium transition-colors ${
                    mode === m ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
                  }`}
                >
                  {m === 'single' ? 'Pick one' : 'Pick any'}
                </button>
              ))}
            </div>
          </div>

          <label className="flex min-w-0 flex-col gap-1 text-body-sm text-on-surface-variant">
            Deadline (optional)
            <input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="min-w-0 rounded-full hairline bg-transparent px-3 py-2 font-mono text-label-md text-on-surface [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </label>
        </div>

        <p className="mt-2 text-label-sm text-on-surface-faint">
          Everyone it is for is told — their bell and their phone. After the deadline nobody can
          add, change or withdraw an answer.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="tap rounded-full hairline px-4 py-2 text-body-sm font-medium text-on-surface"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready || create.isPending}
            className="tap rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {create.isPending ? 'Posting…' : 'Post poll'}
          </button>
        </div>
      </form>
    </Tile>
  )
}
