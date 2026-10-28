import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { pagesWithRules } from '../lib/pageList'
import {
  ACCESS_LEVELS,
  STANDINGS,
  levelOf,
  standingMayOpen,
  type AccessLevel,
  type Standing,
} from '../lib/pageAccess'
import { useAppSettingsState } from '../lib/appSettings'
import { usePageLevels } from '../lib/usePageLevels'
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
  fixed: { label: 'Fixed', tone: 'neutral' },
}

const short = (level: AccessLevel) => ACCESS_LEVELS.find((l) => l.value === level)?.short ?? level

export function PageAccessCard() {
  const { isAdmin } = useAuth()
  const { settings, settled } = useAppSettingsState()
  const [preview, setPreview] = useState<Standing>('church')
  // Each page's level, as the grid holds it (0215).
  const access = usePageLevels()

  if (!isAdmin) return null

  // Issues follows "Who can raise one" in Page by Page.
  const scope = settings.issues_raise_scope
  // Serving's three tabs are listed each on its own.
  const pages = pagesWithRules()
  const open = pages.filter((p) => standingMayOpen(preview, levelOf(p.item.to, access, scope)))
  const groups = [...new Set(pages.map((p) => p.item.group ?? ''))]

  return (
    <QueryState isLoading={!settled} error={null}>
      <div className="flex flex-col gap-4">
        <SectionTile title="See it as…" hint="Pick a profile to light up the pages it can open.">
          <div role="radiogroup" aria-label="Preview as" className="flex flex-wrap gap-2">
            {STANDINGS.map((s) => (
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
            {STANDINGS.find((s) => s.value === preview)?.blurb}{' '}
            <span className="font-mono text-label-sm text-on-surface-faint" data-testid="preview-count">
              {open.length} of {pages.length} pages
            </span>
          </p>
          <ul
            aria-label={`Pages a ${STANDINGS.find((s) => s.value === preview)?.label} can open`}
            className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3"
          >
            {pages.map(({ item }) => {
              const yes = standingMayOpen(preview, levelOf(item.to, access, scope))
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
                        <span className="rounded-full bg-raised px-3 py-1.5 font-mono text-label-md text-on-surface-variant">
                          {short(level)}
                        </span>
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
          Admins can always open every page — that is how a wrong setting gets put right. “Database”
          means the rows themselves follow the choice, not only the menu. Each page’s choice is made in
          Page by Page, under that page.
        </p>
      </div>
    </QueryState>
  )
}
