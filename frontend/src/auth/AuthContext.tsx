import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { errorMessage } from '../lib/errorMessage'
import { profileSchema, userRoleSchema, type Profile, type RoleType, type UserRole } from './types'
import { z } from 'zod'

/**
 * Who an Admin is previewing the app as. The pages, the dock and the
 * buttons follow it; the database does not — every read still carries the
 * Admin's own access, which the banner says out loud.
 */
export type ViewAs =
  | { as: 'church' }
  | { as: 'member'; departmentId: string; departmentName: string }
  | { as: 'head'; departmentId: string; departmentName: string }

const VIEW_AS_KEY = 'rim-view-as'

function readViewAs(): ViewAs | null {
  try {
    const raw = sessionStorage.getItem(VIEW_AS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ViewAs
    if (parsed?.as === 'church') return parsed
    if ((parsed?.as === 'member' || parsed?.as === 'head') && parsed.departmentId) return parsed
    return null
  } catch {
    return null
  }
}

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  roles: UserRole[]
  loading: boolean
  /** Why the session couldn't be read, when it couldn't. */
  authError: string | null
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
  /** Whether this person may preview the app as somebody else: an Admin. */
  canPreview: boolean
  /** The preview in force, if any. */
  viewAs: ViewAs | null
  setViewAs: (next: ViewAs | null) => void
}

/** How long the app may sit on "Loading…" before it has to say something. */
const BOOT_TIMEOUT_MS = 8_000

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [realRoles, setRoles] = useState<UserRole[]>([])
  // Who owns the app. One account holds it; it decides who may take Admin
  // away, and it can only move by being offered and accepted.
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Set when the session couldn't be established at all, so the shell can
  // say so rather than sitting on a spinner.
  const [authError, setAuthError] = useState<string | null>(null)
  // For this tab only: a preview left on should not greet the Admin again
  // tomorrow as a Church Member.
  const [viewAsState, setViewAsState] = useState<ViewAs | null>(readViewAs)

  async function loadProfileAndRoles(userId: string) {
    const [{ data: profileData }, { data: roleData }, { data: ownerData }] = await Promise.all([
      // Your own row, every column, through my_profile() (0126): email,
      // phone and marital status are closed on `profiles` to everybody
      // but the Owner's function (0127), so `select('*')` would be refused.
      supabase.rpc('my_profile').maybeSingle(),
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
    // Whatever happens, the loading screen has to end. A rejected session
    // lookup — the project asleep, DNS gone, a phone that lost signal
    // between the tap and the request — used to leave the app on "Loading…"
    // for ever, with nothing said and nothing to press.
    // A deadline on the session lookup itself, not just on the request it
    // makes. supabase-js serialises its auth work behind an internal queue,
    // so a call that never settles — a storage read that hangs, a queue
    // entry that never drains — takes `.finally` down with it and the
    // loading screen never ends. Racing it means the screen always
    // resolves to something a person can act on.
    let settled = false
    const bootDeadline = window.setTimeout(() => {
      if (settled) return
      settled = true
      setAuthError('The server took too long to answer.')
      setLoading(false)
    }, BOOT_TIMEOUT_MS)

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        if (session?.user) return loadProfileAndRoles(session.user.id)
      })
      .catch((err: unknown) => {
        console.error('Could not read the session:', err)
        setAuthError(errorMessage(err, 'Could not reach the server.'))
      })
      .finally(() => {
        settled = true
        window.clearTimeout(bootDeadline)
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        const userId = nextSession.user.id
        // This callback runs while supabase-js holds the lock for the
        // sign-in that triggered it, and every query below needs that same
        // lock to attach the access token. Supabase's own guidance is to
        // make no Supabase call from inside this callback for exactly that
        // reason: where the two do contend, the queries wait on the lock
        // and the lock waits on the callback, and the sign-in promise
        // never settles — no error, nothing failed, it simply never
        // finishes. Deferring to a fresh task lets the lock go first.
        setTimeout(() => {
          void loadProfileAndRoles(userId).catch((err: unknown) => {
            console.error('Could not load the profile:', err)
          })
        }, 0)
      } else {
        setProfile(null)
        setRoles([])
      }
    })

    return () => {
      window.clearTimeout(bootDeadline)
      subscription.unsubscribe()
    }
  }, [])

  const realIsAdmin = realRoles.some((r) => r.role_type === 'admin')
  const realIsSuperAdmin = !!ownerId && ownerId === session?.user.id
  const canPreview = realIsAdmin || realIsSuperAdmin
  // A preview only ever narrows, and only for somebody allowed to take one.
  const viewAs = canPreview ? viewAsState : null

  function setViewAs(next: ViewAs | null) {
    setViewAsState(next)
    try {
      if (next) sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify(next))
      else sessionStorage.removeItem(VIEW_AS_KEY)
    } catch {
      // Storage refused: the preview still works, it just will not survive a reload.
    }
  }

  // The roles the pages are shown. A Church Member and a Team Member hold
  // none; a Team Head holds the one team being previewed.
  const roles: UserRole[] = !viewAs
    ? realRoles
    : viewAs.as === 'head'
      ? [
          {
            id: 'preview',
            role_type: 'department_head',
            department_id: viewAs.departmentId,
            service_id: null,
          },
        ]
      : []

  function hasRole(role: RoleType, opts?: { departmentId?: string; serviceId?: string }) {
    return roles.some((r) => {
      if (r.role_type !== role) return false
      if (opts?.departmentId && r.department_id !== opts.departmentId) return false
      if (opts?.serviceId && r.service_id !== opts.serviceId) return false
      return true
    })
  }

  const isAdmin = hasRole('admin')
  const isSuperAdmin = realIsSuperAdmin && !viewAs

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
        authError,
        isAdmin,
        isSuperAdmin,
        ownerId,
        hasRole,
        isDepartmentHead,
        ledDepartmentIds,
        refreshProfile,
        signOut,
        canPreview,
        viewAs,
        setViewAs,
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
