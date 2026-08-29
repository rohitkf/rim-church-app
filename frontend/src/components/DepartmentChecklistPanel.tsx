import { type FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from './QueryState'
import { StatusBadge, SegmentedProgressBar } from './ChecklistStatus'
import { useHandbookUrl } from '../lib/useHandbookUrl'
import { todayIso } from '../lib/monthGrid'
import { formatServiceDay } from '../lib/sunday'
import { useErrorText } from '../lib/useErrorText'
import { useServiceFlowSigner } from '../lib/useServiceFlowSigner'
import { useTeamCoordinator } from '../lib/useTeamCoordinator'
import {
  departmentSchema,
  departmentMemberRowSchema,
  checklistItemRowSchema,
  type ChecklistItemRow,
  type Department,
  type DepartmentMemberRow,
} from '../lib/types'

async function fetchDepartment(id: string): Promise<Department | null> {
  const { data, error } = await supabase.from('departments').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? departmentSchema.parse(data) : null
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


interface DepartmentChecklistPanelProps {
  departmentId: string
  serviceId: string
  /** The service's date, so the panel can lock editing outside its day. */
  serviceDate?: string
  /** Shown above the panel when the surrounding page doesn't name the department. */
  showDepartmentName?: boolean
}

/**
 * One department's checklist for one service: the task list with its
 * three-stage verification and readiness bar. Turnout is recorded in the
 * Availability Tracker instead. Rendered
 * inline on the Checklists page and as the body of the deep-linked prep
 * page, so both stay in step.
 */
export function DepartmentChecklistPanel({
  departmentId,
  serviceId,
  serviceDate,
  showDepartmentName = false,
}: DepartmentChecklistPanelProps) {
  const { session, isAdmin, isDepartmentHead } = useAuth()
  const errorText = useErrorText()
  const myId = session?.user.id
  const queryClient = useQueryClient()

  const roleAllowsCoordinatorVerify = useServiceFlowSigner(serviceId)
  // Whoever the rota has coordinating this team at this service stands in
  // for the Head on it — see useTeamCoordinator.
  const isTeamCoordinator = useTeamCoordinator(serviceId, departmentId)

  // Managing the checklist and verifying a member's item are the same
  // right — you are over this team today — so they are one predicate. Two
  // spellings of one rule is how the Assisting Head ended up able to
  // verify an item but not to manage the list it was on.
  const roleAllowsHeadWork = isAdmin || isDepartmentHead(departmentId) || isTeamCoordinator

  // Outside Admin, a checklist is only workable on the service's own day —
  // beforehand or after the fact it's read-only, so a past week's record
  // can't be quietly rewritten.
  const editingLocked = !isAdmin && !!serviceDate && serviceDate !== todayIso()

  const canManageChecklist = roleAllowsHeadWork && !editingLocked
  const canHeadVerify = canManageChecklist
  const canCoordinatorVerify = roleAllowsCoordinatorVerify && !editingLocked

  const [newLabel, setNewLabel] = useState('')
  const [newAssignee, setNewAssignee] = useState('')
  const [itemError, setItemError] = useState<string | null>(null)

  const deptQuery = useQuery({
    queryKey: ['department', departmentId],
    queryFn: () => fetchDepartment(departmentId),
  })
  const membersQuery = useQuery({
    queryKey: ['department-core-members', departmentId],
    queryFn: () => fetchCoreMembers(departmentId),
    enabled: canManageChecklist,
  })
  const checklistIdQuery = useQuery({
    queryKey: ['checklist-id', departmentId, serviceId],
    queryFn: () => fetchChecklistId(departmentId, serviceId),
  })
  const itemsQuery = useQuery({
    queryKey: ['checklist-items', checklistIdQuery.data],
    queryFn: () => fetchChecklistItems(checklistIdQuery.data!),
    enabled: !!checklistIdQuery.data,
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
    onError: (err: unknown) => setItemError(errorText(err, 'Could not create the checklist.')),
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
    onError: (err: unknown) => setItemError(errorText(err, 'Could not add item.')),
  })

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('checklist_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onSuccess: invalidateItems,
    onError: (err: unknown) => setItemError(errorText(err, 'Could not delete item.')),
  })

  const setStatus = useMutation({
    mutationFn: async ({ itemId, patch }: { itemId: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from('checklist_items').update(patch).eq('id', itemId)
      if (error) throw error
    },
    onSuccess: invalidateItems,
    onError: (err: unknown) => setItemError(errorText(err, 'Could not update the task.')),
  })



  function handleAddItem(e: FormEvent) {
    e.preventDefault()
    if (!newLabel.trim() || !newAssignee) return
    addItem.mutate()
  }



  const items = itemsQuery.data ?? []
  const counts = {
    memberComplete: items.filter((i) => i.status === 'member_complete').length,
    headVerified: items.filter((i) => i.status === 'head_verified').length,
    coordinatorVerified: items.filter((i) => i.status === 'coordinator_verified').length,
  }

  return (
    <div>
      {(showDepartmentName || handbookQuery.data) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {showDepartmentName ? (
            <h3 className="text-headline-md">{deptQuery.data?.name}</h3>
          ) : (
            <span />
          )}
          {handbookQuery.data && (
            <a
              href={handbookQuery.data}
              target="_blank"
              rel="noreferrer"
              className="tap rounded-full hairline bg-surface-lowest px-4 py-2 text-body-sm font-medium text-on-surface hover:border-secondary"
            >
              Download Handbook PDF
            </a>
          )}
        </div>
      )}

      {editingLocked && (
        <p className="mt-4 rounded-full hairline bg-surface-container px-3 py-2 text-body-sm text-on-surface-variant">
          View only — this checklist can be worked on {formatServiceDay(serviceDate!)}.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
          <h4 className="text-headline-md">Pre-Service Tasks</h4>

          {checklistIdQuery.data === null && !checklistIdQuery.isLoading && (
            <div className="mt-4">
              <p className="text-body-sm text-on-surface-variant">No checklist exists for this service yet.</p>
              {canManageChecklist && (
                <button
                  onClick={() => createChecklist.mutate()}
                  disabled={createChecklist.isPending}
                  className="mt-3 rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
                >
                  {createChecklist.isPending ? 'Creating…' : 'Create Checklist'}
                </button>
              )}
            </div>
          )}

          {checklistIdQuery.data && (
            <QueryState
              isLoading={itemsQuery.isLoading}
              error={itemsQuery.error}
              isEmpty={items.length === 0}
              emptyMessage="No tasks added yet."
            >
              <ul className="mt-4 flex flex-col gap-3">
                {items.map((item) => {
                  const canMemberComplete =
                    item.status === 'pending' && item.assigned_to === myId && !editingLocked
                  const canThisHeadVerify = item.status === 'member_complete' && canHeadVerify
                  const canThisCoordinatorVerify = item.status === 'head_verified' && canCoordinatorVerify

                  return (
                    <li key={item.id} className="rounded-[var(--radius-card)] hairline p-4">
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
                            onClick={() =>
                              setStatus.mutate({
                                itemId: item.id,
                                patch: {
                                  status: 'member_complete',
                                  completed_by: myId,
                                  completed_at: new Date().toISOString(),
                                },
                              })
                            }
                            className="rounded-sm bg-status-member px-3 py-1.5 text-body-sm font-medium text-white hover:opacity-90"
                          >
                            Mark Complete
                          </button>
                        )}
                        {canThisHeadVerify && (
                          <button
                            onClick={() =>
                              setStatus.mutate({
                                itemId: item.id,
                                patch: {
                                  status: 'head_verified',
                                  verified_by_head: myId,
                                  verified_by_head_at: new Date().toISOString(),
                                },
                              })
                            }
                            className="rounded-sm bg-status-head px-3 py-1.5 text-body-sm font-medium text-white hover:opacity-90"
                          >
                            Verify (Head)
                          </button>
                        )}
                        {canThisCoordinatorVerify && (
                          <button
                            onClick={() =>
                              setStatus.mutate({
                                itemId: item.id,
                                patch: {
                                  status: 'coordinator_verified',
                                  verified_by_coordinator: myId,
                                  verified_by_coordinator_at: new Date().toISOString(),
                                },
                              })
                            }
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
            <form
              onSubmit={handleAddItem}
              className="mt-6 flex flex-wrap items-end gap-2 border-t border-border-subtle pt-4"
            >
              <label className="flex flex-1 flex-col gap-1 text-body-sm text-on-surface-variant">
                Task
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Test all microphone batteries"
                  className="tap rounded-full hairline px-3 py-2 text-body-md text-on-surface"
                />
              </label>
              <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
                Assign to
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="tap rounded-full hairline px-3 py-2 text-body-md text-on-surface"
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
                className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
              >
                {addItem.isPending ? 'Adding…' : 'Add'}
              </button>
            </form>
          )}
          {itemError && (
            <p className="mt-2 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
              {itemError}
            </p>
          )}
        </section>

        <div className="flex flex-col gap-6">
          <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
            <h4 className="text-headline-md">Department Readiness</h4>
            <div className="mt-4">
              <SegmentedProgressBar
                total={items.length}
                memberComplete={counts.memberComplete}
                headVerified={counts.headVerified}
                coordinatorVerified={counts.coordinatorVerified}
              />
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
