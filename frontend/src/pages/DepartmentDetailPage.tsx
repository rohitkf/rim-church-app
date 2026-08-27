import { type FormEvent, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { HANDBOOK_BUCKET, useHandbookUrl } from '../lib/useHandbookUrl'
import { HandbookUploadModal } from '../components/HandbookUploadModal'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { searchProfiles, type ProfileSearchResult } from '../lib/queries'
import { DepartmentRolesCard } from '../components/DepartmentRolesCard'
import { errorMessage } from '../lib/errorMessage'
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

function ComplianceCell({ sensitive }: { sensitive: SensitiveByUser | undefined }) {
  // RLS on profile_sensitive is the source of truth: if the row wasn't
  // returned, this viewer isn't allowed to see it (Admin + the individual
  // only), so we show a neutral placeholder instead of guessing why.
  if (!sensitive) {
    return <span className="text-body-sm text-on-surface-variant">—</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      <span
        className={`rounded-full px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide ${
          sensitive.has_dbs
            ? 'bg-status-coordinator/15 text-status-coordinator'
            : 'bg-error-container text-on-error-container'
        }`}
      >
        {sensitive.has_dbs ? 'DBS Clear' : 'DBS Missing'}
      </span>
    </div>
  )
}

export function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, hasRole } = useAuth()
  const queryClient = useQueryClient()
  const canManage = isAdmin || hasRole('department_head', { departmentId: id })

  const [addEmail, setAddEmail] = useState('')
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
    onError: (err: unknown) => setAddError(errorMessage(err, 'Could not add member.')),
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
    onError: (err: unknown) => setUploadError(errorMessage(err, 'Could not remove the handbook.')),
  })

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!addEmail.trim()) return
    addMember.mutate({ email: addEmail.trim(), type: addType })
  }

  return (
    <QueryState isLoading={deptQuery.isLoading} error={deptQuery.error} isEmpty={deptQuery.data === null} emptyMessage="Department not found, or you don't have access to it.">
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-headline-xl">{deptQuery.data?.name}</h1>
            <p className="mt-1 text-body-md text-on-surface-variant">
              Manage core team members, guest access, and compliance status.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {handbookQuery.data && (
              <a
                href={handbookQuery.data}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm border border-border-subtle bg-surface-lowest px-4 py-2 text-body-sm font-medium text-on-surface hover:border-secondary"
              >
                {handbookLabel}
              </a>
            )}
            {canManage && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="rounded-sm border border-border-subtle bg-surface-lowest px-4 py-2 text-body-sm font-medium text-on-surface hover:border-secondary"
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
                    className="rounded-sm px-3 py-2 text-body-sm font-medium text-on-surface-variant hover:text-error"
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {uploadError && (
          <p className="mt-2 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">{uploadError}</p>
        )}

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-headline-md">Core Members</h2>
              <span className="rounded-full bg-surface-container px-2 py-0.5 font-mono text-label-sm text-on-surface-variant">
                {membersQuery.data?.filter((m) => m.member_type === 'core').length ?? 0} Active
              </span>
            </div>

            <QueryState isLoading={membersQuery.isLoading} error={membersQuery.error}>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                  <thead>
                    <tr className="border-b border-border-subtle font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                      <th className="py-2 pr-4">Member</th>
                      <th className="py-2 pr-4">Contact</th>
                      <th className="py-2 pr-4">Compliance</th>
                      {canManage && <th className="py-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {membersQuery.data
                      ?.filter((m) => m.member_type === 'core')
                      .map((m) => (
                        <tr key={m.id} className="border-b border-border-subtle last:border-0">
                          <td className="py-3 pr-4 font-medium text-on-surface">
                            {m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'Unknown user'}
                          </td>
                          <td className="py-3 pr-4 text-on-surface-variant">{m.profiles?.email}</td>
                          <td className="py-3 pr-4">
                            <ComplianceCell sensitive={sensitiveQuery.data?.[m.user_id]} />
                          </td>
                          {canManage && (
                            <td className="py-3 text-right">
                              <button
                                onClick={() => removeMember.mutate(m.id)}
                                className="text-body-sm text-error hover:underline"
                              >
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
                {membersQuery.data?.filter((m) => m.member_type === 'core').length === 0 && (
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
                      className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
                    />
                  </label>

                  {picked && (
                    <p className="text-label-sm text-secondary">
                      Adding {picked.first_name} {picked.last_name}
                    </p>
                  )}

                  {!picked && searchTerm.length >= 2 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-sm border border-border-subtle bg-surface-lowest shadow-lg">
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
                    className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
                  >
                    <option value="core">Core</option>
                    <option value="guest">Guest</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={addMember.isPending}
                  className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                >
                  {addMember.isPending ? 'Adding…' : 'Add'}
                </button>
              </form>
            )}
            {addError && (
              <p className="mt-2 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">{addError}</p>
            )}
          </section>

          {id && <DepartmentRolesCard departmentId={id} canManage={canManage} />}

          <section className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
            <h2 className="text-headline-md">Guest List</h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Users from other departments with visibility into this department's content.
            </p>
            <QueryState isLoading={membersQuery.isLoading} error={membersQuery.error}>
              <ul className="mt-4 flex flex-col gap-3">
                {membersQuery.data
                  ?.filter((m) => m.member_type === 'guest')
                  .map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between rounded-lg border border-border-subtle p-3"
                    >
                      <div>
                        <div className="text-body-sm font-medium text-on-surface">
                          {m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : 'Unknown user'}
                        </div>
                        <div className="text-body-sm text-on-surface-variant">{m.profiles?.email}</div>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => removeMember.mutate(m.id)}
                          className="text-body-sm text-error hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                {membersQuery.data?.filter((m) => m.member_type === 'guest').length === 0 && (
                  <p className="text-body-sm text-on-surface-variant">No guests yet.</p>
                )}
              </ul>
            </QueryState>
          </section>
        </div>

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
            <div className="w-full max-w-md rounded-lg border border-border-subtle bg-surface-lowest p-6 shadow-lg">
              <h2 id="remove-handbook-title" className="text-headline-md">
                Remove this handbook?
              </h2>
              <p className="mt-2 text-body-sm text-on-surface-variant">
                The team loses access to it straight away. You can upload a new one at any time.
              </p>
              {uploadError && (
                <p className="mt-3 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                  {uploadError}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmRemoveHandbook(false)}
                  className="rounded-sm border border-border-subtle px-4 py-2.5 text-body-sm font-medium text-on-surface hover:border-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => removeHandbook.mutate()}
                  disabled={removeHandbook.isPending}
                  className="rounded-sm bg-error px-4 py-2.5 text-body-sm font-medium text-on-error hover:opacity-90 disabled:opacity-50"
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
