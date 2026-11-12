import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '../lib/usePermissions'
import { useNow } from '../lib/useNow'
import { useErrorText } from '../lib/useErrorText'
import {
  HEALTH_ERRORS_KEY,
  HEALTH_EVENTS_KEY,
  HEALTH_KEPT_DAYS,
  HEALTH_OVERVIEW_KEY,
  agoWords,
  bytesWords,
  clearClientErrors,
  clearHealthEvents,
  deviceWords,
  errorReference,
  eventWords,
  fetchClientErrors,
  fetchHealthEvents,
  fetchHealthOverview,
  groupErrors,
  healthVerdict,
  jobsInOrder,
  reporterName,
  sourceWords,
  timesWords,
  whoWords,
  type ErrorGroup,
  type HealthEvent,
} from '../lib/appHealth'
import { useConfirmAction } from './ConfirmAction'
import { QueryState } from './QueryState'
import { ActionButton, Pill, Row, SectionTile, type PillTone } from './Surface'

/**
 * Settings › App Health: what has gone wrong, in one place (0284).
 *
 * Until this room a page that broke on somebody's phone was known only
 * to that phone, and a timed job that failed was known to nobody. Here is
 * what each device reported, folded so one bug is one thing to look at;
 * what failed in the database's own work; and how it stands this minute.
 *
 * It is a log to read, not a set of switches: the only thing to press is
 * "Put away", for what has been dealt with. Everything in it clears by
 * itself after thirty days.
 */

const EVENT_TONE: Record<HealthEvent['kind'], PillTone> = { job: 'orange', push: 'red', call: 'orange' }

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-row)] bg-raised px-4 py-3">
      <p className="font-mono text-eyebrow uppercase text-on-surface-faint">{label}</p>
      <p className="mt-1 text-headline-sm tabular text-on-surface [overflow-wrap:anywhere]">{value}</p>
      {note && <p className="mt-0.5 text-label-md text-on-surface-faint">{note}</p>}
    </div>
  )
}

