import { z } from 'zod'
import { supabase } from './supabaseClient'
import { todayIso } from './monthGrid'

/**
 * Permanent people on a role (0282).
 *
 * A team's role can name who holds it as a matter of course — at every
 * service, or at one kind of service. The database puts them on the rota
 * of each service still to come, as an ordinary assignment, when the
 * service is made and when they are made permanent; never over a "can't
 * serve", never over a role they already hold there. Taken off one
 * Sunday's rota they stay off that Sunday.
 *
 * This is the reading and the two calls. Who may, and what happens to the
 * rota, is the database's: `set_role_permanent` and `remove_role_permanent`.
 */

const personSchema = z.object({ id: z.string(), first_name: z.string(), last_name: z.string() })

export const rolePermanentSchema = z.object({
  id: z.string(),
  role_id: z.string(),
  department_id: z.string(),
  user_id: z.string(),
  /** Null is every service; otherwise the kind of service, as a service is named. */
  service_type: z.string().nullable(),
  person: personSchema.nullable(),
})
export type RolePermanent = z.infer<typeof rolePermanentSchema>

/** The query key for a team's permanent people; the live table refreshes it. */
export const ROLE_PERMANENTS_KEY = ['role-permanents'] as const

/** Everybody permanent on a role of these teams, oldest arrangement first. */
export async function fetchRolePermanents(departmentIds: string[]): Promise<RolePermanent[]> {
  if (departmentIds.length === 0) return []
  const { data, error } = await supabase
    .from('department_role_permanents')
    .select(
      'id, role_id, department_id, user_id, service_type, person:profiles!department_role_permanents_user_id_fkey(id, first_name, last_name)',
    )
    .in('department_id', departmentIds)
    .order('created_at')
  if (error) throw error
  return z.array(rolePermanentSchema).parse(data ?? [])
}

export interface TeamPerson {
  id: string
  name: string
}

/** The people on a team, by name: who can be made permanent on one of its roles. */
export async function fetchTeamPeople(departmentId: string): Promise<TeamPerson[]> {
  const { data, error } = await supabase
    .from('department_members')
    .select('user_id, profiles(id, first_name, last_name)')
    .eq('department_id', departmentId)
  if (error) throw error
  const rows = z.array(z.object({ user_id: z.string(), profiles: personSchema.nullable() })).parse(data ?? [])
  return rows
    .map((r) => ({ id: r.user_id, name: personName(r.profiles) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The kinds of service still to come ("English Service", "Malayalam Service"). */
export async function fetchServiceKinds(): Promise<string[]> {
  const { data, error } = await supabase.from('services').select('service_type').gte('date', todayIso())
  if (error) throw error
  return serviceKinds(z.array(z.object({ service_type: z.string() })).parse(data ?? []).map((s) => s.service_type))
}

/**
 * Make somebody permanent on a role, or change which services they are
 * permanent at. Answers how many services still to come they were put on.
 */
export async function setRolePermanent(roleId: string, userId: string, serviceType: string | null): Promise<number> {
  const { data, error } = await supabase.rpc('set_role_permanent', {
    p_role: roleId,
    p_person: userId,
    p_service_type: serviceType,
  })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

/** End it. Answers how many services still to come they were taken off. */
export async function removeRolePermanent(roleId: string, userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('remove_role_permanent', { p_role: roleId, p_person: userId })
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

export const EVERY_SERVICE = 'Every service'

export function personName(person: { first_name: string; last_name: string } | null | undefined): string {
  return `${person?.first_name ?? ''} ${person?.last_name ?? ''}`.trim() || 'Somebody'
}

/**
 * The kinds of service on offer: each once, however it was capitalised or
 * spaced, in the first spelling met, A to Z. `also` is a kind already
 * chosen for somebody, kept on the list though no such service is planned.
 */
export function serviceKinds(types: string[], also: (string | null)[] = []): string[] {
  const seen = new Map<string, string>()
  for (const raw of [...types, ...also]) {
    const kind = (raw ?? '').trim()
    if (kind && !seen.has(kind.toLowerCase())) seen.set(kind.toLowerCase(), kind)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** "Every service", or the kind of service somebody is permanent at. */
export function atWords(serviceType: string | null): string {
  return serviceType?.trim() || EVERY_SERVICE
}

/** One line for a role's row: "Joel Skaria · Ama Owusu (English Service)". */
export function permanentLine(people: RolePermanent[]): string {
  return people.map((p) => personName(p.person) + (p.service_type ? ` (${p.service_type.trim()})` : '')).join(' · ')
}

const services = (n: number) => `${n} ${n === 1 ? 'service' : 'services'}`

/** What making somebody permanent did to the rota, said once it is done. */
export function madeWords(name: string, role: string, added: number): string {
  return added > 0
    ? `${name} is permanent on ${role}: on the rota for ${services(added)} to come`
    : `${name} is permanent on ${role}. No service to come needed changing`
}

/** What changing which services did. */
export function changedWords(name: string, at: string | null, added: number): string {
  const where = at ? `at ${at.trim()} only` : 'at every service'
  return added > 0 ? `${name} is now permanent ${where}: added to ${services(added)} to come` : `${name} is now permanent ${where}`
}

/** What ending it did. */
export function endedWords(name: string, role: string, freed: number): string {
  return freed > 0
    ? `${name} is no longer permanent on ${role}: off ${services(freed)} to come`
    : `${name} is no longer permanent on ${role}`
}
