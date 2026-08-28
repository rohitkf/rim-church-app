import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { ActionButton, Eyebrow, inputClasses } from './Surface'
import { fetchDepartments, fetchServices } from '../lib/queries'
import { formatServiceDay } from '../lib/sunday'
import { todayIso } from '../lib/monthGrid'

const MAX = 500

/**
 * Writing to a team, rather than to the board.
 *
 * A board post is a notice everyone can read next time they look; an alert
 * is a phone going off in someone's pocket. That difference is the whole
 * reason this is a separate thing with its own audience control, and why
 * only Admins and the heads of a team can send one to it.
 *
 * The audience toggle is the part worth getting right. "Everyone on the
 * team" is the whole roster, core and guest. "This service" is the people
 * the service actually needs — anyone rostered on it, plus anyone who said
 * they can or might serve. Someone who already answered no is not chased
 * about a service they have answered for.
 */
export function TeamAlertPanel() {
  const { isAdmin, ledDepartmentIds } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: fetchServices })

  const departments = (departmentsQuery.data ?? []).filter(
    (d) => isAdmin || ledDepartmentIds.includes(d.id),
  )
  const today = todayIso()
  const upcoming = (servicesQuery.data ?? [])
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6)

  const [deptId, setDeptId] = useState('')
  const [scope, setScope] = useState<'team' | 'service'>('team')
  const [serviceId, setServiceId] = useState('')
  const [body, setBody] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chosenDept = deptId || departments[0]?.id || ''
  const chosenService = serviceId || upcoming[0]?.id || ''

  const send = useMutation({
    mutationFn: async () => {
      const { data, error: rpcError } = await supabase.rpc('alert_team', {
        dept_id: chosenDept,
        message: body.trim(),
        svc_id: scope === 'service' ? chosenService : null,
      })
      if (rpcError) throw rpcError
      return typeof data === 'number' ? data : 0
    },
    onSuccess: (count) => {
      setBody('')
      setError(null)
      setNote(
        count === 0
          ? 'Nobody to send that to — everyone it applies to has already been told, or the list is empty.'
          : `Sent to ${count} ${count === 1 ? 'person' : 'people'}.`,
      )
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      window.setTimeout(() => setNote(null), 6000)
    },
    onError: (err: unknown) => {
      setNote(null)
      setError(errorText(err, "That alert didn't send."))
    },
  })

  // Nobody to send to means nothing to show: an ordinary member never sees
  // this panel at all.
  if (departments.length === 0) return null

  const scopeButton = (value: 'team' | 'service', label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setScope(value)}
      aria-pressed={scope === value}
      className={`flex-1 rounded-full px-3 py-2 text-label-md transition-colors duration-300 ease-[var(--ease-glide)] ${
        scope === value ? 'bg-primary font-medium text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
      }`}
    >
      {label}
    </button>
  )

  return (
    <section className="mt-6 rounded-[var(--radius-card)] bg-surface-lowest p-4 hairline">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Eyebrow>Send an alert</Eyebrow>
        <span className="text-label-sm text-on-surface-faint">
          Goes to their notifications and their phone — not to the board.
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        {departments.length > 1 && (
          <label className="flex min-w-40 flex-1 flex-col gap-1.5">
            <span className="text-label-sm text-on-surface-variant">Team</span>
            <select
              value={chosenDept}
              onChange={(e) => setDeptId(e.target.value)}
              className={inputClasses}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="min-w-52 flex-1">
          <span className="text-label-sm text-on-surface-variant">Who</span>
          <div className="mt-1.5 flex rounded-full bg-inset p-1 hairline">
            {scopeButton('team', 'Everyone on the team')}
            {scopeButton('service', 'One service')}
          </div>
        </div>
      </div>

      {scope === 'service' && (
        <label className="mt-3 flex flex-col gap-1.5">
          <span className="text-label-sm text-on-surface-variant">Service</span>
          <select
            value={chosenService}
            onChange={(e) => setServiceId(e.target.value)}
            className={inputClasses}
          >
            {upcoming.length === 0 && <option value="">No services coming up</option>}
            {upcoming.map((s) => (
              <option key={s.id} value={s.id}>
                {s.service_type} · {s.date === today ? 'Today' : formatServiceDay(s.date)}
              </option>
            ))}
          </select>
          <span className="text-label-sm text-on-surface-faint">
            Anyone rostered on it, plus anyone who said yes or maybe.
          </span>
        </label>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX))}
        placeholder="Sound check moved to 8:30 — please be set up before doors."
        rows={2}
        className={`${inputClasses} mt-3 resize-y`}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-label-sm text-on-surface-faint tabular">
          {body.length}/{MAX}
        </span>
        <ActionButton
          size="sm"
          onClick={() => send.mutate()}
          disabled={send.isPending || body.trim().length === 0 || !chosenDept}
        >
          {send.isPending ? 'Sending…' : 'Send alert'}
        </ActionButton>
      </div>

      {note && (
        <p aria-live="polite" className="mt-2 text-label-md text-on-surface-variant">
          {note}
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}
    </section>
  )
}
