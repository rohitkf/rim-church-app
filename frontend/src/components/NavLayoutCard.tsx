import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { NAV_ITEMS } from '../lib/navItems'
import {
  NAV_LAYOUT_KEY,
  applyNavLayout,
  defaultNavLayout,
  fetchNavLayout,
  saveNavLayout,
  type NavLayout,
} from '../lib/navLayout'
import { useDragReorder } from '../lib/useDragReorder'
import { useErrorText } from '../lib/useErrorText'
import { ActionButton, inputClasses } from './Surface'
import { DragHandle } from './DragHandle'
import { QueryState } from './QueryState'

/**
 * The menu, as the church wants it.
 *
 * One list, with the group headings standing in it like dividers: a page
 * dragged past a heading is under that heading, and anything above the
 * first heading sits at the top with no heading at all, the way Dashboard
 * does. One list rather than a box per group because a drag between boxes
 * is a drag nobody can do one-handed on a phone; past a divider is the
 * same drag as any other.
 *
 * A heading moves as a block — it takes its pages with it — by its own
 * up and down, so moving a group never quietly re-files the pages around
 * it. It can be renamed in place, and removed once nothing is under it.
 *
 * Nothing is written until Save. Who may open each page is unchanged: this
 * only says where a page sits for somebody who can already open it.
 */

type Row = { kind: 'item'; id: string; to: string } | { kind: 'group'; id: string; name: string }

// A heading's id is its place in the saved layout, so re-reading the same
// layout gives the same ids and nothing being typed in is swapped out from
// under the cursor. A group added here gets an id of its own.
let added = 0
const groupRow = (name: string, id = `group:new-${added++}`): Row => ({ kind: 'group', id, name })

function rowsFrom(layout: NavLayout): Row[] {
  // Every page the app has, placed as the layout says — so a page added
  // since the layout was saved shows up in the editor where the menu has
  // put it, not missing.
  const placed = applyNavLayout(NAV_ITEMS, layout)
  const rows: Row[] = placed.filter((i) => !i.group).map((i) => ({ kind: 'item', id: `item:${i.to}`, to: i.to }))
  for (const [n, g] of layout.groups.entries()) {
    rows.push(groupRow(g.name, `group:${n}`))
    for (const i of placed.filter((p) => p.group === g.name)) rows.push({ kind: 'item', id: `item:${i.to}`, to: i.to })
  }
  return rows
}

function layoutFrom(rows: Row[]): NavLayout {
  const layout: NavLayout = { top: [], groups: [] }
  for (const row of rows) {
    if (row.kind === 'group') layout.groups.push({ name: row.name.trim() || 'Untitled', items: [] })
    else if (layout.groups.length === 0) layout.top.push(row.to)
    else layout.groups[layout.groups.length - 1].items.push(row.to)
  }
  return layout
}

/** The rows of one group: its heading and the pages up to the next heading. */
function blockOf(rows: Row[], index: number): [number, number] {
  let end = index + 1
  while (end < rows.length && rows[end].kind === 'item') end++
  return [index, end]
}

