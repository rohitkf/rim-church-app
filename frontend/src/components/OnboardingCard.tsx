import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { usePermissions } from '../lib/usePermissions'
import { useErrorText } from '../lib/useErrorText'
import { showToast } from '../lib/toast'
import { ONBOARDING_KEY, fetchEveryonesOnboarding, pushTour, tourStatusOf, type OnboardingRow } from '../lib/onboarding'
import { LOCATION_ACCESS_KEY, fetchEveryonesLocationAccess } from '../lib/locationAccess'
import {
  SETUP_COLUMNS,
  SETUP_KEY,
  fetchPeopleSetup,
  hasSomethingLeft,
  promptSetup,
  setupTicksOf,
} from '../lib/gettingSetUp'
import { ActionButton, SectionTile, inputClasses } from './Surface'
import { QueryState } from './QueryState'
import { useConfirmAction } from './ConfirmAction'

/**
 * Settings › Onboarding: who has set up what, in one table, and asking
 * whoever has something left (0276) — and sending the tour.
 *
 * Names down the side, a tick for each thing done: who they are (the
 * joining form's questions, as ticks and never as answers), the tour,
 * location on their phone, notifications, the app on their home screen.
 * The ticks are the app's own record and cannot be set here; the box
 * beside a name only picks that person for the two buttons.
 *
 * Asking sends a bell notification and, the next time they open the app,
 * a card listing what is left on that phone — which they can close. The
 * details themselves need no asking: whoever has a blank is shown the
 * joining form before anything else (ProtectedRoute).
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

type Show = 'all' | 'left' | 'done'
const SHOW: { value: Show; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'left', label: 'Something left' },
  { value: 'done', label: 'All done' },
]

/** A tick that is read, never pressed: done, or still an empty box. */
function Tick({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      role="img"
      aria-label={`${label}: ${done ? 'done' : 'not yet'}`}
      className={`mx-auto flex h-5 w-5 items-center justify-center rounded-[6px] ${
        done ? 'bg-accent-green/15 text-accent-green-soft' : 'hairline-strong text-transparent'
      }`}
    >
      {done && (
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3.5 8.5l3 3 6-7" />
        </svg>
      )}
    </span>
  )
}

/** What the ticks cannot say: a tour sent and not opened, an ask still waiting. */
function detailOf(row: OnboardingRow | undefined, somethingLeft: boolean): string | null {
  const bits: string[] = []
  const tour = tourStatusOf(row)
  if (tour.kind === 'sent') bits.push(`tour sent ${day(tour.at)}`)
  if (row?.setup_asked_at && somethingLeft) bits.push(`asked ${day(row.setup_asked_at)}`)
  return bits.length ? bits.join(' · ') : null
}

