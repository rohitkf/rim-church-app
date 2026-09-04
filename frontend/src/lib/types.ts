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
  is_service_flow: z.boolean(),
  // Which team keeps the set lists. A fact about the team rather than its
  // name, so renaming it to "Worship & Creative" changes nothing.
  is_worship: z.boolean(),
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
  // When somebody called the end of it. Optional so the planner still
  // renders against a database that hasn't had the migration applied.
  ended_at: z.string().nullable().optional(),
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
  // A session is led by somebody with an account or by a guest on this
  // service's list — never both; the database refuses the pair.
  guest_id: z.string().nullable().optional(),
  department_id: z.string().nullable(),
  role_label: z.string().nullable(),
  // Set when the session was dropped mid-service. Optional so the planner
  // still renders against a database that hasn't had the migration applied.
  skipped_at: z.string().nullable().optional(),
  skip_reason: z.string().nullable().optional(),
  // Minutes granted on request mid-service, and who asked. Part of
  // duration_minutes; kept apart so the plan's own length stays knowable.
  added_minutes: z.number().nullable().optional(),
  // One entry per grant, so the left of the timeline can show each "+10m
  // asked" rather than only their total.
  added_grants: z
    .array(
      z.object({
        minutes: z.number(),
        note: z.string().nullable().optional(),
        at: z.string().optional(),
      }),
    )
    .nullable()
    .optional(),
  // Set when the clock reached this one and it had not begun.
  held_at: z.string().nullable().optional(),
  updated_at: z.string(),
  assignee: personSummarySchema.nullable(),
  guest: z.object({ id: z.string(), name: z.string(), note: z.string().nullable() }).nullable().optional(),
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

/** Which end of the service an item belongs to. */
export const checklistPhaseSchema = z.enum(['pre', 'post'])
export type ChecklistPhase = z.infer<typeof checklistPhaseSchema>

export const roleChecklistItemSchema = z.object({
  id: z.string(),
  role_id: z.string(),
  department_id: z.string(),
  label: z.string(),
  sort_order: z.number(),
  phase: checklistPhaseSchema,
})
export type RoleChecklistItem = z.infer<typeof roleChecklistItemSchema>

export const rotaProgressSchema = z.object({
  id: z.string(),
  assignment_id: z.string(),
  item_id: z.string(),
  status: checklistItemStatusSchema,
})
export type RotaProgress = z.infer<typeof rotaProgressSchema>

export const departmentRoleSchema = z.object({
  id: z.string(),
  department_id: z.string(),
  name: z.string(),
  sort_order: z.number(),
  // Which family the role belongs to on the Teams page. Null is a real
  // answer — most teams are small enough to want no groups at all.
  group_id: z.string().nullable(),
})
export type DepartmentRole = z.infer<typeof departmentRoleSchema>

export const setListItemSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  title: z.string(),
  led_by: z.string().nullable(),
  link: z.string().nullable(),
  lyrics: z.string().nullable(),
  sort_order: z.number(),
  leader: personSummarySchema.nullable(),
})
export type SetListItem = z.infer<typeof setListItemSchema>

export const departmentRoleGroupSchema = z.object({
  id: z.string(),
  department_id: z.string(),
  name: z.string(),
  sort_order: z.number(),
})
export type DepartmentRoleGroup = z.infer<typeof departmentRoleGroupSchema>

export const rotaAssignmentSchema = z.object({
  id: z.string(),
  service_id: z.string(),
  department_id: z.string(),
  user_id: z.string(),
  role_label: z.string(),
  role_id: z.string().nullable(),
  profile: personSummarySchema.nullable(),
  department: z.object({ id: z.string(), name: z.string(), color: z.string().nullable() }).nullable(),
})
export type RotaAssignment = z.infer<typeof rotaAssignmentSchema>

export const rotaRequestStatusSchema = z.enum(['pending', 'approved', 'denied'])
export type RotaRequestStatus = z.infer<typeof rotaRequestStatusSchema>

export const rotaReleaseRequestSchema = z.object({
  id: z.string(),
  assignment_id: z.string(),
  requested_by: z.string(),
  requesting_department_id: z.string(),
  requested_role_label: z.string(),
  status: rotaRequestStatusSchema,
  created_at: z.string(),
  requester: personSummarySchema.nullable(),
  requesting_department: z.object({ id: z.string(), name: z.string() }).nullable(),
  assignment: z
    .object({
      id: z.string(),
      role_label: z.string(),
      department_id: z.string(),
      user_id: z.string(),
      service_id: z.string(),
      profile: personSummarySchema.nullable(),
      department: z.object({ id: z.string(), name: z.string() }).nullable(),
    })
    .nullable(),
})
export type RotaReleaseRequest = z.infer<typeof rotaReleaseRequestSchema>

export const availabilityStatusSchema = z.enum(['available', 'unavailable', 'tentative'])
export type AvailabilityStatus = z.infer<typeof availabilityStatusSchema>

