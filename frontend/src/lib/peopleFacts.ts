import { supabase } from './supabaseClient'
import type { PersonFacts } from './personAccess'

/**
 * What the rules ask about people — their standings, teams and rota
 * places — read as an Admin reads them. By person asks it of one person;
 * the change preview (Phase 3) of everybody at once.
 */

/** The rota's Team Coordinator, as may() reads the label (0207): trimmed, in either case. */
export const COORDINATOR_LABELS = ['coordinator', 'team coordinator']

export interface RoleRow {
  user_id?: string
  role_type: string
  department_id: string | null
}
export interface RosterRow {
  user_id?: string
  department_id: string
  member_type?: string
}
export interface RotaRow {
  user_id?: string
  department_id: string
  role_label: string
}

/** One person's facts, from rows that are theirs. */
export function factsOf(
  id: string,
  roles: readonly RoleRow[],
  rosters: readonly RosterRow[],
  rota: readonly RotaRow[],
  ownerId: string | null,
): PersonFacts {
  const teamsFor = (type: string) => roles.filter((g) => g.role_type === type && g.department_id).map((g) => g.department_id as string)
  const coordinating = rota.filter((a) => COORDINATOR_LABELS.includes(a.role_label.trim().toLowerCase()))
  return {
    id,
    owner: ownerId === id,
    admin: roles.some((g) => g.role_type === 'admin'),
    overwatch: roles.some((g) => g.role_type === 'overwatch'),
    pastor: roles.some((g) => g.role_type === 'pastor'),
    headTeams: teamsFor('department_head'),
    assistTeams: teamsFor('assisting_head'),
    memberTeams: rosters.map((m) => m.department_id),
    coordinatorTeams: [...new Set(coordinating.map((a) => a.department_id))],
  }
}

export interface PersonEntry {
  id: string
  name: string
  facts: PersonFacts
}

/** Everybody, with their facts, for asking what a change would do to each. */
export async function fetchEveryonesFacts(): Promise<PersonEntry[]> {
  const [people, roles, rosters, rota, owner] = await Promise.all([
    supabase.from('profiles').select('id, first_name, last_name'),
    supabase.from('user_roles').select('user_id, role_type, department_id'),
    supabase.from('department_members').select('user_id, department_id'),
    supabase.from('rota_assignments').select('user_id, department_id, role_label').ilike('role_label', '%coordinator%'),
    supabase.from('app_owner').select('user_id').maybeSingle(),
  ])
  for (const r of [people, roles, rosters, rota, owner]) if (r.error) throw r.error
  const ownerId = (owner.data as { user_id?: string } | null)?.user_id ?? null
  const mine = <T extends { user_id?: string }>(rows: T[] | null, id: string) => (rows ?? []).filter((r) => r.user_id === id)
  return ((people.data ?? []) as { id: string; first_name: string | null; last_name: string | null }[])
    .map((p) => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Somebody',
      facts: factsOf(
        p.id,
        mine(roles.data as RoleRow[] | null, p.id),
        mine(rosters.data as RosterRow[] | null, p.id),
        mine(rota.data as RotaRow[] | null, p.id),
        ownerId,
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
