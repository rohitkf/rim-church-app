import { useMemo, useState } from 'react'
import { ActionButton, Overlay, inputClasses } from './Surface'
import { TeamMark } from './TeamMark'
import { Select } from './Select'
import { fetchRequests } from '../lib/purchaseRequest'
import type { Department, InventoryCategory, InventoryItem } from '../lib/types'
import { FILTER_LABEL, FILTER_MEANING, FILTER_ORDER, matchesFilter, type InventoryFilter } from '../lib/inventory'
import { UNCATEGORISED_LABEL } from '../lib/inventoryCategories'
import {
  WISHLIST_DEFAULT,
  WISHLIST_STATUSES,
  WISHLIST_STATUS_LABEL,
  buildInventoryWorkbook,
  inventoryFileName,
  itemsForExport,
  wishlistForExport,
  type ShelfChoice,
  type WishlistStatus,
} from '../lib/inventoryExport'
import { writeWorkbook } from '../lib/writeWorkbook'
import { useErrorText } from '../lib/useErrorText'

/**
 * Choosing what to take away from the register.
 *
 * It starts from what the page was showing — the same filter chip, the
 * same search — because somebody pressing Export has usually just narrowed
 * the list to the thing they want a file of. From there: a shelf, the teams
 * (on the all-teams page), and any single item unticked by hand. The list
 * below the filters is exactly what will be in the file, so there is no
 * guessing what "Needs attention, Cables shelf" came to.
 *
 * The wishlist is a second sheet, off unless asked for, and by default only
 * what is still wanted — the asks not yet bought or turned down.
 */
