import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { ActionButton, inputClasses } from './Surface'
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
    /*
     * A column, not a row.
     *
     * The fields used to sit side by side, which put "Team" and "Who" on
     * different baselines and let a two-line segment label stretch one
     * control taller than the other — the alignment reads as a mistake
     * even when nothing is broken. Stacked, every label lines up, every
     * control is the same width, and the panel fits the narrow column it
     * now lives in.
     *
     * The ring is orange rather than the usual hairline: this is the one
     * thing on the page that makes a phone buzz in someone's pocket, and
     * it should not look like the box above it.
     */
    <section className="rounded-[var(--radius-tile)] bg-surface-lowest p-5 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_22%,transparent)]">
      <div className="flex items-center gap-2">
        <svg
          className="h-4 w-4 shrink-0 text-accent-orange"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        <span className="font-mono text-eyebrow uppercase tracking-[0.18em] text-accent-orange">
          Send an alert
        </span>
      </div>
      <p className="mt-2 text-label-md text-on-surface-variant">
        Goes to their notifications, their phone, and a message they have to dismiss. It lands on
        the team&rsquo;s own board too, so it can be read again later.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {departments.length > 1 && (
          <label className="flex flex-col gap-1.5">
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

        <div className="flex flex-col gap-1.5">
          <span className="text-label-sm text-on-surface-variant">Who</span>
          <div className="flex gap-1 rounded-full bg-inset p-1 hairline">
            {scopeButton('team', 'Everyone')}
            {scopeButton('service', 'One service')}
          </div>
        </div>

        {scope === 'service' && (
          <label className="flex flex-col gap-1.5">
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
          rows={3}
          className={`${inputClasses} min-h-24 resize-y`}
        />

        <div className="flex items-center justify-between gap-3">
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
          <p aria-live="polite" className="text-label-md text-on-surface-variant">
            {note}
          </p>
        )}
        {error && (
          <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
