import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { PageHeader } from '../components/Surface'
import { TeamMark } from '../components/TeamMark'
import { fetchDepartments, fetchServices } from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { formatServiceDay } from '../lib/sunday'
import { useAppSettings } from '../lib/appSettings'
import { useErrorText } from '../lib/useErrorText'
import { useConfirmAction } from '../components/ConfirmAction'
import { Chevron, useExpanded } from '../components/Collapsible'
import {
  DEBRIEFS_KEY,
  daysLeft,
  debriefExpiresAt,
  debriefFor,
  deleteDebrief,
  fetchDebriefs,
  isExpired,
  saveDebrief,
  type Debrief,
} from '../lib/debriefs'
import { formatRange } from '../lib/dateRange'

/**
 * What each team said after the service.
 *
 * Every team talks afterwards — what ran late, what nobody could hear, who
 * needs showing how to do the thing that went wrong. That conversation has
 * been living in people's heads and in four separate WhatsApp groups, so
 * the head who was away misses it and none of it carries into next week.
 *
 * Written by whoever runs the team, read by everybody: a debrief is how a
 * church learns about itself, and minutes only one team can read mean the
 * same problem gets solved twice.
 *
 * And they go. Minutes are working notes — they say the radio mic was dead
 * again and name whoever forgot the batteries — so they are kept for a
 * month and then deleted, by a nightly job rather than by anybody
 * remembering. The window is a setting; the clock runs from the service,
 * so every team's minutes for one Sunday expire together. The page says so
 * out loud rather than letting the words vanish unannounced.
 */

