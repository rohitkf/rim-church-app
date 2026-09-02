import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { fetchDepartments } from '../lib/queries'
import { formatRelativeTime } from '../lib/relativeTime'
import { ActionButton, Eyebrow, Field, Pill, Row, inputClasses } from './Surface'
import { TeamMark } from './TeamMark'
import { QueryState } from './QueryState'

const MAX = 500

const personSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
})
type Person = z.infer<typeof personSchema>

const sentSchema = z.object({
  id: z.string(),
  body: z.string(),
  audience: z.enum(['everyone', 'teams', 'people']),
  recipient_count: z.number(),
  created_at: z.string(),
})

type Audience = 'everyone' | 'teams' | 'people'

async function fetchPeople(): Promise<Person[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .order('first_name')
  if (error) throw error
  return z.array(personSchema).parse(data)
}

async function fetchSentAnnouncements() {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, body, audience, recipient_count, created_at')
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw error
  return z.array(sentSchema).parse(data)
}

const AUDIENCES: { value: Audience; label: string; blurb: string }[] = [
  { value: 'everyone', label: 'Everybody', blurb: 'Every account in the church.' },
  { value: 'teams', label: 'Teams', blurb: 'Everyone on the teams you pick, and whoever leads them.' },
  { value: 'people', label: 'People', blurb: 'Only the names you pick.' },
]

/**
 * Saying something to the whole church, or to three people in it.
 *
 * The team alert on the Teams page can only speak to a room somebody is
 * standing in. The things an Admin actually needs to say — the building is
 * locked, this Sunday is off, you two please come early — are aimed
 * somewhere else, and until now there was no way to say any of them.
 *
 * This is the same interruption at the other end: their bell, their phone,
 * and the banner nobody scrolls past. So it asks who first and what
 * second, and names the audience in words before the button will do
 * anything — an alert written in the belief it goes to one team and sent
 * to two hundred people is a mistake that cannot be taken back.
 */
