import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import {
  LOCATION_ACCESS_KEY,
  PLATFORM_LABEL,
  accessStatusOf,
  fetchEveryonesLocationAccess,
  promptLocation,
  type AccessStatus,
  type LocationAccess,
} from '../lib/locationAccess'
import { ActionButton, SectionTile, inputClasses } from './Surface'
import { QueryState } from './QueryState'
import { useConfirmAction } from './ConfirmAction'

/**
 * Settings › Onboarding: whose phone allows location (0228), and asking the
 * rest to allow it — beside the tour, and to the same people.
 *
 * Each phone says its answer whenever the app opens on it, so the list is
 * as fresh as the last time each person opened the app. Asking sends a
 * notification that opens the page with the steps for an iPhone and for
 * Android.
 */

const personSchema = z.object({ id: z.string(), first_name: z.string(), last_name: z.string() })
type Person = z.infer<typeof personSchema>

async function fetchPeople(): Promise<Person[]> {
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name').order('first_name')
  if (error) throw error
  return z.array(personSchema).parse(data ?? [])
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

type Show = 'all' | 'allowed' | 'not'
const SHOW: { value: Show; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'not', label: 'Not allowed' },
  { value: 'allowed', label: 'Allowed' },
]

function StatusChip({ status }: { status: AccessStatus }) {
  const look =
    status.kind === 'allowed'
      ? 'bg-accent-green/15 text-accent-green-soft'
      : status.kind === 'blocked'
        ? 'bg-accent-red/15 text-accent-red-soft'
        : status.kind === 'not_yet'
          ? 'bg-accent-orange/15 text-accent-orange-soft'
          : 'bg-raised-strong text-on-surface-variant'
  const text =
    status.kind === 'allowed'
      ? 'Allowed'
      : status.kind === 'blocked'
        ? 'Blocked'
        : status.kind === 'not_yet'
          ? 'Not allowed yet'
          : 'Not opened since'
  return <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-label-sm ${look}`}>{text}</span>
}

function detailOf(row: LocationAccess | undefined): string | null {
  if (!row) return null
  const bits: string[] = []
  if (row.reported_at) {
    bits.push(`${PLATFORM_LABEL[row.platform]}${row.installed ? ' app' : ''} · ${day(row.reported_at)}`)
  }
  if (row.asked_at && row.state !== 'granted') bits.push(`asked ${day(row.asked_at)}`)
  return bits.length ? bits.join(' · ') : null
}

export function LocationAccessCard() {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const [filter, setFilter] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  const people = useQuery({ queryKey: ['onboarding-people'], queryFn: fetchPeople })
  const rows = useQuery({ queryKey: LOCATION_ACCESS_KEY, queryFn: fetchEveryonesLocationAccess })

  const send = useMutation({
    mutationFn: (ids: string[] | null) => promptLocation(ids),
    onSuccess: (n) => {
      setError(null)
      setPicked(new Set())
      showToast(n === 0 ? 'Nobody to ask' : `Asked ${n} ${n === 1 ? 'person' : 'people'} to allow location`)
      return queryClient.invalidateQueries({ queryKey: LOCATION_ACCESS_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not send that.')),
  })

  const byId = useMemo(() => new Map((rows.data ?? []).map((r) => [r.user_id, r])), [rows.data])
  const everyone = people.data ?? []
  const allowedCount = everyone.filter((p) => byId.get(p.id)?.state === 'granted').length
  const notCount = everyone.length - allowedCount

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (people.data ?? []).filter((p) => {
      if (q && !`${p.first_name} ${p.last_name}`.toLowerCase().includes(q)) return false
      const allowed = byId.get(p.id)?.state === 'granted'
      return show === 'all' || (show === 'allowed' ? allowed : !allowed)
    })
  }, [people.data, filter, show, byId])

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <SectionTile
      title="Location on their phones"
      hint={
        people.data && rows.data
          ? `${allowedCount} allowed · ${notCount} not. Updated whenever somebody opens the app. Asking sends a notification that opens the steps for iPhone and Android.`
          : 'Who has allowed location, so they can clock in. Asking sends a notification that opens the steps for iPhone and Android.'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton
          onClick={() =>
            ask({
              title: 'Ask everyone not allowing location?',
              body: `Everybody whose phone has not said it allows location${notCount ? ` (${notCount})` : ''} gets a notification asking them to, with the steps for their phone.`,
              confirmLabel: 'Ask them',
              onConfirm: () => send.mutate(null),
            })
          }
          disabled={send.isPending || notCount === 0}
        >
          Ask everyone not allowed
        </ActionButton>
        <ActionButton tone="quiet" onClick={() => send.mutate([...picked])} disabled={picked.size === 0 || send.isPending}>
          {picked.size === 0 ? 'Ask the people ticked below' : `Ask ${picked.size} ${picked.size === 1 ? 'person' : 'people'}`}
        </ActionButton>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Find somebody by name"
          placeholder="Find somebody"
          className={`${inputClasses} sm:flex-1`}
        />
        <div role="group" aria-label="Show" className="flex gap-1">
          {SHOW.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={show === s.value}
              onClick={() => setShow(s.value)}
              className={`tap rounded-full px-3 py-1 text-label-md ${
                show === s.value ? 'bg-primary text-on-primary' : 'bg-raised text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <QueryState
        isLoading={people.isLoading || rows.isLoading}
        error={people.error || rows.error}
        isEmpty={shown.length === 0}
        emptyMessage={filter.trim() ? 'Nobody by that name.' : 'Nobody here.'}
      >
        <ul aria-label="Location on their phones" className="mt-3 flex flex-col divide-y divide-border-subtle">
          {shown.map((p) => {
            const id = `location-pick-${p.id}`
            const row = byId.get(p.id)
            const detail = detailOf(row)
            return (
              <li key={p.id} aria-label={`${p.first_name} ${p.last_name}`.trim()} className="flex items-center justify-between gap-3 py-2.5">
                <label htmlFor={id} className="flex min-w-0 items-center gap-3 text-body-sm text-on-surface">
                  <input
                    id={id}
                    type="checkbox"
                    checked={picked.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="break-words">
                      {p.first_name} {p.last_name}
                    </span>
                    {detail && <span className="font-mono text-label-sm text-on-surface-faint">{detail}</span>}
                  </span>
                </label>
                <StatusChip status={accessStatusOf(row)} />
              </li>
            )
          })}
        </ul>
      </QueryState>
      {dialog}
    </SectionTile>
  )
}