export const availabilityRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  service_id: z.string(),
  department_id: z.string(),
  status: availabilityStatusSchema,
  note: z.string().nullable(),
  // null until the team head confirms whether they actually turned up.
  attended: z.boolean().nullable(),
  updated_at: z.string(),
})
export type AvailabilityRow = z.infer<typeof availabilityRowSchema>

export const serviceTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_time: z.string(), // 'HH:MM:SS'
  created_at: z.string(),
})
export type ServiceTemplate = z.infer<typeof serviceTemplateSchema>

export const templateSessionSchema = z.object({
  id: z.string(),
  template_id: z.string(),
  order_index: z.number(),
  session_name: z.string(),
  duration_minutes: z.number(),
})
export type TemplateSession = z.infer<typeof templateSessionSchema>

export const notificationRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  type: z.string(),
  reference_id: z.string().nullable(),
  /** Only set on an alert someone wrote themselves. */
  body: z.string().nullable().optional(),
  read_boolean: z.boolean(),
  created_at: z.string(),
})
export type NotificationRow = z.infer<typeof notificationRowSchema>

export const inventoryStatusSchema = z.enum([
  'in_service',
  'on_loan',
  'in_repair',
  'missing',
  'retired',
])
export type InventoryStatus = z.infer<typeof inventoryStatusSchema>

export const inventoryConditionSchema = z.enum(['good', 'fair', 'poor'])
export type InventoryCondition = z.infer<typeof inventoryConditionSchema>

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
  // Added by the tracking migration; optional so the page still renders
  // against a database that hasn't had it applied.
  asset_tag: z.string().nullable().optional(),
  kind: z.enum(['asset', 'consumable']).optional(),
  category: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  // The shelf it is filed on. Added by the categories migration; optional
  // so the page still renders against a database without it.
  category_id: z.string().nullable().optional(),
  item_status: inventoryStatusSchema.optional(),
  item_condition: inventoryConditionSchema.optional(),
  held_by: z.string().nullable().optional(),
  checked_out_at: z.string().nullable().optional(),
  due_back: z.string().nullable().optional(),
  reorder_level: z.number().nullable().optional(),
  last_audited_at: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  estimated_cost: z.union([z.number(), z.string()]).nullable().optional(),
  /** What one of it is — "screw", "box", "metre". The cost is the cost of one. */
  unit: z.string().nullable().optional(),
  product_url: z.string().nullable().optional(),
  holder: z
    .object({ id: z.string(), first_name: z.string(), last_name: z.string() })
    .nullable()
    .optional(),
})
export type InventoryItem = z.infer<typeof inventoryItemSchema>

/** A shelf a team files its inventory on. */
export const inventoryCategorySchema = z.object({
  id: z.string(),
  department_id: z.string(),
  name: z.string(),
  sort_order: z.number(),
})
export type InventoryCategory = z.infer<typeof inventoryCategorySchema>

export const inventoryEventSchema = z.object({
  id: z.string(),
  item_id: z.string(),
  at: z.string(),
  actor_id: z.string().nullable(),
  event_type: z.enum([
    'created',
    'checked_out',
    'checked_in',
    'quantity_adjusted',
    'status_changed',
    'moved',
    'audited',
    'note',
  ]),
  quantity_delta: z.number().nullable(),
  from_value: z.string().nullable(),
  to_value: z.string().nullable(),
  note: z.string().nullable(),
  actor: z
    .object({ id: z.string(), first_name: z.string(), last_name: z.string() })
    .nullable()
    .optional(),
})
export type InventoryEvent = z.infer<typeof inventoryEventSchema>

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

export const joinRequestStatusSchema = z.enum(['pending', 'approved', 'declined', 'withdrawn'])
export type JoinRequestStatus = z.infer<typeof joinRequestStatusSchema>

export const joinRequestSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  department_id: z.string(),
  status: joinRequestStatusSchema,
  note: z.string().nullable(),
  created_at: z.string(),
  responded_at: z.string().nullable(),
  granted_type: memberTypeSchema.nullable(),
  requester: personSummarySchema.extend({ avatar_url: z.string().nullable() }).nullable(),
  department: z.object({ id: z.string(), name: z.string(), color: z.string().nullable() }).nullable(),
})
export type JoinRequest = z.infer<typeof joinRequestSchema>

/**
 * An invitation that was sent, and whether it was ever answered.
 *
 * `accepted_at` is stamped when the address first signs in — not when the
 * mail goes out and not when the row appears — so an invitation with a
 * null there is genuinely still outstanding.
 */
export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  department_id: z.string().nullable(),
  invited_by: z.string().nullable(),
  created_at: z.string(),
  accepted_at: z.string().nullable(),
  inviter: personSummarySchema.nullable(),
  department: z.object({ id: z.string(), name: z.string(), color: z.string().nullable() }).nullable(),
})
export type Invitation = z.infer<typeof invitationSchema>
