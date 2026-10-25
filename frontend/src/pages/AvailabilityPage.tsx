import { useMemo, useState } from 'react'
import { Lifespan } from '../components/Lifespan'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { usePermissions } from '../lib/usePermissions'
import { useMyTeams } from '../lib/useMyTeams'
import { FloatingServiceTitle } from '../components/FloatingServiceTitle'
import { useConfirmAction } from '../components/ConfirmAction'
import { QueryState } from '../components/QueryState'
import { PageHeader, segmentClasses, segmentTrackClasses, type SegmentTone } from '../components/Surface'
import { fetchDepartments, fetchOwnDepartmentIds, fetchServices } from '../lib/queries'
import { todayIso } from '../lib/monthGrid'
import { formatServiceDay, shortServiceDay } from '../lib/sunday'
import { callTimeRowSchema, serviceDays, type CallTimeRow } from '../lib/callTimes'
import { ServiceCountdown } from '../components/ServiceCountdown'
import { checklistWindow } from '../lib/checklistWindow'
import { useNow } from '../lib/useNow'
import { sectionServices } from '../lib/serviceSections'
import { ServiceSections } from '../components/ServiceSections'
import { DayHeading } from '../components/DayHeading'
import { TeamMark } from '../components/TeamMark'
import { NudgeButton } from '../components/NudgeButton'
import { useFinishedServices } from '../lib/useFinishedServices'
import { useAppSettings, useDisplay } from '../lib/appSettings'
import { availabilityClosesAt } from '../lib/availabilityDeadline'
import { LOOKAHEAD_DAYS, servicesAhead, servicesToShow, shiftIsoDays } from '../lib/rotaWindow'
import {
  availabilityWindowDays,
  opensByDefault,
} from '../lib/availabilityWindow'
import { Chevron, useExpanded } from '../components/Collapsible'
import { inStartOrder } from '../lib/upcomingServices'
import { teamWash } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'
import { availabilitySummary } from '../lib/availabilitySummary'
import { useErrorText } from '../lib/useErrorText'
import {
  availabilityRowSchema,
  departmentMemberRowSchema,
  type AvailabilityRow,
  type AvailabilityStatus,
  type DepartmentMemberRow,
} from '../lib/types'
import { Select } from '../components/Select'
import { AskToChangeAnswer, LateAnswerQueue } from '../components/LateAnswerRequest'
import { AnswerHistory } from '../components/AnswerHistory'
import { fetchAvailabilityHistory, historyOf } from '../lib/availabilityHistory'
import { fetchGuestAnswerHistory, fetchGuestAnswers, fetchTeamGuests, setGuestAnswer } from '../lib/guestAvailability'
import {
  AVAILABILITY_REQUESTS_KEY,
  askToChangeAnswer,
  decideAvailabilityRequest,
  fetchAvailabilityRequests,
  pendingFor,
  pendingOn,
  settledFor,
  withdrawAvailabilityRequest,
} from '../lib/availabilityRequests'

/**
 * Three answers, one tap.
 *
 * A volunteer answers this on a phone, standing up, in a hurry — so it is a
 * segmented control rather than three buttons: one object, thumb-sized
 * targets, and the answer you gave is the one that is filled in. The short
 * labels are deliberate; "Can't make it" doesn't fit a third of a phone.
 */
const STATUS_OPTIONS: {
  value: AvailabilityStatus
  label: string
  full: string
  tone: SegmentTone
}[] = [
  { value: 'available', label: 'Yes', full: 'Available', tone: 'green' },
  { value: 'tentative', label: 'Maybe', full: 'Tentative', tone: 'orange' },
  { value: 'unavailable', label: 'No', full: "Can't make it", tone: 'red' },
]

const statusLabel: Record<AvailabilityStatus, string> = {
  available: 'Available',
  tentative: 'Tentative',
  unavailable: "Can't make it",
}

const statusTextClass: Record<AvailabilityStatus, string> = {
  available: 'text-success',
  tentative: 'text-warning',
  unavailable: 'text-error',
}

/** Somebody on a team's list: an account holder, or a name on the guest roll. */
interface TrackedPerson {
  /** The membership row's id. */
  id: string
  /** The account, or for the guest roll the guest — what their answers are keyed by. */
  user_id: string
  member_type: 'core' | 'guest'
  name: string
  noAccount: boolean
}

async function fetchAvailability(serviceIds: string[]): Promise<AvailabilityRow[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase.from('availability').select('*').in('service_id', serviceIds)
  if (error) throw error
  return z.array(availabilityRowSchema).parse(data)
}

async function fetchMembers(departmentIds: string[]): Promise<DepartmentMemberRow[]> {
  if (departmentIds.length === 0) return []
  const { data, error } = await supabase
    .from('department_members')
    .select('*, profiles(id, first_name, last_name, avatar_url)')
    .in('department_id', departmentIds)
  if (error) throw error
  return z.array(departmentMemberRowSchema).parse(data)
}

/**
 * What the answer could not say on its own.
 *
 * "Yes" is true and still leaves the head guessing: somebody can serve
 * and not be there until half nine, or serve but not lift. That sentence
 * has been arriving by WhatsApp, which reaches whoever was looking at
 * their phone — while the tracker, which is where the morning actually
 * gets planned, said a confident "Yes".
 *
 * It is the volunteer's own words and it appears beside their name, so
 * only they write it. A head reads it and plans around it.
 */
