import { type FormEvent, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { useHandbookUrl } from '../lib/useHandbookUrl'
import { StatusBadge, SegmentedProgressBar } from '../components/ChecklistStatus'
import {
  departmentSchema,
  serviceSchema,
  departmentMemberRowSchema,
  checklistItemRowSchema,
  attendanceRowSchema,
  type AttendanceRow,
  type ChecklistItemRow,
  type Department,
  type DepartmentMemberRow,
  type Service,
} from '../lib/types'

async function fetchDepartment(id: string): Promise<Department | null> {
  const { data, error } = await supabase.from('departments').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? departmentSchema.parse(data) : null
}

async function fetchService(id: string): Promise<Service | null> {
  const { data, error } = await supabase.from('services').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? serviceSchema.parse(data) : null
}

async function fetchCoreMembers(departmentId: string): Promise<DepartmentMemberRow[]> {
  const { data, error } = await supabase
    .from('department_members')
    .select('*, profiles(id, first_name, last_name, email, phone, avatar_url)')
    .eq('department_id', departmentId)
    .eq('member_type', 'core')
  if (error) throw error
  return z.array(departmentMemberRowSchema).parse(data)
}

async function fetchChecklistId(departmentId: string, serviceId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('checklists')
    .select('id')
    .eq('department_id', departmentId)
    .eq('service_id', serviceId)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

async function fetchChecklistItems(checklistId: string): Promise<ChecklistItemRow[]> {
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*, assignee:profiles!checklist_items_assigned_to_fkey(id, first_name, last_name)')
    .eq('checklist_id', checklistId)
    .order('created_at')
  if (error) throw error
  return z.array(checklistItemRowSchema).parse(data)
}

async function fetchAttendance(departmentId: string, serviceId: string): Promise<AttendanceRow | null> {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('department_id', departmentId)
    .eq('service_id', serviceId)
    .maybeSingle()
  if (error) throw error
  return data ? attendanceRowSchema.parse(data) : null
}

export function DepartmentPrepPage() {
  const { departmentId, serviceId } = useParams<{ departmentId: string; serviceId: string }>()
  const { session, isAdmin, hasRole } = useAuth()
  const myId = session?.user.id
  const queryClient = useQueryClient()

  const canManageChecklist = isAdmin || hasRole('department_head', { departmentId })
  const canHeadVerify =
    isAdmin || hasRole('department_head', { departmentId }) || hasRole('assisting_head', { departmentId })
  const canCoordinatorVerify = isAdmin || hasRole('service_flow_coordinator', { serviceId })
  const canLogAttendance = isAdmin || hasRole('department_head', { departmentId })

  const [newLabel, setNewLabel] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [itemError, setItemError] = useState<string | null>(null)
  const [expected, setExpected] = useState('')
  const [actual, setActual] = useState('')
  const [attendanceError, setAttendanceError] = useState<string | null>(null)

  const deptQuery = useQuery({
    queryKey: ['department', departmentId],
    queryFn: () => fetchDepartment(departmentId!),
    enabled: !!departmentId,
  })
  const serviceQuery = useQuery({
    queryKey: ['service', serviceId],
    queryFn: () => fetchService(serviceId!),
    enabled: !!serviceId,
  })
  const membersQuery = useQuery({
    queryKey: ['department-core-members', departmentId],
    queryFn: () => fetchCoreMembers(departmentId!),
    enabled: !!departmentId && canManageChecklist,
  })
  const checklistIdQuery = useQuery({
    queryKey: ['checklist-id', departmentId, serviceId],
    queryFn: () => fetchChecklistId(departmentId!, serviceId!),
    enabled: !!departmentId && !!serviceId,
  })
  const itemsQuery = useQuery({
    queryKey: ['checklist-items', checklistIdQuery.data],
    queryFn: () => fetchChecklistItems(checklistIdQuery.data!),
    enabled: !!checklistIdQuery.data,
  })
  const attendanceQuery = useQuery({
    queryKey: ['attendance', departmentId, serviceId],
    queryFn: () => fetchAttendance(departmentId!, serviceId!),
    enabled: !!departmentId && !!serviceId,
  })
  const handbookQuery = useHandbookUrl(deptQuery.data?.handbook_url)

  const invalidateItems = () => {
    queryClient.invalidateQueries({ queryKey: ['checklist-items', checklistIdQuery.data] })
  }

  const createChecklist = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('checklists').insert({ department_id: departmentId, service_id: serviceId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checklist-id', departmentId, serviceId] }),
  })

  const addItem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('checklist_items').insert({
        checklist_id: checklistIdQuery.data,
        role_label: newLabel.trim(),
        assigned_to: newAssignee,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setNewLabel('')
      setNewAssignee('')
      setItemError(null)
      invalidateItems()
    },
    onError: (err: unknown) => setItemError(err instanceof Error ? err.message : 'Could not add item.'),
  })

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('checklist_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onSuccess: invalidateItems,
  })

  const memberComplete = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('checklist_items')
        .update({ status: 'member_complete', completed_by: myId, completed_at: new Date().toISOString() })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: invalidateItems,
  })

  const headVerify = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('checklist_items')
        .update({ status: 'head_verified', verified_by_head: myId, verified_by_head_at: new Date().toISOString() })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: invalidateItems,
  })

  const coordinatorVerify = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('checklist_items')
        .update({
          status: 'coordinator_verified',
          verified_by_coordinator: myId,
          verified_by_coordinator_at: new Date().toISOString(),
        })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: invalidateItems,
  })

  const logAttendance = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('attendance').upsert(
        {
          department_id: departmentId,
          service_id: serviceId,
          expected_count: Number(expected) || 0,
          actual_count: actual === '' ? null : Number(actual),
          logged_by: myId,
          logged_at: new Date().toISOString(),
        },
        { onConflict: 'department_id,service_id' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      setAttendanceError(null)
      queryClient.invalidateQueries({ queryKey: ['attendance', departmentId, serviceId] })
    },
    onError: (err: unknown) => setAttendanceError(err instanceof Error ? err.message : 'Could not log attendance.'),
  })

  function handleAddItem(e: FormEvent) {
    e.preventDefault()
    if (!newLabel.trim() || !newAssignee) return
    addItem.mutate()
  }

  function handleLogAttendance(e: FormEvent) {
    e.preventDefault()
    logAttendance.mutate()
  }

  const items = itemsQuery.data ?? []
  const counts = {
    memberComplete: items.filter((i) => i.status === 'member_complete').length,
    headVerified: items.filter((i) => i.status === 'head_verified').length,
    coordinatorVerified: items.filter((i) => i.status === 'coordinator_verified').length,
  }

  const attendancePct =
    attendanceQuery.data?.actual_count != null && attendanceQuery.data.expected_count > 0
      ? Math.round((attendanceQuery.data.actual_count / attendanceQuery.data.expected_count) * 100)
      : null

  return (
    <QueryState
      isLoading={deptQuery.isLoading || serviceQuery.isLoading}
      error={deptQuery.error || serviceQuery.error}
      isEmpty={deptQuery.data === null || serviceQuery.data === null}
      emptyMessage="Department or service not found, or you don't have access."
    >
      <div>
        <Link to="/checklists" className="text-body-sm text-secondary">
          ← Back to Checklists
        </Link>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <h1 className="text-headline-xl">{deptQuery.data?.name} Department Prep</h1>
            <p className="mt-1 text-body-md text-on-surface-variant">
              {serviceQuery.data?.service_type} Service — {serviceQuery.data?.date}
            </p>
          </div>
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
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <section className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
            <h2 className="text-headline-md">Pre-Service Tasks</h2>

            {checklistIdQuery.data === null && !checklistIdQuery.isLoading && (
              <div className="mt-4">
                <p className="text-body-sm text-on-surface-variant">No checklist exists for this service yet.</p>
                {canManageChecklist && (
                  <button
                    onClick={() => createChecklist.mutate()}
                    disabled={createChecklist.isPending}
                    className="mt-3 rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                  >
                    {createChecklist.isPending ? 'Creating…' : 'Create Checklist'}
                  </button>
                )}
              </div>
            )}

            {checklistIdQuery.data && (
              <QueryState isLoading={itemsQuery.isLoading} error={itemsQuery.error} isEmpty={items.length === 0} emptyMessage="No tasks added yet.">
                <ul className="mt-4 flex flex-col gap-3">
                  {items.map((item) => {
                    const canMemberComplete = item.status === 'pending' && item.assigned_to === myId
                    const canThisHeadVerify = item.status === 'member_complete' && canHeadVerify
                    const canThisCoordinatorVerify = item.status === 'head_verified' && canCoordinatorVerify

                    return (
                      <li key={item.id} className="rounded-lg border border-border-subtle p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-on-surface">{item.role_label}</div>
                            <div className="mt-1 text-body-sm text-on-surface-variant">
                              {item.assignee ? `${item.assignee.first_name} ${item.assignee.last_name}` : 'Unassigned'}
                            </div>
                          </div>
                          <StatusBadge status={item.status} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {canMemberComplete && (
                            <button
                              onClick={() => memberComplete.mutate(item.id)}
                              className="rounded-sm bg-status-member px-3 py-1.5 text-body-sm font-medium text-white hover:opacity-90"
                            >
                              Mark Complete
                            </button>
                          )}
                          {canThisHeadVerify && (
                            <button
                              onClick={() => headVerify.mutate(item.id)}
                              className="rounded-sm bg-status-head px-3 py-1.5 text-body-sm font-medium text-white hover:opacity-90"
                            >
                              Verify (Head)
                            </button>
                          )}
                          {canThisCoordinatorVerify && (
                            <button
                              onClick={() => coordinatorVerify.mutate(item.id)}
                              className="rounded-sm bg-status-coordinator px-3 py-1.5 text-body-sm font-medium text-white hover:opacity-90"
                            >
                              Verify (Coordinator)
                            </button>
                          )}
                          {canManageChecklist && (
                            <button
                              onClick={() => deleteItem.mutate(item.id)}
                              className="ml-auto text-body-sm text-error hover:underline"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </QueryState>
            )}

            {checklistIdQuery.data && canManageChecklist && (
              <form onSubmit={handleAddItem} className="mt-6 flex flex-wrap items-end gap-2 border-t border-border-subtle pt-4">
                <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
                  Task
                  <input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Test all microphone batteries"
                    className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
                  />
                </label>
                <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
                  Assign to
                  <select
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
                  >
                    <option value="">Select…</option>
                    {membersQuery.data?.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.profiles ? `${m.profiles.first_name} ${m.profiles.last_name}` : m.user_id}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={addItem.isPending}
                  className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                >
                  {addItem.isPending ? 'Adding…' : 'Add'}
                </button>
              </form>
            )}
            {itemError && (
              <p className="mt-2 rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">{itemError}</p>
            )}
          </section>

          <div className="flex flex-col gap-6">
            <section className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
              <h2 className="text-headline-md">Department Readiness</h2>
              <div className="mt-4">
                <SegmentedProgressBar
                  total={items.length}
                  memberComplete={counts.memberComplete}
                  headVerified={counts.headVerified}
                  coordinatorVerified={counts.coordinatorVerified}
                />
              </div>
            </section>

            <section className="rounded-lg border border-border-subtle bg-surface-lowest p-6">
              <h2 className="text-headline-md">Team Attendance</h2>
              <QueryState isLoading={attendanceQuery.isLoading} error={attendanceQuery.error}>
                <div className="mt-4 flex items-center justify-between text-body-sm">
                  <span className="text-on-surface-variant">Expected</span>
                  <span className="font-medium text-on-surface">{attendanceQuery.data?.expected_count ?? '—'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-body-sm">
                  <span className="text-on-surface-variant">Actual</span>
                  <span className="font-medium text-on-surface">
                    {attendanceQuery.data?.actual_count ?? '—'}
                    {attendancePct !== null && (
                      <span className="ml-1 text-on-surface-variant">({attendancePct}%)</span>
                    )}
                  </span>
                </div>

                {canLogAttendance && (
                  <form onSubmit={handleLogAttendance} className="mt-4 flex flex-col gap-2 border-t border-border-subtle pt-4">
                    <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
                      Expected
                      <input
                        type="number"
                        min={0}
                        value={expected}
                        onChange={(e) => setExpected(e.target.value)}
                        placeholder={String(attendanceQuery.data?.expected_count ?? '')}
                        className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
                      Actual volunteers present
                      <input
                        type="number"
                        min={0}
                        value={actual}
                        onChange={(e) => setActual(e.target.value)}
                        placeholder="Enter count…"
                        className="rounded-sm border border-border-subtle px-3 py-2 text-body-md text-on-surface"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={logAttendance.isPending}
                      className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                    >
                      {logAttendance.isPending ? 'Logging…' : 'Log'}
                    </button>
                    {attendanceError && (
                      <p className="rounded-sm bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                        {attendanceError}
                      </p>
                    )}
                  </form>
                )}
              </QueryState>
            </section>
          </div>
        </div>
      </div>
    </QueryState>
  )
}
