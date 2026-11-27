import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { useAppSettings } from '../lib/appSettings'
import { churchClock } from '../lib/clockIn'
import {
  TEAM_ARRIVALS_KEY,
  arrivalWords,
  cardShows,
  choicesWith,
  fetchTeamArrivals,
  orderPeople,
  sayOnMyWay,
  teamsFor,
  type ArrivalTeam,
  type Say,
} from '../lib/onMyWay'
import { estimateFromHere, estimateWords, type Estimate } from '../lib/onMyWayEstimate'
import { useErrorText } from '../lib/useErrorText'
import { useMyTeams } from '../lib/useMyTeams'
import { useNow } from '../lib/useNow'
import { usePageAccess } from '../lib/usePageAccess'
import { useConfirmAction } from './ConfirmAction'
import { ActionButton, IconBadge, Pill, Tile } from './Surface'
import { TeamMark } from './TeamMark'
import { MapPinIcon, UsersIcon } from './icons'

/**
 * Who is here, and who is on the way (0337, lib/onMyWay).
 *
 * On a service day, from a couple of hours before a team is called: that
 * team, name by name, as here, about when, can't make it, or no word. And
 * for somebody due in who has not clocked in, the way to say which they
 * are — a number of minutes, worked out from where their phone is if they
 * ask for that, or chosen. The number is what is sent; where they are is
 * not.
 *
 * It sits under the Clock in button, which is the other answer to the
 * same question.
 */
