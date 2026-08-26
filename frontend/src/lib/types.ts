import { z } from 'zod'

/**
 * Runtime schemas for every shape that comes back from Supabase (or the
 * FastAPI assistant service). A TypeScript `interface` only checks types
 * at compile time — it does nothing once data actually arrives over the
 * network, so a schema drift (a renamed column, a join that started
 * returning null, a bad manual `as unknown as X` cast) would silently
 * produce `undefined` fields in the UI instead of a caught error. Each
 * `queryFn` below parses its Supabase response through the matching
 * schema instead of casting.
 */

const personSummarySchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
})

export const departmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  handbook_url: z.string().nullable(),
  color: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type Department = z.infer<typeof departmentSchema>

export const memberTypeSchema = z.enum(['core', 'guest'])
export type MemberType = z.infer<typeof memberTypeSchema>

export const departmentMemberRowSchema = z.object({
  id: z.string(),
  department_id: z.string(),
  user_id: z.string(),
  member_type: memberTypeSchema,
  created_at: z.string(),
  profiles: z
    .object({
      id: z.string(),
      first_name: z.string(),
      last_name: z.string(),
      email: z.string(),
      phone: z.string().nullable(),
      avatar_url: z.string().nullable(),
    })
    .nullable(),
})
export type DepartmentMemberRow = z.infer<typeof departmentMemberRowSchema>

export const sensitiveByUserSchema = z.object({
  visa_type: z.string().nullable(),
  has_dbs: z.boolean(),
  visa_expiry: z.string().nullable(),
})
export type SensitiveByUser = z.infer<typeof sensitiveByUserSchema>

export const serviceSchema = z.object({
  id: z.string(),
  date: z.string(),
  service_type: z.string(),
  created_at: z.string(),
})
export type Service = z.infer<typeof serviceSchema>

export const checklistItemStatusSchema = z.enum([
  'pending',
  'member_complete',
  'head_verified',
  'coordinator_verified',
])
export type ChecklistItemStatus = z.infer<typeof checklistItemStatusSchema>

export const checklistSchema = z.object({
  id: z.string(),
  department_id: z.string(),
  service_id: z.string(),
  created_at: z.string(),
})
export type Checklist = z.infer<typeof checklistSchema>

export const checklistItemRowSchema = z.object({
  id: z.string(),
  checklist_id: z.string(),
  role_label: z.string(),
  status: checklistItemStatusSchema,
  assigned_to: z.string().nullable(),
  completed_by: z.string().nullable(),
  completed_at: z.string().nullable(),
  verified_by_head: z.string().nullable(),
  verified_by_head_at: z.string().nullable(),
  verified_by_coordinator: z.string().nullable(),
  verified_by_coordinator_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  assignee: personSummarySchema.nullable(),
})
export type ChecklistItemRow = z.infer<typeof checklistItemRowSchema>

export const serviceSessionRowSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  order_index: z.number(),
  start_time: z.string(),
  duration_minutes: z.number(),
  session_name: z.string(),
  assigned_user_id: z.string().nullable(),
  department_id: z.string().nullable(),
  role_label: z.string().nullable(),
  updated_at: z.string(),
  assignee: personSummarySchema.nullable(),
})
export type ServiceSessionRow = z.infer<typeof serviceSessionRowSchema>

export const profileOptionSchema = personSummarySchema
export type ProfileOption = z.infer<typeof profileOptionSchema>

export const messageRowSchema = z.object({
  id: z.string(),
  author_id: z.string(),
  body: z.string(),
  created_at: z.string(),
  author: personSummarySchema.nullable(),
  department_id: z.string().nullable(),
  department: z.object({ id: z.string(), name: z.string(), color: z.string().nullable() }).nullable(),
})
export type MessageRow = z.infer<typeof messageRowSchema>

export const notificationRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  type: z.string(),
  reference_id: z.string().nullable(),
  read_boolean: z.boolean(),
  created_at: z.string(),
})
export type NotificationRow = z.infer<typeof notificationRowSchema>

export const inventoryItemSchema = z.object({
  id: z.string(),
  department_id: z.string(),
  name: z.string(),
  quantity: z.number(),
  status: z.string().nullable(),
  location: z.string().nullable(),
  last_checked: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type InventoryItem = z.infer<typeof inventoryItemSchema>

export const attendanceRowSchema = z.object({
  id: z.string(),
  department_id: z.string(),
  service_id: z.string(),
  expected_count: z.number(),
  actual_count: z.number().nullable(),
  logged_by: z.string().nullable(),
  logged_at: z.string().nullable(),
})
export type AttendanceRow = z.infer<typeof attendanceRowSchema>
