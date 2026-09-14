import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { PageHeader } from '../components/Surface'
import { TeamMark } from '../components/TeamMark'
import { fetchDepartments, fetchMembersForDepartments, fetchServices } from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { formatServiceDay } from '../lib/sunday'
import { useAppSettings } from '../lib/appSettings'
import { useErrorText } from '../lib/useErrorText'
import { useConfirmAction } from '../components/ConfirmAction'
import { Chevron, useExpanded } from '../components/Collapsible'
import {
  DEBRIEFS_KEY,
  addDebriefItem,
  daysLeft,
  debriefExpiresAt,
  debriefFor,
  deleteDebrief,
  deleteDebriefItem,
  fetchDebriefs,
  isExpired,
  itemProgress,
  nextSortOrder,
  setDebriefItemDone,
  updateDebriefItem,
  type Debrief,
  type DebriefItem,
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
 *
 * Written as a list rather than a paragraph, because that is what a
 * debrief is: six people remembering the morning out of order, each thing
 * separate, some of them somebody's to deal with before next Sunday. A box
 * of prose cannot say which of those got done; a list with ticks can, and
 * the ones still outstanding sit at the top where they are awkward.
 */

interface Person {
  id: string
  first_name: string
  last_name: string
}

const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`

/**
 * Putting a name against a thing, or leaving it against nobody.
 *
 * Most items are only worth remembering — "the new projector was much
 * better" needs no one's name — so "Nobody in particular" is the default
 * and not an afterthought at the bottom of the list.
 */
function PersonPicker({
  value,
  people,
  label,
  onChange,
}: {
  value: string | null
  people: Person[]
  label: string
  onChange: (id: string | null) => void
}) {
  return (
    <select
      value={value ?? ''}
      aria-label={label}
      onChange={(e) => onChange(e.target.value || null)}
      className="min-w-0 flex-1 rounded-full bg-raised px-3 py-1.5 text-label-md text-on-surface hairline focus:outline-none focus:ring-1 focus:ring-secondary sm:flex-none"
    >
      <option value="">Nobody in particular</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {fullName(person)}
        </option>
      ))}
    </select>
  )
}

/**
 * One line of the debrief.
 *
 * The tick is the whole point of the list, so it is the first thing on the
 * row and a real checkbox rather than something that merely looks like
 * one. A done item stays readable — struck through, not greyed to nothing
 * — because "we already dealt with that" is information too.
 */
function ItemRow({
  item,
  people,
  mayWrite,
  onToggle,
  onSave,
  onRemove,
}: {
  item: DebriefItem
  people: Person[]
  mayWrite: boolean
  onToggle: (done: boolean) => void
  onSave: (fields: { body: string; assignedTo: string | null }) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(item.body)
  const [assignedTo, setAssignedTo] = useState<string | null>(item.assigned_to)
  const done = !!item.done_at

  if (editing) {
    return (
      <li className="rounded-[var(--radius-chip)] bg-raised p-2.5 hairline">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          autoFocus
          aria-label="Edit this item"
          className="w-full bg-transparent text-body-sm text-on-surface focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PersonPicker
            value={assignedTo}
            people={people}
            label="Who it is on"
            onChange={setAssignedTo}
          />
          <button
            type="button"
            disabled={!body.trim()}
            onClick={() => {
              onSave({ body, assignedTo })
              setEditing(false)
            }}
            className="rounded-full bg-primary px-3 py-1.5 text-label-md font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setBody(item.body)
              setAssignedTo(item.assigned_to)
              setEditing(false)
            }}
            className="tap text-label-md text-on-surface-faint hover:text-secondary hover:underline"
          >
            Cancel
          </button>
        </div>
      </li>
    )
  }

  /*
   * The thing said gets the whole width, and whose it is and what can be
   * done to it go underneath. Kept on one line they squeeze the sentence
   * into three words a line on a phone, which is where a debrief is
   * actually read.
   */
  return (
    <li className="py-2">
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={done}
          disabled={!mayWrite}
          aria-label={done ? `Put back: ${item.body}` : `Tick off: ${item.body}`}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)] disabled:opacity-50"
        />
        <span
          className={`min-w-0 flex-1 break-words text-body-sm ${done ? 'text-on-surface-faint line-through' : 'text-on-surface'}`}
        >
          {item.body}
        </span>
      </div>
      {(item.assignee || mayWrite) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[26px]">
          {item.assignee && (
            <span className="rounded-full bg-raised px-2 py-0.5 font-mono text-label-sm text-on-surface-variant">
              {fullName(item.assignee)}
            </span>
          )}
          {mayWrite && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="tap text-label-sm text-on-surface-faint hover:text-secondary hover:underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove: ${item.body}`}
                className="tap text-label-sm text-on-surface-faint hover:text-error hover:underline"
              >
                Remove
              </button>
            </>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * Adding the next thing.
 *
 * It stays open and empties itself after each one, because a debrief comes
 * out in a rush and a form that has to be re-opened between items loses
 * the fourth and fifth things anybody said.
 */
