export interface Department {
  id: string
  name: string
  handbook_url: string | null
  created_at: string
  updated_at: string
}

export type MemberType = 'core' | 'guest'

export interface DepartmentMemberRow {
  id: string
  department_id: string
  user_id: string
  member_type: MemberType
  created_at: string
  profiles: {
    id: string
    first_name: string
    last_name: string
    email: string
    phone: string | null
    avatar_url: string | null
  } | null
}

export interface SensitiveByUser {
  visa_type: string | null
  has_dbs: boolean
  visa_expiry: string | null
}

export interface Service {
  id: string
  date: string
  service_type: string
  created_at: string
}

export type ChecklistItemStatus = 'pending' | 'member_complete' | 'head_verified' | 'coordinator_verified'

export interface Checklist {
  id: string
  department_id: string
  service_id: string
  created_at: string
}

export interface ChecklistItemRow {
  id: string
  checklist_id: string
  role_label: string
  status: ChecklistItemStatus
  assigned_to: string | null
  completed_by: string | null
  completed_at: string | null
  verified_by_head: string | null
  verified_by_head_at: string | null
  verified_by_coordinator: string | null
  verified_by_coordinator_at: string | null
  created_at: string
  updated_at: string
  assignee: { id: string; first_name: string; last_name: string } | null
}

export interface AttendanceRow {
  id: string
  department_id: string
  service_id: string
  expected_count: number
  actual_count: number | null
  logged_by: string | null
  logged_at: string | null
}
