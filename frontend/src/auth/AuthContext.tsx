import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { profileSchema, userRoleSchema, type Profile, type RoleType, type UserRole } from './types'
import { z } from 'zod'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  roles: UserRole[]
  loading: boolean
  isAdmin: boolean
  hasRole: (role: RoleType, opts?: { departmentId?: string; serviceId?: string }) => boolean
  isDepartmentHead: (departmentId: string) => boolean
  isServiceCoordinator: (serviceId: string) => boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)

  async function loadProfileAndRoles(userId: string) {
    const [{ data: profileData }, { data: roleData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_roles').select('id, role_type, department_id, service_id').eq('user_id', userId),
    ])

    const profileResult = profileData ? profileSchema.safeParse(profileData) : null
    if (profileResult && !profileResult.success) {
      console.error('Profile response did not match expected shape:', profileResult.error)
    }
    setProfile(profileResult?.success ? profileResult.data : null)

    const rolesResult = z.array(userRoleSchema).safeParse(roleData ?? [])
    if (!rolesResult.success) {
      console.error('Roles response did not match expected shape:', rolesResult.error)
    }
    setRoles(rolesResult.success ? rolesResult.data : [])
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        loadProfileAndRoles(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        loadProfileAndRoles(session.user.id)
      } else {
        setProfile(null)
        setRoles([])
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  function hasRole(role: RoleType, opts?: { departmentId?: string; serviceId?: string }) {
    return roles.some((r) => {
      if (r.role_type !== role) return false
      if (opts?.departmentId && r.department_id !== opts.departmentId) return false
      if (opts?.serviceId && r.service_id !== opts.serviceId) return false
      return true
    })
  }

  const isAdmin = hasRole('admin')

  function isDepartmentHead(departmentId: string) {
    return (
      hasRole('department_head', { departmentId }) || hasRole('assisting_head', { departmentId })
    )
  }

  function isServiceCoordinator(serviceId: string) {
    return hasRole('service_flow_coordinator', { serviceId })
  }

  async function refreshProfile() {
    if (session?.user) await loadProfileAndRoles(session.user.id)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        roles,
        loading,
        isAdmin,
        hasRole,
        isDepartmentHead,
        isServiceCoordinator,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