function ItemComposer({
  people,
  adding,
  onAdd,
}: {
  people: Person[]
  adding: boolean
  onAdd: (fields: { body: string; assignedTo: string | null }) => void
}) {
  const [body, setBody] = useState('')
  const [assignedTo, setAssignedTo] = useState<string | null>(null)

  const submit = () => {
    if (!body.trim()) return
    onAdd({ body, assignedTo })
    setBody('')
    setAssignedTo(null)
  }

  /*
   * The box takes a whole line of its own until there is room for the
   * picker beside it: sharing a row on a phone left it about four
   * characters wide, which is not a box anybody can type a sentence into.
   */
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Enter adds it: this is a list being typed at speed, not a form
          // being filled in.
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
        maxLength={1000}
        aria-label="Add a debrief item"
        placeholder="What went well, what did not, or what somebody has to do."
        className="w-full min-w-0 rounded-[var(--radius-chip)] bg-raised px-3 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary sm:flex-1"
      />
      <div className="flex items-center gap-2">
        <PersonPicker
          value={assignedTo}
          people={people}
          label="Who it is on"
          onChange={setAssignedTo}
        />
        <button
          type="button"
          disabled={adding || !body.trim()}
          onClick={submit}
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-label-md font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
        >
          {adding ? 'Adding…' : 'Add'}
        </button>
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

  /*
   * Who each team can put an item on. RLS narrows this to the teams the
   * reader may see, so a head gets their own team and not the church.
   */
  const departmentIds = useMemo(
    () => (departmentsQuery.data ?? []).map((d) => d.id),
    [departmentsQuery.data],
  )
  const membersQuery = useQuery({
    queryKey: ['debrief-people', departmentIds.join(',')],
    queryFn: () => fetchMembersForDepartments(departmentIds),
    enabled: departmentIds.length > 0,
  })
  const peopleByTeam = useMemo(() => {
    const map = new Map<string, Person[]>()
    for (const row of membersQuery.data ?? []) {
      if (!row.profiles) continue
      const list = map.get(row.department_id) ?? []
      list.push(row.profiles)
      map.set(row.department_id, list)
    }
    for (const list of map.values()) list.sort((a, b) => fullName(a).localeCompare(fullName(b)))
    return map
  }, [membersQuery.data])

  const debriefsQuery = useQuery({
    queryKey: [...DEBRIEFS_KEY, services.map((s) => s.id).join(',')],
    queryFn: () => fetchDebriefs(services.map((s) => s.id)),
    enabled: services.length > 0,
  })
  const debriefs = debriefsQuery.data ?? []

  const refresh = () => {
    setError(null)
    return queryClient.invalidateQueries({ queryKey: DEBRIEFS_KEY })
  }
  const complain = (fallback: string) => (err: unknown) => setError(errorText(err, fallback))

  const add = useMutation({
    mutationFn: (fields: {
      debriefId: string | null
      serviceId: string
      departmentId: string
      body: string
      assignedTo: string | null
      sortOrder: number
    }) => addDebriefItem({ ...fields, createdBy: myId! }),
    onSuccess: refresh,
    onError: complain('Could not add that item.'),
  })

  const edit = useMutation({
    mutationFn: (fields: { id: string; body: string; assignedTo: string | null }) =>
      updateDebriefItem(fields.id, fields),
    onSuccess: refresh,
    onError: complain('Could not change that item.'),
  })

  const tick = useMutation({
    mutationFn: (fields: { id: string; done: boolean }) =>
      setDebriefItemDone(fields.id, fields.done, myId!),
    onSuccess: refresh,
    onError: complain('Could not tick that item off.'),
  })

  const removeItem = useMutation({
    mutationFn: (id: string) => deleteDebriefItem(id),
    onSuccess: refresh,
    onError: complain('Could not remove that item.'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteDebrief(id),
    onSuccess: refresh,
    onError: complain('Could not remove those minutes.'),
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
              (d) => (debriefFor(debriefs, service.id, d.id)?.items ?? []).length > 0,
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
                    const items = debrief?.items ?? []
                    const { done, total } = itemProgress(items)
                    const mine = mayWriteFor(dept.id)
                    const people = peopleByTeam.get(dept.id) ?? []
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
                            {total > 0 && (
                              <span className="font-mono text-label-sm text-on-surface-faint">
                                {done}/{total} done
                              </span>
                            )}
                          </span>
                          {mine && debrief && (
                            <button
                              type="button"
                              onClick={() =>
                                ask({
                                  title: `Remove ${dept.name}'s debrief?`,
                                  body: 'Every item on it goes, for everybody. Nothing else about the service changes.',
                                  confirmLabel: 'Remove',
                                  onConfirm: () => remove.mutate(debrief.id),
                                })
                              }
                              className="tap text-label-md text-on-surface-faint hover:text-error hover:underline"
                            >
                              Remove all
                            </button>
                          )}
                        </div>

                        {items.length > 0 ? (
                          <ul className="mt-1.5 flex flex-col divide-y divide-[var(--color-hairline)]">
                            {items.map((item) => (
                              <ItemRow
                                key={item.id}
                                item={item}
                                people={people}
                                mayWrite={mine}
                                onToggle={(isDone) => tick.mutate({ id: item.id, done: isDone })}
                                onSave={(fields) => edit.mutate({ id: item.id, ...fields })}
                                onRemove={() => removeItem.mutate(item.id)}
                              />
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1.5 text-label-md text-on-surface-faint">
                            {mine
                              ? 'Nothing written up yet.'
                              : 'Nothing written up yet — their head or assisting head can add it.'}
                          </p>
                        )}

                        {/* Minutes typed by the previous build, before the
                            list replaced the box. Shown so nobody's words
                            vanish; nothing writes this any more. */}
                        {debrief?.minutes && (
                          <p className="mt-2 whitespace-pre-wrap break-words text-body-sm text-on-surface-variant">
                            {debrief.minutes}
                          </p>
                        )}

                        {debrief && items.length > 0 && (
                          <p className="mt-1.5 font-mono text-label-sm text-on-surface-faint">
                            {authorLine(debrief)}
                          </p>
                        )}
                        {mine && (
                          <ItemComposer
                            people={people}
                            adding={add.isPending}
                            onAdd={(fields) =>
                              add.mutate({
                                debriefId: debrief?.id ?? null,
                                serviceId: service.id,
                                departmentId: dept.id,
                                sortOrder: nextSortOrder(items),
                                ...fields,
                              })
                            }
                          />
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