export function OnMyWayCard({ className = '' }: { className?: string }) {
  const { session, viewAs } = useAuth()
  const myId = session?.user.id
  const settings = useAppSettings()
  const { teamIds } = useMyTeams()
  const { canOpen } = usePageAccess()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const now = useNow(15_000)
  const { ask, dialog } = useConfirmAction()

  const query = useQuery({
    queryKey: [...TEAM_ARRIVALS_KEY, myId],
    queryFn: fetchTeamArrivals,
    enabled: !!myId && settings.clock_in_on_my_way,
    // Somebody arriving, or saying they are late, is news within the half-minute.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  const data = query.data
  // Every team is for whoever sees the Clock In page; a preview is narrowed to what its standing would be given.
  const teams = teamsFor(data, { seesAll: !!data?.sees_all && canOpen('/clock-in'), teamIds, previewing: !!viewAs })

  const [choosing, setChoosing] = useState(false)
  const [minutes, setMinutes] = useState<number | null>(null)
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [finding, setFinding] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const say = useMutation({
    mutationFn: (what: Say) => sayOnMyWay(what),
    onSuccess: async () => {
      setError(null)
      setChoosing(false)
      setEstimate(null)
      setMinutes(null)
      await queryClient.invalidateQueries({ queryKey: TEAM_ARRIVALS_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not tell your team. Try again.')),
  })

  if (!data || !cardShows(data, teams, now)) return null

  const clock = (iso: string) => churchClock(iso, settings.timezone)
  // Theirs to say: due in today, and not in yet.
  const mayPressOnMyWay = data.due && !data.clocked
  const estimated = estimate?.at === 'away' ? estimate.minutes : null

  async function workItOut() {
    setFinding(true)
    const found = await estimateFromHere()
    setFinding(false)
    setEstimate(found)
    if (found.at === 'away') setMinutes(found.minutes)
  }

  function cantMakeIt() {
    ask({
      title: 'Tell your team you can’t make it?',
      body: 'Your team sees it beside your name, and its Head is told straight away. You can change it if you can come after all.',
      confirmLabel: 'Tell them',
      cancelLabel: 'Not now',
      onConfirm: () => say.mutate({ word: 'not_coming' }),
    })
  }

  const here = teams.reduce((n, t) => n + t.people.filter((p) => p.state === 'here').length, 0)
  const expected = teams.reduce((n, t) => n + t.people.length, 0)

  return (
    <section aria-label="Who is here" data-tour="on-my-way" className={className}>
      <Tile padded={false} className="overflow-hidden px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex items-start gap-3">
          <IconBadge icon={UsersIcon} tone="blue" />
          <div className="min-w-0 flex-1">
            <h2 className="text-headline-sm text-on-surface">Who is here</h2>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">
              {here} of {expected} in so far
            </p>
          </div>
        </div>

        {mayPressOnMyWay && (
          <div className="mt-4 rounded-[var(--radius-row)] bg-surface-container px-4 py-3">
            {!choosing ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p role="status" className="min-w-0 text-body-sm text-on-surface">
                  {data.word === 'coming' && data.eta_at ? (
                    <>
                      You told your team: about <span className="font-mono tabular-nums">{clock(data.eta_at)}</span>.
                    </>
                  ) : data.word === 'not_coming' ? (
                    'You told your team you can’t make it.'
                  ) : (
                    'Not there yet? Tell your team when you will be.'
                  )}
                </p>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {data.word ? (
                    <ActionButton size="sm" tone="quiet" onClick={() => setChoosing(true)}>
                      Change
                    </ActionButton>
                  ) : (
                    <>
                      <ActionButton size="sm" tone="accent-quiet" onClick={() => setChoosing(true)}>
                        On my way
                      </ActionButton>
                      <ActionButton size="sm" tone="quiet" onClick={() => cantMakeIt()}>
                        Can’t make it
                      </ActionButton>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <p id="on-my-way-how-long" className="text-body-sm font-medium text-on-surface">
                  How long will you be?
                </p>
                <div role="radiogroup" aria-labelledby="on-my-way-how-long" className="mt-2 flex flex-wrap gap-2">
                  {choicesWith(estimated).map((choice) => {
                    const on = minutes === choice
                    return (
                      <button
                        key={choice}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setMinutes(choice)}
                        className={`tap rounded-full px-3.5 py-1.5 font-mono text-label-md tabular-nums transition-colors ${
                          on ? 'bg-primary text-on-primary' : 'bg-raised-strong text-on-surface hairline-strong'
                        }`}
                      >
                        {choice} min
                      </button>
                    )
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <ActionButton size="sm" tone="quiet" onClick={() => void workItOut()} disabled={finding}>
                    <MapPinIcon className="size-4" />
                    {finding ? 'Finding you…' : 'Work it out from where I am'}
                  </ActionButton>
                  <p className="min-w-0 text-label-md text-on-surface-variant" role="status">
                    {estimate ? estimateWords(estimate) : 'Your phone is read once. Only the time is sent, never where you are.'}
                  </p>
                </div>
                {minutes !== null && (
                  <p className="mt-3 text-body-sm text-on-surface">
                    Your team will see: about{' '}
                    <span className="font-mono tabular-nums">{clock(new Date(now + minutes * 60_000).toISOString())}</span>.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton
                    size="sm"
                    tone="primary"
                    disabled={minutes === null || say.isPending}
                    onClick={() => minutes !== null && say.mutate({ word: 'coming', minutes, how: minutes === estimated ? 'estimate' : 'chosen' })}
                  >
                    Tell my team
                  </ActionButton>
                  {data.word !== 'not_coming' && (
                    <ActionButton size="sm" tone="quiet" disabled={say.isPending} onClick={() => cantMakeIt()}>
                      Can’t make it
                    </ActionButton>
                  )}
                  <ActionButton
                    size="sm"
                    tone="ghost"
                    onClick={() => {
                      setChoosing(false)
                      setEstimate(null)
                      setMinutes(null)
                      setError(null)
                    }}
                  >
                    Cancel
                  </ActionButton>
                </div>
              </div>
            )}
            {error && (
              <p role="alert" className="mt-2 text-label-md text-error">
                {error}
              </p>
            )}
          </div>
        )}

        <ul className="mt-3 divide-y divide-border-subtle">
          {teams.map((team) => (
            <TeamRows
              key={team.id}
              team={team}
              myId={myId}
              now={now}
              clock={clock}
              // A team of their own is open; the rest, for whoever sees every team, open on a tap.
              shut={!team.mine && teams.length > 1 && !open.has(team.id)}
              onToggle={
                !team.mine && teams.length > 1
                  ? () =>
                      setOpen((was) => {
                        const next = new Set(was)
                        if (next.has(team.id)) next.delete(team.id)
                        else next.add(team.id)
                        return next
                      })
                  : undefined
              }
            />
          ))}
        </ul>
      </Tile>
      {dialog}
    </section>
  )
}

function TeamRows({
  team,
  myId,
  now,
  clock,
  shut,
  onToggle,
}: {
  team: ArrivalTeam
  myId: string | undefined
  now: number
  clock: (iso: string) => string
  shut: boolean
  onToggle?: () => void
}) {
  const here = team.people.filter((p) => p.state === 'here').length
  const coming = team.people.filter((p) => p.state === 'coming').length
  const listId = `arrivals-${team.id}`
  return (
    <li className="min-w-0 py-3">
      {/* The name on a line of its own: beside the counts, on a phone, it was left a column one letter wide. */}
      <div className="flex items-start gap-2.5">
        <TeamMark color={team.color} className="mt-1" />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-body-md font-medium text-on-surface">{team.name}</h3>
          <p className="font-mono text-label-md tabular-nums text-on-surface-variant">
            called {clock(team.call_at)} · {here} of {team.people.length} here{coming > 0 ? ` · ${coming} on the way` : ''}
          </p>
        </div>
        {onToggle && (
          <ActionButton size="sm" tone="ghost" onClick={onToggle} aria-expanded={!shut} aria-controls={listId} aria-label={`${shut ? 'Show' : 'Hide'} ${team.name}`}>
            {shut ? 'Show' : 'Hide'}
          </ActionButton>
        )}
      </div>
      {!shut && (
        <ul id={listId} aria-label={`${team.name}: who is here`} className="mt-1.5 pl-[1.375rem]">
          {orderPeople(team.people).map((person) => {
            const words = arrivalWords(person, now, team.call_at, clock)
            const name = `${person.first_name} ${person.last_name}`.trim() || 'Somebody'
            return (
              <li key={person.id} className={`flex min-w-0 items-center gap-2.5 py-1.5 ${person.state === 'here' ? 'text-on-surface-variant' : 'text-on-surface'}`}>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-body-sm">
                    {name}
                    {person.id === myId && <span className="text-on-surface-faint"> (you)</span>}
                  </span>
                  {/* Under the name, not beside the tag: three things on one line left a name two words tall on a phone. */}
                  {words.detail && <span className="block text-label-md text-on-surface-faint">{words.detail}</span>}
                </span>
                <Pill tone={words.tone}>{words.label}</Pill>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}
