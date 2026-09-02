import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { QueryState } from './QueryState'
import { NumberDial } from './NumberDial'
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  WEEKDAY_NAMES,
  fetchAppSettings,
  type AppSettings,
} from '../lib/appSettings'
import { Select, selectPillClasses } from './Select'

/**
 * The windows the app works to, in one place an Admin can change.
 *
 * Every field here used to be a number in the source. They are grouped by
 * the page they govern rather than by type, because the question an Admin
 * arrives with is "why am I not seeing next Sunday yet" — a question about
 * the rota, not about integers.
 *
 * Each field says what it does in the words the page uses, and carries the
 * shipped default, so a church that has tuned itself into a corner can find
 * its way back without asking anybody.
 */
type NumberField = {
  key: keyof Omit<AppSettings, 'always_show_my_services' | 'board_clear_dow'>
  label: string
  /** What the number means, in the words the pages themselves use. */
  help: string
  /** Which pages move when it moves — the question people arrive with. */
  affects: string
  min: number
  max: number
  /** Where the ruler stops, when the real ceiling is absurd to drag to. */
  dialMax?: number
  dialStep?: number
  majorEvery?: number
  unit: string
}

const GROUPS: { heading: string; blurb: string; fields: NumberField[] }[] = [
  {
    heading: 'Team Rota, Availability and Checklists',
    blurb: 'How far ahead these three pages list services.',
    fields: [
      {
        key: 'rota_window_days',
        label: 'Days ahead',
        help: 'Every service dated within this many days of today is listed — not the next few services, which on a busy Sunday would be spent on one day and hide the week after. Two rules ride along and cannot be turned off: if nothing falls inside the window the nearest day that has a service is shown instead, so the page is never blank; and a service that has finished stops holding the window open, so the moment today’s service ends, next Sunday’s is already there.',
        affects: 'Team Rota · Availability · Checklists',
        min: 1,
        max: 120,
        dialMax: 60,
        majorEvery: 7,
        unit: 'days',
      },
    ],
  },
  {
    heading: 'Service Planner',
    blurb: 'The agenda under the month calendar, and how long a finished service stays open.',
    fields: [
      {
        key: 'planner_upcoming_limit',
        label: 'Upcoming services listed',
        help: 'How many services the “Upcoming services” list shows. A count rather than a window, because the calendar above it already shows the month — this list is what you are working on next. Finished services are removed before the count, so six always means six you can still act on.',
        affects: 'Service Planner agenda only — not the calendar',
        min: 1,
        max: 50,
        unit: 'services',
      },
      {
        key: 'edit_grace_minutes',
        label: 'Editing stays open for',
        help: 'How long after a service ends its record stays open for correction. The clock starts when End service was pressed, or, if nobody pressed it, at the planned end of the last session. When it runs out the database itself starts refusing changes to the running order, checklist ticks and sign-offs, availability answers, and rota assignments for that service — so this is a real lock, not a hidden button. An hour is “walk off the stage and fix what you noticed”; a day suits a team that does its paperwork on Monday.',
        affects: 'Running order · Checklists · Availability · Team Rota, for a service that is over',
        min: 0,
        max: 10080,
        // A week in minutes is a real ceiling and a ridiculous drag, so the
        // ruler covers the day that anybody actually picks from and typing
        // covers the rest.
        dialMax: 1440,
        dialStep: 15,
        majorEvery: 4,
        unit: 'minutes',
      },
    ],
  },
  {
    heading: 'While a service is on',
    blurb: 'When a service starts and stops reading as “on now”. Both ends are read from the running order, so a service with no running order planned is never “on now”.',
    fields: [
      {
        key: 'lead_in_minutes',
        label: 'Doors open before',
        help: 'A service starts wearing the “on now” badge this long before its first session, so the rota highlights the right service while teams are setting up.',
        affects: 'The “on now” badge and highlight on Team Rota',
        min: 0,
        max: 240,
        unit: 'minutes',
      },
      {
        key: 'run_out_minutes',
        label: 'Still on after',
        help: 'And it keeps the badge this long after the last session ends, so it does not blink out mid-handshake. Set it to 0 for the badge to go the second the service does.',
        affects: 'The “on now” badge and highlight on Team Rota',
        min: 0,
        max: 240,
        unit: 'minutes',
      },
    ],
  },
]

