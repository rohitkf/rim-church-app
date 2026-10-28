import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavNames } from '../lib/navNames'
import { useSettingsDraft } from '../lib/useSettingsDraft'
import { pageName } from '../lib/settingsCatalog'
import { SETTINGS_PAGES } from '../lib/pageSettings'
import { levelOf } from '../lib/pageAccess'
import { levelsFrom } from '../lib/pageCells'
import { OVERWATCH_ACTS, overwatchOpens, overwatchPageKey, type OverwatchAct } from '../lib/overwatch'
import { reachOf } from '../lib/permissions'
import { usePermissionDraft } from '../lib/usePermissionDraft'
import { QueryState } from './QueryState'
import { SectionTile } from './Surface'
import { InlineRow, SaveBar, SettingList, Switch } from './SettingRows'

/**
 * Settings › Overwatch (0187).
 *
 * Overwatch sees every team and changes almost nothing. This is where the
 * church says which pages it opens, and which of the five things it may
 * do. Somebody is made Overwatch from the Volunteers page.
 *
 * The five are Overwatch's cells in the grid since 0214 — its column in
 * Access & Privileges — so the switches here edit those cells, and either
 * place shows what the other saved.
 *
 * A page open to everyone signed in is open to Overwatch too — Overwatch
 * is somebody signed in — so it shows as on, and cannot be turned off
 * here; close it to everybody in Page by Page instead.
 */

const ACTS: { act: OverwatchAct; label: string; summary: string; help: string }[] = [
  {
    act: 'board',
    label: 'Overwatch may post on the message board',
    summary: 'As themselves, never as a team.',
    help: 'Overwatch reads everything and changes almost nothing. This is one of the five things it may do: post on the church-wide message board, under their own name. It needs the Message Board open to Overwatch as well.',
  },
  {
    act: 'chat',
    label: 'Overwatch may post in team chats',
    summary: 'In any team’s chat, which it can already read.',
    help: 'Overwatch can read every team’s chat. With this on it can also post in any of them, as itself. It cannot remove or edit anybody else’s messages. It needs Team Chat open to Overwatch as well.',
  },
  {
    act: 'polls',
    label: 'Overwatch may ask polls',
    summary: 'And change or remove its own. It reads every poll either way.',
    help: 'Overwatch can see every poll and its counts. With this on it can also ask one, of any audience, and change or remove the ones it asked. It never answers a poll that was not asked of it.',
  },
  {
    act: 'issues',
    label: 'Overwatch may raise issues',
    summary: 'Filed as raised by Overwatch, in a group of their own.',
    help: 'Overwatch can raise an issue against any team, inside the same window everybody else raises in. The team is told, and the Issues page gathers these under Overwatch. Overwatch never marks an issue resolved — that stays with the team.',
  },
  {
    act: 'debriefs',
    label: 'Overwatch may write its own debrief',
    summary: 'One Overwatch write-up per service, beside every team’s.',
    help: 'Each service gets an Overwatch debrief next to the teams’ — the points anybody in Overwatch noticed, written while the debrief window is open. It never writes a team’s debrief.',
  },
]

const KEYS = ['overwatch_pages', 'issues_raise_scope'] as const

export function OverwatchCard() {
  const room = useSettingsDraft(KEYS)
  // The five, as Overwatch's cells in the grid (0214).
  const perms = usePermissionDraft()
  const [cellsSaved, setCellsSaved] = useState(false)
  // Each page's level, as the grid holds it (0215).
  const levels = useMemo(() => levelsFrom(perms.working), [perms.working])
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
                const everyone = levelOf(page.to, levels, draft.issues_raise_scope) === 'everyone'
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
              {ACTS.map(({ act, label, summary, help }) => {
                const { capability, page } = OVERWATCH_ACTS[act]
                const on = reachOf(perms.working, capability, 'overwatch') !== 'none'
                return (
                  <InlineRow
                    key={act}
                    label={label}
                    summary={summary}
                    changed={on !== (reachOf(perms.stored, capability, 'overwatch') !== 'none')}
                    help={help}
                    affects={[names[page] ?? pageName(page)]}
                    defaultText="on"
                  >
                    <Switch
                      label={label}
                      checked={on}
                      onChange={(next) => {
                        setCellsSaved(false)
                        perms.chooseChurch(capability, 'overwatch', next ? 'all' : 'none')
                      }}
                    />
                  </InlineRow>
                )
              })}
            </SettingList>
            <p className="mt-3 px-1 text-label-md text-on-surface-faint">
              The same five are Overwatch’s column in{' '}
              <Link to="/settings/access" className="text-accent-blue-soft hover:text-on-surface">
                Access &amp; Privileges
              </Link>
              .
            </p>
          </SectionTile>

          <SaveBar
            changed={room.changed || perms.pending.length > 0}
            saving={room.saving || perms.saving}
            saved={(room.saved || cellsSaved) && !room.changed && perms.pending.length === 0}
            error={room.error ?? perms.error}
            onSave={() => {
              // The cells first: a refused one leaves the pages unsaved too.
              void (async () => {
                if (perms.pending.length > 0) {
                  try {
                    await perms.commit()
                  } catch {
                    return
                  }
                  setCellsSaved(true)
                }
                if (room.changed) room.save()
              })()
            }}
            label="Save"
          />
        </div>
      )}
    </QueryState>
  )
}
