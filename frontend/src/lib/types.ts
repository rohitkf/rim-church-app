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
