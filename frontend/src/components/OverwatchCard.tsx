import { useMemo } from 'react'
import { useNavNames } from '../lib/navNames'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { settingEntry } from '../lib/settingsCatalog'
import { SETTINGS_PAGES } from '../lib/pageSettings'
import { levelOf, type PageAccess } from '../lib/pageAccess'
import { overwatchOpens, overwatchPageKey } from '../lib/overwatch'
import type { AppSettings } from '../lib/appSettings'
import { QueryState } from './QueryState'
import { SectionTile } from './Surface'
import { SaveBar, SettingList, Switch } from './SettingRows'
import { SettingEntries } from './SettingEntry'

/**
 * Settings › Overwatch (0187).
 *
 * Overwatch sees every team and changes almost nothing. This is where the
 * church says which pages it opens, and which of the five things it may
 * do. Somebody is made Overwatch from the Volunteers page.
 *
 * A page open to everyone signed in is open to Overwatch too — Overwatch
 * is somebody signed in — so it shows as on, and cannot be turned off
 * here; close it to everybody in Page by Page instead.
 */

const ACTS = [
  'overwatch_board_posts',
  'overwatch_chat_posts',
  'overwatch_polls',
  'overwatch_issues',
  'overwatch_debriefs',
] as const

const KEYS = ['overwatch_pages', ...ACTS, 'page_access', 'issues_raise_scope'] as const

export function OverwatchCard() {
  const room = useSettingsDraft(KEYS)
  const names = useNavNames()
  const draft = room.draft

  // Every page in the menu, once — Serving's three tabs each count.
  const pages = useMemo(() => {
    const seen = new Set<string>()
    return SETTINGS_PAGES.flatMap((page) => {
      if (!page.to.startsWith('/')) return []
      const key = overwatchPageKey(page.to)
      if (!key || seen.has(key)) return []
      seen.add(key)
      return [{ ...page, key }]
    })
  }, [])

  const choose = (key: string, open: boolean) => {
    if (!draft) return
    const next: Record<string, boolean> = { ...draft.overwatch_pages, [key]: open }
    // Keep only what differs from the default: a page not named is open,
    // Volunteers aside.
    const fallback = overwatchOpens(`/${key}`, {})
    if (open === fallback) delete next[key]
    room.set('overwatch_pages', next)
  }

  return (
    <QueryState isLoading={room.query.isLoading} error={room.query.error}>
      {draft && (
        <div className="flex flex-col gap-4">
          <p className="px-1 text-body-sm text-on-surface-variant">
            Overwatch sees every team — rotas, availability, checklists, chats, debriefs and issues — and changes
            almost nothing. Make somebody Overwatch from the Volunteers page. Contact details, visas, DBS and families
            stay the Owner’s.
          </p>

          <SectionTile title="Pages it can open" hint="Turn a page off and Overwatch no longer sees it in the menu or opens it.">
            <ul aria-label="Pages Overwatch can open" className="-mx-2 flex flex-col">
              {pages.map((page) => {
                const everyone =
                  levelOf(page.to, draft.page_access as PageAccess, draft.issues_raise_scope) === 'everyone'
                const open = everyone || overwatchOpens(page.to, draft.overwatch_pages)
                const label = names[page.to] ?? page.label
                return (
                  <li key={page.key} className="flex items-center gap-3 px-2 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-sm font-medium text-on-surface">{label}</span>
                      {everyone && (
                        <span className="block text-label-md text-on-surface-faint">
                          Open to everyone signed in, so always open to Overwatch.
                        </span>
                      )}
                    </span>
                    {everyone ? (
                      <span className="rounded-full bg-raised px-3 py-1 font-mono text-label-sm text-on-surface-variant">
                        Open
                      </span>
                    ) : (
                      <Switch label={`Overwatch can open ${label}`} checked={open} onChange={(on) => choose(page.key, on)} />
                    )}
                  </li>
                )
              })}
            </ul>
          </SectionTile>

          <SectionTile title="What it may do" hint="Everything else stays read-only. Each needs its page open as well.">
            <SettingList>
              <SettingEntries
                entries={ACTS.map(settingEntry)}
                draft={draft}
                stored={room.query.data ?? {}}
                set={(patch) => {
                  for (const [key, value] of Object.entries(patch)) {
                    room.set(key as (typeof KEYS)[number], value as AppSettings[(typeof ACTS)[number]])
                  }
                }}
                open={null}
                onToggle={() => {}}
              />
            </SettingList>
          </SectionTile>

          <SaveBar
            changed={room.changed}
            saving={room.saving}
            saved={room.saved}
            error={room.error}
            onSave={room.save}
            label="Save"
          />
        </div>
      )}
    </QueryState>
  )
}