export function OnboardingCard() {
  const { can } = usePermissions()
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const { ask, dialog } = useConfirmAction()
  const [filter, setFilter] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  const people = useQuery({ queryKey: ['onboarding-people'], queryFn: fetchPeople })
  const tours = useQuery({ queryKey: [...ONBOARDING_KEY, 'everyone'], queryFn: fetchEveryonesOnboarding })
  const setup = useQuery({ queryKey: SETUP_KEY, queryFn: fetchPeopleSetup })
  const locations = useQuery({ queryKey: LOCATION_ACCESS_KEY, queryFn: fetchEveryonesLocationAccess })

  const refresh = () => {
    setError(null)
    setPicked(new Set())
    void queryClient.invalidateQueries({ queryKey: LOCATION_ACCESS_KEY })
    return queryClient.invalidateQueries({ queryKey: ONBOARDING_KEY })
  }

  const send = useMutation({
    mutationFn: (ids: string[] | null) => pushTour(ids),
    onSuccess: (n, ids) => {
      showToast(
        ids === null
          ? `Tour sent to everyone (${n})`
          : `Tour sent to ${n} ${n === 1 ? 'person' : 'people'}`,
      )
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not send the tour.')),
  })

  const nudge = useMutation({
    mutationFn: (ids: string[] | null) => promptSetup(ids),
    onSuccess: (n) => {
      showToast(n === 0 ? 'Nobody to ask — they have nothing left' : `Asked ${n} ${n === 1 ? 'person' : 'people'} to finish setting up`)
      return refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not send that.')),
  })

  /*
   * One row a person, for everybody the reader may send the tour to —
   * `people_setup()` answers for exactly those, so a Head given the right
   * for their own team sees their own team.
   */
  const rows = useMemo(() => {
    const tourOf = new Map((tours.data ?? []).map((r) => [r.user_id, r]))
    const setupOf = new Map((setup.data ?? []).map((r) => [r.user_id, r]))
    const locationOf = new Map((locations.data ?? []).map((r) => [r.user_id, r]))
    return (people.data ?? [])
      .filter((p) => setupOf.has(p.id))
      .map((p) => {
        const ticks = setupTicksOf(setupOf.get(p.id), tourOf.get(p.id), locationOf.get(p.id))
        const left = hasSomethingLeft(ticks)
        return { ...p, name: `${p.first_name} ${p.last_name}`.trim(), ticks, left, detail: detailOf(tourOf.get(p.id), left) }
      })
  }, [people.data, tours.data, setup.data, locations.data])

  const leftCount = rows.filter((r) => r.left).length
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false
      return show === 'all' || (show === 'left' ? r.left : !r.left)
    })
  }, [rows, filter, show])

  if (!can('people.onboard')) return null

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const busy = send.isPending || nudge.isPending
  const loaded = people.isSuccess && tours.isSuccess && setup.isSuccess && locations.isSuccess

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
            disabled={busy}
          >
            Send to everyone
          </ActionButton>
          <ActionButton tone="quiet" onClick={() => send.mutate([...picked])} disabled={picked.size === 0 || busy}>
            {picked.size === 0
              ? 'Send to the people ticked below'
              : `Send to ${picked.size} ${picked.size === 1 ? 'person' : 'people'}`}
          </ActionButton>
        </div>
      </SectionTile>

      <SectionTile
        title="Getting set up"
        hint={
          loaded
            ? `${rows.length - leftCount} all done · ${leftCount} with something left. A tick is the app’s own record — it shows that a detail is on their profile, never what it is. Whoever has a detail missing is asked for it before the app opens; asking here is for the rest.`
            : 'Who has filled in their details, taken the tour, allowed location and notifications, and put the app on their phone.'
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            tone="quiet"
            onClick={() =>
              ask({
                title: 'Ask everyone with something left?',
                body: `Everybody with something still to set up${leftCount ? ` (${leftCount})` : ''} gets a notification, and a card listing what is left the next time they open the app. They can close it and carry on.`,
                confirmLabel: 'Ask them',
                onConfirm: () => nudge.mutate(null),
              })
            }
            disabled={busy || leftCount === 0}
          >
            Ask everyone with something left
          </ActionButton>
          <ActionButton tone="quiet" onClick={() => nudge.mutate([...picked])} disabled={picked.size === 0 || busy}>
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
            aria-label="Find somebody"
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
          isLoading={people.isLoading || tours.isLoading || setup.isLoading || locations.isLoading}
          error={people.error || tours.error || setup.error || locations.error}
          isEmpty={shown.length === 0}
          emptyMessage={filter.trim() ? 'Nobody by that name.' : 'Nobody here.'}
        >
          {/* Ten columns will not fit a phone, and forty-eight rows will not
              fit a screen: it scrolls inside itself both ways, the names
              staying put at the side and the headings at the top — a tick
              three screens down still says which column it is in. (Headings
              can only stay put inside the box that scrolls, so the list has
              a height of its own rather than running the length of the page.) */}
          <div className="relative mt-3 -mx-2 max-h-[70svh] overflow-auto overscroll-contain px-2">
            <table aria-label="Getting set up" className="w-full min-w-[40rem] border-collapse text-body-sm">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 top-0 z-30 min-w-40 bg-surface-lowest px-2 pb-2 pt-1 text-left align-bottom shadow-[inset_0_-1px_0_var(--color-border-subtle)] font-mono text-label-sm font-normal uppercase tracking-wide text-on-surface-variant">
                    Name
                  </th>
                  {SETUP_COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      title={c.label}
                      className="sticky top-0 z-20 bg-surface-lowest px-1.5 pb-2 pt-1 text-center align-bottom shadow-[inset_0_-1px_0_var(--color-border-subtle)] font-mono text-label-sm font-normal uppercase tracking-wide text-on-surface-variant"
                    >
                      <span aria-hidden="true">{c.short}</span>
                      <span className="sr-only">{c.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const id = `setup-pick-${r.id}`
                  return (
                    <tr key={r.id} className="border-t border-border-subtle">
                      <th scope="row" className="sticky left-0 z-10 bg-surface-lowest px-2 py-2.5 text-left font-normal">
                        <label htmlFor={id} className="flex min-w-0 items-center gap-3 text-on-surface">
                          <input
                            id={id}
                            type="checkbox"
                            aria-label={r.name}
                            checked={picked.has(r.id)}
                            onChange={() => toggle(r.id)}
                            className="h-4 w-4 shrink-0"
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="break-words">{r.name}</span>
                            {r.detail && <span className="font-mono text-label-sm text-on-surface-faint">{r.detail}</span>}
                          </span>
                        </label>
                      </th>
                      {SETUP_COLUMNS.map((c) => (
                        <td key={c.key} className="px-1.5 py-2.5 text-center">
                          <Tick done={r.ticks[c.key]} label={c.label} />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </QueryState>
      </SectionTile>

      {/* Which phone and browser each person opens the app on — what to
          walk them through — stays with Clock In's settings, an Admin's room. */}
      {isAdmin && (
        <p className="px-1 text-body-sm text-on-surface-variant">
          Which phone and browser each person uses, for walking them through allowing location, is in{' '}
          <Link to="/settings/clock-in" className="text-accent-blue-soft hover:underline">
            Clock In’s settings
          </Link>
          .
        </p>
      )}
      {dialog}
    </div>
  )
}
