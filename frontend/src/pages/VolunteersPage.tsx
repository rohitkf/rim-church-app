import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { OwnershipTransfer } from '../components/OwnershipTransfer'
import { fetchDepartments, fetchMembersForDepartments } from '../lib/queries'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import { userRoleSchema, type RoleType, type UserRole } from '../auth/types'
import { useErrorText } from '../lib/useErrorText'

const volunteerSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string(),
})
type Volunteer = z.infer<typeof volunteerSchema>

const grantSchema = userRoleSchema.extend({ user_id: z.string() })
type Grant = z.infer<typeof grantSchema>

async function fetchVolunteers(): Promise<Volunteer[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email')
    .order('first_name')
  if (error) throw error
  return z.array(volunteerSchema).parse(data)
}

async function fetchAllGrants(): Promise<Grant[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('id, user_id, role_type, department_id, service_id')
  if (error) throw error
  return z.array(grantSchema).parse(data)
}

/** Designation shown per team, in descending authority. */
function designationFor(grants: UserRole[], departmentId: string): string {
  if (grants.some((g) => g.role_type === 'department_head' && g.department_id === departmentId)) {
    return 'Department Head'
  }
  if (grants.some((g) => g.role_type === 'assisting_head' && g.department_id === departmentId)) {
    return 'Assisting Head'
  }
  return 'Team Member'
}

const designationClass: Record<string, string> = {
  'Department Head': 'bg-status-head/15 text-status-head',
  'Assisting Head': 'bg-status-coordinator/15 text-status-coordinator',
  'Team Member': 'bg-surface-container text-on-surface-variant',
}

