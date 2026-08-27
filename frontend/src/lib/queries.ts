import { z } from 'zod'
import { supabase } from './supabaseClient'
import {
  departmentSchema,
  serviceSchema,
  serviceTemplateSchema,
  templateSessionSchema,
  type Department,
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

/** Department ids the user is a member of (core or guest). */
export async function fetchOwnDepartmentIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('department_members').select('department_id').eq('user_id', userId)
  if (error) throw error
  return z
    .array(z.object({ department_id: z.string() }))
    .parse(data)
    .map((r) => r.department_id)
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
