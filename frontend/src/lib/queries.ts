import { z } from 'zod'
import { supabase } from './supabaseClient'
import { departmentSchema, serviceSchema, type Department, type Service } from './types'

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