export function SendAlertCard() {
  const { isAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  const [audience, setAudience] = useState<Audience>('everyone')
  const [teamIds, setTeamIds] = useState<string[]>([])
  const [personIds, setPersonIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [body, setBody] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const departmentsQuery = useQuery({
    queryKey: ['departments'],
    queryFn: fetchDepartments,
    enabled: isAdmin,
  })
  const peopleQuery = useQuery({
    queryKey: ['announcement-people'],
    queryFn: fetchPeople,
    enabled: isAdmin,
  })
  const sentQuery = useQuery({
    queryKey: ['announcements-sent'],
    queryFn: fetchSentAnnouncements,
    enabled: isAdmin,
  })

  const departments = departmentsQuery.data ?? []
  const people = peopleQuery.data ?? []

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return people
    return people.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
  }, [people, search])

  const send = useMutation({
    mutationFn: async () => {
      const { data, error: rpcError } = await supabase.rpc('send_announcement', {
        message: body.trim(),
        audience,
        dept_ids: audience === 'teams' ? teamIds : [],
        people: audience === 'people' ? personIds : [],
      })
      if (rpcError) throw rpcError
      return typeof data === 'number' ? data : 0
    },
    onSuccess: (count) => {
      setBody('')
      setConfirming(false)
      setError(null)
      setNote(
        // Zero means the audience resolved to nobody but the sender — an
        // empty team, or a list of one name that is your own. It is not a
        // failure and it is not a send, so it says which.
        count === 0
          ? 'Nobody to send that to — the audience came out empty, or you were the only one in it.'
          : `Sent to ${count} ${count === 1 ? 'person' : 'people'}.`,
      )
      queryClient.invalidateQueries({ queryKey: ['announcements-sent'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err: unknown) => {
      setConfirming(false)
      setNote(null)
      setError(errorText(err, "That announcement didn't send."))
    },
  })

  if (!isAdmin) return null

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]

  const chosenTeams = departments.filter((d) => teamIds.includes(d.id))
  const chosenPeople = people.filter((p) => personIds.includes(p.id))
  const audienceChosen =
    audience === 'everyone' ||
    (audience === 'teams' && teamIds.length > 0) ||
    (audience === 'people' && personIds.length > 0)
  const ready = audienceChosen && body.trim().length > 0 && !send.isPending

  /** What the button is about to do, in the words it will do it in. */
  const aimedAt =
    audience === 'everyone'
      ? 'everybody in the church'
      : audience === 'teams'
        ? chosenTeams.map((t) => t.name).join(', ')
        : chosenPeople.map((p) => `${p.first_name} ${p.last_name}`).join(', ')

  return (
    <section className="w-full rounded-[var(--radius-card)] bg-surface-lowest p-6 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_22%,transparent)]">
      <h2 className="text-headline-md">Send an alert</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        Their bell, their phone, and a message they have to dismiss before they can carry on. It is
        the loudest thing this app can do, so it asks who before it asks what.
      </p>

      {/* Who. A segmented control rather than three buttons: one answer is
          chosen at a time, and the object should look like it knows that. */}
      <div className="mt-5">
        <Eyebrow>Who it goes to</Eyebrow>
        <div className="mt-2 flex gap-1 rounded-full bg-inset p-1 hairline">
          {AUDIENCES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setAudience(option.value)}
              aria-pressed={audience === option.value}
              className={`tap flex-1 rounded-full px-3 py-2 text-label-md transition-colors duration-300 ease-[var(--ease-glide)] ${
                audience === option.value
                  ? 'bg-primary font-medium text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-label-sm text-on-surface-faint">
          {AUDIENCES.find((a) => a.value === audience)?.blurb}
        </p>
      </div>

      {audience === 'teams' && (
        <QueryState isLoading={departmentsQuery.isLoading} error={departmentsQuery.error}>
          <ul className="mt-4 flex flex-col gap-2">
            {departments.map((dept) => (
              <li key={dept.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-row)] bg-raised px-4 py-3">
                  <input
                    type="checkbox"
                    checked={teamIds.includes(dept.id)}
                    onChange={() => setTeamIds((ids) => toggle(ids, dept.id))}
                    className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                  />
                  <TeamMark color={dept.color} />
                  <span className="min-w-0 flex-1 truncate text-body-sm text-on-surface">
                    {dept.name}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </QueryState>
      )}

      {audience === 'people' && (
        <div className="mt-4">
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
                  onClick={() => setPersonIds((ids) => toggle(ids, p.id))}
                  aria-label={`Take ${p.first_name} ${p.last_name} off the list`}
                  className="tap rounded-full bg-secondary-container px-3 py-1 text-label-md text-on-surface"
                >
                  {p.first_name} {p.last_name} ✕
                </button>
              ))}
            </div>
          )}
          <QueryState isLoading={peopleQuery.isLoading} error={peopleQuery.error}>
            <ul className="mt-3 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {matches.map((person) => (
                <li key={person.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-row)] bg-raised px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={personIds.includes(person.id)}
                      onChange={() => setPersonIds((ids) => toggle(ids, person.id))}
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

      <div className="mt-5">
        <Field label="What it says">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX))}
            rows={3}
            placeholder="The hall is locked until 9 — come to the side door."
            className={inputClasses}
          />
        </Field>
        <p className="mt-1 text-right font-mono text-label-sm tabular text-on-surface-faint">
          {body.trim().length}/{MAX}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {confirming ? (
          <>
            <ActionButton onClick={() => send.mutate()} disabled={!ready}>
              {send.isPending ? 'Sending…' : 'Yes, send it'}
            </ActionButton>
            <ActionButton tone="ghost" onClick={() => setConfirming(false)}>
              Not yet
            </ActionButton>
          </>
        ) : (
          <ActionButton onClick={() => setConfirming(true)} disabled={!ready}>
            Send this alert
          </ActionButton>
        )}
      </div>

      {/* The last thing before it happens, in words rather than a count.
          "Send to 214 people" is a number somebody skims; the names of the
          teams it is about to interrupt are not. */}
      {confirming && (
        <p className="mt-3 rounded-[var(--radius-chip)] bg-[color-mix(in_oklab,var(--color-accent-orange)_12%,transparent)] px-3.5 py-2.5 text-body-sm text-on-surface">
          This interrupts <span className="font-medium">{aimedAt}</span>
          {audience === 'teams' && ` — and whoever leads ${chosenTeams.length === 1 ? 'it' : 'them'}`}
          . They cannot carry on in the app until they have read it.
        </p>
      )}

      {note && <p className="mt-3 text-body-sm text-accent-green">{note}</p>}
      {error && (
        <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      {/* What has already gone out. An alert cannot be taken back, so the
          only kindness left is showing what was said — which is also how
          somebody notices they are about to send it twice. */}
      {(sentQuery.data?.length ?? 0) > 0 && (
        <div className="mt-6 border-t border-border-subtle pt-5">
          <Eyebrow>Recently sent</Eyebrow>
          <ul className="mt-3 flex flex-col gap-2">
            {sentQuery.data?.map((sent) => (
              <Row key={sent.id} as="li" variant="raised" stack>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="orange">
                    {sent.audience === 'everyone'
                      ? 'Everybody'
                      : sent.audience === 'teams'
                        ? 'Teams'
                        : 'People'}
                  </Pill>
                  <span className="font-mono text-label-sm text-on-surface-faint">
                    {sent.recipient_count} reached · {formatRelativeTime(sent.created_at)}
                  </span>
                </div>
                <p className="text-body-sm text-on-surface">{sent.body}</p>
              </Row>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
