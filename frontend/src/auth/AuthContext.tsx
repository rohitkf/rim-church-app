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
  /** The single account that owns the app: it alone may take Admin away. */
  isSuperAdmin: boolean
  ownerId: string | null
  hasRole: (role: RoleType, opts?: { departmentId?: string; serviceId?: string }) => boolean
  isDepartmentHead: (departmentId: string) => boolean
  /** Departments this user heads or assists — an Assisting Head has the
   * same authority as the Head for their own team. */
  ledDepartmentIds: string[]
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<UserRole[]>([])
  // Who owns the app. One account holds it; it decides who may take Admin
  // away, and it can only move by being offered and accepted.
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfileAndRoles(userId: string) {
    const [{ data: profileData }, { data: roleData }, { data: ownerData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_roles').select('id, role_type, department_id, service_id').eq('user_id', userId),
      supabase.from('app_owner').select('user_id').maybeSingle(),
    ])

    setOwnerId(
      ownerData && typeof (ownerData as { user_id?: unknown }).user_id === 'string'
        ? (ownerData as { user_id: string }).user_id
        : null,
    )

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
  const isSuperAdmin = !!ownerId && ownerId === session?.user.id

  const ledDepartmentIds = roles
    .filter((r) => r.role_type === 'department_head' || r.role_type === 'assisting_head')
    .map((r) => r.department_id)
    .filter((id): id is string => !!id)

  function isDepartmentHead(departmentId: string) {
    return (
      hasRole('department_head', { departmentId }) || hasRole('assisting_head', { departmentId })
    )
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
        isSuperAdmin,
        ownerId,
        hasRole,
        isDepartmentHead,
        ledDepartmentIds,
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
