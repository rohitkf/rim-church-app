import { useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { DASHBOARD_PANELS, DISPLAY_DEFAULTS, readDisplay, type Display } from '../lib/display'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { shortDuration } from '../lib/settingsReadout'
import { NumberDial } from './NumberDial'
import { QueryState } from './QueryState'
import { SectionTile } from './Surface'
import { InlineRow, SaveBar, SettingList, SettingRow, Switch } from './SettingRows'

/**
 * What the pages show, and how they arrive — for everybody at once.
 *
 * None of this is a rule: it decides what is drawn, not what anybody may
 * read (that is Access & privileges). Stored as one object
 * (`app_settings.display`, lib/display), so a preference added later costs
 * no migration.
 */

type Windows = Display['windows']

const WINDOWS: { key: keyof Windows; label: string; summary: string; max: number; affects: string[]; help: string }[] = [
  {
    key: 'availabilityDays',
    label: 'Availability asks this far ahead',
    summary: 'At least the rota’s own window, whatever this says.',
    max: 120,
    affects: ['Availability'],
    help: 'How far ahead people are asked whether they can serve. It never asks less far ahead than the rota lists, so nobody is put on a service they were not asked about.',
  },
  {
    key: 'setListDays',
    label: 'Set Lists looks ahead',
    summary: 'The services whose songs are listed.',
    max: 120,
    affects: ['Set Lists'],
    help: 'Services within this many days get a set list on the page, today’s first.',
  },
  {
    key: 'debriefAheadDays',
    label: 'Debriefs lists services ahead',
    summary: 'So a team can see which debriefs are coming.',
    max: 120,
    affects: ['Debriefs'],
    help: 'Services within this many days are listed on Debriefs under Next and Upcoming. A debrief only opens for writing once its service has ended.',
  },
  {
    key: 'diaryPastDays',
    label: 'Events keeps past events for',
    summary: 'How far back the diary’s Past events go on screen.',
    max: 3650,
    affects: ['Events'],
    help: 'Only what is drawn: the events themselves are not deleted.',
  },
  {
    key: 'invitationStaleDays',
    label: 'An invitation is stale after',
    summary: 'When an unanswered one is marked as gone quiet.',
    max: 365,
    affects: ['Volunteers'],
    help: 'An invitation nobody has accepted is marked stale after this many days, so it can be chased or sent again.',
  },
]

export function DisplayCard() {
  const { isAdmin } = useAuth()
  const room = useSettingsDraft(['display'] as const)
  const [open, setOpen] = useState<string | null>(null)
  if (!isAdmin) return null

  const draft = room.draft ? readDisplay(room.draft.display) : null
  const stored = room.query.data ? readDisplay(room.query.data.display) : null
  const write = (next: Display) => room.set('display', next)
  const toggle = (key: string) => setOpen((current) => (current === key ? null : key))
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

  return (
    <QueryState isLoading={room.query.isLoading} error={room.query.error}>
      {draft && stored && (
        <div className="flex flex-col gap-4">
          <p className="px-1 text-body-sm text-on-surface-variant">
            What each page shows, for everybody. This only changes what is drawn — who may open a
            page is in Access &amp; privileges.
          </p>

          <SectionTile title="Dashboard" hint="The first page everybody sees.">
            <SettingList>
              <InlineRow
                label="Service days to list"
                summary="The next one, or the next few."
                changed={draft.dashboard.serviceDays !== stored.dashboard.serviceDays}
                help="The Dashboard lists every service on the next service day. Set it higher to list the following service days too, each with its own countdown."
                affects={['Dashboard']}
                defaultText="1"
              >
                <Segmented
                  label="Service days to list"
                  value={String(draft.dashboard.serviceDays)}
                  options={['1', '2', '3', '4'].map((n) => ({ value: n, label: n }))}
                  onChange={(n) => write({ ...draft, dashboard: { ...draft.dashboard, serviceDays: Number(n) } })}
                />
              </InlineRow>
              <InlineRow
                label="The next service’s card"
                summary="Opened up, or folded to one line."
                changed={draft.dashboard.openNext !== stored.dashboard.openNext}
                help="“On the day” opens it on the morning itself and keeps it folded to its countdown before then. “Open” always shows the readiness, teams and activity; “Folded” always waits to be tapped."
                affects={['Dashboard']}
                defaultText="On the day"
              >
                <Segmented
                  label="The next service’s card"
                  value={draft.dashboard.openNext}
                  options={[
                    { value: 'auto', label: 'On the day' },
                    { value: 'always', label: 'Open' },
                    { value: 'never', label: 'Folded' },
                  ]}
                  onChange={(v) =>
                    write({ ...draft, dashboard: { ...draft.dashboard, openNext: v as Display['dashboard']['openNext'] } })
                  }
                />
              </InlineRow>
            </SettingList>

            <h3 className="mt-5 px-1 text-body-sm font-medium text-on-surface">On a service’s card</h3>
            <ul className="mt-2 flex flex-col">
              {DASHBOARD_PANELS.map((panel) => (
                <li key={panel.key} className="flex items-center gap-3 rounded-[var(--radius-row)] px-1 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-sm text-on-surface">{panel.label}</span>
                    <span className="block text-label-md text-on-surface-variant">{panel.hint}</span>
                  </span>
                  <Switch
                    checked={draft.dashboard.show[panel.key]}
                    onChange={(on) =>
                      write({
                        ...draft,
                        dashboard: { ...draft.dashboard, show: { ...draft.dashboard.show, [panel.key]: on } },
                      })
                    }
                    label={`Show ${panel.label}`}
                  />
                </li>
              ))}
            </ul>
          </SectionTile>

          <SectionTile title="Folded sections" hint="Every page that lists services: Today, Next, Upcoming, Finished.">
            <SettingList>
              <InlineRow
                label="Upcoming services start open"
                summary="Otherwise folded under their heading."
                changed={draft.lists.upcomingOpen !== stored.lists.upcomingOpen}
                help="On the planner, the rota, availability, checklists, set lists and debriefs. Folded, a page leads with what is today and next; open, everything ahead is laid out at once."
                affects={['Every service page']}
                defaultText="folded"
              >
                <Switch
                  checked={draft.lists.upcomingOpen}
                  onChange={(on) => write({ ...draft, lists: { ...draft.lists, upcomingOpen: on } })}
                  label="Upcoming services start open"
                />
              </InlineRow>
              <InlineRow
                label="Finished services start open"
                summary="A page still opens it when something in it can be written to."
                changed={draft.lists.finishedOpen !== stored.lists.finishedOpen}
                help="Finished services are a record, so they arrive folded. A page opens them by itself while something there can still be written — a checklist’s after-half, last night’s debrief — whatever this says."
                affects={['Every service page']}
                defaultText="folded"
              >
                <Switch
                  checked={draft.lists.finishedOpen}
                  onChange={(on) => write({ ...draft, lists: { ...draft.lists, finishedOpen: on } })}
                  label="Finished services start open"
                />
              </InlineRow>
            </SettingList>
          </SectionTile>

          <SectionTile title="How far pages look" hint="Windows of days, page by page.">
            <SettingList>
              {WINDOWS.map((w) => {
                const value = draft.windows[w.key]
                const fallback = DISPLAY_DEFAULTS.windows[w.key]
                const setWindow = (n: number) => write({ ...draft, windows: { ...draft.windows, [w.key]: n } })
                return (
                  <SettingRow
                    key={w.key}
                    label={w.label}
                    summary={w.summary}
                    value={shortDuration(value, 'days')}
                    changed={value !== stored.windows[w.key]}
                    open={open === w.key}
                    onToggle={() => toggle(w.key)}
                    help={w.help}
                    affects={w.affects}
                    defaultText={shortDuration(fallback, 'days')}
                    onDefault={value === fallback ? undefined : () => setWindow(fallback)}
                  >
                    <NumberDial
                      value={value}
                      onChange={setWindow}
                      min={1}
                      max={w.key === 'diaryPastDays' ? 730 : Math.min(w.max, 120)}
                      majorEvery={w.key === 'diaryPastDays' ? 30 : 7}
                      unit="days"
                      label={w.label}
                    />
                  </SettingRow>
                )
              })}
            </SettingList>
          </SectionTile>

          <SaveBar
            changed={room.changed && !same(draft, stored)}
            saving={room.saving}
            saved={room.saved}
            error={room.error}
            onSave={room.save}
            onRestore={() => room.set('display', {})}
          />
        </div>
      )}
    </QueryState>
  )
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: ReactNode }[]
  onChange: (value: string) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-inset p-1 hairline">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`tap min-w-9 rounded-full px-3 py-1.5 text-label-md transition-colors duration-300 ${
            value === o.value ? 'bg-primary font-medium text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
