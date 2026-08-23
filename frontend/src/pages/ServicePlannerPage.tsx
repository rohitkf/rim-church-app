import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { QueryState } from '../components/QueryState'
import { addMinutesIso, combineDateAndTime, formatTime, timeInputValue } from '../lib/time'
import {
  serviceSchema,
  serviceSessionRowSchema,
  profileOptionSchema,
  type ProfileOption,
  type Service,
  type ServiceSessionRow,
} from '../lib/types'

async function fetchService(id: string): Promise<Service | null> {
  const { data, error } = await supabase.from('services').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? serviceSchema.parse(data) : null
}

async function fetchSessions(serviceId: string): Promise<ServiceSessionRow[]> {
  const { data, error } = await supabase
    .from('service_sessions')
    .select('*, assignee:profiles!service_sessions_assigned_user_id_fkey(id, first_name, last_name)')
    .eq('service_id', serviceId)
    .order('order_index')
  if (error) throw error
  return z.array(serviceSessionRowSchema).parse(data)
}

async function fetchProfileOptions(): Promise<ProfileOption[]> {
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name').order('first_name')
  if (error) throw error
  return z.array(profileOptionSchema).parse(data)
}

export function ServicePlannerPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const { isAdmin, hasRole } = useAuth()
  const queryClient = useQueryClient()

  const canManage = isAdmin || hasRole('service_flow_coordinator', { serviceId })

  const serviceQuery = useQuery({
    queryKey: ['service', serviceId],
    queryFn: () => fetchService(serviceId!),
    enabled: !!serviceId,
  })
  const sessionsQuery = useQuery({
    queryKey: ['service-sessions', serviceId],
    queryFn: () => fetchSessions(serviceId!),
    enabled: !!serviceId,
  })
  const profilesQuery = useQuery({ queryKey: ['profile-options'], queryFn: fetchProfileOptions, enabled: canManage })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['service-sessions', serviceId] })

  const updateField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ServiceSessionRow> }) => {
      const { error } = await supabase.from('service_sessions').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const addSession = useMutation({
    mutationFn: async () => {
      const sessions = sessionsQuery.data ?? []
      const last = sessions[sessions.length - 1]
      const nextOrderIndex = (last?.order_index ?? 0) + 1
      const startTime = last
        ? addMinutesIso(last.start_time, last.duration_minutes)
        : combineDateAndTime(serviceQuery.data!.date, '09:00')

      const { error } = await supabase.from('service_sessions').insert({
        service_id: serviceId,
        order_index: nextOrderIndex,
        start_time: startTime,
        duration_minutes: 5,
        session_name: 'New Session',
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const sessions = sessionsQuery.data ?? []
      const { error: deleteError } = await supabase.from('service_sessions').delete().eq('id', sessionId)
      if (deleteError) throw deleteError

      const remaining = sessions.filter((s) => s.id !== sessionId)
      let cursor: string | null = null
      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i]
        const newOrderIndex = i + 1
        const newStart = i === 0 ? s.start_time : cursor!
        if (newOrderIndex !== s.order_index || newStart !== s.start_time) {
          const { error } = await supabase
            .from('service_sessions')
            .update({ order_index: newOrderIndex, start_time: newStart })
            .eq('id', s.id)
          if (error) throw error
        }
        cursor = addMinutesIso(newStart, s.duration_minutes)
      }
    },
    onSuccess: invalidate,
  })

  const sessions = sessionsQuery.data ?? []

  return (
    <QueryState
      isLoading={serviceQuery.isLoading}
      error={serviceQuery.error}
      isEmpty={serviceQuery.data === null}
      emptyMessage="Service not found."
    >
      <div>
        <Link to="/service-planner" className="text-body-sm text-secondary">
          ← Back to Service Planner
        </Link>
        <div className="mt-2 flex items-start justify-between">
          <div>
            <h1 className="text-headline-xl">{serviceQuery.data?.service_type} Service Plan</h1>
            <p className="mt-1 text-body-md text-on-surface-variant">{serviceQuery.data?.date}</p>
          </div>
          {canManage && (
            <button
              onClick={() => addSession.mutate()}
              disabled={addSession.isPending}
              className="rounded-sm bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
            >
              {addSession.isPending ? 'Adding…' : '+ Add Session'}
            </button>
          )}
        </div>

        <QueryState isLoading={sessionsQuery.isLoading} error={sessionsQuery.error} isEmpty={sessions.length === 0} emptyMessage="No sessions yet.">
          <div className="mt-6 overflow-x-auto rounded-lg border border-border-subtle bg-surface-lowest">
            <table className="w-full text-left text-body-sm">
              <thead>
                <tr className="border-b border-border-subtle font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Assigned</th>
                  {canManage && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {sessions.map((session, idx) => {
                  const isFirst = idx === 0
                  return (
                    <tr key={`${session.id}-${session.updated_at}`} className="border-b border-border-subtle last:border-0">
                      <td className="px-4 py-3 font-mono">
                        {isFirst && canManage ? (
                          <input
                            type="time"
                            defaultValue={timeInputValue(session.start_time)}
                            onBlur={(e) => {
                              if (!e.target.value) return
                              updateField.mutate({
                                id: session.id,
                                patch: { start_time: combineDateAndTime(serviceQuery.data!.date, e.target.value) },
                              })
                            }}
                            className="rounded-sm border border-border-subtle px-2 py-1"
                          />
                        ) : (
                          <span className={isFirst ? '' : 'text-on-surface-variant'}>{formatTime(session.start_time)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canManage ? (
                          <input
                            type="number"
                            min={0}
                            defaultValue={session.duration_minutes}
                            onBlur={(e) => {
                              const value = Number(e.target.value)
                              if (Number.isNaN(value) || value === session.duration_minutes) return
                              updateField.mutate({ id: session.id, patch: { duration_minutes: value } })
                            }}
                            className="w-20 rounded-sm border border-border-subtle px-2 py-1"
                          />
                        ) : (
                          session.duration_minutes
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canManage ? (
                          <input
                            defaultValue={session.session_name}
                            onBlur={(e) => {
                              if (!e.target.value.trim() || e.target.value === session.session_name) return
                              updateField.mutate({ id: session.id, patch: { session_name: e.target.value.trim() } })
                            }}
                            className="w-full rounded-sm border border-border-subtle px-2 py-1"
                          />
                        ) : (
                          session.session_name
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canManage ? (
                          <select
                            defaultValue={session.assigned_user_id ?? ''}
                            onChange={(e) =>
                              updateField.mutate({ id: session.id, patch: { assigned_user_id: e.target.value || null } })
                            }
                            className="rounded-sm border border-border-subtle px-2 py-1"
                          >
                            <option value="">Unassigned</option>
                            {profilesQuery.data?.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.first_name} {p.last_name}
                              </option>
                            ))}
                          </select>
                        ) : session.assignee ? (
                          `${session.assignee.first_name} ${session.assignee.last_name}`
                        ) : (
                          <span className="text-on-surface-variant">Unassigned</span>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => deleteSession.mutate(session.id)}
                            className="text-body-sm text-error hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </QueryState>
      </div>
    </QueryState>
  )
}
