import { z } from 'zod'

export const roleTypeSchema = z.enum([
  'admin',
  'department_head',
  'assisting_head',
  'service_flow_coordinator',
])
export type RoleType = z.infer<typeof roleTypeSchema>

export const userRoleSchema = z.object({
  id: z.string(),
  role_type: roleTypeSchema,
  department_id: z.string().nullable(),
  service_id: z.string().nullable(),
})
export type UserRole = z.infer<typeof userRoleSchema>

export const profileSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  dob: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  avatar_url: z.string().nullable(),
})
export type Profile = z.infer<typeof profileSchema>