export function NavLayoutCard() {
  const { isAdmin } = useAuth()
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const query = useQuery({ queryKey: NAV_LAYOUT_KEY, queryFn: fetchNavLayout, enabled: isAdmin })
  const saved = useMemo(() => query.data ?? defaultNavLayout(NAV_ITEMS), [query.data])

  // The saved arrangement until somebody starts changing it; their draft
  // after. A fresh copy from the server shows through only while there is
  // no draft, so nothing being edited is swapped out from under them.
  const savedRows = useMemo(() => rowsFrom(saved), [saved])
  const [draft, setDraft] = useState<Row[] | null>(null)
  const rows = draft ?? savedRows
  const dirty = draft !== null
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const change = (next: Row[]) => {
    setDraft(next)
    setNote(null)
  }

  const byId = new Map(rows.map((r) => [r.id, r]))
  const { ordered, handleProps, rowProps } = useDragReorder(
    rows.map((r) => r.id),
    (ids) => change(ids.map((id) => byId.get(id)!)),
  )

  const save = useMutation({
    mutationFn: (layout: NavLayout | null) => saveNavLayout(layout),
    onSuccess: (_d, layout) => {
      setError(null)
      setDraft(null)
      setNote(layout ? 'Saved — everybody’s menu now looks like this.' : 'Back to the app’s own menu.')
      return queryClient.invalidateQueries({ queryKey: NAV_LAYOUT_KEY })
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not save the menu.')),
  })

  if (!isAdmin) return null

  const labelOf = (to: string) => NAV_ITEMS.find((i) => i.to === to)?.label ?? to
  const iconOf = (to: string) => NAV_ITEMS.find((i) => i.to === to)?.icon
  const names = rows.filter((r) => r.kind === 'group').map((r) => (r as { name: string }).name.trim().toLowerCase())
  const duplicate = names.some((n, i) => names.indexOf(n) !== i)

  const moveGroup = (index: number, direction: -1 | 1) => {
    const [start, end] = blockOf(ordered.map((id) => byId.get(id)!), index)
    const list = ordered.map((id) => byId.get(id)!)
    const block = list.slice(start, end)
    const rest = [...list.slice(0, start), ...list.slice(end)]
    // Find the neighbouring group's heading in what is left.
    const headings = rest.map((r, i) => (r.kind === 'group' ? i : -1)).filter((i) => i >= 0)
    const before = headings.filter((i) => i < start)
    let at: number
    if (direction === -1) {
      if (before.length === 0) return
      at = before[before.length - 1]
    } else {
      const after = headings.filter((i) => i >= start)
      if (after.length === 0) return
      at = blockOf(rest, after[0])[1]
    }
    change([...rest.slice(0, at), ...block, ...rest.slice(at)])
  }

  const rename = (id: string, name: string) =>
    change(rows.map((r) => (r.id === id && r.kind === 'group' ? { ...r, name } : r)))

  const remove = (id: string) => change(rows.filter((r) => r.id !== id))

  return (
    <section id="menu" className="w-full scroll-mt-24 rounded-[var(--radius-card)] bg-surface-lowest p-6 hairline">
      {/* Past a heading puts a page in that group; above the first
          heading puts it at the top with no heading, like Dashboard. A
          group moves with its arrows, taking its pages along. */}
      <p className="text-body-sm text-on-surface-variant">
        Drag a page by its grip to move it. Who can open each page does not change.
      </p>

      <QueryState isLoading={query.isLoading} error={query.error}>
        <ul className="mt-4 flex flex-col gap-1" aria-label="Menu arrangement">
          {ordered.map((id, index) => {
            const row = byId.get(id)
            if (!row) return null
            if (row.kind === 'group') {
              const [, end] = blockOf(ordered.map((x) => byId.get(x)!), index)
              const empty = end === index + 1
              const isFirst = !ordered.slice(0, index).some((x) => byId.get(x)?.kind === 'group')
              const isLast = !ordered.slice(index + 1).some((x) => byId.get(x)?.kind === 'group')
              return (
                <li
                  key={row.id}
                  {...rowProps(row.id)}
                  className="mt-3 flex items-center gap-1 rounded-[var(--radius-chip)] bg-surface-muted px-1.5 py-1.5 hairline"
                >
                  <input
                    value={row.name}
                    onChange={(e) => rename(row.id, e.target.value.slice(0, 40))}
                    aria-label="Group name"
                    className={`${inputClasses} min-w-0 flex-1 px-3 py-2 text-body-md font-medium`}
                  />
                  <button
                    type="button"
                    disabled={isFirst}
                    onClick={() => moveGroup(index, -1)}
                    aria-label={`Move ${row.name} up`}
                    className="tap-square shrink-0 rounded-full px-1.5 text-on-surface-variant hover:text-on-surface disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={isLast}
                    onClick={() => moveGroup(index, 1)}
                    aria-label={`Move ${row.name} down`}
                    className="tap-square shrink-0 rounded-full px-1.5 text-on-surface-variant hover:text-on-surface disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={!empty}
                    title={empty ? undefined : 'Move its pages out first'}
                    onClick={() => remove(row.id)}
                    aria-label={`Remove group ${row.name}`}
                    className="tap-square shrink-0 rounded-full px-2 text-on-surface-faint hover:text-error disabled:opacity-30"
                  >
                    ✕
                  </button>
                </li>
              )
            }
            const Icon = iconOf(row.to)
            const item = NAV_ITEMS.find((i) => i.to === row.to)
            return (
              <li
                key={row.id}
                {...rowProps(row.id)}
                className="flex min-h-11 items-center gap-3 rounded-[var(--radius-chip)] px-2 text-body-md text-on-surface"
              >
                <DragHandle label={labelOf(row.to)} {...handleProps(row.id)} />
                {Icon && <Icon className="shrink-0" width={18} height={18} />}
                <span className="min-w-0 flex-1 truncate">{labelOf(row.to)}</span>
                {item?.adminOnly && (
                  <span className="font-mono text-label-sm text-on-surface-faint">Admins</span>
                )}
                {item?.teamOnly && (
                  <span className="font-mono text-label-sm text-on-surface-faint">Teams</span>
                )}
              </li>
            )
          })}
        </ul>

        <div className="mt-4">
          <ActionButton size="sm" tone="ghost" glyph="+" onClick={() => change([...rows, groupRow('New group')])}>
            Add group
          </ActionButton>
        </div>

        {duplicate && (
          <p className="mt-3 text-body-sm text-error">Two groups have the same name — give each its own.</p>
        )}
        {error && (
          <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ActionButton disabled={!dirty || duplicate || save.isPending} onClick={() => save.mutate(layoutFrom(rows))}>
            {save.isPending ? 'Saving…' : 'Save menu'}
          </ActionButton>
          {dirty && (
            <ActionButton tone="ghost" onClick={() => setDraft(null)}>
              Undo changes
            </ActionButton>
          )}
          {query.data && !dirty && (
            <ActionButton tone="ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
              Use the app’s own menu
            </ActionButton>
          )}
          {note && <p className="text-body-sm text-accent-green">{note}</p>}
        </div>
      </QueryState>
    </section>
  )
}
