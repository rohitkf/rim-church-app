import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useAppSettings } from '../lib/appSettings'
import { useMyTeams } from '../lib/useMyTeams'
import { useErrorText } from '../lib/useErrorText'
import { fetchDepartments, fetchServices } from '../lib/queries'
import { formatRelativeTime } from '../lib/relativeTime'
import { formatServiceDay } from '../lib/sunday'
import { todayIso } from '../lib/monthGrid'
import { shiftIsoDays } from '../lib/rotaWindow'
import {
  ISSUES_KEY,
  fetchIssues,
  mayRaiseIssue,
  mayResolveIssue,
  splitIssues,
  type Issue,
} from '../lib/issues'
import { QueryState } from '../components/QueryState'
import { ActionButton, Field, PageHeader, Pill, Tile, inputClasses } from '../components/Surface'
import { Select } from '../components/Select'
import { TeamMark } from '../components/TeamMark'
import { Lifespan } from '../components/Lifespan'
import { FinishedServices } from '../components/FinishedServices'
import { useConfirmAction } from '../components/ConfirmAction'

/**
 * Issues.
 *
 * What somebody noticed at a service that a team needs to fix — the mic
 * that crackled, the slide that would not advance — written down against
 * the service and the team it is for, with who raised it and their team.
 * The team it is for is told (bell and phone), and whoever on it deals
 * with it marks it done, with their own name on that.
 *
 * Who may raise one is App settings' call; the database (0117) holds the
 * same rule, and decides who may mark one done.
 */