export function ExportInventoryDialog({
  departments,
  items,
  categories,
  todayIso,
  startFilter = 'all',
  startSearch = '',
  onClose,
}: {
  /** One team on a team's page; every team on the all-teams page. */
  departments: Department[]
  items: InventoryItem[]
  categories: InventoryCategory[]
  todayIso: string
  startFilter?: InventoryFilter
  startSearch?: string
  onClose: () => void
}) {
  const errorText = useErrorText()
  const oneTeam = departments.length === 1 ? departments[0] : null
  const [filter, setFilter] = useState<InventoryFilter>(startFilter)
  const [search, setSearch] = useState(startSearch)
  const [shelf, setShelf] = useState<ShelfChoice>('all')
  const [teamIds, setTeamIds] = useState<Set<string>>(() => new Set(departments.map((d) => d.id)))
  // Unticked by hand, by id: a filter changed and changed back keeps them out.
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set())
  const [withWishlist, setWithWishlist] = useState(false)
  const [statuses, setStatuses] = useState<Set<WishlistStatus>>(() => new Set(WISHLIST_DEFAULT))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const teamNames = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments])
  const teamColor = useMemo(() => new Map(departments.map((d) => [d.id, d.color])), [departments])
  const shelves = useMemo(
    () => (oneTeam ? categories.filter((c) => c.department_id === oneTeam.id) : []),
    [categories, oneTeam],
  )

  const matching = useMemo(
    () =>
      itemsForExport(
        items,
        categories,
        { filter, search, shelf, teamIds: oneTeam ? undefined : teamIds },
        todayIso,
      ),
    [items, categories, filter, search, shelf, teamIds, oneTeam, todayIso],
  )
  const chosen = useMemo(() => matching.filter((i) => !left.has(i.id)), [matching, left])
  const allChosen = matching.length > 0 && chosen.length === matching.length

  // The number on each chip, within the shelf and teams already chosen.
  const chipCounts = useMemo(() => {
    const base = itemsForExport(
      items,
      categories,
      { filter: 'all', search, shelf, teamIds: oneTeam ? undefined : teamIds },
      todayIso,
    )
    return Object.fromEntries(
      FILTER_ORDER.map((f) => [f, base.filter((i) => matchesFilter(i, f, todayIso)).length]),
    ) as Record<InventoryFilter, number>
  }, [items, categories, search, shelf, teamIds, oneTeam, todayIso])

  const toggleItem = (id: string) =>
    setLeft((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const toggleTeam = (id: string) =>
    setTeamIds((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const toggleStatus = (s: WishlistStatus) =>
    setStatuses((current) => {
      const next = new Set(current)
      if (!next.delete(s)) next.add(s)
      return next
    })

  const nothing = chosen.length === 0 && !(withWishlist && statuses.size > 0)

  async function handleExport() {
    setBusy(true)
    setError(null)
    try {
      const wishlist = withWishlist
        ? // Narrowed here as well as asked for narrowly: a team's file holds
          // that team's wishes, whatever else the read comes back with.
          wishlistForExport(
            await fetchRequests(oneTeam?.id ?? null),
            statuses,
            oneTeam ? new Set([oneTeam.id]) : teamIds,
          )
        : undefined
      const sheets = buildInventoryWorkbook({ items: chosen, categories, teamNames, wishlist, todayIso })
      await writeWorkbook(sheets, inventoryFileName(oneTeam?.name ?? null))
      onClose()
    } catch (err: unknown) {
      setError(errorText(err, 'Could not build the export.'))
    } finally {
      setBusy(false)
    }
  }

  const label = 'Export inventory'
  const shelfName = (item: InventoryItem) =>
    (item.category_id && shelves.find((c) => c.id === item.category_id)?.name) || null

  return (
    <Overlay label={label} onDismiss={onClose} align="sheet">
      <div className="flex max-h-[88svh] w-full max-w-lg flex-col rounded-t-[var(--radius-tile)] bg-surface-low shadow-[var(--shadow-lifted)] hairline-strong sm:rounded-[var(--radius-tile)]">
        <div className="mx-auto mt-3 h-[5px] w-[38px] shrink-0 rounded-full bg-white/22 sm:hidden" />
        <div className="px-6 pt-5">
          <h2 className="text-headline-md">{label}</h2>
          <p className="mt-1.5 text-body-sm text-on-surface-variant">
            An Excel workbook of {oneTeam ? `${oneTeam.name}’s` : 'the teams’'} items — and the wishlist, if
            you want it, on a sheet of its own.
          </p>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-6">
          {!oneTeam && (
            <fieldset>
              <legend className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                Teams
              </legend>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {departments.map((d) => (
                  <li key={d.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-body-sm hairline hover:bg-raised">
                      <input
                        type="checkbox"
                        checked={teamIds.has(d.id)}
                        onChange={() => toggleTeam(d.id)}
                        className="h-4 w-4"
                      />
                      <TeamMark color={d.color} />
                      {d.name}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          <fieldset className={oneTeam ? '' : 'mt-5'}>
            <legend className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
              Which items
            </legend>
            <div role="group" aria-label="Filter the items" className="mt-2 flex flex-wrap gap-1.5">
              {FILTER_ORDER.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  title={FILTER_MEANING[f]}
                  aria-pressed={filter === f}
                  className={`tap rounded-full px-3 py-1.5 text-body-sm ${
                    filter === f
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant ring-1 ring-black/8 hover:text-on-surface dark:ring-white/10'
                  }`}
                >
                  {FILTER_LABEL[f]}
                  <span className="ml-1.5 font-mono text-label-sm opacity-70">{chipCounts[f]}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tag, name, brand, serial or location…"
                aria-label="Search the items to export"
                className={`${inputClasses} min-w-0 flex-1`}
              />
              {shelves.length > 0 && (
                <div className="w-full sm:w-44">
                <Select
                  aria-label="Shelf"
                  value={shelf === null ? 'none' : shelf}
                  onChange={(v) => setShelf(v === 'all' ? 'all' : v === 'none' ? null : v)}
                  options={[
                    { value: 'all', label: 'Every shelf' },
                    ...[...shelves]
                      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
                      .map((c) => ({ value: c.id, label: c.name })),
                    { value: 'none', label: UNCATEGORISED_LABEL },
                  ]}
                />
                </div>
              )}
            </div>
          </fieldset>

          <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-row)] bg-raised px-4 py-2.5 hairline">
            <label className="flex items-center gap-3 text-body-sm font-medium text-on-surface">
              <input
                type="checkbox"
                aria-label="Every item listed"
                checked={allChosen}
                disabled={matching.length === 0}
                ref={(node) => {
                  if (node) node.indeterminate = chosen.length > 0 && !allChosen
                }}
                onChange={() =>
                  setLeft((current) => {
                    const next = new Set(current)
                    for (const i of matching) {
                      if (allChosen) next.add(i.id)
                      else next.delete(i.id)
                    }
                    return next
                  })
                }
                className="h-4 w-4"
              />
              Every item listed
            </label>
            <span data-testid="export-count" className="ml-auto font-mono text-label-sm text-on-surface-faint">
              {chosen.length}/{matching.length}
            </span>
          </div>

          <ul aria-label="Items to export" className="mt-1.5 flex flex-col">
            {matching.map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-row)] px-4 py-2 hover:bg-raised">
                  <input
                    type="checkbox"
                    checked={!left.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    aria-label={`Export ${item.name}`}
                    className="h-4 w-4 shrink-0"
                  />
                  {!oneTeam && <TeamMark color={teamColor.get(item.department_id) ?? null} />}
                  <span className="min-w-0 flex-1 break-words text-body-sm text-on-surface">{item.name}</span>
                  <span className="shrink-0 font-mono text-label-sm text-on-surface-faint">
                    {[item.asset_tag, oneTeam ? shelfName(item) : teamNames.get(item.department_id)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </label>
              </li>
            ))}
            {matching.length === 0 && (
              <li className="px-4 py-3 text-body-sm text-on-surface-variant">Nothing matches these filters.</li>
            )}
          </ul>

          <div className="mt-5 border-t border-border-subtle pt-4">
            <label className="flex items-start gap-3 text-body-sm text-on-surface">
              <input
                type="checkbox"
                checked={withWishlist}
                onChange={(e) => setWithWishlist(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Include the wishlist
                <span className="block text-label-md text-on-surface-faint">
                  What the team has asked to buy, on a sheet of its own — the shelf filters above don’t apply
                  to it.
                </span>
              </span>
            </label>
            {withWishlist && (
              <div role="group" aria-label="Wishlist items to include" className="ml-7 mt-2 flex flex-wrap gap-1.5">
                {WISHLIST_STATUSES.map((s) => (
                  <label
                    key={s}
                    className="flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-body-sm hairline hover:bg-raised"
                  >
                    <input
                      type="checkbox"
                      checked={statuses.has(s)}
                      onChange={() => toggleStatus(s)}
                      className="h-4 w-4"
                    />
                    {WISHLIST_STATUS_LABEL[s]}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="mx-6 mt-4 rounded-[var(--radius-chip)] bg-error-container px-4 py-3 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
          <ActionButton tone="quiet" onClick={onClose}>
            Cancel
          </ActionButton>
          <ActionButton onClick={handleExport} disabled={busy || nothing}>
            {busy
              ? 'Building…'
              : nothing
                ? 'Nothing to export'
                : `Export ${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}${withWishlist ? ' + wishlist' : ''}`}
          </ActionButton>
        </div>
      </div>
    </Overlay>
  )
}