function AnswerNote({
  note,
  busy,
  editable,
  onSave,
}: {
  note: string | null
  busy: boolean
  editable: boolean
  onSave: (note: string) => void
}) {
  // With no note yet the box is simply there, under the answer just given:
  // a faint "Add a note" link was a feature nobody found. Once a note is
  // written it reads as a quote, and editing it is a tap away.
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note ?? '')
  const open = editable && (editing || !note)

  if (!open) {
    if (!note) return null
    return (
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 break-words text-label-md text-on-surface-variant">
          <span aria-hidden="true">“</span>
          {note}
          <span aria-hidden="true">”</span>
        </span>
        {editable && (
          <button
            type="button"
            onClick={() => {
              setText(note)
              setEditing(true)
            }}
            className="tap shrink-0 text-label-sm text-on-surface-faint hover:text-accent-blue-soft hover:underline"
          >
            Edit note
          </button>
        )}
      </div>
    )
  }

  const changed = text.trim() !== (note ?? '')
  const save = () => {
    if (!changed) return
    onSave(text)
    setEditing(false)
  }

  return (
    <div className="mt-3">
      <label className="flex items-baseline justify-between gap-2 font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
        <span>
          Note <span className="normal-case tracking-normal text-on-surface-faint">(optional)</span>
        </span>
        <span className="tabular text-on-surface-faint">{text.trim().length}/200</span>
      </label>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          }
        }}
        maxLength={200}
        autoFocus={editing}
        aria-label="A note with your answer"
        placeholder="e.g. “Only there by 8.30am”"
        className="mt-1.5 w-full rounded-[var(--radius-chip)] bg-raised px-3 py-2 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus:ring-1 focus:ring-secondary"
      />
      {(changed || editing) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || !changed}
            onClick={save}
            className="rounded-full bg-primary px-3 py-1.5 text-label-md font-medium text-on-primary hover:opacity-90 disabled:opacity-60"
          >
            Save note
          </button>
          <button
            type="button"
            onClick={() => {
              setText(note ?? '')
              setEditing(false)
            }}
            className="tap text-label-md text-on-surface-faint hover:text-accent-blue-soft hover:underline"
          >
            Cancel
          </button>
          {/* Clearing it is saving an empty one, which the database counts
              as no note at all. */}
        </div>
      )}
    </div>
  )
}

