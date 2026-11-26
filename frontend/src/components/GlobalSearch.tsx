import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { usePageAccess } from '../lib/usePageAccess'
import { usePermissions } from '../lib/usePermissions'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { SearchIcon } from './icons'
import { Overlay } from './Surface'
import { shortcutLabel, shortcutSpoken, thisPlatform } from '../lib/shortcutKey'
import { useNavNames } from '../lib/navNames'
import { maySee } from '../lib/settingsSections'
import { markedPieces, tokensOf } from '../lib/searchMatch'
import {
  MIN_TEXT_QUERY,
  SEARCH_INDEX_KEY,
  arrange,
  fetchSearchIndex,
  matchThings,
  placeThings,
  recentThings,
  rememberThing,
  searchWritten,
  type Thing,
} from '../lib/globalSearch'
import { forgetRecent } from '../lib/searchRecent'

/*
 * What is searched, and how a match is judged, is lib/globalSearch and
 * lib/searchMatch. This file is the box: the button in the header, the
 * window that opens over the page, and the list in it.
 */

/** How long the names of things are kept before they are read again. */
const INDEX_FRESH_MS = 5 * 60_000

/** A name with the letters that were typed drawn heavier, so a row shows why it is one. */
function Marked({ query, text }: { query: string; text: string }) {
  return (
    <>
      {markedPieces(query, text).map((piece, i) =>
        piece.found ? (
          <mark key={i} className="bg-transparent font-semibold text-on-surface underline decoration-primary/60 decoration-2 underline-offset-2">
            {piece.text}
          </mark>
        ) : (
          <Fragment key={i}>{piece.text}</Fragment>
        ),
      )}
    </>
  )
}

/**
 * One box over everything, and it opens in the middle of the screen.
 *
 * It used to be a text field in the header with a list hanging off the
 * bottom of it: a quarter of the width of the page for results that reach
 * across the whole app, competing with the header for room on a laptop
 * and pinned under the notch on a phone. ⌘K focused it, which on a busy
 * page meant the thing you had summoned was a thin strip in the corner.
 *
 * Now the header carries a button that looks like a field, and pressing
 * it — or the shortcut, from anywhere — opens the search over the page,
 * centred, the way every search worth using since Spotlight has done it.
 * The page behind it is held still (see Overlay), so the list you are
 * arrowing through cannot scroll away underneath you.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const platform = useMemo(() => thisPlatform(), [])

  // ⌘K or Ctrl-K from anywhere. Both modifiers, always — only the label
  // in the corner is platform-specific, because a keyboard that has one
  // of these keys is not confused by the app accepting the other.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((was) => !was)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour="search"
        aria-label={`Search — ${shortcutSpoken(platform)}`}
        aria-keyshortcuts={platform.platform && /mac|iphone|ipad/i.test(platform.platform) ? 'Meta+K' : 'Control+K'}
        className="tap flex w-full min-w-0 max-w-sm items-center gap-2.5 rounded-full bg-surface-low px-4 py-2.5 text-body-sm text-on-surface-variant ring-1 ring-inset ring-black/5 transition-shadow duration-200 ease-[var(--ease-glide)] hover:ring-secondary/50 dark:bg-surface-container dark:ring-white/10"
      >
        <SearchIcon width={16} height={16} className="shrink-0" />
        {/* One word, at every width. It said "Search anything…" where there
            was room, which is a slogan where a label was wanted; what can be
            found is said inside, once the box is open. */}
        <span className="min-w-0 flex-1 truncate text-left">Search</span>
        {/* The key this keyboard actually has. It advertised ⌘K to
            everybody, including the people who do not have that key. */}
        <kbd className="hidden shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 font-mono text-[0.6875rem] text-on-surface-variant ring-1 ring-inset ring-black/8 sm:block dark:ring-white/10">
          {shortcutLabel(platform)}
        </kbd>
      </button>

      {open && <SearchPalette onClose={() => setOpen(false)} />}
    </>
  )
}

