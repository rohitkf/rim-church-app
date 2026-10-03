import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { NAV_ITEMS } from '../lib/navItems'
import {
  ACCESS_LEVELS,
  PAGE_RULES,
  STANDINGS,
  compactAccess,
  levelOf,
  standingMayOpen,
  type AccessLevel,
  type PageAccess,
  type Standing,
} from '../lib/pageAccess'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { useAppSettings } from '../lib/appSettings'
import { QueryState } from './QueryState'
import { Pill, SectionTile } from './Surface'
import { SaveBar } from './SettingRows'

/**
 * Who can open each page, chosen by the church — and what each profile
 * ends up with.
 *
 * Two halves, because they answer two questions. "What does a Church
 * Member actually see?" is answered by picking one and looking at the
 * pages lit up. "Who should see Inventory?" is answered on Inventory's
 * row. Both read the same draft, so changing a row relights the preview
 * before anything is saved.
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
  const room = useSettingsDraft(['page_access'] as const)
  // Issues follows Timings' "Who can raise one"; shown here, owned there.
  const scope = useAppSettings().issues_raise_scope
  const [preview, setPreview] = useState<Standing>('church')

  if (!isAdmin) return null

  const draft = room.draft
  const access = (draft?.page_access ?? {}) as PageAccess
  const choose = (key: string, level: AccessLevel) =>
    room.set('page_access', compactAccess({ ...access, [key]: level }) as Record<string, string>)

  const pages = NAV_ITEMS.map((item) => ({ item, rule: PAGE_RULES[item.to] })).filter((p) => p.rule)
  const open = pages.filter((p) => standingMayOpen(preview, levelOf(p.item.to, access, scope)))
  const groups = [...new Set(pages.map((p) => p.item.group ?? ''))]

  return (
    <QueryState isLoading={room.query.isLoading} error={room.query.error}>
      {draft && (
        <div className="flex flex-col gap-4">
          <SectionTile
            title="See it as…"
            hint="Pick a profile to light up the pages it can open, with your changes included."
          >
            <div role="radiogroup" aria-label="Preview as" className="flex flex-wrap gap-2">
              {STANDINGS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={preview === s.value}
                  onClick={() => setPreview(s.value)}
                  className={`tap rounded-full px-4 py-2 text-body-sm transition-colors duration-300 ${
                    preview === s.value
                      ? 'bg-primary font-medium text-on-primary'
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
                    className={`flex items-center gap-2 rounded-[var(--radius-row)] px-3 py-2.5 text-body-sm transition-colors duration-300 ${
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
                    return (
                      <li key={item.to} className="flex flex-col gap-2.5 py-3.5 first:pt-0 last:pb-0">
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
                          {rule.choices.length > 1 && rule.key ? (
                            <div
                              role="radiogroup"
                              aria-label={`Who can open ${item.label}`}
                              className="flex gap-1 rounded-full bg-inset p-1 hairline"
                            >
                              {rule.choices.map((choice) => (
                                <button
                                  key={choice}
                                  type="button"
                                  role="radio"
                                  aria-checked={level === choice}
                                  onClick={() => choose(rule.key!, choice)}
                                  className={`tap rounded-full px-3 py-1.5 text-label-md transition-colors duration-300 ${
                                    level === choice
                                      ? 'bg-primary font-medium text-on-primary'
                                      : 'text-on-surface-variant hover:text-on-surface'
                                  }`}
                                >
                                  {short(choice)}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="rounded-full bg-raised px-3 py-1.5 font-mono text-label-md text-on-surface-variant">
                              {short(level)}
                            </span>
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
            Admins can always open every page — that is how a wrong setting gets put right.
            “Database” means the rows themselves follow your choice, not only the menu.
          </p>

          <SaveBar
            changed={room.changed}
            saving={room.saving}
            saved={room.saved}
            error={room.error}
            onSave={room.save}
            onRestore={() => room.set('page_access', {})}
            label="Save who sees what"
          />
        </div>
      )}
    </QueryState>
  )
}
