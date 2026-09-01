import { z } from 'zod'
import { supabase } from './supabaseClient'
import {
  availabilityRowSchema,
  departmentMemberRowSchema,
  departmentRoleSchema,
  departmentSchema,
  joinRequestSchema,
  roleChecklistItemSchema,
  rotaAssignmentSchema,
  rotaProgressSchema,
  serviceSchema,
  serviceTemplateSchema,
  templateSessionSchema,
  type AvailabilityRow,
  type Department,
  type DepartmentMemberRow,
  type DepartmentRole,
  type JoinRequest,
  type RoleChecklistItem,
  type RotaAssignment,
  type RotaProgress,
  type Service,
  type ServiceTemplate,
  type TemplateSession,
} from './types'

/** Shared, Zod-validated queries reused across several index pages
 * (Checklists, Dashboard, Departments, Inventory, Service Planner) —
 * previously each page had its own copy of the same fetch. */

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase.from('departments').select('*').order('name')
  if (error) throw error
  return z.array(departmentSchema).parse(data)
}

export async function fetchServices(): Promise<Service[]> {
  const { data, error } = await supabase.from('services').select('*').order('date', { ascending: false })
  if (error) throw error
  return z.array(serviceSchema).parse(data)
}

/** Roster rows for several departments at once. RLS narrows this to the
 * departments the caller may see, so a plain member gets only their own. */
export async function fetchMembersForDepartments(departmentIds: string[]): Promise<DepartmentMemberRow[]> {
  if (departmentIds.length === 0) return []
  const { data, error } = await supabase
    .from('department_members')
    .select('*, profiles(id, first_name, last_name, email, phone, avatar_url)')
    .in('department_id', departmentIds)
  if (error) throw error
  return z.array(departmentMemberRowSchema).parse(data)
}

/** The roles a set of departments fill, for the rota's role pickers. */
export async function fetchDepartmentRoles(departmentIds: string[]): Promise<DepartmentRole[]> {
  if (departmentIds.length === 0) return []
  const { data, error } = await supabase
    .from('department_roles')
    .select('id, department_id, name, sort_order')
    .in('department_id', departmentIds)
    // Hand-set first, name only to break a tie: a team that has never
    // reordered its roles still reads alphabetically.
    .order('sort_order')
    .order('name')
  if (error) throw error
  return z.array(departmentRoleSchema).parse(data)
}

/** The standing checklist items for a set of departments' roles. */
export async function fetchRoleChecklistItems(departmentIds: string[]): Promise<RoleChecklistItem[]> {
  if (departmentIds.length === 0) return []
  const { data, error } = await supabase
    .from('department_role_checklist_items')
    .select('id, role_id, department_id, label, sort_order, phase')
    .in('department_id', departmentIds)
    // Ordered within a phase here; the two phases are separated where they
    // are shown, because "post" sorts before "pre" alphabetically and the
    // service does not run in that order.
    .order('sort_order')
  if (error) throw error
  return z.array(roleChecklistItemSchema).parse(data)
}

/** Who the rota puts on each service, with the role they were given. */
export async function fetchRotaAssignments(serviceIds: string[]): Promise<RotaAssignment[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('rota_assignments')
    .select(
      'id, service_id, department_id, user_id, role_label, role_id, profile:profiles!rota_assignments_user_id_fkey(id, first_name, last_name), department:departments(id, name, color)',
    )
    .in('service_id', serviceIds)
    .order('role_label')
  if (error) throw error
  return z.array(rotaAssignmentSchema).parse(data)
}

/** Progress on those items for a set of rota assignments. */
export async function fetchRotaProgress(assignmentIds: string[]): Promise<RotaProgress[]> {
  if (assignmentIds.length === 0) return []
  const { data, error } = await supabase
    .from('rota_checklist_progress')
    .select('id, assignment_id, item_id, status')
    .in('assignment_id', assignmentIds)
  if (error) throw error
  return z.array(rotaProgressSchema).parse(data)
}

/** Availability answers for several services at once. */
export async function fetchAvailabilityFor(serviceIds: string[]): Promise<AvailabilityRow[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase.from('availability').select('*').in('service_id', serviceIds)
  if (error) throw error
  return z.array(availabilityRowSchema).parse(data)
}

export const profileSearchResultSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string(),
})
export type ProfileSearchResult = z.infer<typeof profileSearchResultSchema>

/** Registered people whose name or email contains `term`, for type-ahead. */
export async function searchProfiles(term: string, limit = 8): Promise<ProfileSearchResult[]> {
  const q = term.trim()
  if (!q) return []
  // Commas and parens would be read as PostgREST filter syntax inside or().
  const safe = q.replace(/[,()]/g, ' ')
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email')
    .or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%`)
    .order('first_name')
    .limit(limit)
  if (error) throw error
  return z.array(profileSearchResultSchema).parse(data)
}

/** Department ids the user is a member of (core or guest). */
export async function fetchOwnDepartmentIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('department_members').select('department_id').eq('user_id', userId)
  if (error) throw error
  return z
    .array(z.object({ department_id: z.string() }))
    .parse(data)
    .map((r) => r.department_id)
}

/** Own memberships with their kind, for anywhere core and guest differ. */
export async function fetchOwnMemberships(
  userId: string,
): Promise<{ department_id: string; member_type: 'core' | 'guest' }[]> {
  const { data, error } = await supabase
    .from('department_members')
    .select('department_id, member_type')
    .eq('user_id', userId)
  if (error) throw error
  return z
    .array(z.object({ department_id: z.string(), member_type: z.enum(['core', 'guest']) }))
    .parse(data)
}

export async function fetchServiceTemplates(): Promise<ServiceTemplate[]> {
  const { data, error } = await supabase.from('service_templates').select('*').order('name')
  if (error) throw error
  return z.array(serviceTemplateSchema).parse(data)
}

export async function fetchTemplateSessions(templateId: string): Promise<TemplateSession[]> {
  const { data, error } = await supabase
    .from('service_template_sessions')
    .select('*')
    .eq('template_id', templateId)
    .order('order_index')
  if (error) throw error
  return z.array(templateSessionSchema).parse(data)
}

/**
 * Requests to join a team.
 *
 * RLS decides who sees what: your own asks always, plus — for a head — the
 * ones addressed to the team they lead, plus everything for an Admin. So
 * the same query serves the volunteer's "waiting on the head" chip and the
 * head's inbox; the caller narrows by user_id when it wants only its own.
 */
export async function fetchJoinRequests(opts?: {
  userId?: string
  status?: 'pending'
}): Promise<JoinRequest[]> {
  let query = supabase
    .from('team_join_requests')
    .select(
      '*, requester:profiles!team_join_requests_user_id_fkey(id, first_name, last_name, avatar_url), department:departments(id, name, color)',
    )
    .order('created_at', { ascending: false })
  if (opts?.userId) query = query.eq('user_id', opts.userId)
  if (opts?.status) query = query.eq('status', opts.status)
  const { data, error } = await query
  if (error) throw error
  return z.array(joinRequestSchema).parse(data)
}
