import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { usePermissions } from '../lib/usePermissions'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import {
  ONBOARDING_KEY,
  fetchEveryonesOnboarding,
  pushTour,
  tourStatusOf,
  type TourStatus,
} from '../lib/onboarding'
import { ActionButton, SectionTile, inputClasses } from './Surface'
import { QueryState } from './QueryState'
import { useConfirmAction } from './ConfirmAction'
import { LocationAccessCard } from './LocationAccessCard'

/**
 * Settings › Onboarding: send the tour, and see who has taken it.
 *
 * Everyone at once, or a few picked by name. Whoever it is sent to gets a
 * bell notification and the tour the next time they open the app — the
 * whole tour for their standing, whether or not they have seen it before.
 * The list says where each person is with it, so "did they ever see it?"
 * has an answer before anyone is sent it twice.
 */

const personSchema = z.object({ id: z.string(), first_name: z.string(), last_name: z.string() })
type Person = z.infer<typeof personSchema>

async function fetchPeople(): Promise<Person[]> {
  const { data, error } = await supabase.from('profiles').select('id, first_name, last_name').order('first_name')
  if (error) throw error
  return z.array(personSchema).parse(data ?? [])
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

function StatusChip({ status }: { status: TourStatus }) {
  const look =
    status.kind === 'taken'
      ? 'bg-accent-green/15 text-accent-green-soft'
      : status.kind === 'sent'
        ? 'bg-accent-orange/15 text-accent-orange-soft'
        : 'bg-raised-strong text-on-surface-variant'
  const text =
    status.kind === 'taken'
      ? `Taken ${day(status.at)}`
      : status.kind === 'sent'
        ? `Sent ${day(status.at)} · waiting`
        : 'Not yet'
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-label-sm ${look}`}>{text}</span>
  )
}

export function OnboardingCard() {
  const { can } = usePermissions()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const [filter, setFilter] = useState('')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  const people = useQuery({ queryKey: ['onboarding-people'], queryFn: fetchPeople })
  const rows = useQuery({ queryKey: [...ONBOARDING_KEY, 'everyone'], queryFn: fetchEveryonesOnboarding })

  const send = useMutation({
    mutationFn: (ids: string[] | null) => pushTour(ids),
    onSuccess: (n, ids) => {
      setError(null)
      setPicked(new Set())
      showToast(
        ids === null
          ? `Tour sent to everyone (${n})`
          : `Tour sent to ${n} ${n === 1 ? 'person' : 'people'}`,
      )
      return queryClient.invalidateQueries({ queryKey: ONBOARDING_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not send the tour.')),
  })

  const byId = useMemo(() => new Map((rows.data ?? []).map((r) => [r.user_id, r])), [rows.data])
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (people.data ?? []).filter((p) => !q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
  }, [people.data, filter])

  if (!can('people.onboard')) return null

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="flex flex-col gap-4">
      <SectionTile
        title="Send the tour"
        hint="Whoever you send it to gets a notification, and the tour opens for them the next time they open the app — the whole tour for their standing, whether or not they have seen it before."
      >
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            onClick={() =>
              ask({
                title: 'Send the tour to everyone?',
                body: 'Every account gets the tour for their standing the next time they open the app, and a notification saying so.',
                confirmLabel: 'Send to everyone',
                onConfirm: () => send.mutate(null),
              })
            }
            disabled={send.isPending}
          >
            Send to everyone
          </ActionButton>
          <ActionButton
            tone="quiet"
            onClick={() => send.mutate([...picked])}
            disabled={picked.size === 0 || send.isPending}
          >
            {picked.size === 0
              ? 'Send to the people ticked below'
              : `Send to ${picked.size} ${picked.size === 1 ? 'person' : 'people'}`}
          </ActionButton>
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}
      </SectionTile>

      <SectionTile title="Who has taken it" hint="Tick anyone to send it to them.">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Find somebody"
          placeholder="Find somebody"
          className={inputClasses}
        />
        <QueryState
          isLoading={people.isLoading || rows.isLoading}
          error={people.error || rows.error}
          isEmpty={shown.length === 0}
          emptyMessage="Nobody by that name."
        >
          <ul className="mt-3 flex flex-col divide-y divide-border-subtle">
            {shown.map((p) => {
              const id = `tour-pick-${p.id}`
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <label htmlFor={id} className="flex min-w-0 items-center gap-3 text-body-sm text-on-surface">
                    <input
                      id={id}
                      type="checkbox"
                      checked={picked.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                    />
                    <span className="min-w-0 break-words">
                      {p.first_name} {p.last_name}
                    </span>
                  </label>
                  <StatusChip status={tourStatusOf(byId.get(p.id))} />
                </li>
              )
            })}
          </ul>
        </QueryState>
      </SectionTile>

      <LocationAccessCard />
      {dialog}
    </div>
  )
}
