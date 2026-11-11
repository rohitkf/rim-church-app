import { useState } from 'react'
import { Link } from 'react-router-dom'
import { pagesWithRules } from '../lib/pageList'
import { ACCESS_LEVELS, STANDINGS, levelOf, type AccessLevel, type Standing } from '../lib/pageAccess'
import { pageOpening, type PageWho } from '../lib/pageOpening'
import { ROLE_NAME } from '../lib/roleNames'
import { useAppSettingsState } from '../lib/appSettings'
import { usePageLevels } from '../lib/usePageLevels'
import { usePermissions } from '../lib/usePermissions'
import { reachOf, type GridRole } from '../lib/permissions'
import { pageSlug } from '../lib/pageSettings'
import { QueryState } from './QueryState'
import { Pill, SectionTile } from './Surface'

/**
 * Who can open each page, and what each profile ends up with — to look
 * at. The choice itself is made on the page's own section in Page by
 * Page, beside everything else about that page; this room used to offer
 * it too, a second Save for the same column, and an Admin could not tell
 * which was the real one.
 *
 * Two halves, because they answer two questions. "What does a Church
 * Member actually see?" is answered by picking one and looking at the
 * pages lit up. "Who can open Inventory?" is answered on Inventory's row,
 * which links to where it is changed.
 *
 * Every row says what the choice really does: the database follows it,
 * the database follows it only wider, or it only hides the page. A
 * setting that sounds like a lock and is a curtain is the one thing this
 * page must not be.
 */

const ENFORCEMENT: Record<string, { label: string; tone: 'green' | 'blue' | 'neutral' }> = {
  database: { label: 'Database', tone: 'green' },
  widen: { label: 'Database', tone: 'green' },
  page: { label: 'Hides page', tone: 'neutral' },
  // Opens by a row of its own in the grid (0277): each role yes or no, and
  // teams or people by name — a choice, only not a level.
  permission: { label: 'By permission', tone: 'blue' },
  // Follows another of the church's choices, named in its note.
  follows: { label: 'Follows a setting', tone: 'neutral' },
  // The Dashboard alone: where everybody lands.
  fixed: { label: 'Always open', tone: 'neutral' },
}

const short = (level: AccessLevel) => ACCESS_LEVELS.find((l) => l.value === level)?.short ?? level

/**
 * Everybody the menu might be drawn for: the four standings, and the two
 * church-wide standings with pages of their own (0214). Each is asked of
 * `pageOpening()` as the menu asks it, so the preview cannot say
 * something the menu does not.
 */
type Preview = Standing | 'overwatch' | 'pastor'
const PREVIEWS: { value: Preview; label: string; blurb: string }[] = [
  ...STANDINGS,
  {
    value: 'overwatch',
    label: ROLE_NAME.overwatch,
    blurb: 'On no team: what Settings › Overwatch leaves open to it, and every page open to everyone.',
  },
  { value: 'pastor', label: ROLE_NAME.pastor, blurb: 'On no team: what a Church Member opens, and Prayer Requests always.' },
]
const NOBODY: PageWho = {
  myId: 'preview',
  standing: 'church',
  isAdmin: false,
  isOwner: false,
  isOverwatch: false,
  isPastor: false,
  teamIds: [],
  clockInViewer: false,
  prayerCarer: false,
  regManager: false,
  doorWorker: false,
}
const WHO: Record<Preview, Partial<PageWho>> = {
  church: {},
  member: { standing: 'member' },
  lead: { standing: 'lead' },
  admin: { standing: 'admin', isAdmin: true },
  overwatch: { isOverwatch: true },
  pastor: { isPastor: true },
}
/** The grid column each preview reads its cells from — for a page that opens by a cell of its own (the Countdown, 0264). */
const COLUMN: Record<Preview, GridRole> = {
  church: 'newcomer',
  member: 'member',
  lead: 'head',
  admin: 'admin',
  overwatch: 'overwatch',
  pastor: 'pastor',
}
/**
 * Every column a preview answers from: may() passes whoever any of their
 * profiles lets through, and everybody signed in is a Church Member — so a
 * Pastor opens what a Church Member opens, and a Head what their team does.
 */
const TIERS: Record<Preview, GridRole[]> = {
  church: ['newcomer'],
  member: ['newcomer', 'member'],
  lead: ['newcomer', 'member', 'head'],
  admin: ['newcomer', 'admin'],
  overwatch: ['newcomer', 'overwatch'],
  pastor: ['newcomer', 'pastor'],
}
const somebody = (p: { value: Preview; label: string }) =>
  p.value === 'overwatch' ? p.label : /^[AEIOU]/.test(p.label) ? `an ${p.label}` : `a ${p.label}`