export function AvailabilityPage() {
  const { session, isAdmin, isOverwatch, seesAllTeams, isDepartmentHead } = useAuth()
  // What may be done to other people's answers is the church's to say
  // (Settings › Access & Privileges). Admins seeing every team, and not
  // answering for themselves here, stay as they were.
  const { can } = usePermissions()
  // A changed answer is asked about first: a tap that slides from Yes to No
  // takes somebody off the rota, and one slip should not do that.
  const { ask, dialog } = useConfirmAction()
  const { teamStyle } = useTeamStyle()
  const errorText = useErrorText()
  const myId = session?.user.id
  const queryClient = useQueryClient()
  const today = todayIso()
  const settings = useAppSettings()
  const display = useDisplay()

  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const ownDeptsQuery = useQuery({
    queryKey: ['own-departments', myId],
    queryFn: () => fetchOwnDepartmentIds(myId!),
    enabled: !!myId,
  })

  // Everything still to come, out to the look-ahead. Which of these have
  // finished decides the window, so it is worked out on the wider list and
  // the window is drawn from the answer.
  const candidates = useMemo(() => {
    const horizon = shiftIsoDays(today, LOOKAHEAD_DAYS)
    return servicesAhead(servicesQuery.data ?? [], today).filter((s) => s.date <= horizon)
  }, [servicesQuery.data, today])

  // A service that has happened can no longer be answered for, so it drops
  // below the ones that still need an answer rather than sitting at the top
  // of the page asking for something nobody can give.
  const { isFinished } = useFinishedServices(candidates.map((s) => s.id))
  /*
   * `isExpanded` here means "toggled away from what this service does on
   * its own", not "open": what opens by default depends on which group a
   * service is in, and a single set of ids cannot carry both facts.
   */
  const { isExpanded: isToggled, toggle: toggleService } = useExpanded()

  // Three weeks, not the rota's week. Availability is asked in advance —
  // somebody knows in the second week of the month that they are away on
  // the fourth Sunday, and a page showing only this week gives them
  // nowhere to say so until it has stopped being useful.
  const listed = useMemo(
    () =>
      servicesToShow(candidates, today, {
        days: availabilityWindowDays(settings.rota_window_days, display.windows.availabilityDays),
        isFinished,
      }),
    [candidates, today, isFinished, settings, display],
  )

  // In date order, so the split below can draw its line at a day.
  const upcoming = useMemo(
    () => [...listed].sort((a, b) => a.date.localeCompare(b.date)),
    [listed],
  )
  const upcomingIds = useMemo(() => upcoming.map((s) => s.id), [upcoming])

  /*
   * A service that is over cannot be answered for, so it leaves the page
   * proper entirely and waits at the foot of it under "Finished". It used
   * to stay on its own day at the top — the right place for a Sunday that
   * has been and gone, and the wrong place for a question nobody can
   * answer, which is what every card on this page is.
   */
  /*
   * The call times for the days on the page.
   *
   * Attendance is a fact about a morning: it cannot be recorded before
   * the team has been called in, because until then nobody has turned up
   * or failed to. The same rule, and the same table, as the checklist
   * window (0079) — one call time per team per day, seven o'clock when
   * nobody has set one.
   */
  const shownDates = useMemo(
    () => [...new Set(upcoming.map((s) => s.date))].sort(),
    [upcoming],
  )
  const callTimesQuery = useQuery({
    queryKey: ['call-times', shownDates],
    queryFn: async (): Promise<CallTimeRow[]> => {
      const { data, error: err } = await supabase
        .from('department_call_times')
        .select('department_id, on_date, call_time')
        .in('on_date', shownDates)
      if (err) throw err
      return callTimeRowSchema.array().parse(data)
    },
    enabled: shownDates.length > 0,
  })
  const callTimes = useMemo(() => callTimesQuery.data ?? [], [callTimesQuery.data])

  // Recomputed on a timer, so the present/no-show buttons appear — and a
  // deadline that passes while somebody is looking at the page closes
  // itself — rather than waiting for the next reload.
  const now = useNow()

  /*
   * When each service starts, for the order of a day with two.
   *
   * "The next service" is the one on top, open, and on a Sunday with an
   * English and a Malayalam service which of them is next is a fact about
   * the running order — sorting by name would open whichever comes first
   * in the alphabet. One row per service: the first session's start.
   */
  const startsQuery = useQuery({
    queryKey: ['availability-service-starts', upcomingIds],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('service_sessions')
        .select('service_id, start_time')
        .in('service_id', upcomingIds)
        .order('start_time')
      if (err) throw err
      return z.array(z.object({ service_id: z.string(), start_time: z.string() })).parse(data)
    },
    enabled: upcomingIds.length > 0,
  })
  const startOf = useMemo(() => {
    const first = new Map<string, string>()
    for (const row of startsQuery.data ?? []) {
      if (!first.has(row.service_id)) first.set(row.service_id, row.start_time)
    }
    return (service: { id: string }) => first.get(service.id) ?? null
  }, [startsQuery.data])

  // Today's, the next service day, the rest, and what is over — the same
  // four sections as every page with services on it (lib/serviceSections).
  const sections = useMemo(
    () => sectionServices(inStartOrder(upcoming, startOf), today, (s) => isFinished(s.id)),
    [upcoming, startOf, today, isFinished],
  )
  // The one service that arrives open: the first still to answer for.
  const nextId = (sections.today[0] ?? sections.next[0])?.id ?? null

  /*
   * A Sunday is one occasion, not two questions.
   *
   * The page listed each service on its own, so a church with an English
   * service and a Malayalam service on the same morning read as two
   * separate days — and three weeks of that is six headings for three
   * Sundays. The day is the heading now; the services sit under it.
   */
  const daysOf = (services: typeof upcoming) => serviceDays(services)

  // Teams shown here: the ones you belong to or lead. Admins get every
  // team, so the check-ins they can record match the teams the dashboard
  // counts — otherwise a team they aren't a member of would sit forever
  // as "still to check in" with no way to resolve it.
  const myDepartments = useMemo(() => {
    const all = departmentsQuery.data ?? []
    // Overwatch reads every team the way an Admin does (0187).
    if (seesAllTeams) return all
    const mine = new Set(ownDeptsQuery.data ?? [])
    return all.filter(
      (d) => mine.has(d.id) || isDepartmentHead(d.id),
    )
  }, [departmentsQuery.data, ownDeptsQuery.data, seesAllTeams, isDepartmentHead])

  const availabilityQuery = useQuery({
    queryKey: ['availability', 'tracker', upcomingIds],
    queryFn: () => fetchAvailability(upcomingIds),
    enabled: upcomingIds.length > 0,
  })

  // Rosters for every team shown: they're the denominator of each team's
  // availability bar, and the name-by-name list heads and Admins expand.
  const myDepartmentIds = useMemo(() => myDepartments.map((d) => d.id), [myDepartments])
  const membersQuery = useQuery({
    queryKey: ['availability-members', myDepartmentIds],
    queryFn: () => fetchMembers(myDepartmentIds),
    enabled: myDepartmentIds.length > 0,
  })

  /*
   * The guest roll's people on those teams (0161), who have no account and
   * so no answer of their own: whoever may answer for others answers for
   * them (0166). Their answers come back keyed by the guest, so the lists
   * below take them like anybody else's.
   */
  const teamGuestsQuery = useQuery({
    queryKey: ['availability-team-guests', myDepartmentIds],
    queryFn: () => fetchTeamGuests(myDepartmentIds),
    enabled: myDepartmentIds.length > 0,
  })
  const guestAnswersQuery = useQuery({
    queryKey: ['availability', 'guests', upcomingIds],
    queryFn: () => fetchGuestAnswers(upcomingIds),
    enabled: upcomingIds.length > 0 && (teamGuestsQuery.data ?? []).length > 0,
  })
  const allAnswers = useMemo(
    () => [...(availabilityQuery.data ?? []), ...(guestAnswersQuery.data ?? [])],
    [availabilityQuery.data, guestAnswersQuery.data],
  )

  // The per-person breakdown, with who turned up, is for whoever may
  // change somebody else's answer on that team.
  const ledDepartmentIds = useMemo(
    () => myDepartments.filter((d) => can('avail.edit_others', { departmentId: d.id })).map((d) => d.id),
    [myDepartments, can],
  )

  /*
   * The log behind each answer (0145): every time it was given, changed
   * or taken away, and by whom. Who may read it is the church's to say
   * (`avail.history`); out of the box, the Owner and Admins. Fetched only
   * for somebody who may read some of it, and the database returns only
   * the lines they may.
   */
  // Overwatch reads every team's log, as it reads every team (0187).
  const seesHistory = (departmentId: string, ownerId: string | undefined) =>
    isOverwatch || can('avail.history', { departmentId, ownerId })
  const readsHistory = myDepartments.some(
    (d) => can('avail.history', { departmentId: d.id }) || seesHistory(d.id, myId),
  )
  const historyQuery = useQuery({
    // Under 'availability', so every write on this page refreshes it too.
    queryKey: ['availability', 'history', upcomingIds],
    queryFn: () => fetchAvailabilityHistory(upcomingIds),
    enabled: readsHistory && upcomingIds.length > 0,
  })
  const guestHistoryQuery = useQuery({
    queryKey: ['availability', 'guest-history', upcomingIds],
    queryFn: () => fetchGuestAnswerHistory(upcomingIds),
    enabled: readsHistory && upcomingIds.length > 0 && (teamGuestsQuery.data ?? []).length > 0,
  })
  const history = useMemo(
    () => [...(historyQuery.data ?? []), ...(guestHistoryQuery.data ?? [])],
    [historyQuery.data, guestHistoryQuery.data],
  )

  // Admins are here to watch the numbers, not to answer for themselves:
  // they see every team, and a row of buttons on each one is noise on a
  // page they use for oversight. Overwatch watches the same way, and
  // answers only for a team it is actually on.
  // The teams they are on — as a preview has them, when it is one.
  const { teamIds: ownTeamIds } = useMyTeams()
  const ownDeptIds = useMemo(() => new Set(ownTeamIds), [ownTeamIds])
  const canAnswerFor = (departmentId: string) =>
    !isAdmin && (!isOverwatch || ownDeptIds.has(departmentId) || isDepartmentHead(departmentId))
  const [overrideError, setOverrideError] = useState<string | null>(null)

  /*
   * The asks that are waiting on somebody, and the ones already answered.
   *
   * RLS decides what comes back: your own, plus everything on a team you
   * lead. So the same query serves the member asking and the head
   * answering, and neither sees anything that is not theirs.
   */
  const requestsQuery = useQuery({
    queryKey: [...AVAILABILITY_REQUESTS_KEY, upcoming.map((s) => s.id).join(',')],
    queryFn: () => fetchAvailabilityRequests(upcoming.map((s) => s.id)),
    enabled: upcoming.length > 0,
  })
  const requests = requestsQuery.data ?? []
  const refreshRequests = () =>
    queryClient.invalidateQueries({ queryKey: AVAILABILITY_REQUESTS_KEY })

  const askForChange = useMutation({
    mutationFn: (fields: {
      serviceId: string
      departmentId: string
      status: AvailabilityStatus
      reason: string
    }) =>
      askToChangeAnswer({
        userId: myId!,
        serviceId: fields.serviceId,
        departmentId: fields.departmentId,
        status: fields.status,
        reason: fields.reason,
      }),
    onSuccess: () => {
      setOverrideError(null)
      return refreshRequests()
    },
    onError: (err: unknown) => setOverrideError(errorText(err, 'Could not send that request.')),
  })

  const withdrawRequest = useMutation({
    mutationFn: (id: string) => withdrawAvailabilityRequest(id),
    onSuccess: refreshRequests,
    onError: (err: unknown) => setOverrideError(errorText(err, 'Could not take that back.')),
  })

  /*
   * A head's yes is what writes the answer — a trigger does it, because by
   * now nobody may write that row by hand. So this invalidates the
   * answers as well as the asks.
   */
  const decideRequest = useMutation({
    mutationFn: (fields: { id: string; approve: boolean; note: string }) =>
      decideAvailabilityRequest({
        id: fields.id,
        approve: fields.approve,
        decidedBy: myId!,
        note: fields.note,
      }),
    onSuccess: () => {
      setOverrideError(null)
      queryClient.invalidateQueries({ queryKey: ['availability'] })
      queryClient.invalidateQueries({ queryKey: ['rota'] })
      return refreshRequests()
    },
    onError: (err: unknown) => setOverrideError(errorText(err, 'Could not answer that request.')),
  })

  const setAvailability = useMutation({
    mutationFn: async ({
      serviceId,
      departmentId,
      status,
    }: {
      serviceId: string
      departmentId: string
      status: AvailabilityStatus
    }) => {
      const { error } = await supabase.from('availability').upsert(
        { user_id: myId, service_id: serviceId, department_id: departmentId, status },
        { onConflict: 'user_id,service_id,department_id' },
      )
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['availability'] }),
  })

  /*
   * The sentence that goes with the answer.
   *
   * Written onto the answer's own row rather than anywhere new: it is
   * part of the answer, goes when the answer goes, and the head reads it
   * in the same place they read the yes. Blank clears it — the database
   * treats whitespace as nothing said.
   */
  const setNote = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase
        .from('availability')
        .update({ note: note.trim() || null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setOverrideError(null)
      return queryClient.invalidateQueries({ queryKey: ['availability'] })
    },
    onError: (err: unknown) => setOverrideError(errorText(err, 'Could not save that note.')),
  })

  // Admins don't answer for themselves here, but they do sometimes have to
  // record an answer someone gave them another way — a phone call on the
  // day — or correct one. RLS and the availability guard already allow an
  // Admin, and only an Admin, to write another person's row.
  const setForMember = useMutation({
    mutationFn: async ({
      answerId,
      userId,
      serviceId,
      departmentId,
      status,
      guest,
    }: {
      answerId: string | null
      userId: string
      serviceId: string
      departmentId: string
      status: AvailabilityStatus | null
      /** Somebody on the guest roll, whose answers are kept apart (0166). */
      guest?: boolean
    }) => {
      if (guest) return setGuestAnswer({ answerId, guestId: userId, serviceId, departmentId, status })
      if (status === null) {
        if (!answerId) return
        const { error } = await supabase.from('availability').delete().eq('id', answerId)
        if (error) throw error
        return
      }
      // An answer already given is changed, not re-added: an upsert is
      // checked as an insert too, which is the narrower "add" right, and
      // "change" is the one a Head is given (0163).
      if (answerId) {
        const { error } = await supabase.from('availability').update({ status }).eq('id', answerId)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('availability').upsert(
        { user_id: userId, service_id: serviceId, department_id: departmentId, status },
        { onConflict: 'user_id,service_id,department_id' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      setOverrideError(null)
      queryClient.invalidateQueries({ queryKey: ['availability'] })
    },
    onError: (err: unknown) => setOverrideError(errorText(err, 'Could not change that answer.')),
  })

  // The head confirms, on the day, whether each person who said yes
  // actually turned up — that's what the dashboard's attendance figure
  // counts, so it's recorded against the same answer row.
  const setAttended = useMutation({
    mutationFn: async ({ id, attended }: { id: string; attended: boolean | null }) => {
      const { error } = await supabase.from('availability').update({ attended }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['availability'] }),
  })

  const myRow = (serviceId: string, departmentId: string) =>
    (availabilityQuery.data ?? []).find(
      (a) => a.user_id === myId && a.service_id === serviceId && a.department_id === departmentId,
    ) ?? null

  const myAnswer = (serviceId: string, departmentId: string) =>
    myRow(serviceId, departmentId)?.status ?? null

  const isLoading = servicesQuery.isLoading || departmentsQuery.isLoading || ownDeptsQuery.isLoading
  const error = servicesQuery.error || departmentsQuery.error || ownDeptsQuery.error

  /**
   * One service's card.
   *
   * `inNowGroup` decides only whether it starts open — everything else
   * about the card is the same wherever it sits, which is the point: a
   * service three weeks out is answered exactly like this Sunday's.
   */
  const renderService = (service: (typeof upcoming)[number], inNowGroup: boolean) => {
    const finished = isFinished(service.id)
    /*
     * When a volunteer's own answer is due: the night before, at the
     * time the church has set.
     *
     * "Can you serve on Sunday?" is asked in advance so a rota can be
     * built out of the answers, and it used to stay open until the
     * service itself began — so a no at 09:59 for a service at 10:00 was
     * in time, which is not a deadline but the moment the head is already
     * in the hall counting heads.
     *
     * The database says the same (0092), so this is not the rule, only
     * the page's way of saying it before somebody taps a button that
     * would bounce.
     */
    const answersClose = availabilityClosesAt(
      service.date,
      settings.availability_closes_time,
      settings.timezone,
    )
    const answersClosed = answersClose.getTime() <= now
    // What opens itself, and what somebody has since touched. A service
    // is open when those two disagree: the ones needing an answer now
    // start open and close on a touch; a finished one, or one three
    // weeks out, starts closed and opens on a touch.
    const open = opensByDefault(inNowGroup, finished) !== isToggled(service.id)
    const heading = (
        <div className="flex w-full flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-headline-md">{service.service_type}</h2>
          <span className="flex items-baseline gap-2.5 text-body-sm text-on-surface-variant">
            {finished && (
              <span className="rounded-full bg-[color-mix(in_oklab,var(--color-accent-green)_16%,transparent)] px-2.5 py-1 font-mono text-label-sm uppercase tracking-wide text-accent-green-soft">
                Finished · closed
              </span>
            )}
            {/*
              The deadline, on the card rather than inside a team.

              It was written under each team's buttons, which is the one
              place it cannot be read from: it only appears once the card
              is open, once per team, and below the thing it is a deadline
              for. A volunteer scanning the page wants one answer — how
              long have I got — and it belongs beside the service's name.
              It is a clock rather than a date on purpose: on the morning
              itself, the question is whether there are twenty minutes
              left, and that changes while you read it.
            */}
            {!finished &&
              (answersClosed ? (
                <span className="rounded-full bg-raised-strong px-2.5 py-1 font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                  Answers closed
                </span>
              ) : (
                <span className="rounded-full bg-[color-mix(in_oklab,var(--color-accent-orange)_14%,transparent)] px-2.5 py-1 font-mono text-label-sm text-accent-orange-soft">
                  <ServiceCountdown
                    startsAt={answersClose.toISOString()}
                    label="to answer"
                    until="closes"
                  />
                </span>
              ))}
            <Chevron open={open} />
          </span>
        </div>
    )
    return (
    <section
      key={service.id}
      className={`rounded-[var(--radius-card)] bg-surface-lowest hairline p-6 ${
        finished ? 'opacity-70' : ''
      }`}
    >
      {/* Every card folds now, not only the finished ones: a service
        three weeks out has to be openable, and one that opens itself
        has to be closable by whoever does not want it. */}
    <button
      type="button"
      onClick={() => toggleService(service.id)}
      aria-expanded={open}
      aria-controls={`availability-teams-${service.id}`}
      className="flex w-full text-left"
    >
      {heading}
    </button>

      <div>
      {/* Which service this is, once its heading has scrolled away. */}
      {open && <FloatingServiceTitle title={service.service_type} detail={shortServiceDay(service.date)} />}
      {/* Each team is its own card, so the eye can jump to the one
          that is short rather than reading a column of bars. */}
      <ul
        id={`availability-teams-${service.id}`}
        hidden={!open}
        className="mt-5 flex flex-col gap-3">
        {myDepartments.map((dept) => {
          const mine = myAnswer(service.id, dept.id)
          const leads = ledDepartmentIds.includes(dept.id)
          // Core members are the people expected to serve, and
          // they are the denominator: a guest is not somebody the
          // team is short of.
          const onTeam = (membersQuery.data ?? []).filter(
            (m) => m.department_id === dept.id,
          )
          const coreMembers = onTeam.filter((m) => m.member_type === 'core')
          /*
           * The roll's people on the team, as people on it: core or guest
           * the same way, keyed by the guest — and a core one counts
           * towards the team like any other core member.
           */
          const rollPeople: TrackedPerson[] = (teamGuestsQuery.data ?? [])
            .filter((g) => g.department_id === dept.id)
            .map((g) => ({
              id: g.id,
              user_id: g.guest_id,
              member_type: g.member_type,
              name: g.guests?.name ?? 'Unknown',
              noAccount: true,
            }))
          const answers = allAnswers.filter(
            (a) => a.service_id === service.id && a.department_id === dept.id,
          )
          const coreIds = [
            ...coreMembers.map((m) => m.user_id),
            ...rollPeople.filter((p) => p.member_type === 'core').map((p) => p.user_id),
          ]
          const summary = availabilitySummary(coreIds, answers)
          const coreAnswered = answers.filter((a) => coreIds.includes(a.user_id)).length
          /*
           * Whether anybody can be marked present yet.
           *
           * Attendance is a fact about a morning, not a plan: before the
           * team is called in nobody has turned up, and nobody has failed
           * to. The buttons were there from the moment somebody said yes —
           * three weeks early, on a service nobody had been to — which
           * makes "no-show" a thing you can record about next month.
           *
           * The same rule and the same table as the checklist window
           * (0079): the team's own call time on the day, seven o'clock
           * when nobody has set one. Once open it stays open, because the
           * register is usually filled in after the fact.
           */
          const attendance = checklistWindow({
            serviceDate: service.date,
            departmentId: dept.id,
            callTimes,
            now,
          })
          /*
           * Every guest is listed, answered or not.
           *
           * Only a guest who had answered used to appear, so a Head
           * could neither see that a guest had not said, nor say it
           * for them. Guests come after the core team and are badged,
           * so the count above still means what it says; somebody on
           * the guest roll with no account is badged too.
           */
          const accountPeople: TrackedPerson[] = onTeam.map((m) => ({
            id: m.id,
            user_id: m.user_id,
            member_type: m.member_type,
            name: m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'Unknown',
            noAccount: false,
          }))
          const everyone = [...accountPeople, ...rollPeople]
          const guests = everyone.filter((m) => m.member_type === 'guest')
          const teamMembers = [...everyone.filter((m) => m.member_type === 'core'), ...guests]

          // A team still owed answers keeps the amber row: what
          // needs a person outranks whose team it is.
          return (
            <li
              key={dept.id}
              className={`rounded-[var(--radius-row)] px-4 py-3.5 sm:px-5 ${
                summary.noAnswer > 0
                  ? 'bg-[color-mix(in_oklab,var(--color-accent-orange)_8%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_20%,transparent)]'
                  : 'bg-raised hairline'
              }`}
              style={summary.noAnswer > 0 ? undefined : teamWash(dept.color, teamStyle)}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="flex items-center gap-2.5">
                  <TeamMark color={dept.color} />
                  <span className="text-body-md font-medium text-on-surface">{dept.name}</span>
                </div>
                <span
                  className={`font-mono text-label-sm ${
                    summary.noAnswer > 0 ? 'text-accent-orange-soft' : 'text-on-surface-faint'
                  }`}
                >
                  {summary.noAnswer > 0
                    ? `${summary.noAnswer} unanswered · ${summary.available}/${summary.total}`
                    : `${summary.pct}% available · ${summary.available}/${summary.total}`}
                  {summary.tentative > 0 && ` · ${summary.tentative} tentative`}
                </span>
              </div>

              <div
                className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-raised-strong"
                role="img"
                aria-label={`${dept.name}: ${summary.pct}% available, ${summary.tentative} tentative, ${summary.noAnswer} yet to answer`}
              >
                <div
                  className="bg-success"
                  style={{ width: `${summary.total > 0 ? (summary.available / summary.total) * 100 : 0}%` }}
                />
                <div
                  className="bg-warning"
                  style={{ width: `${summary.total > 0 ? (summary.tentative / summary.total) * 100 : 0}%` }}
                />
                <div
                  className="bg-error"
                  style={{
                    width: `${summary.total > 0 ? (summary.unavailable / summary.total) * 100 : 0}%`,
                  }}
                />
              </div>

              {/* Chasing an answer belongs beside the count of
                  answers still missing, not in a settings page:
                  this is the moment a head notices. */}
              {!finished && summary.noAnswer > 0 && can('avail.nudge', { departmentId: dept.id }) && (
                <div className="mt-3">
                  <NudgeButton
                    rpc="nudge_availability"
                    args={{ dept_id: dept.id, svc_id: service.id }}
                    nobodyLabel="Only you left to answer"
                  >
                    Remind the {summary.noAnswer} who haven&rsquo;t answered
                  </NudgeButton>
                </div>
              )}

              {canAnswerFor(dept.id) && !finished && !answersClosed && (
                <div
                  role="group"
                  aria-label={`Can you serve at ${service.service_type} for ${dept.name}?`}
                  className={`${segmentTrackClasses} mt-3 ${
                    mine
                      ? ''
                      : /* Unanswered is the state that needs chasing,
                           so the control itself asks for the tap. */
                        'shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-accent-orange)_35%,transparent)]'
                  }`}
                >
                  {STATUS_OPTIONS.map((opt) => {
                    const active = mine === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        title={opt.full}
                        aria-pressed={active}
                        onClick={() => {
                          const send = () =>
                            setAvailability.mutate({
                              serviceId: service.id,
                              departmentId: dept.id,
                              status: opt.value,
                            })
                          if (!mine || mine === opt.value) return send()
                          const was = STATUS_OPTIONS.find((o) => o.value === mine)?.full ?? mine
                          ask({
                            title: `Change your answer to “${opt.full}”?`,
                            body:
                              opt.value === 'unavailable'
                                ? `You said “${was}”. Saying you can’t make it takes you off any role you are on for this service, and your Head is told.`
                                : `You said “${was}”.`,
                            confirmLabel: 'Change answer',
                            cancelLabel: `Keep “${was}”`,
                            onConfirm: send,
                          })
                        }}
                        disabled={setAvailability.isPending}
                        // Taller than the system's 32: these are tapped standing up.
                        className={`${segmentClasses(active, opt.tone)} min-h-11 text-body-sm`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* A note only means something attached to an answer, so it
                  appears once one has been given — and stays readable
                  after the window shuts, when it is the head who needs
                  it most. */}
              {canAnswerFor(dept.id) && mine && !finished && (
                <AnswerNote
                  note={myRow(service.id, dept.id)?.note ?? null}
                  busy={setNote.isPending}
                  editable={!answersClosed}
                  onSave={(note) => {
                    const row = myRow(service.id, dept.id)
                    if (row) setNote.mutate({ id: row.id, note })
                  }}
                />
              )}

              {canAnswerFor(dept.id) && seesHistory(dept.id, myId) && (
                <AnswerHistory
                  label="Your changes"
                  whose="your answer"
                  entries={historyOf(history, myId!, service.id, dept.id)}
                />
              )}

              {/*
                How long is left to answer.
                
                A deadline nobody can see is a deadline that surprises
                people, and this one is worth a clock rather than a date:
                somebody looking at the page on the morning itself wants
                to know whether they still have twenty minutes, and the
                answer changes while they read it.
              */}
              {canAnswerFor(dept.id) && !finished && !answersClosed && (
                <p className="mt-2 text-label-sm text-on-surface-faint">
                  <ServiceCountdown
                    startsAt={answersClose.toISOString()}
                    label="left to answer"
                    until="closes"
                  />
                </p>
              )}

              {/* And what happens once it has run out: the answer is no
                  longer yours to change, but it is still yours to ask
                  about. A head's yes is what moves it. */}
              {canAnswerFor(dept.id) && answersClosed && !finished && (
                <AskToChangeAnswer
                  answered={mine}
                  pending={pendingFor(requests, myId!, service.id, dept.id)}
                  settled={settledFor(requests, myId!, service.id, dept.id)}
                  busy={askForChange.isPending || withdrawRequest.isPending}
                  onAsk={(status, reason) =>
                    askForChange.mutate({
                      serviceId: service.id,
                      departmentId: dept.id,
                      status,
                      reason,
                    })
                  }
                  onWithdraw={(id) => withdrawRequest.mutate(id)}
                />
              )}

              {canAnswerFor(dept.id) && answersClosed && finished && (
                <p className="mt-2 text-label-sm text-on-surface-faint">
                  {mine
                    ? `Answers closed the night before — you said ${statusLabel[mine].toLowerCase()}.`
                    : 'Answers closed the night before.'}
                </p>
              )}

              {/* The asks waiting on whoever leads this team. Admins see
                  them too, since they can already correct any answer. */}
              {can('avail.late_decide', { departmentId: dept.id }) && (
                <LateAnswerQueue
                  requests={pendingOn(requests, service.id, dept.id)}
                  busy={decideRequest.isPending}
                  onDecide={(id, approve, note) => decideRequest.mutate({ id, approve, note })}
                />
              )}

              {(leads || isOverwatch || can('avail.history', { departmentId: dept.id })) && teamMembers.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer font-mono text-label-sm uppercase text-on-surface-faint transition-colors duration-200 hover:text-on-surface">
                    Team responses ({coreAnswered}/{coreIds.length})
                    {guests.length > 0 && ` + ${guests.length} guest${guests.length === 1 ? '' : 's'}`}
                  </summary>
                  {/* Said once for the team rather than once per person:
                      ten names each carrying the same sentence is a wall,
                      and the fact belongs to the morning, not to anybody
                      on the list. */}
                  {!attendance.open && answers.some((a) => a.status === 'available') && (
                    <p className="mt-2 text-label-sm text-on-surface-faint">
                      Present and no-show can be marked from {attendance.clock} on{' '}
                      {formatServiceDay(service.date)}, when {dept.name} is called in.
                    </p>
                  )}

                  <ul className="mt-2 flex flex-col gap-1.5 border-l border-border-subtle pl-3">
                    {teamMembers.map((m) => {
                      const answer = answers.find((a) => a.user_id === m.user_id)
                      return (
                        <li key={m.id} className="text-body-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                              <span className="break-words text-on-surface">{m.name}</span>
                              {m.member_type === 'guest' && (
                                <span className="shrink-0 rounded-full bg-raised-strong px-1.5 py-0.5 font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
                                  Guest
                                </span>
                              )}
                              {m.noAccount && (
                                <span className="shrink-0 text-label-sm text-on-surface-faint">no account</span>
                              )}
                            </span>
                            {(answer
                              ? can('avail.edit_others', { departmentId: dept.id })
                              : can('avail.add_others', { departmentId: dept.id })) ? (
                              <Select
                                value={answer?.status ?? ''}
                                onChange={(status) =>
                                  setForMember.mutate({
                                    answerId: answer?.id ?? null,
                                    userId: m.user_id,
                                    serviceId: service.id,
                                    departmentId: dept.id,
                                    status: (status || null) as AvailabilityStatus | null,
                                    guest: m.noAccount,
                                  })
                                }
                                disabled={setForMember.isPending || finished}
                                aria-label={`Availability for ${m.name}`}
                                /* A fixed width, so a column of answers
                                   lines up instead of each pill sizing to
                                   its own word — "Yes" and "No answer"
                                   started their text in different places
                                   down the same column. Wide enough for
                                   the longest of them, so nothing
                                   truncates. */
                                className={`tap w-28 shrink-0 rounded-full hairline bg-surface-lowest px-2.5 py-1.5 font-mono text-label-sm ${
                                  answer ? statusTextClass[answer.status] : 'text-on-surface-variant'
                                }`}
                                options={[
                                  // Taking an answer away is the "add or remove" right.
                                  ...(!answer || can('avail.add_others', { departmentId: dept.id })
                                    ? [{ value: '', label: 'No answer' }]
                                    : []),
                                  ...STATUS_OPTIONS.map((opt) => ({
                                    value: opt.value,
                                    label: opt.label,
                                  })),
                                ]}
                              />
                            ) : (
                              <span
                                className={`shrink-0 font-mono text-label-sm ${
                                  answer ? statusTextClass[answer.status] : 'text-on-surface-variant'
                                }`}
                              >
                                {answer ? statusLabel[answer.status] : 'No answer'}
                              </span>
                            )}
                          </div>

                          {/* The note, where the head is already looking
                              to see who said what. */}
                          {answer?.note && (
                            <p className="mt-0.5 break-words text-label-md text-on-surface-variant">
                              <span aria-hidden="true">“</span>
                              {answer.note}
                              <span aria-hidden="true">”</span>
                            </p>
                          )}

                          {seesHistory(dept.id, m.noAccount ? undefined : m.user_id) && (
                            <AnswerHistory
                              whose={`${m.name}’s answer`}
                              entries={historyOf(history, m.user_id, service.id, dept.id)}
                            />
                          )}

                          {leads && !m.noAccount && answer?.status === 'available' && attendance.open && (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="font-mono text-label-sm text-on-surface-variant">
                                Turned up?
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setAttended.mutate({
                                    id: answer.id,
                                    attended: answer.attended === true ? null : true,
                                  })
                                }
                                className={`tap rounded-full border px-2.5 py-1 text-label-sm ${
                                  answer.attended === true
                                    ? 'border-success bg-success/10 font-medium text-success'
                                    : 'border-border-subtle text-on-surface hover:border-secondary'
                                }`}
                              >
                                Present
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setAttended.mutate({
                                    id: answer.id,
                                    attended: answer.attended === false ? null : false,
                                  })
                                }
                                className={`tap rounded-full border px-2.5 py-1 text-label-sm ${
                                  answer.attended === false
                                    ? 'border-error bg-error/10 font-medium text-error'
                                    : 'border-border-subtle text-on-surface hover:border-secondary'
                                }`}
                              >
                                No-show
                              </button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </details>
              )}
            </li>
          )
        })}
      </ul>
      </div>
    </section>
    )
  }


  return (
    <div>
      {dialog}
      <PageHeader
        eyebrow={seesAllTeams ? 'All teams' : 'Your answers'}
        title={seesAllTeams ? 'Availability Tracker' : 'Can you serve?'}
        description={
          isAdmin
            ? 'Who can serve at the services coming up, team by team.'
            : 'One tap per service. Your team sees the answer straight away.'
        }
      />
      <Lifespan page="availability" className="mb-4" />

      {overrideError && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {overrideError}
        </p>
      )}

      <QueryState isLoading={isLoading} error={error}>
        {upcoming.length === 0 ? (
          <p className="mt-6 text-body-sm text-on-surface-variant">
            No upcoming services scheduled yet — check back soon.
          </p>
        ) : myDepartments.length === 0 ? (
          <p className="mt-6 text-body-sm text-on-surface-variant">
            You're not on a team yet — an Admin can add you to one.
          </p>
        ) : (
          <ServiceSections
            sections={sections}
            finishedId="finished-availability"
            empty="Every service in the window is over. What was answered is under Finished services."
            render={(list) => (
              <div className="flex flex-col gap-6">
                {daysOf(list).map((day) => (
                  <section key={day.date} aria-label={formatServiceDay(day.date)}>
                    <DayHeading date={day.date} today={today} count={day.services.length} />
                    <div className="mt-3 flex flex-col gap-4">
                      {day.services.map((service) => renderService(service, service.id === nextId))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          />
        )}
      </QueryState>
    </div>
  )
}