export function VolunteersPage() {
  const { isAdmin, isSuperAdmin, ownerId, session } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [confirmingRemoval, setConfirmingRemoval] = useState<Volunteer | null>(null)
  const [transferTo, setTransferTo] = useState<Volunteer | null>(null)

  const volunteersQuery = useQuery({ queryKey: ['volunteers'], queryFn: fetchVolunteers, enabled: isAdmin })
  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments, enabled: isAdmin })
  const grantsQuery = useQuery({ queryKey: ['all-user-roles'], queryFn: fetchAllGrants, enabled: isAdmin })

  const allDeptIds = useMemo(() => (departmentsQuery.data ?? []).map((d) => d.id), [departmentsQuery.data])
  const membersQuery = useQuery({
    queryKey: ['volunteer-memberships', allDeptIds],
    queryFn: () => fetchMembersForDepartments(allDeptIds),
    enabled: isAdmin && allDeptIds.length > 0,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['all-user-roles'] })
    queryClient.invalidateQueries({ queryKey: ['user-roles'] })
  }

  const grantRole = useMutation({
    mutationFn: async ({
      userId,
      roleType,
      departmentId,
    }: {
      userId: string
      roleType: RoleType
      departmentId: string | null
    }) => {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role_type: roleType, department_id: departmentId })
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not grant that role.')),
  })

  const revokeRole = useMutation({
    mutationFn: async (grantId: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', grantId)
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not remove that role.')),
  })

  const removeVolunteer = useMutation({
    mutationFn: async (userId: string) => {
      // Deleting the auth user is what actually removes someone —
      // everything else hangs off it by cascade. The browser has no
      // rights over auth.users, so this goes through a guarded function.
      const { error } = await supabase.rpc('admin_delete_user', { target_user_id: userId })
      if (error) throw error
    },
    onSuccess: () => {
      setConfirmingRemoval(null)
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['volunteers'] })
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] })
      queryClient.invalidateQueries({ queryKey: ['volunteer-memberships'] })
    },
    onError: (err: unknown) =>
      setError(errorText(err, 'Could not remove that person.')),
  })

  if (!isAdmin) return <Navigate to="/" replace />

  const grants = grantsQuery.data ?? []
  const memberships = membersQuery.data ?? []
  const departments = departmentsQuery.data ?? []
  const deptById = new Map(departments.map((d) => [d.id, d]))

  const isLoading =
    volunteersQuery.isLoading || departmentsQuery.isLoading || grantsQuery.isLoading || membersQuery.isLoading
  const loadError = volunteersQuery.error || departmentsQuery.error || grantsQuery.error || membersQuery.error

  // Who belongs to each team, in the order a rota is read: the head, then
  // an assisting head, then core members, then guests — alphabetically
  // within each tier.
  const tierOf = (personGrants: Grant[], deptId: string, memberType?: string) => {
    if (personGrants.some((g) => g.role_type === 'department_head' && g.department_id === deptId)) return 0
    if (personGrants.some((g) => g.role_type === 'assisting_head' && g.department_id === deptId)) return 1
    return memberType === 'guest' ? 3 : 2
  }

  const volunteers = volunteersQuery.data ?? []
  const me = volunteers.find((v) => v.id === session?.user.id)

  const teamGroups = [...departments]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((dept) => {
      const people = volunteers
        .map((v) => {
          const personGrants = grants.filter((g) => g.user_id === v.id)
          const membership = memberships.find(
            (m) => m.user_id === v.id && m.department_id === dept.id,
          )
          const leads = personGrants.some(
            (g) =>
              g.department_id === dept.id &&
              (g.role_type === 'department_head' || g.role_type === 'assisting_head'),
          )
          if (!membership && !leads) return null
          return { volunteer: v, tier: tierOf(personGrants, dept.id, membership?.member_type) }
        })
        .filter((x): x is { volunteer: Volunteer; tier: number } => x !== null)
        .sort((a, b) => a.tier - b.tier || a.volunteer.first_name.localeCompare(b.volunteer.first_name))
      return { dept, people }
    })
    .filter((g) => g.people.length > 0)

  const onNoTeam = volunteers.filter(
    (v) =>
      !memberships.some((m) => m.user_id === v.id) &&
      !grants.some(
        (g) =>
          g.user_id === v.id &&
          (g.role_type === 'department_head' || g.role_type === 'assisting_head'),
      ),
  )

  /** One person's card. The signed-in user's own is tinted and pinned at
   *  the top, and appears again under each team they're on. */
  function renderCard(v: Volunteer, highlight = false) {
    const myGrants = grants.filter((g) => g.user_id === v.id)
    const adminGrant = myGrants.find((g) => g.role_type === 'admin')
    const isOwner = v.id === ownerId
    // Ownership carries Admin whether or not a grant row says so, so the
    // owner never shows a "Make admin" button that would do nothing.
    const holdsAdmin = !!adminGrant || isOwner
    const myMemberships = memberships.filter((m) => m.user_id === v.id)
    const core = myMemberships.filter((m) => m.member_type === 'core')
    const guest = myMemberships.filter((m) => m.member_type === 'guest')

    // Teams they lead but may not be a member of still belong here.
    const ledDeptIds = myGrants
      .filter((g) => g.role_type === 'department_head' || g.role_type === 'assisting_head')
      .map((g) => g.department_id)
      .filter((id): id is string => !!id)
    const shownDeptIds = [...new Set([...core.map((m) => m.department_id), ...ledDeptIds])]

    return (
      <li
        key={v.id}
        className={`rounded-lg border p-5 ${
          highlight
            ? 'border-secondary/50 bg-secondary/5'
            : 'border-border-subtle bg-surface-lowest'
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-on-surface">
              {v.first_name} {v.last_name}
              {v.id === session?.user.id && (
                <span className="ml-2 font-mono text-label-sm text-secondary">You</span>
              )}
            </div>
            <div className="text-body-sm text-on-surface-variant">{v.email}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOwner && (
              <span className="rounded-full bg-secondary px-3 py-1 font-mono text-label-sm uppercase tracking-wide text-on-secondary">
                Owner
              </span>
            )}
            {holdsAdmin ? (
              <>
                <span className="rounded-full bg-primary px-3 py-1 font-mono text-label-sm uppercase tracking-wide text-on-primary">
                  Admin
                </span>
                {/* Taking Admin away is the owner's, or your own to give up.
                    One Admin removing another is how a disagreement becomes
                    a lockout, so the button simply isn't there. */}
                {/* Only the owner takes Admin away, and never their own —
                    stepping yourself down is a door that locks behind you. */}
                {isSuperAdmin && !isOwner && adminGrant && v.id !== session?.user.id && (
                  <button
                    onClick={() => revokeRole.mutate(adminGrant.id)}
                    className="text-body-sm text-error hover:underline"
                  >
                    Remove admin
                  </button>
                )}
                {isSuperAdmin && !isOwner && (
                  <button
                    onClick={() => {
                      setError(null)
                      setTransferTo(v)
                    }}
                    className="rounded-full px-3 py-1.5 text-body-sm text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 dark:ring-white/10"
                  >
                    Transfer ownership
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => grantRole.mutate({ userId: v.id, roleType: 'admin', departmentId: null })}
                className="rounded-sm border border-border-subtle px-3 py-1.5 text-body-sm font-medium text-on-surface hover:border-secondary"
              >
                Make admin
              </button>
            )}
            {v.id !== session?.user.id && !isOwner && (!holdsAdmin || isSuperAdmin) && (
              <button
                onClick={() => {
                  setError(null)
                  setConfirmingRemoval(v)
                }}
                className="rounded-sm border border-border-subtle px-3 py-1.5 text-body-sm font-medium text-error hover:border-error"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
              Core teams
            </div>
            {shownDeptIds.length === 0 ? (
              <p className="mt-2 text-body-sm text-on-surface-variant">Not on a team yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {shownDeptIds.map((deptId) => {
                  const dept = deptById.get(deptId)
                  const designation = designationFor(myGrants, deptId)
                  const leadGrant = myGrants.find(
                    (g) =>
                      g.department_id === deptId &&
                      (g.role_type === 'department_head' || g.role_type === 'assisting_head'),
                  )
                  return (
                    <li key={deptId} className="flex flex-wrap items-center gap-2 text-body-sm">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: dept?.color ?? DEFAULT_DEPT_COLOR }}
                      />
                      <span className="text-on-surface">{dept?.name ?? 'Unknown team'}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${designationClass[designation]}`}
                      >
                        {designation}
                      </span>
                      {leadGrant ? (
                        <button
                          onClick={() => revokeRole.mutate(leadGrant.id)}
                          className="text-label-sm text-error hover:underline"
                        >
                          Step down
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() =>
                              grantRole.mutate({
                                userId: v.id,
                                roleType: 'department_head',
                                departmentId: deptId,
                              })
                            }
                            className="text-label-sm font-medium text-secondary hover:underline"
                          >
                            Make head
                          </button>
                          <button
                            onClick={() =>
                              grantRole.mutate({
                                userId: v.id,
                                roleType: 'assisting_head',
                                departmentId: deptId,
                              })
                            }
                            className="text-label-sm font-medium text-secondary hover:underline"
                          >
                            Make assisting
                          </button>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div>
            <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
              Guest teams
            </div>
            {guest.length === 0 ? (
              <p className="mt-2 text-body-sm text-on-surface-variant">None.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {guest.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-body-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: deptById.get(m.department_id)?.color ?? DEFAULT_DEPT_COLOR,
                      }}
                    />
                    <span className="text-on-surface">
                      {deptById.get(m.department_id)?.name ?? 'Unknown team'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </li>
    )
  }

  return (
    <div>
      <h1 className="text-headline-xl">Volunteers</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Everyone with an account, the teams they're on, and what they're allowed to do. Roles
        granted here control what each person can see and change across the app.
      </p>

      {error && (
        <p className="mt-4 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
      )}

      <div className="mt-6">
        <OwnershipTransfer />
      </div>

      <QueryState
        isLoading={isLoading}
        error={loadError}
        isEmpty={volunteersQuery.data?.length === 0}
        emptyMessage="Nobody has signed up yet."
      >
        <div className="mt-6 flex flex-col gap-8">
          {me && <ul className="flex flex-col gap-4">{renderCard(me, true)}</ul>}

          {teamGroups.map(({ dept, people }) => (
            <section key={dept.id}>
              <div className="flex items-center gap-2 border-b border-border-subtle pb-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: dept.color ?? DEFAULT_DEPT_COLOR }}
                />
                <h2 className="text-headline-md">{dept.name}</h2>
                <span className="font-mono text-label-sm text-on-surface-variant">
                  {people.length} {people.length === 1 ? 'person' : 'people'}
                </span>
              </div>
              <ul className="mt-4 flex flex-col gap-4">
                {people.map(({ volunteer }) => renderCard(volunteer, volunteer.id === me?.id))}
              </ul>
            </section>
          ))}

          {onNoTeam.length > 0 && (
            <section>
              <div className="flex items-center gap-2 border-b border-border-subtle pb-2">
                <h2 className="text-headline-md">Not on a team yet</h2>
                <span className="font-mono text-label-sm text-on-surface-variant">
                  {onNoTeam.length}
                </span>
              </div>
              <ul className="mt-4 flex flex-col gap-4">
                {onNoTeam.map((v) => renderCard(v, v.id === me?.id))}
              </ul>
            </section>
          )}
        </div>

      </QueryState>

      {transferTo && (
        <TransferOwnershipDialog
          person={transferTo}
          onClose={() => setTransferTo(null)}
          onError={setError}
        />
      )}

      {confirmingRemoval && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-volunteer-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
        >
          <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface-lowest p-6 shadow-lg">
            <h2 id="remove-volunteer-title" className="text-headline-md">
              Remove {confirmingRemoval.first_name} {confirmingRemoval.last_name}?
            </h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              This deletes their account entirely — their sign-in, profile, team memberships, roles,
              availability answers, rota assignments and message board posts all go with it. It
              can't be undone, and they'd have to sign up again from scratch.
            </p>
            {error && (
              <p className="mt-3 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                {error}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmingRemoval(null)}
                className="rounded-sm border border-border-subtle px-4 py-2.5 text-body-sm font-medium text-on-surface hover:border-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => removeVolunteer.mutate(confirmingRemoval.id)}
                disabled={removeVolunteer.isPending}
                className="rounded-sm bg-error px-4 py-2.5 text-body-sm font-medium text-on-error hover:opacity-90 disabled:opacity-50"
              >
                {removeVolunteer.isPending ? 'Removing…' : 'Yes, remove permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Offering ownership: a decision worth stating plainly before it is made. */
function TransferOwnershipDialog({
  person,
  onClose,
  onError,
}: {
  person: Volunteer
  onClose: () => void
  onError: (message: string) => void
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  const offer = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('request_ownership_transfer', { target: person.id })
      if (error) throw error
    },
    onSuccess: () => {
      onClose()
      queryClient.invalidateQueries({ queryKey: ['ownership-transfer'] })
    },
    onError: (err: unknown) => onError(errorText(err, 'Could not send that offer.')),
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12">
        <h2 id="transfer-title" className="text-headline-md">
          Offer ownership to {person.first_name}?
        </h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          They will be asked to accept. If they do, they become the one account that can grant and
          remove Admin, and you stay an Admin — you would need them to offer it back.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface ring-1 ring-black/8 transition-all duration-500 ease-[var(--ease-glide)] hover:ring-black/20 dark:ring-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => offer.mutate()}
            disabled={offer.isPending}
            className="rounded-full bg-primary px-5 py-2.5 text-body-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-50"
          >
            {offer.isPending ? 'Sending…' : 'Send the offer'}
          </button>
        </div>
      </div>
    </div>
  )
}