export function PageAccessCard() {
  // Inside Access & Privileges, which opens by this row (0277).
  const mayRead = usePermissions().can('app.permissions')
  const { settings, settled } = useAppSettingsState()
  const [preview, setPreview] = useState<Preview>('church')
  // Each page's level, as the grid holds it (0215).
  const access = usePageLevels()
  const { overrides } = usePermissions()

  if (!mayRead) return null

  // Issues follows "Who can raise one" in Page by Page.
  const scope = settings.issues_raise_scope
  // Serving's three tabs are listed each on its own.
  const pages = pagesWithRules()
  const opens = (path: string) =>
    pageOpening(
      path,
      // The profile's own cells answer for a page that opens by one, as
      // may() would for somebody with nothing given them by name.
      {
        ...NOBODY,
        ...WHO[preview],
        opens: (cap) =>
          // The Countdown opens by its own column alone (0264); a page opens to any tier they hold.
          (cap === 'countdown.view' ? [COLUMN[preview]] : TIERS[preview]).some((role) => reachOf(overrides, cap, role) !== 'none'),
        // Clock In opens by its cell, an Admin's included (0275).
        clockInViewer: TIERS[preview].some((role) => reachOf(overrides, 'clockin.view', role) !== 'none'),
      },
      settings,
      access,
    ).open
  const open = pages.filter((p) => opens(p.item.to))
  const current = PREVIEWS.find((s) => s.value === preview)!
  const groups = [...new Set(pages.map((p) => p.item.group ?? ''))]

  return (
    <QueryState isLoading={!settled} error={null}>
      <div className="flex flex-col gap-4">
        <SectionTile title="See it as…" hint="Pick a profile to light up the pages it can open.">
          <div role="radiogroup" aria-label="Preview as" className="flex flex-wrap gap-2">
            {PREVIEWS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={preview === s.value}
                onClick={() => setPreview(s.value)}
                className={`tap rounded-full px-4 py-2 text-body-sm transition-colors duration-200 ${
                  preview === s.value
                    ? 'bg-primary font-semibold text-on-primary'
                    : 'bg-raised text-on-surface-variant hairline hover:text-on-surface'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-body-sm text-on-surface-variant">
            {current.blurb}{' '}
            <span className="font-mono text-label-sm text-on-surface-faint" data-testid="preview-count">
              {open.length} of {pages.length} pages
            </span>
          </p>
          <ul
            aria-label={`Pages ${somebody(current)} can open`}
            className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {pages.map(({ item }) => {
              const yes = opens(item.to)
              const Icon = item.icon
              return (
                <li
                  key={item.to}
                  aria-label={`${item.label}: ${yes ? 'can open' : 'cannot open'}`}
                  className={`flex items-center gap-2 rounded-[var(--radius-row)] px-3 py-2.5 text-body-sm transition-colors duration-200 ${
                    yes
                      ? 'bg-[color-mix(in_oklab,var(--color-accent-green)_14%,transparent)] text-on-surface'
                      : 'bg-raised text-on-surface-faint line-through decoration-on-surface-faint/40'
                  }`}
                >
                  <Icon width={16} height={16} className="shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{item.label}</span>
                </li>
              )
            })}
          </ul>
        </SectionTile>

        {groups.map((group) => (
          <SectionTile key={group || 'top'} title={group || 'Everybody’s first page'}>
            <ul className="flex flex-col divide-y divide-border-subtle">
              {pages
                .filter((p) => (p.item.group ?? '') === group)
                .map(({ item, rule }) => {
                  const level = levelOf(item.to, access, scope)
                  const tag = ENFORCEMENT[rule.enforcement]
                  const Icon = item.icon
                  const moved = !!rule.key && level !== rule.default
                  const settable = rule.choices.length > 1 && !!rule.key
                  return (
                    <li
                      key={item.to}
                      aria-label={`${item.label}: ${short(level)}`}
                      className="flex flex-col gap-2.5 py-3.5 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="flex min-w-0 flex-1 basis-40 items-center gap-2.5">
                          <Icon width={18} height={18} className="shrink-0 text-on-surface-variant" aria-hidden="true" />
                          <span className="text-body-md font-medium text-on-surface">{item.label}</span>
                          {moved && (
                            <span
                              aria-label="Changed from the app’s default"
                              title="Changed from the app’s default"
                              className="h-2 w-2 shrink-0 rounded-full bg-accent-orange"
                            />
                          )}
                          <Pill tone={tag.tone}>{tag.label}</Pill>
                        </span>
                        {/* A page that opens by permission has no level to show: its rows say who. */}
                        {rule.enforcement !== 'permission' && (
                          <span className="rounded-full bg-raised px-3 py-1.5 font-mono text-label-md text-on-surface-variant">
                            {short(level)}
                          </span>
                        )}
                        {rule.enforcement === 'permission' && (
                          <Link
                            to={`/settings/pages#${pageSlug(item.to)}`}
                            aria-label={`Change who can open ${item.label}, in Page by Page`}
                            className="tap rounded-full px-2 py-1 text-label-md text-accent-blue-soft hover:text-on-surface"
                          >
                            Change
                          </Link>
                        )}
                        {rule.enforcement === 'follows' && (
                          <Link
                            to={`/settings/pages#${pageSlug(item.to)}`}
                            aria-label={`Change what ${item.label} follows, in Page by Page`}
                            className="tap rounded-full px-2 py-1 text-label-md text-accent-blue-soft hover:text-on-surface"
                          >
                            Change
                          </Link>
                        )}
                        {settable && (
                          <Link
                            to={`/settings/pages#${pageSlug(item.to)}`}
                            aria-label={`Change who can open ${item.label}, in Page by Page`}
                            className="tap rounded-full px-2 py-1 text-label-md text-accent-blue-soft hover:text-on-surface"
                          >
                            Change
                          </Link>
                        )}
                      </div>
                      <p className="text-label-md text-on-surface-faint">{rule.note}</p>
                    </li>
                  )
                })}
            </ul>
          </SectionTile>
        ))}

        <p className="px-1 text-label-sm text-on-surface-faint">
          The Owner can always open every page — that is how a wrong setting gets put right. “Database”
          means the rows themselves follow the choice, not only the menu; “By permission” means the
          page opens by a row of its own, role by role, team by team or person by person. Each page’s
          choice is made in Page by Page, under that page.
        </p>
      </div>
    </QueryState>
  )
}