export function AppHealthCard() {
  const may = usePermissions().can('settings.health')
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const { ask, dialog } = useConfirmAction()
  const now = useNow()

  const overview = useQuery({ queryKey: HEALTH_OVERVIEW_KEY, queryFn: fetchHealthOverview, enabled: may })
  const errors = useQuery({ queryKey: HEALTH_ERRORS_KEY, queryFn: fetchClientErrors, enabled: may })
  const events = useQuery({ queryKey: HEALTH_EVENTS_KEY, queryFn: fetchHealthEvents, enabled: may })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['app-health'] })
  }
  const putAwayErrors = useMutation({ mutationFn: (ids: string[]) => clearClientErrors(ids), onSuccess: refresh })
  const putAwayEvents = useMutation({ mutationFn: (ids: number[]) => clearHealthEvents(ids), onSuccess: refresh })
  const failed = putAwayErrors.error ?? putAwayEvents.error
  const busy = putAwayErrors.isPending || putAwayEvents.isPending

  if (!may) {
    return (
      <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
        <p className="text-body-sm text-on-surface-variant">
          Seeing what has gone wrong in the app is not open to you. Whoever owns this app can see it, or give you the room
          in Access &amp; Privileges.
        </p>
      </section>
    )
  }

  const groups = groupErrors(errors.data ?? [])
  const failures = events.data ?? []
  const jobs = jobsInOrder(overview.data?.jobs ?? [])
  const jobsFailing = jobs.filter((j) => j.failed > 0).length
  const known = !errors.isLoading && !events.isLoading && !errors.error && !events.error
  const verdict = healthVerdict({ groups: groups.length, events: failures.length, jobsFailing })
  const o = overview.data

  const askPutAway = (group: ErrorGroup) =>
    ask({
      title: 'Put this error away?',
      body: (
        <>
          Its {group.rows.length === 1 ? 'report is' : `${group.rows.length} reports are`} removed from this list. If it happens again
          it comes back, and you are told again.
        </>
      ),
      confirmLabel: 'Put away',
      onConfirm: () => putAwayErrors.mutate(group.rows.map((r) => r.id)),
    })

  return (
    <div className="flex flex-col gap-4">
      {/* The word and the button sit under the sentence, not beside it: beside
          it, on a phone, they left the sentence a column one word wide. */}
      <SectionTile title="How it stands" hint={known ? verdict.words : 'Reading what has been recorded…'}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {known && <Pill tone={verdict.tone}>{verdict.tone === 'green' ? 'All well' : 'Wants a look'}</Pill>}
          <ActionButton size="sm" tone="quiet" onClick={refresh}>
            Read again
          </ActionButton>
        </div>
        <QueryState isLoading={overview.isLoading} error={overview.error}>
          {o && (
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-4">
              <Figure label="Errors today" value={o.errors.day.toLocaleString()} note={`${o.errors.kept.toLocaleString()} kept in all`} />
              <Figure
                label="Notifications to phones"
                value={o.pushes.asked === 0 ? 'None asked for' : `${o.pushes.answered.toLocaleString()} of ${o.pushes.asked.toLocaleString()} sent`}
                note={`In the last ${o.pushes.hours} hours${o.pushes.failed > 0 ? ` · ${o.pushes.failed} failed` : ''}`}
              />
              <Figure label="Database" value={bytesWords(o.database.bytes)} note="The free plan holds 500 MB" />
              <Figure label="Connections" value={`${o.database.connections} of ${o.database.connections_max}`} note="In use this minute" />
            </div>
          )}
        </QueryState>
        <p className="mt-3 text-label-md text-on-surface-faint">
          Whoever can open this room is told once a day, in the bell, when something new has failed — and not otherwise. A check that
          runs outside the app watches whether the site and the database answer at all, and opens an issue on GitHub when either stops.
        </p>
        {failed ? (
          <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {errorText(failed, 'That could not be put away.')}
          </p>
        ) : null}
      </SectionTile>

      <SectionTile
        title="Errors on people’s devices"
        hint={`A page that broke, or the app asking the database for something it has not got. Folded by what was said and which version said it. Kept ${HEALTH_KEPT_DAYS} days.`}
      >
        <QueryState isLoading={errors.isLoading} error={errors.error} isEmpty={groups.length === 0} emptyMessage="No device has reported an error.">
          <ul className="flex flex-col gap-2">
            {groups.map((group) => (
              <Row key={group.key} as="li" stack>
                <p className="font-mono text-body-sm text-on-surface [overflow-wrap:anywhere]">{group.message}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="orange">
                    {whoWords(group)} · {timesWords(group.times)}
                  </Pill>
                  <Pill tone="neutral">{group.build ? `Version ${group.build}` : 'Version not known'}</Pill>
                  <span className="text-label-md text-on-surface-faint">Last {agoWords(group.lastAt, now)}</span>
                </div>
                {group.pages.length > 0 && (
                  <p className="text-label-md text-on-surface-variant [overflow-wrap:anywhere]">
                    On {group.pages.slice(0, 6).join(', ')}
                    {group.pages.length > 6 ? ` and ${group.pages.length - 6} more` : ''}
                  </p>
                )}
                <details className="rounded-[var(--radius-chip)] bg-inset px-3.5 py-2.5">
                  <summary className="cursor-pointer text-label-md font-medium text-on-surface-variant">
                    {group.rows.length === 1 ? 'The report' : `The ${group.rows.length} reports`}
                  </summary>
                  <ul className="mt-2 flex flex-col gap-3">
                    {group.rows.slice(0, 20).map((row) => (
                      <li key={row.id} className="min-w-0">
                        <p className="text-body-sm text-on-surface [overflow-wrap:anywhere]">
                          <span className="font-medium">{reporterName(row)}</span> · {agoWords(row.last_at, now)}
                          {row.times > 1 ? ` · ${timesWords(row.times)}` : ''}
                        </p>
                        <p className="text-label-md text-on-surface-faint [overflow-wrap:anywhere]">
                          {sourceWords(row.source)}
                          {row.page ? ` on ${row.page}` : ''} · {deviceWords(row.device)}
                          {row.installed ? ' · installed app' : ''} · reference{' '}
                          <span className="font-mono tracking-wider text-on-surface-variant">{errorReference(row.id)}</span>
                        </p>
                      </li>
                    ))}
                    {group.rows.length > 20 && <li className="text-label-md text-on-surface-faint">And {group.rows.length - 20} more.</li>}
                  </ul>
                  {group.rows[0]?.stack && (
                    <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-[var(--radius-chip)] bg-raised px-3 py-2 font-mono text-label-sm text-on-surface-variant [overflow-wrap:anywhere]">
                      {group.rows[0].stack}
                    </pre>
                  )}
                </details>
                <div>
                  <ActionButton size="sm" tone="quiet" disabled={busy} onClick={() => askPutAway(group)}>
                    Put away
                  </ActionButton>
                </div>
              </Row>
            ))}
          </ul>
        </QueryState>
      </SectionTile>

      <SectionTile
        title="What failed in the app’s own work"
        hint={`A timed job that failed, or a notification the database could not hand to the sender. Kept ${HEALTH_KEPT_DAYS} days.`}
        aside={
          failures.length > 0 ? (
            <ActionButton
              size="sm"
              tone="quiet"
              disabled={busy}
              onClick={() =>
                ask({
                  title: 'Put these away?',
                  body: 'The list is emptied. Anything that fails again is recorded again, and you are told again.',
                  confirmLabel: 'Put away',
                  onConfirm: () => putAwayEvents.mutate(failures.map((f) => f.id)),
                })
              }
            >
              Put all away
            </ActionButton>
          ) : undefined
        }
      >
        <QueryState isLoading={events.isLoading} error={events.error} isEmpty={failures.length === 0} emptyMessage="Nothing has failed.">
          <ul className="flex flex-col gap-2">
            {failures.map((event) => (
              <Row key={event.id} as="li" stack>
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={EVENT_TONE[event.kind]}>{eventWords(event.kind)}</Pill>
                  <span className="font-mono text-body-sm text-on-surface [overflow-wrap:anywhere]">{event.name}</span>
                  <span className="text-label-md text-on-surface-faint">{agoWords(event.at, now)}</span>
                </div>
                {event.detail && <p className="font-mono text-label-md text-on-surface-variant [overflow-wrap:anywhere]">{event.detail}</p>}
              </Row>
            ))}
          </ul>
        </QueryState>
      </SectionTile>

      {/* Folded unless a job has failed. Whether one has is only known once the
          overview arrives, after the first draw, and a tile reads `defaultOpen`
          once — so it is a different tile then, and opens. */}
      <SectionTile
        key={jobsFailing > 0 ? 'a job has failed' : 'none has'}
        title="Timed jobs"
        hint={
          jobs.length === 0
            ? 'The work the database does by the clock.'
            : `${jobs.length} jobs the database runs by the clock${jobsFailing > 0 ? ` · ${jobsFailing} failed in the last day` : ' · none failed in the last day'}.`
        }
        collapsible
        defaultOpen={jobsFailing > 0}
      >
        <QueryState isLoading={overview.isLoading} error={overview.error} isEmpty={jobs.length === 0} emptyMessage="No timed jobs are set up.">
          <ul className="flex flex-col gap-2">
            {jobs.map((job) => (
              <Row key={job.name ?? job.schedule ?? 'job'} as="li" stack>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-body-sm text-on-surface [overflow-wrap:anywhere]">{job.name ?? 'A job with no name'}</span>
                  {job.failed > 0 ? (
                    <Pill tone="red">
                      {job.failed} of {job.runs} failed
                    </Pill>
                  ) : job.active === false ? (
                    <Pill tone="orange">Switched off</Pill>
                  ) : job.runs === 0 ? (
                    <Pill tone="neutral">Has not run in the last day</Pill>
                  ) : (
                    <Pill tone="green">{job.runs.toLocaleString()} runs, none failed</Pill>
                  )}
                </div>
                <p className="text-label-md text-on-surface-faint">
                  <span className="font-mono">{job.schedule ?? ''}</span>
                  {job.last_at ? ` · last ran ${agoWords(job.last_at, now)}` : ''}
                </p>
              </Row>
            ))}
          </ul>
        </QueryState>
      </SectionTile>
      {dialog}
    </div>
  )
}
