import { z } from 'zod'
import { supabase } from './supabaseClient'
import type { AppSettings } from './appSettings'

/** The Issues page's one query, kept live by lib/liveTables. */
export const ISSUES_KEY = ['issues']

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
  resolved_at: z.string().nullable(),
  resolved_by: z.string().nullable(),
  service: z.object({ date: z.string(), service_type: z.string() }).nullable().default(null),
  team,
  raiser_team: team,
  raiser: person,
  resolver: person,
})
export type Issue = z.infer<typeof issueSchema>

export async function fetchIssues(): Promise<Issue[]> {
  const { data, error } = await supabase
    .from('service_issues')
    .select(
      'id, service_id, department_id, title, details, raised_by, raised_by_department_id, created_at, resolved_at, resolved_by, ' +
        'service:services(date, service_type), ' +
        'team:departments!service_issues_department_id_fkey(id, name, color), ' +
        'raiser_team:departments!service_issues_raised_by_department_id_fkey(id, name, color), ' +
        'raiser:profiles!service_issues_raised_by_fkey(first_name, last_name), ' +
        'resolver:profiles!service_issues_resolved_by_fkey(first_name, last_name)',
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

/** Whether this person may mark this issue done: the team it is for, its Heads, an Admin. */
export function mayResolveIssue(
  issue: Pick<Issue, 'department_id'>,
  who: { isAdmin: boolean; myTeamIds: readonly string[] },
): boolean {
  return who.isAdmin || who.myTeamIds.includes(issue.department_id)
}

/** Open first, newest first; then resolved, most recently resolved first. */
export function splitIssues(issues: Issue[]): { open: Issue[]; resolved: Issue[] } {
  const open = issues.filter((i) => !i.resolved_at)
  const resolved = issues
    .filter((i) => !!i.resolved_at)
    .sort((a, b) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? ''))
  return { open, resolved }
}
