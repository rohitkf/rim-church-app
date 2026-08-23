export type RoleType =
  | 'admin'
  | 'department_head'
  | 'assisting_head'
  | 'service_flow_coordinator'

export interface UserRole {
  id: string
  role_type: RoleType
  department_id: string | null
  service_id: string | null
}

export interface Profile {
  id: string
  first_name: string
  last_name: string
  dob: string | null
  email: string
  phone: string | null
  avatar_url: string | null
}
