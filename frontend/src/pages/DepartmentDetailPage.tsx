import { type FormEvent, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import type { Department, DepartmentMemberRow, MemberType, SensitiveByUser } from '../lib/types'

const HANDBOOK_BUCKET = 'handbooks'

async function fetchDepartment(id: string): Promise<Department | null> {
  const { data, error } = await supabase.from('departments').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

async function fetchMembers(id: string): Promise<DepartmentMemberRow[]> {
  const { data, error } = await supabase
    .from('department_members')
    .select('*, profiles(id, first_name, last_name, email, phone, avatar_url)')
    .eq('department_id', id)
  if (error) throw error
  return data as unknown as DepartmentMemberRow[]
}

async function fetchSensitive(userIds: string[]): Promise<Record<string, SensitiveByUser>> {
  if (userIds.length === 0) return {}
  const { data, error } = await supabase
    .from('profile_sensitive')
    .select('user_id, visa_type, has_dbs, visa_expiry')
    .in('user_id', userIds)
  if (error) throw error
  return Object.fromEntries(data.map((row) => [row.user_id, row]))
}

async function fetchHandbookUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(HANDBOOK_BUCKET).createSignedUrl(path, 300)
  if (error) return null
  return data.signedUrl
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

  const handbookQuery = useQuery({
    queryKey: ['department-handbook-url', deptQuery.data?.handbook_url],
    queryFn: () => fetchHandbookUrl(deptQuery.data?.handbook_url ?? null),
    enabled: !!deptQuery.data?.handbook_url,
  })

  const addMember = useMutation({
    mutationFn: async ({ email, type }: { email: string; type: MemberType }) => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      if (profileError) throw profileError
      if (!profile) throw new Error('No registered user with that email.')

      const { error } = await supabase
        .from('department_members')
        .insert({ department_id: id, user_id: profile.id, member_type: type })
      if (error) throw error
    },
    onSuccess: () => {
      setAddEmail('')
      setAddError(null)
      queryClient.invalidateQueries({ queryKey: ['department-members', id] })
    },
    onError: (err: unknown) => setAddError(err instanceof Error ? err.message : 'Could not add member.'),
  })

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('department_members').delete().eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['department-members', id] }),
  })

  const uploadHandbook = useMutation({
    mutationFn: async (file: File) => {
      const path = `${id}/handbook.pdf`
      const { error: uploadErr } = await supabase.storage
        .from(HANDBOOK_BUCKET)
        .upload(path, file, { upsert: true, contentType: 'application/pdf' })
      if (uploadErr) throw uploadErr

      const { error: updateErr } = await supabase.from('departments').update({ handbook_url: path }).eq('id', id)
      if (updateErr) throw updateErr
    },
    onSuccess: () => {
      setUploadError(null)
      queryClient.invalidateQueries({ queryKey: ['department', id] })
    },
    onError: (err: unknown) => setUploadError(err instanceof Error ? err.message : 'Upload failed.'),
  })

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!addEmail.trim()) return
    addMember.mutate({ email: addEmail.trim(), type: addType })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadHandbook.mutate(file)
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
                Download Handbook PDF
              </a>
            )}
            {canManage && (
              <label className="cursor-pointer rounded-sm border border-border-subtle bg-surface-lowest px-4 py-2 text-body-sm font-medium text-on-surface hover:border-secondary">
                {uploadHandbook.isPending ? 'Uploading…' : deptQuery.data?.handbook_url ? 'Replace Handbook' : 'Upload Handbook'}
                <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
              </label>
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
                <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
                  Add by email
                  <input
                    type="email"
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="member@example.com"
                    className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface focus:border-2 focus:border-secondary focus:outline-none"
                  />
                </label>
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
      </div>
    </QueryState>
  )
}
