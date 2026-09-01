import { type FormEvent, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import {
  DESIGNATION_BADGE,
  DESIGNATION_LABEL,
  DESIGNATION_RANK,
  designationOn,
  type Designation,
} from '../lib/designation'
import { userRoleSchema } from '../auth/types'
import { InviteDialog } from '../components/InviteDialog'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { HANDBOOK_BUCKET, useHandbookUrl } from '../lib/useHandbookUrl'
import { HandbookUploadModal } from '../components/HandbookUploadModal'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { searchProfiles, type ProfileSearchResult } from '../lib/queries'
import { DepartmentRolesCard } from '../components/DepartmentRolesCard'
import { useErrorText } from '../lib/useErrorText'
import {
  departmentSchema,
  departmentMemberRowSchema,
  sensitiveByUserSchema,
  type Department,
  type DepartmentMemberRow,
  type MemberType,
  type SensitiveByUser,
} from '../lib/types'

async function fetchDepartment(id: string): Promise<Department | null> {
  const { data, error } = await supabase.from('departments').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? departmentSchema.parse(data) : null
}

async function fetchMembers(id: string): Promise<DepartmentMemberRow[]> {
  const { data, error } = await supabase
    .from('department_members')
    .select('*, profiles(id, first_name, last_name, email, phone, avatar_url)')
    .eq('department_id', id)
  if (error) throw error
  return z.array(departmentMemberRowSchema).parse(data)
}

const sensitiveRowSchema = sensitiveByUserSchema.extend({ user_id: z.string() })

async function fetchSensitive(userIds: string[]): Promise<Record<string, SensitiveByUser>> {
  if (userIds.length === 0) return {}
  const { data, error } = await supabase
    .from('profile_sensitive')
    .select('user_id, visa_type, has_dbs, visa_expiry')
    .in('user_id', userIds)
  if (error) throw error
  const rows = z.array(sensitiveRowSchema).parse(data)
  return Object.fromEntries(rows.map((row) => [row.user_id, row]))
}

const departmentGrantSchema = userRoleSchema.extend({ user_id: z.string() })
type DepartmentGrant = z.infer<typeof departmentGrantSchema>

async function fetchDepartmentGrants(departmentId: string): Promise<DepartmentGrant[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('id, user_id, role_type, department_id, service_id')
    .eq('department_id', departmentId)
  if (error) throw error
  return z.array(departmentGrantSchema).parse(data)
}

function ComplianceCell({ sensitive }: { sensitive: SensitiveByUser | undefined }) {
  // RLS on profile_sensitive is the source of truth: if the row wasn't
  // returned, this viewer isn't allowed to see it (Admin + the individual
  // only), so we show a neutral placeholder instead of guessing why.
  if (!sensitive) {
    return <span className="text-body-sm text-on-surface-variant">—</span>
  }
  return (
    /* One line, always. "DBS MISSING" wrapping to two lines inside a pill
       was most of what made this roster look broken on a phone. */
    <span
      className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${
        sensitive.has_dbs
          ? 'bg-status-coordinator/15 text-status-coordinator'
          : 'bg-error-container text-on-error-container'
      }`}
    >
      {sensitive.has_dbs ? 'DBS ✓' : 'No DBS'}
    </span>
  )
}

export function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, isDepartmentHead } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const canManage = isAdmin || (!!id && isDepartmentHead(id))

  const [addEmail, setAddEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [addType, setAddType] = useState<MemberType>('core')
  const [addError, setAddError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const deptQuery = useQuery({
    queryKey: ['department', id],
    queryFn: () => fetchDepartment(id!),
    enabled: !!id,
  })

  const membersQuery = useQuery({
    queryKey: ['department-members', id],
    queryFn: () => fetchMembers(id!),
    enabled: !!id,
  })

  /*
   * Who runs this team.
   *
   * The roster listed everybody the same way, so the person to ask about a
   * rota clash looked exactly like the person to ask about a camera. The
   * grants live in user_roles rather than on the membership row, so they are
   * fetched alongside and matched by user.
   */
  const grantsQuery = useQuery({
    queryKey: ['department-grants', id],
    queryFn: () => fetchDepartmentGrants(id!),
    enabled: !!id,
  })
  const designationOf = (userId: string): Designation =>
    designationOn((grantsQuery.data ?? []).filter((g) => g.user_id === userId), id!)

  // Split once: the roster renders twice — as cards on a phone and as a
  // table from `sm` up — and both need the same list.
  const coreMembers = [...(membersQuery.data ?? [])]
    .filter((m) => m.member_type === 'core')
    .sort(
      (a, b) =>
        DESIGNATION_RANK[designationOf(a.user_id)] - DESIGNATION_RANK[designationOf(b.user_id)] ||
        (a.profiles?.first_name ?? '').localeCompare(b.profiles?.first_name ?? ''),
    )
  const guestMembers = (membersQuery.data ?? []).filter((m) => m.member_type === 'guest')

  const memberIds = membersQuery.data?.map((m) => m.user_id) ?? []
  const sensitiveQuery = useQuery({
    queryKey: ['department-members-sensitive', id, memberIds],
    queryFn: () => fetchSensitive(memberIds),
    enabled: memberIds.length > 0,
  })

  const handbookQuery = useHandbookUrl(deptQuery.data?.handbook_url)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [confirmRemoveHandbook, setConfirmRemoveHandbook] = useState(false)
  const handbookLabel = deptQuery.data?.handbook_url?.endsWith('.docx')
    ? 'Open handbook (Word)'
    : 'Open handbook (PDF)'

  // Type-ahead over registered profiles: people rarely remember the exact
  // address they signed up with, so match on name too and let them pick.
  const [picked, setPicked] = useState<ProfileSearchResult | null>(null)
  const searchTerm = useDebouncedValue(addEmail.trim(), 250)
  const suggestionsQuery = useQuery({
    queryKey: ['profile-search', searchTerm],
    queryFn: () => searchProfiles(searchTerm),
    enabled: canManage && searchTerm.length >= 2 && !picked,
  })
  const memberIdSet = useMemo(
    () => new Set((membersQuery.data ?? []).map((m) => m.user_id)),
    [membersQuery.data],
  )
  const suggestions = (suggestionsQuery.data ?? []).filter((p) => !memberIdSet.has(p.id))

  const addMember = useMutation({
    mutationFn: async ({ email, type }: { email: string; type: MemberType }) => {
      let userId = picked?.id ?? null

      if (!userId) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle()
        if (profileError) throw profileError
        if (!profile) throw new Error('No registered user matches that — pick someone from the suggestions.')
        userId = profile.id
      }

      const { error } = await supabase
        .from('department_members')
        .insert({ department_id: id, user_id: userId, member_type: type })
      if (error) throw error
    },
    onSuccess: () => {
      setAddEmail('')
      setPicked(null)
      setAddError(null)
      queryClient.invalidateQueries({ queryKey: ['department-members', id] })
    },
    onError: (err: unknown) => setAddError(errorText(err, 'Could not add member.')),
  })

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('department_members').delete().eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['department-members', id] }),
  })

  // Uploading lives in its own modal; here we only take one away.
  const removeHandbook = useMutation({
    mutationFn: async () => {
      const path = deptQuery.data?.handbook_url
      if (!path) return
      const { error: removeErr } = await supabase.storage.from(HANDBOOK_BUCKET).remove([path])
      if (removeErr) throw removeErr
      const { error: updateErr } = await supabase
        .from('departments')
        .update({ handbook_url: null })
        .eq('id', id)
      if (updateErr) throw updateErr
    },
    onSuccess: () => {
      setConfirmRemoveHandbook(false)
      setUploadError(null)
      queryClient.invalidateQueries({ queryKey: ['department', id] })
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
    onError: (err: unknown) => setUploadError(errorText(err, 'Could not remove the handbook.')),
  })

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!addEmail.trim()) return
    addMember.mutate({ email: addEmail.trim(), type: addType })
  }

  return (
    <QueryState isLoading={deptQuery.isLoading} error={deptQuery.error} isEmpty={deptQuery.data === null} emptyMessage="Department not found, or you don't have access to it.">
      <div>
        {/* The handbook controls are 199px of buttons that were pinned to
            the right of the title with nowhere to go on a phone, so they
            hung off the edge. They sit under the title until there is
            room for both. */}
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-headline-xl">{deptQuery.data?.name}</h1>
            <p className="mt-1 text-body-md text-on-surface-variant">
              Manage core team members, guest access, and compliance status.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            {handbookQuery.data && (
              <a
                href={handbookQuery.data}
                target="_blank"
                rel="noreferrer"
                className="tap rounded-full hairline bg-surface-lowest px-4 py-2 text-body-sm font-medium text-on-surface hover:border-secondary"
              >
                {handbookLabel}
              </a>
            )}
            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Adding somebody who has no account yet is the commonest
                    dead end on this page: the roster only takes people who
                    already exist. */}
                <button
                  type="button"
                  onClick={() => setInviting(true)}
                  className="tap rounded-full bg-primary px-4 py-2 text-body-sm font-medium text-on-primary hover:opacity-90"
                >
                  Invite someone
                </button>
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="tap rounded-full hairline bg-surface-lowest px-4 py-2 text-body-sm font-medium text-on-surface hover:border-secondary"
                >
                  {deptQuery.data?.handbook_url ? 'Replace handbook' : 'Upload handbook'}
                </button>
                {deptQuery.data?.handbook_url && (
                  <button
                    type="button"
                    onClick={() => {
                      setUploadError(null)
                      setConfirmRemoveHandbook(true)
                    }}
                    className="tap rounded-sm px-3 py-2 text-body-sm font-medium text-on-surface-variant hover:text-error"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {uploadError && (
          <p className="mt-2 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">{uploadError}</p>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-headline-md">Core Members</h2>
              <span className="rounded-full bg-surface-container px-2 py-0.5 font-mono text-label-sm text-on-surface-variant">
                {coreMembers.length} Active
              </span>
            </div>

            <QueryState isLoading={membersQuery.isLoading} error={membersQuery.error}>
              {/*
                Four columns need about 420px and a phone has 360, so the
                table used to hand a phone a sideways scroll with the
                compliance badge parked off the edge where nobody found it.
                Below `sm` each member is a card instead — same fields,
                stacked, nothing hidden. The table returns where it fits.
              */}
              {/*
                Name, then who they are, then how to reach them, then the
                one badge — in that order down the card rather than fought
                over on one line. Remove sits at the bottom right as quiet
                text: it is the rarest thing anyone does here and it used to
                be the loudest thing on every row.
              */}
              <ul className="mt-4 flex flex-col gap-2.5 sm:hidden">
                {coreMembers.map((m) => {
                  const rank = designationOf(m.user_id)
                  return (
                    <li key={m.id} className="rounded-[var(--radius-row)] bg-raised p-3.5 hairline">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="min-w-0 break-words text-body-md font-medium text-on-surface">
                          {m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'Unknown user'}
                        </span>
                        {rank !== 'member' && (
                          <span
                            className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${
                              rank === 'head'
                                ? 'bg-primary/15 text-primary'
                                : 'bg-secondary/15 text-secondary'
                            }`}
                          >
                            {DESIGNATION_BADGE[rank]}
                          </span>
                        )}
                      </div>
                      {/* An email has no spaces to wrap at, so it needs
                          permission to break mid-word or it sets the card's
                          width for it. */}
                      <div className="mt-1 break-all text-body-sm text-on-surface-variant">
                        {m.profiles?.email}
                      </div>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <ComplianceCell sensitive={sensitiveQuery.data?.[m.user_id]} />
                        {canManage && (
                          <button
                            onClick={() => removeMember.mutate(m.id)}
                            className="tap text-label-md text-on-surface-faint hover:text-error hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>

              <div className="mt-4 hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-body-sm">
                  <thead>
                    <tr className="border-b border-border-subtle font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                      <th className="py-2 pr-4">Member</th>
                      <th className="py-2 pr-4">On this team</th>
                      <th className="py-2 pr-4">Contact</th>
                      <th className="py-2 pr-4">Compliance</th>
                      {canManage && <th className="py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {coreMembers.map((m) => (
                        <tr key={m.id} className="border-b border-border-subtle last:border-0">
                          <td className="py-3 pr-4 font-medium text-on-surface">
                            {m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'Unknown user'}
                          </td>
                          <td className="py-3 pr-4 text-on-surface-variant">
                            {DESIGNATION_LABEL[designationOf(m.user_id)]}
                          </td>
                          <td className="py-3 pr-4 break-all text-on-surface-variant">
                            {m.profiles?.email}
                          </td>
                          <td className="py-3 pr-4">
                            <ComplianceCell sensitive={sensitiveQuery.data?.[m.user_id]} />
                          </td>
                          {canManage && (
                            <td className="py-3 text-right">
                              <button
                                onClick={() => removeMember.mutate(m.id)}
                                className="tap inline-flex items-center text-body-sm text-on-surface-faint hover:text-error hover:underline"
                              >
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
                {coreMembers.length === 0 && (
                  <p className="py-4 text-body-sm text-on-surface-variant">No core members yet.</p>
                )}
              </div>
            </QueryState>

            {canManage && (
              <form onSubmit={handleAdd} className="mt-6 flex flex-wrap items-end gap-2 border-t border-border-subtle pt-4">
                <div className="relative flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
                  <label className="flex flex-col gap-1">
                    Add by name or email
                    <input
                      type="text"
                      autoComplete="off"
                      value={addEmail}
                      onChange={(e) => {
                        setAddEmail(e.target.value)
                        setPicked(null)
                      }}
                      placeholder="Start typing a name or email…"
                      className="rounded-full hairline px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
                    />
                  </label>

                  {picked && (
                    <p className="text-label-sm text-secondary">
                      Adding {picked.first_name} {picked.last_name}
                    </p>
                  )}

                  {!picked && searchTerm.length >= 2 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-[var(--radius-chip)] hairline bg-surface-lowest shadow-lg">
                      {suggestionsQuery.isLoading ? (
                        <p className="px-3 py-2 text-body-sm text-on-surface-variant">Searching…</p>
                      ) : suggestions.length === 0 ? (
                        <p className="px-3 py-2 text-body-sm text-on-surface-variant">
                          No matching registered user.
                        </p>
                      ) : (
                        <ul className="max-h-56 overflow-y-auto">
                          {suggestions.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setPicked(p)
                                  setAddEmail(p.email)
                                  setAddError(null)
                                }}
                                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-container"
                              >
                                <span className="text-body-sm font-medium text-on-surface">
                                  {p.first_name} {p.last_name}
                                </span>
                                <span className="text-label-sm text-on-surface-variant">{p.email}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
                  Type
                  <select
                    value={addType}
                    onChange={(e) => setAddType(e.target.value as MemberType)}
                    className="tap rounded-full hairline px-3 py-2 text-body-md text-on-surface"
                  >
                    <option value="core">Core</option>
                    <option value="guest">Guest</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={addMember.isPending}
                  className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                >
                  {addMember.isPending ? 'Adding…' : 'Add'}
                </button>
              </form>
            )}
            {addError && (
              <p className="mt-2 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">{addError}</p>
            )}
          </section>

          {id && <DepartmentRolesCard departmentId={id} canManage={canManage} />}

          <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
            <h2 className="text-headline-md">Guest List</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Users from other departments with visibility into this department's content.
            </p>
            <QueryState isLoading={membersQuery.isLoading} error={membersQuery.error}>
              <ul className="mt-4 flex flex-col gap-3">
                {guestMembers.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] hairline p-3"
                    >
                      <div className="min-w-0">
                        <div className="text-body-sm font-medium text-on-surface">
                          {m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'Unknown user'}
                        </div>
                        <div className="break-all text-body-sm text-on-surface-variant">
                          {m.profiles?.email}
                        </div>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => removeMember.mutate(m.id)}
                          className="tap inline-flex items-center text-body-sm text-error hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                {guestMembers.length === 0 && (
                  <p className="text-body-sm text-on-surface-variant">No guests yet.</p>
                )}
              </ul>
            </QueryState>
          </section>
        </div>

        <InviteDialog
          open={inviting}
          onClose={() => setInviting(false)}
          fixedDepartmentId={id}
        />

        {uploadOpen && deptQuery.data && (
          <HandbookUploadModal
            departmentId={id!}
            departmentName={deptQuery.data.name}
            currentPath={deptQuery.data.handbook_url}
            onClose={() => setUploadOpen(false)}
          />
        )}

        {confirmRemoveHandbook && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-handbook-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          >
            <div className="w-full max-w-md rounded-[var(--radius-card)] bg-surface-lowest hairline p-6 shadow-lg">
              <h2 id="remove-handbook-title" className="text-headline-md">
                Remove this handbook?
              </h2>
              <p className="mt-2 text-body-sm text-on-surface-variant">
                The team loses access to it straight away. You can upload a new one at any time.
              </p>
              {uploadError && (
                <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                  {uploadError}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmRemoveHandbook(false)}
                  className="rounded-full hairline px-4 py-2.5 text-body-sm font-medium text-on-surface hover:border-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => removeHandbook.mutate()}
                  disabled={removeHandbook.isPending}
                  className="rounded-full bg-error px-4 py-2.5 text-body-sm font-medium text-on-error hover:opacity-90 disabled:opacity-50"
                >
                  {removeHandbook.isPending ? 'Removing…' : 'Yes, remove'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </QueryState>
  )
}