function MinutesForm({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: string
  saving: boolean
  onSave: (minutes: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  return (
    <div className="mt-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        maxLength={8000}
        autoFocus
        aria-label="Debrief minutes"
        placeholder="What went well, what did not, and what somebody has to do about it before next Sunday."
        className="w-full rounded-[var(--radius-chip)] bg-raised px-3 py-2.5 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving || !text.trim()}
          onClick={() => onSave(text)}
          className="rounded-full bg-primary px-4 py-2 text-label-md font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save minutes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-2 text-label-md text-on-surface hairline hover:border-secondary"
        >
          Cancel
        </button>
        <span className="font-mono text-label-sm text-on-surface-faint">
          {text.trim().length}/8000
        </span>
      </div>
    </div>
  )
}

export function DebriefsPage() {
  const { session, isAdmin, isDepartmentHead } = useAuth()
  const settings = useAppSettings()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const today = todayIso()
  const myId = session?.user.id
  const { ask, dialog } = useConfirmAction()
  const { isExpanded, toggle } = useExpanded()

  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })

  /*
   * The services worth showing: the ones that have happened and whose
   * minutes are still being kept. Anything older has been deleted, so
   * listing it would be a heading over an empty space for ever.
   */
  const services = useMemo(
    () =>
      (servicesQuery.data ?? [])
        .filter(
          (s) => s.date <= today && !isExpired(s.date, settings.debrief_retention_days, today),
        )
        .sort((a, b) => b.date.localeCompare(a.date)),
    [servicesQuery.data, today, settings.debrief_retention_days],
  )

  const debriefsQuery = useQuery({
    queryKey: [...DEBRIEFS_KEY, services.map((s) => s.id).join(',')],
    queryFn: () => fetchDebriefs(services.map((s) => s.id)),
    enabled: services.length > 0,
  })
  const debriefs = debriefsQuery.data ?? []

  const save = useMutation({
    mutationFn: (fields: {
      id: string | null
      serviceId: string
      departmentId: string
      minutes: string
    }) => saveDebrief({ ...fields, writtenBy: myId! }),
    onSuccess: () => {
      setEditing(null)
      setError(null)
      return queryClient.invalidateQueries({ queryKey: DEBRIEFS_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save those minutes.')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteDebrief(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DEBRIEFS_KEY }),
    onError: (err: unknown) => setError(errorText(err, 'Could not remove those minutes.')),
  })

  const mayWriteFor = (departmentId: string) => isAdmin || isDepartmentHead(departmentId)

  const authorLine = (debrief: Debrief) => {
    const who = debrief.author
      ? `${debrief.author.first_name} ${debrief.author.last_name}`
      : 'Somebody'
    const when = new Date(debrief.updated_at).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    })
    const edited = debrief.updated_at !== debrief.created_at
    return `${who} · ${edited ? 'updated' : 'written'} ${when}`
  }

  return (
    <div>
      <PageHeader
        eyebrow="After the service"
        title="Debriefs"
        description="What each team said afterwards — written by whoever runs the team, read by everybody, and kept for a while."
      />

      {error && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <QueryState
        isLoading={servicesQuery.isLoading || departmentsQuery.isLoading}
        error={servicesQuery.error || departmentsQuery.error}
        isEmpty={services.length === 0}
        emptyMessage="Nothing to debrief yet — minutes appear here once a service has happened."
      >
        <div className="mt-6 flex flex-col gap-4">
          {services.map((service) => {
            const left = daysLeft(service.date, settings.debrief_retention_days, today)
            const until = debriefExpiresAt(service.date, settings.debrief_retention_days)
            const written = (departmentsQuery.data ?? []).filter(
              (d) => !!debriefFor(debriefs, service.id, d.id),
            ).length
            // Open by default while it is the most recent one: that is the
            // service anybody is here to write up.
            const open = (service === services[0]) !== isExpanded(service.id)

            return (
              <section
                key={service.id}
                className="rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline sm:p-6"
              >
                <button
                  type="button"
                  onClick={() => toggle(service.id)}
                  aria-expanded={open}
                  aria-controls={`debrief-teams-${service.id}`}
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-left"
                >
                  <span className="min-w-0">
                    <span className="text-headline-md">{service.service_type}</span>
                    <span className="ml-2 font-mono text-label-sm text-on-surface-variant">
                      {formatServiceDay(service.date)}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-2.5">
                    <span className="font-mono text-label-sm text-on-surface-faint">
                      {written}/{(departmentsQuery.data ?? []).length} written
                    </span>
                    <Chevron open={open} />
                  </span>
                </button>

                {/*
                  How long these have left, said as a number of days rather
                  than a ticking clock: a month is not something anybody
                  watches by the second, and "27 days left" is what somebody
                  deciding whether to write it up now actually needs.
                */}
                <p className="mt-1.5 text-label-md text-on-surface-faint">
                  {left <= 1 ? (
                    <span className="text-accent-orange-soft">
                      Deleted after today — {formatRange(service.date, null, today)} minutes are on
                      their last day.
                    </span>
                  ) : (
                    <>
                      Kept until{' '}
                      <span className="font-mono">
                        {until.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </span>{' '}
                      · {left} days left
                    </>
                  )}
                </p>

                <ul id={`debrief-teams-${service.id}`} hidden={!open} className="mt-4 flex flex-col gap-3">
                  {(departmentsQuery.data ?? []).map((dept) => {
                    const debrief = debriefFor(debriefs, service.id, dept.id)
                    const key = `${service.id}:${dept.id}`
                    const mine = mayWriteFor(dept.id)
                    return (
                      <li
                        key={dept.id}
                        className="rounded-[var(--radius-row)] bg-surface-muted p-3.5 hairline"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <TeamMark color={dept.color} />
                            <span className="text-body-md font-medium text-on-surface">
                              {dept.name}
                            </span>
                          </span>
                          {mine && editing !== key && (
                            <span className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setEditing(key)}
                                className="tap text-label-md text-on-surface-faint hover:text-secondary hover:underline"
                              >
                                {debrief ? 'Edit' : 'Write them up'}
                              </button>
                              {debrief && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    ask({
                                      title: `Remove ${dept.name}'s minutes?`,
                                      body: 'They disappear for everybody. Nothing else about the service changes.',
                                      confirmLabel: 'Remove',
                                      onConfirm: () => remove.mutate(debrief.id),
                                    })
                                  }
                                  className="tap text-label-md text-on-surface-faint hover:text-error hover:underline"
                                >
                                  Remove
                                </button>
                              )}
                            </span>
                          )}
                        </div>

                        {editing === key ? (
                          <MinutesForm
                            initial={debrief?.minutes ?? ''}
                            saving={save.isPending}
                            onCancel={() => setEditing(null)}
                            onSave={(minutes) =>
                              save.mutate({
                                id: debrief?.id ?? null,
                                serviceId: service.id,
                                departmentId: dept.id,
                                minutes,
                              })
                            }
                          />
                        ) : debrief ? (
                          <>
                            {/* Whitespace is kept: people write minutes as
                                a list of lines, and a paragraph of them run
                                together is not the same document. */}
                            <p className="mt-2 whitespace-pre-wrap break-words text-body-sm text-on-surface">
                              {debrief.minutes}
                            </p>
                            <p className="mt-1.5 font-mono text-label-sm text-on-surface-faint">
                              {authorLine(debrief)}
                            </p>
                          </>
                        ) : (
                          <p className="mt-1.5 text-label-md text-on-surface-faint">
                            {mine
                              ? 'Nothing written up yet.'
                              : 'Nothing written up yet — their head or assisting head can add it.'}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      </QueryState>

      {dialog}
    </div>
  )
}