export function IssuesPage() {
  const { session, isAdmin, ledDepartmentIds } = useAuth()
  const settings = useAppSettings()
  const { teamIds, onATeam, settled } = useMyTeams()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const openedId = params.get('issue')
  const myId = session?.user.id ?? null
  const [error, setError] = useState<string | null>(null)
  const [mineOnly, setMineOnly] = useState(false)
  const { ask, dialog } = useConfirmAction()

  const myTeamIds = useMemo(() => [...new Set([...teamIds, ...ledDepartmentIds])], [teamIds, ledDepartmentIds])
  const canRaise = mayRaiseIssue(settings.issues_raise_scope, {
    isAdmin,
    onATeam,
    leadsATeam: ledDepartmentIds.length > 0,
  })

  // Seen by anybody on a team, and by everybody once App settings let
  // everybody raise them; anybody else is sent back to the dashboard.
  const mayView = onATeam || settings.issues_raise_scope === 'everyone'

  const issuesQuery = useQuery({ queryKey: ISSUES_KEY, queryFn: fetchIssues, enabled: mayView })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const departments = departmentsQuery.data ?? []

  const shown = useMemo(() => {
    const all = issuesQuery.data ?? []
    return mineOnly ? all.filter((i) => myTeamIds.includes(i.department_id)) : all
  }, [issuesQuery.data, mineOnly, myTeamIds])
  const { open, resolved } = splitIssues(shown)

  // A tap on the notification lands on the issue it was about.
  useEffect(() => {
    if (!openedId || !issuesQuery.data) return
    document.getElementById(`issue-${openedId}`)?.scrollIntoView?.({ block: 'center' })
  }, [openedId, issuesQuery.data])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ISSUES_KEY })

  const resolve = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error: e } = await supabase.rpc('resolve_issue', { issue: id, done })
      if (e) throw e
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not change that issue.')),
  })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await supabase.from('service_issues').delete().eq('id', id)
      if (e) throw e
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that issue.')),
  })

  const renderIssue = (issue: Issue) => {
    const canResolve = mayResolveIssue(issue, { isAdmin, myTeamIds })
    const canDelete = isAdmin || issue.raised_by === myId
    const raiser = issue.raiser ? `${issue.raiser.first_name} ${issue.raiser.last_name}` : 'Somebody'
    return (
      <li key={issue.id} id={`issue-${issue.id}`}>
        <Tile className={openedId === issue.id ? 'ring-2 ring-primary/50' : ''}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 text-label-md font-medium text-on-surface">
              <TeamMark color={issue.team?.color ?? null} />
              For {issue.team?.name ?? 'a team'}
            </span>
            {issue.resolved_at ? <Pill tone="green">Resolved</Pill> : <Pill tone="orange">Open</Pill>}
          </div>
          <h2 className="mt-2 break-words text-body-lg font-medium text-on-surface">{issue.title}</h2>
          {issue.details && (
            <p className="mt-1 whitespace-pre-line break-words text-body-sm text-on-surface-variant">
              {issue.details}
            </p>
          )}
          <p className="mt-3 text-label-md text-on-surface-variant">
            Raised by <span className="font-medium text-on-surface">{raiser}</span>
            {issue.raiser_team && <> · {issue.raiser_team.name}</>} · {formatRelativeTime(issue.created_at)}
          </p>
          {issue.service && (
            <p className="mt-0.5 font-mono text-label-sm text-on-surface-faint">
              {issue.service.service_type} · {formatServiceDay(issue.service.date)}
            </p>
          )}
          {issue.resolved_at && (
            <p className="mt-2 text-label-md text-accent-green">
              Marked done by{' '}
              <span className="font-medium">
                {issue.resolver ? `${issue.resolver.first_name} ${issue.resolver.last_name}` : 'somebody'}
              </span>{' '}
              · {formatRelativeTime(issue.resolved_at)}
            </p>
          )}

          {(canResolve || canDelete) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {canResolve &&
                (issue.resolved_at ? (
                  <ActionButton
                    size="sm"
                    tone="ghost"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: issue.id, done: false })}
                  >
                    Reopen
                  </ActionButton>
                ) : (
                  <ActionButton
                    size="sm"
                    tone="success"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: issue.id, done: true })}
                  >
                    Mark done
                  </ActionButton>
                ))}
              {canDelete && (
                <ActionButton
                  size="sm"
                  tone="danger-quiet"
                  aria-label={`Delete issue: ${issue.title}`}
                  onClick={() =>
                    ask({
                      title: 'Delete this issue?',
                      body: (
                        <>
                          <strong>{issue.title}</strong> goes for everybody, done or not.
                        </>
                      ),
                      onConfirm: () => remove.mutate(issue.id),
                    })
                  }
                >
                  Delete
                </ActionButton>
              )}
            </div>
          )}
        </Tile>
      </li>
    )
  }

  if (settled && !mayView) return <Navigate to="/" replace />

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        eyebrow="Seen at a service"
        title="Issues"
        description="Something a team needs to put right — who noticed it, and who dealt with it."
      />
      <Lifespan page="issues" className="mb-4" />

      {canRaise && (
        <RaiseIssueForm
          departments={departments}
          myTeamIds={myTeamIds}
          onRaised={invalidate}
          onError={setError}
        />
      )}

      {error && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      {myTeamIds.length > 0 && (
        <div className="mt-6 flex gap-1 rounded-full bg-inset p-1 hairline" role="group" aria-label="Which issues">
          {[
            { mine: false, label: 'All teams' },
            { mine: true, label: 'For my teams' },
          ].map((c) => (
            <button
              key={c.label}
              type="button"
              aria-pressed={mineOnly === c.mine}
              onClick={() => setMineOnly(c.mine)}
              className={`tap flex-1 rounded-full px-3 py-1.5 text-label-md transition-colors ${
                mineOnly === c.mine ? 'bg-primary font-medium text-on-primary' : 'text-on-surface-variant'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <QueryState
        isLoading={issuesQuery.isLoading}
        error={issuesQuery.error}
        isEmpty={false}
      >
        <section aria-label="Open issues" className="mt-6">
          <h2 className="font-mono text-label-md uppercase tracking-[0.14em] text-on-surface">
            Open · {open.length}
          </h2>
          {open.length === 0 ? (
            <p className="mt-3 text-body-sm text-on-surface-variant">Nothing open — every issue raised has been dealt with.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-4">{open.map(renderIssue)}</ul>
          )}
        </section>

        {resolved.length > 0 && (
          <div className="mt-8">
            <FinishedServices count={resolved.length} id="resolved-issues" label="Resolved">
              <ul className="flex flex-col gap-4">{resolved.map(renderIssue)}</ul>
            </FinishedServices>
          </div>
        )}
      </QueryState>

      {dialog}
    </div>
  )
}

/** Raising one: which service, which team it is for, what is wrong. */
function RaiseIssueForm({
  departments,
  myTeamIds,
  onRaised,
  onError,
}: {
  departments: { id: string; name: string }[]
  myTeamIds: string[]
  onRaised: () => void
  onError: (message: string | null) => void
}) {
  const errorText = useErrorText()
  const today = todayIso()
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })

  // The services an issue is likely about: the last fortnight and the
  // three weeks ahead, nearest to today first.
  const services = useMemo(() => {
    const from = shiftIsoDays(today, -14)
    const to = shiftIsoDays(today, 21)
    return (servicesQuery.data ?? [])
      .filter((s) => s.date >= from && s.date <= to)
      .sort(
        (a, b) =>
          Math.abs(Date.parse(a.date) - Date.parse(today)) - Math.abs(Date.parse(b.date) - Date.parse(today)) ||
          a.service_type.localeCompare(b.service_type),
      )
  }, [servicesQuery.data, today])

  const myTeams = departments.filter((d) => myTeamIds.includes(d.id))
  const [serviceId, setServiceId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [asTeam, setAsTeam] = useState('')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [note, setNote] = useState<string | null>(null)

  const chosenService = serviceId || services[0]?.id || ''
  // Somebody on one team raises as that team without being asked.
  const chosenAsTeam = asTeam || (myTeams.length === 1 ? myTeams[0].id : '')

  const raise = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('raise_issue', {
        service: chosenService,
        team: teamId,
        title: title.trim(),
        details: details.trim() || null,
        as_team: chosenAsTeam || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setTitle('')
      setDetails('')
      onError(null)
      const team = departments.find((d) => d.id === teamId)?.name ?? 'the team'
      setNote(`Raised — ${team} has been told.`)
      onRaised()
    },
    onError: (err: unknown) => {
      setNote(null)
      onError(errorText(err, 'That issue did not go through.'))
    },
  })

  const ready = !!chosenService && !!teamId && title.trim().length > 0 && !raise.isPending

  function submit(e: FormEvent) {
    e.preventDefault()
    if (ready) raise.mutate()
  }

  return (
    <Tile as="section">
      <form onSubmit={submit} aria-label="Raise an issue" className="flex flex-col gap-4">
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="font-mono text-label-sm uppercase tracking-[0.12em] text-on-surface-variant">At which service</span>
            <Select
              aria-label="Service"
              value={chosenService}
              onChange={setServiceId}
              placeholder={servicesQuery.isLoading ? 'Loading…' : 'No services nearby'}
              options={services.map((s) => ({
                value: s.id,
                label: `${s.service_type} · ${formatServiceDay(s.date)}`,
              }))}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="font-mono text-label-sm uppercase tracking-[0.12em] text-on-surface-variant">Which team it is for</span>
            <Select
              aria-label="Team it is for"
              value={teamId}
              onChange={setTeamId}
              placeholder="Choose a team…"
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>
        </div>
        <Field label="What is wrong">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 200))}
            placeholder="Mic 2 crackles when it moves"
            className={inputClasses}
          />
        </Field>
        <Field label="More detail (optional)">
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value.slice(0, 2000))}
            rows={3}
            placeholder="Left side of the stage, during worship."
            className={inputClasses}
          />
        </Field>
        {myTeams.length > 1 && (
          <div className="flex min-w-0 flex-col gap-2">
            <span className="font-mono text-label-sm uppercase tracking-[0.12em] text-on-surface-variant">Raised as</span>
            <Select
              aria-label="Raised as"
              value={chosenAsTeam}
              onChange={setAsTeam}
              placeholder="Which of your teams?"
              options={myTeams.map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-label-sm text-on-surface-faint">
            Your name{chosenAsTeam ? ' and team' : ''} go on it, and the team it is for is told — bell and phone.
          </p>
          <ActionButton type="submit" disabled={!ready}>
            {raise.isPending ? 'Raising…' : 'Raise issue'}
          </ActionButton>
        </div>
        {note && <p className="text-body-sm text-accent-green">{note}</p>}
      </form>
    </Tile>
  )
}