export function AppSettingsCard() {
  const { isAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<AppSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const query = useQuery({ queryKey: SETTINGS_KEY, queryFn: fetchAppSettings })
  useEffect(() => {
    if (query.data) setDraft(query.data)
  }, [query.data])

  const save = useMutation({
    mutationFn: async (next: AppSettings) => {
      const { error } = await supabase.from('app_settings').update(next).eq('id', true)
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      setSaved(true)
      // Every page reads these, and most of them are already on screen
      // behind this one, so the whole cache is the honest thing to drop.
      queryClient.invalidateQueries()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save the settings.')),
  })

  if (!isAdmin) return null

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSaved(false)
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }
  const changed = !!draft && !!query.data && JSON.stringify(draft) !== JSON.stringify(query.data)

  return (
    <section className="w-full rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
      <h2 className="text-headline-md">App settings</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        The windows the app works to. These are the church’s, not yours — everyone sees the
        results, and only an Admin can change them.
      </p>

      <QueryState isLoading={query.isLoading} error={query.error}>
        {draft && (
          <div className="mt-6 flex flex-col gap-7">
            {GROUPS.map((group) => (
              <div key={group.heading}>
                <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                  {group.heading}
                </div>
                <p className="mt-1 text-label-md text-on-surface-faint">{group.blurb}</p>
                <div className="mt-3 flex flex-col gap-4">
                  {group.fields.map((field) => (
                    <div key={field.key} className="flex flex-col gap-1">
                      <span className="text-body-sm font-medium text-on-surface">{field.label}</span>
                      <span className="text-label-md text-on-surface-variant">{field.help}</span>
                      <span className="font-mono text-label-sm text-on-surface-faint">
                        {field.affects} · default {DEFAULT_SETTINGS[field.key]}
                      </span>
                      {/* A window of days is a length, and a length is easier
                          to judge against its neighbours than to type into a
                          box: 7 with 14 and 30 in view is a decision, 7 alone
                          is a guess. */}
                      <NumberDial
                        value={draft[field.key]}
                        onChange={(next) => set(field.key, next)}
                        min={field.min}
                        max={field.dialMax ?? field.max}
                        step={field.dialStep ?? 1}
                        majorEvery={field.majorEvery ?? 5}
                        unit={field.unit}
                        label={field.label}
                        className="mt-1.5"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                The week
              </div>
              <p className="mt-1 text-label-md text-on-surface-faint">
                When the message board empties and the planner’s finished list turns over.
              </p>
              <label className="mt-3 flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-2 text-body-sm font-medium text-on-surface">
                  Clears every
                  <Select
                    value={String(draft.board_clear_dow)}
                    onChange={(dow) => set('board_clear_dow', Number(dow))}
                    aria-label="Day the board clears"
                    className={selectPillClasses}
                    options={WEEKDAY_NAMES.map((name, dow) => ({
                      value: String(dow),
                      label: name,
                    }))}
                  />
                </span>
                <span className="text-label-md text-on-surface-variant">
                  At 00:00 UTC on this day, the message board empties — every post, plus the
                  bell notifications pointing at them, so the bell never points at something
                  that is gone. The planner’s Finished list resets on the same clock, so nobody
                  has to learn two different weeks. The clear-out is a deletion and cannot be
                  undone.
                </span>
                <span className="font-mono text-label-sm text-on-surface-faint">
                  Message board · Service Planner’s Finished list · default{' '}
                  {WEEKDAY_NAMES[DEFAULT_SETTINGS.board_clear_dow]}, two days after Sunday
                </span>
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-2 text-body-sm font-medium text-on-surface">
                <input
                  type="checkbox"
                  checked={draft.always_show_my_services}
                  onChange={(e) => set('always_show_my_services', e.target.checked)}
                />
                Always show a service somebody is rostered on
              </span>
              <span className="text-label-md text-on-surface-variant">
                A safety net over the window above: if somebody is assigned to a service further
                out than the window, that service is added to their rota anyway, in date order.
                Nobody else’s page changes. Turn this off and a volunteer can be given a role on
                a service they cannot see, and will not know to tell you.
              </span>
              <span className="font-mono text-label-sm text-on-surface-faint">
                Team Rota · default on
              </span>
            </label>

            {error && (
              <p className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                {error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => draft && save.mutate(draft)}
                disabled={!changed || save.isPending}
                className="rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
              >
                {save.isPending ? 'Saving…' : 'Save settings'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaved(false)
                  setDraft(DEFAULT_SETTINGS)
                }}
                className="rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface hairline hover:border-secondary"
              >
                Restore defaults
              </button>
              {saved && !changed && (
                <span className="text-body-sm text-accent-green">Saved.</span>
              )}
            </div>
          </div>
        )}
      </QueryState>
    </section>
  )
}
