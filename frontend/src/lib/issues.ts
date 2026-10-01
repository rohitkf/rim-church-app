import { z } from 'zod'
import { supabase } from './supabaseClient'
import type { AppSettings } from './appSettings'

/** The Issues page's one query, kept live by lib/liveTables. */
export const ISSUES_KEY = ['issues']

/** A Head's verdict on an issue (0118). Null while nobody has ruled. */
export const ISSUE_OUTCOMES = ['resolved', 'not_resolved', 'persistent'] as const
export type IssueOutcome = (typeof ISSUE_OUTCOMES)[number]

export const OUTCOME_LABEL: Record<IssueOutcome, string> = {
  resolved: 'Resolved',
  not_resolved: 'Not resolved',
  persistent: 'Persistent',
}

const person = z.object({ first_name: z.string(), last_name: z.string() }).nullable().default(null)
const team = z.object({ id: z.string(), name: z.string(), color: z.string().nullable() }).nullable().default(null)

export const issueSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  department_id: z.string(),
  title: z.string(),
  details: z.string().nullable(),
  raised_by: z.string().nullable(),
  raised_by_department_id: z.string().nullable(),
  created_at: z.string(),
  outcome: z.enum(ISSUE_OUTCOMES).nullable(),
  remarks: z.string().nullable(),
  marked_at: z.string().nullable(),
  marked_by: z.string().nullable(),
  team,
  raiser_team: team,
  raiser: person,
  marker: person,
})
export type Issue = z.infer<typeof issueSchema>

export async function fetchIssues(): Promise<Issue[]> {
  const { data, error } = await supabase
    .from('service_issues')
    .select(
      'id, service_id, department_id, title, details, raised_by, raised_by_department_id, created_at, ' +
        'outcome, remarks, marked_at, marked_by, ' +
        'team:departments!service_issues_department_id_fkey(id, name, color), ' +
        'raiser_team:departments!service_issues_raised_by_department_id_fkey(id, name, color), ' +
        'raiser:profiles!service_issues_raised_by_fkey(first_name, last_name), ' +
        'marker:profiles!service_issues_marked_by_fkey(first_name, last_name)',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return z.array(issueSchema).parse(data)
}

/**
 * Whether this person may raise an issue — the same rule as the
 * database's may_raise_issue, so the page offers the form only to those
 * whose press would be accepted.
 */
export function mayRaiseIssue(
  scope: AppSettings['issues_raise_scope'],
  who: { isAdmin: boolean; onATeam: boolean; leadsATeam: boolean },
): boolean {
  if (scope === 'everyone') return true
  if (scope === 'leads') return who.isAdmin || who.leadsATeam
  return who.onATeam
}

/** Whether this person may give a verdict: a Head of the team it is for, or an Admin. */
export function mayMarkIssue(
  issue: Pick<Issue, 'department_id'>,
  who: { isAdmin: boolean; ledTeamIds: readonly string[] },
): boolean {
  return who.isAdmin || who.ledTeamIds.includes(issue.department_id)
}

/**
 * Whether this person may delete it: an Admin always; whoever raised it
 * only until a Head has marked it — after that it is a record.
 */
export function mayDeleteIssue(
  issue: Pick<Issue, 'raised_by' | 'outcome'>,
  who: { isAdmin: boolean; myId: string | null },
): boolean {
  return who.isAdmin || (issue.outcome === null && who.myId !== null && issue.raised_by === who.myId)
}

/**
 * Whether this person raises issues free of the window: an Admin, or a
 * Head or Assisting Head of any team — the database's
 * raises_issues_any_time (0119).
 */
export function raisesIssuesAnyTime(who: { isAdmin: boolean; leadsATeam: boolean }): boolean {
  return who.isAdmin || who.leadsATeam
}

export type IssueWindowState = 'unplanned' | 'before' | 'open' | 'closed'

export interface IssueWindow {
  state: IssueWindowState
  /** Epoch ms; null when the service has no running order. */
  opensAt: number | null
  closesAt: number | null
}

/**
 * When issues may be raised for a service: from `issue_open_minutes_before`
 * its start until `issue_close_minutes_after` its end — the database's
 * issue_window (0118), worked out on the same clock as useFinishedServices.
 */
export function issueWindow(
  startsAt: number | null,
  endsAt: number | null,
  settings: Pick<AppSettings, 'issue_open_minutes_before' | 'issue_close_minutes_after'>,
  now: number,
): IssueWindow {
  if (startsAt === null || endsAt === null) return { state: 'unplanned', opensAt: null, closesAt: null }
  const opensAt = startsAt - settings.issue_open_minutes_before * 60_000
  const closesAt = endsAt + settings.issue_close_minutes_after * 60_000
  const state = now < opensAt ? 'before' : now > closesAt ? 'closed' : 'open'
  return { state, opensAt, closesAt }
}

/** Open ones first, newest first; then the ruled ones, most recently marked first. */
export function orderIssues(issues: Issue[]): Issue[] {
  const open = issues.filter((i) => i.outcome === null)
  const marked = issues
    .filter((i) => i.outcome !== null)
    .sort((a, b) => (b.marked_at ?? '').localeCompare(a.marked_at ?? ''))
  return [...open, ...marked]
}