/** The search itself, over the page rather than beside it. */
function SearchPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  const [recent, setRecent] = useState<Thing[]>(() => recentThings())
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const listId = useId()

  const { session, isAdmin, isSuperAdmin } = useAuth()
  const { can } = usePermissions()
  const { canOpen } = usePageAccess()
  const names = useNavNames()
  const typed = term.trim()
  const hasWords = tokensOf(typed).length > 0

  // Places: every page and room this person can go to. Known already, so found as they type.
  const places = useMemo(
    () => placeThings(names, canOpen, (room) => maySee(room, { isAdmin, isSuperAdmin, can })),
    [names, canOpen, isAdmin, isSuperAdmin, can],
  )

  // Things with a name: read once when the search opens, then found as they type.
  const contacts = can('people.contacts')
  const volunteersOpen = canOpen('/volunteers')
  const index = useQuery({
    queryKey: [...SEARCH_INDEX_KEY, session?.user.id ?? null, contacts, volunteersOpen],
    queryFn: () => fetchSearchIndex({ contacts, volunteersOpen }),
    staleTime: INDEX_FRESH_MS,
  })

  // Things somebody wrote: asked of the database, a moment after the typing stops.
  const debounced = useDebouncedValue(typed, 220)
  const asksWritten = debounced.length >= MIN_TEXT_QUERY
  const written = useQuery({
    queryKey: ['search-written', debounced],
    queryFn: () => searchWritten(debounced),
    enabled: asksWritten,
    placeholderData: keepPreviousData,
  })

  const groups = useMemo(() => {
    if (!hasWords) return []
    // A page somebody cannot open is not offered as a way to move. (What
    // the database refuses never comes back to be offered in the first place.)
    const named = matchThings(typed, index.data ?? []).filter((hit) => canOpen(hit.page))
    const texts = asksWritten && typed.length >= MIN_TEXT_QUERY ? (written.data ?? []).filter((hit) => canOpen(hit.page)) : []
    return arrange([...matchThings(typed, places), ...named, ...texts])
  }, [hasWords, typed, places, index.data, written.data, asksWritten, canOpen])

  // With nothing typed: what was chosen lately, less whatever this person can no longer open.
  const lately = useMemo(
    () => recent.filter((thing) => (thing.kind === 'Setting' || thing.kind === 'Page' ? places.some((p) => p.id === thing.id) : canOpen(thing.page))),
    [recent, places, canOpen],
  )

  const rows = hasWords ? groups.flatMap((g) => g.hits) : lately
  const current = Math.min(active, Math.max(0, rows.length - 1))
  const optionId = (i: number) => `${listId}-option-${i}`

  useEffect(() => input.current?.focus(), [])
  // The row the arrow keys are on stays in view.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }, [current, rows.length])

  function go(thing: Thing) {
    rememberThing(thing)
    onClose()
    navigate(thing.to)
  }

  const looking = (hasWords && index.isLoading) || (asksWritten && written.isFetching)
  // Where each group's rows begin in the one list the arrow keys walk.
  const starts = groups.map((_, g) => groups.slice(0, g).reduce((sum, earlier) => sum + earlier.hits.length, 0))

  const row = (thing: Thing, i: number, chip: boolean) => (
    <button
      key={thing.id}
      type="button"
      role="option"
      id={optionId(i)}
      aria-selected={i === current}
      tabIndex={-1}
      onMouseMove={() => setActive(i)}
      onClick={() => go(thing)}
      className={`flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition-colors duration-150 ${
        i === current ? 'bg-surface-low' : ''
      }`}
    >
      <span className="min-w-0">
        <span className="block break-words text-body-md text-on-surface">
          <Marked query={typed} text={thing.label} />
        </span>
        {thing.detail && <span className="block break-words text-label-sm text-on-surface-faint">{thing.detail}</span>}
      </span>
      {chip && (
        <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 font-mono text-[0.75rem] font-medium text-on-surface-variant">
          {thing.kind}
        </span>
      )}
    </button>
  )

  return (
    <Overlay onDismiss={onClose} label="Search" closable={false}>
      <div
        // Stops at the width of a sentence and the height of a screenful:
        // a palette that grows to fill a 1440px desk is a page, and this
        // is a thing you look at for two seconds.
        className="w-full max-w-xl overflow-hidden rounded-[var(--radius-shell)] bg-surface-lowest shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
      >
        <label className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
          <SearchIcon width={18} height={18} className="shrink-0 text-on-surface-variant" />
          <input
            ref={input}
            value={term}
            onChange={(e) => {
              setTerm(e.target.value)
              // New letters, a new list: back to its first row.
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (!rows.length) return
              const move = (to: number) => {
                e.preventDefault()
                setActive((to + rows.length) % rows.length)
              }
              if (e.key === 'ArrowDown') move(current + 1)
              else if (e.key === 'ArrowUp') move(current - 1)
              else if (e.key === 'Home' && !typed) move(0)
              else if (e.key === 'End' && !typed) move(rows.length - 1)
              else if (e.key === 'Enter') {
                e.preventDefault()
                go(rows[current])
              }
            }}
            placeholder="Search"
            aria-label="Search"
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls={listId}
            aria-activedescendant={rows.length ? optionId(current) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className="w-full bg-transparent text-body-lg text-on-surface outline-none placeholder:text-on-surface-faint"
          />
          {term && (
            <button
              type="button"
              onClick={() => {
                setTerm('')
                setActive(0)
                input.current?.focus()
              }}
              className="tap shrink-0 rounded-full px-2 py-1 text-label-md font-medium text-on-surface-variant hover:text-on-surface"
            >
              Clear
            </button>
          )}
          <kbd className="hidden shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[0.6875rem] text-on-surface-faint ring-1 ring-inset ring-black/8 sm:block dark:ring-white/10">
            esc
          </kbd>
        </label>

        {/* The list holds results and nothing else, so a screen reader hears
            "option 3 of 12" and not the furniture round them. */}
        <div ref={list} id={listId} role="listbox" aria-label={hasWords ? 'Results' : 'Chosen lately'} className="max-h-[min(62vh,30rem)] overflow-y-auto">
          {!hasWords && lately.length > 0 && (
            <div role="group" aria-label="Chosen lately" className="py-1.5">
              <div role="presentation" className="px-5 pb-1 pt-2 font-mono text-eyebrow text-on-surface-faint">
                Chosen lately
              </div>
              {lately.map((thing, i) => row(thing, i, true))}
            </div>
          )}
          {hasWords &&
            groups.map((group, g) => (
              <div key={group.kind} role="group" aria-label={group.heading} className={g === 0 ? 'pt-1.5' : ''}>
                <div role="presentation" className="px-5 pb-1 pt-2.5 font-mono text-eyebrow text-on-surface-faint">
                  {group.heading}
                </div>
                {group.hits.map((hit, i) => row(hit, starts[g] + i, false))}
              </div>
            ))}
        </div>

        {!hasWords && lately.length === 0 && (
          <p className="px-5 py-4 text-body-sm text-on-surface-variant">
            People, teams, services, kit, songs, messages — anything you can open. A few letters will do, in any order.
          </p>
        )}
        {hasWords && rows.length === 0 && (
          <p role="status" className="px-5 py-4 text-body-sm text-on-surface-variant">
            {looking ? 'Searching…' : <>Nothing matches &ldquo;{typed}&rdquo;. Try fewer letters, or another word for it.</>}
          </p>
        )}
        {hasWords && rows.length > 0 && looking && (
          <p role="status" className="px-5 pb-2.5 pt-1 text-label-sm text-on-surface-faint">
            Still looking in what people have written…
          </p>
        )}

        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-2">
            <span aria-hidden="true" className="hidden font-mono text-[0.6875rem] text-on-surface-faint sm:block">
              ↑ ↓ to move · ↵ to open · esc to close
            </span>
            {!hasWords && (
              <button
                type="button"
                onClick={() => {
                  forgetRecent()
                  setRecent([])
                  input.current?.focus()
                }}
                className="tap ml-auto rounded-full px-2 py-0.5 text-label-sm text-on-surface-variant hover:text-on-surface"
              >
                Forget these
              </button>
            )}
          </div>
        )}
      </div>
    </Overlay>
  )
}
