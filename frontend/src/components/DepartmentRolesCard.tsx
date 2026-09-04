import { type FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { QueryState } from './QueryState'
import { fetchDepartmentRoles, fetchRoleChecklistItems, fetchRoleGroups } from '../lib/queries'
import { useErrorText } from '../lib/useErrorText'
import { isCoordinatorRole } from '../lib/useTeamCoordinator'
import { useDragReorder } from '../lib/useDragReorder'
import { PHASES, byPhase } from '../lib/checklistPhase'
import { suggestChecklistItems } from '../lib/checklistSuggestions'
import { itemsToCopy, rolesWithChecklists } from '../lib/copyChecklist'
import { arrangeRoles, reorderWithinGroup, UNGROUPED_LABEL, type RenderedGroup } from '../lib/roleGroups'
import type {
  ChecklistPhase,
  DepartmentRole,
  DepartmentRoleGroup,
  RoleChecklistItem,
} from '../lib/types'
import { DragHandle } from './DragHandle'
import { Chevron } from './Collapsible'
import { ActionButton, Field, Overlay, Pill, inputClasses } from './Surface'
import { Select } from './Select'

/**
 * The roles this team fills at a service. These are the options the Team
 * Rota offers when assigning someone, so this list is the single place
 * they're defined.
 */
/** The standing checklist for one role: what the person holding it must
 * do at every service. Whoever holds the role in the Team Rota works this
 * list on the Checklists page. */
function RoleChecklistEditor({
  roleId,
  departmentId,
  canManage,
  phase,
  roleNames,
}: {
  roleId: string
  departmentId: string
  canManage: boolean
  phase: ChecklistPhase
  /** Role id → name, for saying which role a suggestion came from. */
  roleNames: Map<string, string>
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const itemsQuery = useQuery({
    queryKey: ['role-checklist-items', [departmentId]],
    queryFn: () => fetchRoleChecklistItems([departmentId]),
  })
  const items = byPhase(
    (itemsQuery.data ?? []).filter((i) => i.role_id === roleId),
    phase,
  )

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['role-checklist-items'] })

  // What the team's other roles already call this job. Camera Operator 1
  // and Camera Operator 2 check the same batteries; typing it out twice is
  // slower and ends in two nearly-identical lines that read as two jobs.
  const suggestions = useMemo(
    () =>
      suggestChecklistItems({
        items: itemsQuery.data ?? [],
        roleNames,
        roleId,
        phase,
        query: label,
      }),
    [itemsQuery.data, roleNames, roleId, phase, label],
  )

  const addItem = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase.from('department_role_checklist_items').insert({
        role_id: roleId,
        department_id: departmentId,
        label: text,
        phase,
        sort_order: items.length,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setLabel('')
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not add that item.')),
  })

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('department_role_checklist_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that item.')),
  })

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('reorder_role_checklist_items', { role: roleId, ids })
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not reorder the checklist.')),
  })

  const byId = new Map(items.map((i) => [i.id, i]))
  // The order the list is drawn in, which during a drag is ahead of what
  // the database has been told.
  const { ordered, handleProps, rowProps } = useDragReorder(
    items.map((i) => i.id),
    (ids) => reorder.mutate(ids),
    { enabled: canManage },
  )

  return (
    <div className="mt-2.5">
      {items.length === 0 ? (
        <p className="rounded-[var(--radius-chip)] px-2 py-1.5 text-label-sm text-on-surface-faint">
          Nothing here yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {ordered.map((id) => {
            const item = byId.get(id)
            if (!item) return null
            return (
              <li
                key={item.id}
                {...rowProps(item.id)}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-chip)] bg-surface-lowest px-2 py-1.5 text-body-sm hairline"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {canManage && <DragHandle label={item.label} {...handleProps(item.id)} />}
                  <span className="min-w-0 break-words text-on-surface">{item.label}</span>
                </span>
                {canManage && (
                  <button
                    onClick={() => deleteItem.mutate(item.id)}
                    className="shrink-0 text-label-sm text-on-surface-faint hover:text-error hover:underline"
                  >
                    Remove
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canManage && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (label.trim()) addItem.mutate(label.trim())
          }}
          className="mt-2.5 flex items-center gap-2"
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={
              phase === 'pre' ? 'Check batteries, test focus…' : 'Batteries on charge, cards filed…'
            }
            className="min-w-0 flex-1 rounded-full bg-surface-lowest px-3 py-1.5 text-body-sm text-on-surface hairline placeholder:text-on-surface-faint focus:outline-none focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
          />
          <button
            type="submit"
            disabled={addItem.isPending || !label.trim()}
            className="tap shrink-0 rounded-full bg-raised px-3 py-1.5 text-label-sm font-medium text-on-surface hairline transition-colors hover:bg-surface-container disabled:opacity-40"
          >
            Add
          </button>
        </form>
      )}

      {canManage && suggestions.length > 0 && (
        <div className="mt-3 border-t border-border-subtle pt-2.5">
          <div className="font-mono text-label-sm uppercase tracking-[0.14em] text-on-surface-faint">
            Already on another role
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {suggestions.map((s) => (
              <li key={s.label}>
                <button
                  type="button"
                  onClick={() => addItem.mutate(s.label)}
                  disabled={addItem.isPending}
                  className="tap flex w-full items-baseline gap-2 rounded-[var(--radius-chip)] bg-surface-lowest px-2 py-1 text-left text-body-sm text-on-surface hover:bg-raised disabled:opacity-50"
                >
                  <span className="min-w-0 break-words">{s.label}</span>
                  {s.usedBy.length > 0 && (
                    <span className="ml-auto shrink-0 text-label-sm text-on-surface-faint">
                      {s.usedBy.length > 2
                        ? `${s.usedBy.length} roles`
                        : s.usedBy.join(', ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="mt-1 text-label-sm text-error">{error}</p>}
    </div>
  )
}

/**
 * "Same as Camera Operator 1" — the whole checklist in one go.
 *
 * The suggestions box under each input already saves the typing, but it
 * still asks for one interaction per line, and a role that does the same
 * job as another has one thing to say, not ten. This says it.
 *
 * It copies rather than links, deliberately — see lib/copyChecklist.ts.
 * The copied lines are ordinary items from the moment they land: reorder
 * them, reword them, delete the two that do not apply, add your own. The
 * role it came from neither knows nor cares.
 */
function CopyChecklistFrom({
  roleId,
  departmentId,
  roles,
}: {
  roleId: string
  departmentId: string
  roles: { id: string; name: string }[]
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  /** The role being copied from, once one is chosen. */
  const [from, setFrom] = useState('')
  /** Which of its lines are coming across. Everything, until told otherwise. */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())

  const itemsQuery = useQuery({
    // Same key the per-phase editors use, so this reads the cache they
    // already filled rather than fetching the team's items a third time.
    queryKey: ['role-checklist-items', [departmentId]],
    queryFn: () => fetchRoleChecklistItems([departmentId]),
  })
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data])

  const sources = useMemo(
    () => rolesWithChecklists({ items, roles, excludeRoleId: roleId }),
    [items, roles, roleId],
  )

  const copy = useMutation({
    mutationFn: async (fromRoleId: string) => {
      const rows = itemsToCopy({ items, fromRoleId, toRoleId: roleId, onlyItemIds: picked })
      const from = roles.find((r) => r.id === fromRoleId)?.name ?? 'that role'
      // Nothing new to take is a normal outcome, not a failure: it is what
      // copying the same role twice looks like, and saying so is kinder
      // than a silent no-op that reads as a broken button.
      if (rows.length === 0) return { added: 0, from }
      const { error: insertError } = await supabase
        .from('department_role_checklist_items')
        .insert(rows.map((r) => ({ ...r, role_id: roleId, department_id: departmentId })))
      if (insertError) throw insertError
      return { added: rows.length, from }
    },
    onSuccess: ({ added, from: fromRole }) => {
      setError(null)
      setOpen(false)
      setFrom('')
      setPicked(new Set())
      setCopied(
        added === 0
          ? `Nothing new to take from ${fromRole} — this role already has all of it.`
          : `Copied ${added} ${added === 1 ? 'item' : 'items'} from ${fromRole}.`,
      )
      queryClient.invalidateQueries({ queryKey: ['role-checklist-items'] })
    },
    onError: (err: unknown) => {
      setCopied(null)
      setError(errorText(err, 'Could not copy that checklist.'))
    },
  })

  // What the receiving role already has, matched on wording the way the
  // copy itself matches it. A line it already carries is shown in the
  // picker greyed and unticked rather than hidden: "why is that one not
  // coming across" is a fair question and this answers it in place.
  const alreadyHere = useMemo(() => {
    const has = new Set<string>()
    for (const i of items) {
      if (i.role_id === roleId) has.add(`${i.phase}:${i.label.trim().toLowerCase()}`)
    }
    return has
  }, [items, roleId])

  const sourceItems = useMemo(
    () => (from ? items.filter((i) => i.role_id === from) : []),
    [items, from],
  )
  const isDuplicate = (item: RoleChecklistItem) =>
    alreadyHere.has(`${item.phase}:${item.label.trim().toLowerCase()}`)

  function pickRole(nextFrom: string) {
    setFrom(nextFrom)
    setCopied(null)
    setError(null)
    // Select all is the default, because taking the whole list is what
    // somebody opening this came to do; the ticks are for the exception.
    const source = items.filter((i) => i.role_id === nextFrom)
    setPicked(
      new Set(
        source
          .filter((i) => !alreadyHere.has(`${i.phase}:${i.label.trim().toLowerCase()}`))
          .map((i) => i.id),
      ),
    )
  }

  function close() {
    setOpen(false)
    setFrom('')
    setPicked(new Set())
    setError(null)
  }

  const toggleItem = (id: string) =>
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const phaseItems = (phase: ChecklistPhase) => byPhase(sourceItems, phase)
  const allPickedIn = (phase: ChecklistPhase) => {
    const rows = phaseItems(phase).filter((i) => !isDuplicate(i))
    return rows.length > 0 && rows.every((i) => picked.has(i.id))
  }
  const togglePhase = (phase: ChecklistPhase) => {
    const rows = phaseItems(phase).filter((i) => !isDuplicate(i))
    const turnOff = allPickedIn(phase)
    setPicked((current) => {
      const next = new Set(current)
      for (const row of rows) {
        if (turnOff) next.delete(row.id)
        else next.add(row.id)
      }
      return next
    })
  }

  if (sources.length === 0) return null

  const fromName = sources.find((r) => r.id === from)?.name ?? ''

  return (
    /*
     * A button, not a field.
     *
     * It used to be a dropdown sitting open on the page, above the very
     * lists it fills in — the widest, brightest thing in the panel, for
     * something used once in a role's life. And choosing a name did the
     * copy there and then: the whole of another role's checklist landed
     * with no way to say "all of it except that one", which for two roles
     * that are nearly the same is the only interesting case.
     */
    <div className="border-t border-border-subtle pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <ActionButton size="sm" tone="quiet" onClick={() => setOpen(true)}>
          Copy from…
        </ActionButton>
        <span className="text-label-sm text-on-surface-faint">
          Take another role&rsquo;s checklist, all of it or the parts you pick.
        </span>
      </div>
      {copied && <p className="mt-1.5 text-label-sm text-on-surface-variant">{copied}</p>}
      {error && !open && <p className="mt-1.5 text-label-sm text-error">{error}</p>}

      {open && (
        <Overlay onDismiss={close} label="Copy a checklist from another role">
          <div className="w-full max-w-lg rounded-[var(--radius-card)] bg-surface-container p-5 shadow-[var(--shadow-lifted)] sm:p-6">
            <h3 className="text-headline-md">Copy a checklist</h3>
            <p className="mt-1 text-label-md text-on-surface-faint">
              It is a copy: once the lines are here they are this role&rsquo;s, and changing them
              changes nothing anywhere else.
            </p>

            <div className="mt-4">
              <Field label="Role to copy from">
                <Select
                  value={from}
                  onChange={pickRole}
                  placeholder="Choose a role…"
                  aria-label="Role to copy the checklist from"
                  options={sources.map((r) => ({
                    value: r.id,
                    label: `${r.name} (${r.count})`,
                  }))}
                />
              </Field>
            </div>

            {/* Nothing to tick until there is something to tick: the two
                lists stay away entirely until a role is chosen, rather
                than sitting there greyed out as furniture. */}
            {from && (
              <div className="mt-4 flex flex-col gap-3">
                {PHASES.map((p) => {
                  const rows = phaseItems(p.value)
                  return (
                    <section
                      key={p.value}
                      className="rounded-[var(--radius-chip)] bg-surface-lowest p-3 hairline"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-label-sm uppercase tracking-[0.14em] text-on-surface">
                          {p.label}
                        </span>
                        {rows.some((i) => !isDuplicate(i)) && (
                          <button
                            type="button"
                            onClick={() => togglePhase(p.value)}
                            className="tap ml-auto rounded-full px-2.5 py-1 text-label-sm text-on-surface-variant hairline hover:text-on-surface"
                          >
                            {allPickedIn(p.value) ? 'Select none' : 'Select all'}
                          </button>
                        )}
                      </div>

                      {rows.length === 0 ? (
                        <p className="mt-2 text-label-sm text-on-surface-faint">
                          {fromName} has nothing here.
                        </p>
                      ) : (
                        <ul className="mt-2 flex flex-col gap-1">
                          {rows.map((row) => {
                            const dup = isDuplicate(row)
                            return (
                              <li key={row.id}>
                                <label
                                  className={`flex items-center gap-2.5 rounded-[var(--radius-chip)] px-2 py-1.5 text-body-sm ${
                                    dup ? 'text-on-surface-faint' : 'text-on-surface'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={picked.has(row.id)}
                                    disabled={dup}
                                    onChange={() => toggleItem(row.id)}
                                    className="size-4 shrink-0 accent-[var(--color-primary)]"
                                  />
                                  <span className="min-w-0 break-words">{row.label}</span>
                                  {dup && (
                                    <span className="ml-auto shrink-0 font-mono text-label-sm text-on-surface-faint">
                                      already here
                                    </span>
                                  )}
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </section>
                  )
                })}
              </div>
            )}

            {error && (
              <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-full px-3 py-1.5 text-label-md text-on-surface-variant hover:text-on-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!from || picked.size === 0 || copy.isPending}
                onClick={() => copy.mutate(from)}
                className="tap rounded-full bg-primary px-4 py-1.5 text-label-md font-medium text-on-primary disabled:opacity-40"
              >
                {copy.isPending
                  ? 'Copying…'
                  : `Copy ${picked.size} ${picked.size === 1 ? 'item' : 'items'}`}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}

interface RoleRowProps {
  role: DepartmentRole
  departmentId: string
  canManage: boolean
  roles: DepartmentRole[]
  roleNames: Map<string, string>
  groups: DepartmentRoleGroup[]
  editingId: string | null
  editingName: string
  setEditingId: (id: string | null) => void
  setEditingName: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onMoveToGroup: (id: string, groupId: string | null) => void
  renaming: boolean
  deleting: boolean
  dragHandle?: React.ReactNode
}

/**
 * Held back until the row is pointed at — but only where pointing is a
 * thing that happens.
 *
 * A width breakpoint would have been the easy version and the wrong one: a
 * tablet is wide and has no hover, so Edit and Delete would have been
 * unreachable on it. The query asks the device what it can do rather than
 * how big it is, and anything that cannot hover keeps every control in
 * plain sight. Keyboard focus brings them back either way.
 *
 * Written out in full, twice, rather than built from parts: Tailwind finds
 * classes by reading the source for them, and a name assembled at runtime
 * is a name it never sees — the styles would simply not exist. The
 * underscores are how a space is spelled inside an arbitrary variant;
 * without them the query is invalid CSS and generates nothing at all.
 */
const REVEAL_ON_POINT = {
  role: 'transition-opacity duration-300 ease-[var(--ease-glide)] [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover/role:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-focus-within/role:opacity-100',
  group:
    'transition-opacity duration-300 ease-[var(--ease-glide)] [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover/group:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-focus-within/group:opacity-100',
}

/** One role: its name, what may be done to it, and its checklist. */
function RoleRow({
  role,
  departmentId,
  canManage,
  roles,
  roleNames,
  groups,
  editingId,
  editingName,
  setEditingId,
  setEditingName,
  onRename,
  onDelete,
  onMoveToGroup,
  renaming,
  deleting,
  dragHandle,
}: RoleRowProps) {
  const isCoordinator = isCoordinatorRole(role.name)
  const [showChecklist, setShowChecklist] = useState(false)

  // How long this role's checklist is, said on the toggle and again on
  // each phase. The same query key the editors use, so this is the cache
  // they already filled rather than a third trip for the same rows.
  const checklistQuery = useQuery({
    queryKey: ['role-checklist-items', [departmentId]],
    queryFn: () => fetchRoleChecklistItems([departmentId]),
  })
  const mine = useMemo(
    () => (checklistQuery.data ?? []).filter((i) => i.role_id === role.id),
    [checklistQuery.data, role.id],
  )
  const countFor = (phase: ChecklistPhase) => byPhase(mine, phase).length

  if (editingId === role.id) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const name = editingName.trim()
          if (!name || name === role.name) return setEditingId(null)
          onRename(role.id, name)
        }}
        className="flex w-full flex-col gap-3"
      >
        <Field label="Name">
          <input
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            autoFocus
            className={inputClasses}
          />
        </Field>
        {/* Which family it belongs to, asked here rather than in a
            dropdown on every resting row. A role already sits under its
            group's heading — repeating that heading in a picker beside
            each name said the same thing twice, and it was the widest
            thing in the row. Editing a role is where what it is and where
            it is filed both get decided. */}
        {groups.length > 0 && (
          <Field label="Group">
            <Select
              aria-label={`Group for ${role.name}`}
              value={role.group_id ?? ''}
              onChange={(groupId) => onMoveToGroup(role.id, groupId || null)}
              options={[
                { value: '', label: UNGROUPED_LABEL },
                ...groups.map((g) => ({ value: g.id, label: g.name })),
              ]}
            />
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton type="submit" size="sm" disabled={renaming}>
            Save
          </ActionButton>
          <ActionButton size="sm" tone="ghost" onClick={() => setEditingId(null)}>
            Cancel
          </ActionButton>
        </div>
      </form>
    )
  }

  return (
    <>
      {/* One line: what the role is called, and — held back until the row
          is pointed at, on a screen wide enough for pointing — what can be
          done to it. Five roles each showing a handle, a picker, two
          coloured links and a disclosure is thirty controls at rest, and
          the card stopped reading as a list of jobs. */}
      <div className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex min-w-0 items-center gap-1.5">
          {dragHandle}
          <span className="min-w-0 break-words text-body-sm font-medium text-on-surface">
            {role.name}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          <ActionButton
            size="sm"
            tone="ghost"
            onClick={() => setShowChecklist((was) => !was)}
            aria-expanded={showChecklist}
            glyph={<Chevron open={showChecklist} />}
          >
            Checklist
            {mine.length > 0 && (
              <span className="ml-1.5 font-mono text-label-sm text-on-surface-faint">
                {mine.length}
              </span>
            )}
          </ActionButton>

          {/* The Team Coordinator is not an ordinary role: whoever the rota
              puts in it can verify this team's checklist, and every team is
              given one. Renaming or deleting it would take that away by
              accident, so it is shown as the fixture it is. */}
          {isCoordinator ? (
            <Pill tone="blue">Built in</Pill>
          ) : (
            canManage && (
              <span className={`flex items-center gap-1.5 ${REVEAL_ON_POINT.role}`}>
                <ActionButton
                  size="sm"
                  tone="quiet"
                  onClick={() => {
                    setEditingId(role.id)
                    setEditingName(role.name)
                  }}
                >
                  Edit
                </ActionButton>
                <ActionButton
                  size="sm"
                  tone="danger-quiet"
                  onClick={() => onDelete(role.id)}
                  disabled={deleting}
                >
                  Delete
                </ActionButton>
              </span>
            )
          )}
        </span>
      </div>

      {showChecklist && (
        /*
         * Two lists, not one: the jobs before the doors open and the jobs
         * once everyone has gone are done hours apart, and reading them as
         * a single column means scanning past half of it at both ends.
         *
         * Side by side where there is room. Stacked, the panel was four
         * boxes of equal weight — a copy-from, two phases and a suggestion
         * list — and nothing in it said which was the checklist. The two
         * phases now sit level with each other as the pair they are, in
         * one panel that is plainly the role's, with the shortcut under
         * them rather than over.
         */
        <div className="mt-3 w-full rounded-[var(--radius-card)] bg-surface-lowest/70 p-3 hairline sm:p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {PHASES.map((p) => (
              <section
                key={p.value}
                className="flex flex-col rounded-[var(--radius-chip)] bg-raised/50 p-3"
              >
                <div className="flex items-baseline gap-2">
                  <h4 className="font-mono text-label-sm uppercase tracking-[0.14em] text-on-surface">
                    {p.label}
                  </h4>
                  <span className="ml-auto shrink-0 font-mono text-label-sm tabular-nums text-on-surface-faint">
                    {countFor(p.value)}
                  </span>
                </div>
                <p className="mt-1 text-label-sm text-on-surface-faint">{p.blurb}</p>
                <RoleChecklistEditor
                  roleId={role.id}
                  departmentId={departmentId}
                  canManage={canManage}
                  phase={p.value}
                  roleNames={roleNames}
                />
              </section>
            ))}
          </div>
          {canManage && (
            <div className="mt-3">
              <CopyChecklistFrom roleId={role.id} departmentId={departmentId} roles={roles} />
            </div>
          )}
        </div>
      )}
    </>
  )
}

/**
 * One family of roles, under its heading.
 *
 * Dragging happens inside a section rather than across the whole card:
 * moving Keys 2 above Keys 1 is the ordinary wish, and moving it into
 * Backing Vocals is a change of group, which the dropdown says far more
 * plainly than a drop target ever would.
 */
function RoleGroupSection({
  section,
  onlySection,
  onReorder,
  onRenameGroup,
  onDeleteGroup,
  ...rowProps
}: {
  section: RenderedGroup<DepartmentRole>
  onlySection: boolean
  onReorder: (ids: string[]) => void
  onRenameGroup: (id: string, name: string) => void
  onDeleteGroup: (id: string) => void
} & Omit<RoleRowProps, 'role' | 'dragHandle'>) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(section.group?.name ?? '')

  const roleById = new Map(section.roles.map((r) => [r.id, r]))
  const { ordered, handleProps, rowProps: dragRowProps } = useDragReorder(
    section.roles.map((r) => r.id),
    onReorder,
    { enabled: rowProps.canManage },
  )

  return (
    <div>
      {/* A team with no groups at all gets no heading: it has done nothing
          wrong, and "Everything else" over the only list on the page would
          be a label for a distinction that does not exist yet. */}
      {!onlySection && (
        <div className="group/group flex flex-wrap items-center justify-between gap-2 pb-1.5">
          {renaming && section.group ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const name = draft.trim()
                if (name && name !== section.group!.name) onRenameGroup(section.group!.id, name)
                setRenaming(false)
              }}
              className="flex flex-1 flex-wrap items-center gap-2"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                aria-label="Group name"
                className={`min-w-0 flex-1 ${inputClasses}`}
              />
              <ActionButton type="submit" size="sm">
                Save
              </ActionButton>
              <ActionButton size="sm" tone="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </ActionButton>
              {/* Getting rid of a family of roles is a decision about the
                  family, so it is asked where the family is being edited
                  — not as a red word standing next to every heading. */}
              <ActionButton
                size="sm"
                tone="danger-quiet"
                onClick={() => onDeleteGroup(section.group!.id)}
              >
                Delete group
              </ActionButton>
            </form>
          ) : (
            <>
              {/* A real heading, not a styled span: this is the structure
                  of the card, and a screen reader should be able to jump
                  between families the way an eye does. */}
              <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                {section.group?.name ?? UNGROUPED_LABEL}
                <span className="ml-2 text-on-surface-faint">{section.roles.length}</span>
              </h3>
              {rowProps.canManage && section.group && (
                <ActionButton
                  size="sm"
                  tone="ghost"
                  onClick={() => {
                    setDraft(section.group!.name)
                    setRenaming(true)
                  }}
                  className={REVEAL_ON_POINT.group}
                >
                  Rename
                </ActionButton>
              )}
            </>
          )}
        </div>
      )}

      {section.roles.length === 0 ? (
        <p className="mt-2 text-label-sm text-on-surface-faint">
          Nothing filed here yet — move a role in with its group dropdown.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {ordered.map((id) => {
            const role = roleById.get(id)
            if (!role) return null
            return (
              <li
                key={role.id}
                {...dragRowProps(role.id)}
                /* Once this row grew a Checklist block underneath it, it
                   stopped being one line — and `rounded-full` on a tall box
                   draws an ellipse, not a pill. */
                /* Once this row grew a checklist underneath it, it stopped
                   being one line — and `rounded-full` on a tall box draws
                   an ellipse, not a pill. A surface step rather than a
                   hairline: five outlined boxes under a heading is five
                   more lines than the eye needs to see a list. */
                className="group/role flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-[var(--radius-row)] bg-raised px-4 py-2.5"
              >
                <RoleRow
                  {...rowProps}
                  role={role}
                  dragHandle={
                    rowProps.canManage ? (
                      <DragHandle label={role.name} {...handleProps(role.id)} />
                    ) : null
                  }
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function DepartmentRolesCard({ departmentId, canManage }: { departmentId: string; canManage: boolean }) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const rolesQuery = useQuery({
    queryKey: ['department-roles', [departmentId]],
    queryFn: () => fetchDepartmentRoles([departmentId]),
  })

  const [newGroup, setNewGroup] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)

  const groupsQuery = useQuery({
    queryKey: ['role-groups', departmentId],
    queryFn: () => fetchRoleGroups(departmentId),
  })
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['department-roles'] })
    queryClient.invalidateQueries({ queryKey: ['role-groups', departmentId] })
  }

  const addGroup = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('department_role_groups')
        .insert({ department_id: departmentId, name })
      if (error) throw error
    },
    onSuccess: () => {
      setNewGroup('')
      setAddingGroup(false)
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not add that group.')),
  })

  const renameGroup = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('department_role_groups').update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not rename that group.')),
  })

  const deleteGroup = useMutation({
    // The roles survive: the column is `on delete set null`, so they fall
    // back to the ungrouped list rather than taking their checklists and
    // every rota assignment ever made against them down with the heading.
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('department_role_groups').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that group.')),
  })

  const setRoleGroup = useMutation({
    mutationFn: async ({ id, groupId }: { id: string; groupId: string | null }) => {
      const { error } = await supabase
        .from('department_roles')
        .update({ group_id: groupId })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not move that role.')),
  })

  const addRole = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('department_roles').insert({ department_id: departmentId, name })
      if (error) throw error
    },
    onSuccess: () => {
      setNewName('')
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not add that role.')),
  })

  const renameRole = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('department_roles').update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setEditingId(null)
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not rename that role.')),
  })

  const deleteRole = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('department_roles').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not delete that role.')),
  })

  const reorderRoles = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc('reorder_department_roles', {
        dept: departmentId,
        ids,
      })
      if (error) throw error
    },
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not reorder the roles.')),
  })

  const roles = rolesQuery.data ?? []
  // Stable across renders so the suggestion list isn't recomputed on every
  // keystroke's re-render of the card around it.
  const roleNames = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles])
  const arranged = useMemo(() => arrangeRoles({ roles, groups }), [roles, groups])

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    addRole.mutate(newName.trim())
  }

  return (
    <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
      <h2 className="text-headline-md">Roles</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        The jobs this team fills at a service. These are the options offered when building the Team
        Rota.
      </p>

      <QueryState
        isLoading={rolesQuery.isLoading}
        error={rolesQuery.error}
        isEmpty={roles.length === 0}
        emptyMessage={canManage ? 'No roles yet — add the first one below.' : 'No roles defined yet.'}
      >
        {/* The Team Coordinator, above everything and outside every group.
            Every team is given one, whoever the rota puts in it can verify
            that team's checklist, and on a team of twenty-four it would
            otherwise be the twelfth name down a list of guitars. */}
        {arranged.coordinator && (
          <div className="mt-4 rounded-[var(--radius-chip)] bg-secondary-container px-3 py-2 ring-1 ring-inset ring-secondary/30">
            <RoleRow
              role={arranged.coordinator}
              departmentId={departmentId}
              canManage={canManage}
              roles={roles}
              roleNames={roleNames}
              groups={groups}
              editingId={editingId}
              editingName={editingName}
              setEditingId={setEditingId}
              setEditingName={setEditingName}
              onRename={(id, name) => renameRole.mutate({ id, name })}
              onDelete={(id) => deleteRole.mutate(id)}
              onMoveToGroup={(id, groupId) => setRoleGroup.mutate({ id, groupId })}
              renaming={renameRole.isPending}
              deleting={deleteRole.isPending}
            />
          </div>
        )}

        <div className="mt-4 flex flex-col gap-5">
          {arranged.sections.map((section) => (
            <RoleGroupSection
              key={section.group?.id ?? 'ungrouped'}
              section={section}
              departmentId={departmentId}
              canManage={canManage}
              roles={roles}
              roleNames={roleNames}
              groups={groups}
              onlySection={arranged.sections.length === 1 && !section.group}
              editingId={editingId}
              editingName={editingName}
              setEditingId={setEditingId}
              setEditingName={setEditingName}
              onRename={(id, name) => renameRole.mutate({ id, name })}
              onDelete={(id) => deleteRole.mutate(id)}
              onMoveToGroup={(id, groupId) => setRoleGroup.mutate({ id, groupId })}
              onReorder={(ids) =>
                reorderRoles.mutate(
                  reorderWithinGroup({
                    ...arranged,
                    groupId: section.group?.id ?? null,
                    orderedIds: ids,
                  }),
                )
              }
              onRenameGroup={(id, name) => renameGroup.mutate({ id, name })}
              onDeleteGroup={(id) => deleteGroup.mutate(id)}
              renaming={renameRole.isPending}
              deleting={deleteRole.isPending}
            />
          ))}
        </div>
      </QueryState>

      {canManage && (
        /* Adding a role is what this card is for, so its form is the one
           thing standing open at the foot of it. Adding a group is a rarer
           act — a team gets its families once and then lives with them —
           and it was sitting here as a second form of equal weight, under
           a second rule, making the bottom of the card look like a
           settings page. It is a button until it is wanted. */
        <div className="mt-5 flex flex-col gap-3 border-t border-border-subtle pt-5">
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
            <Field label="New role" className="min-w-48 flex-1">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Cameraman, Sound Desk, Usher…"
                className={inputClasses}
              />
            </Field>
            <ActionButton type="submit" disabled={addRole.isPending}>
              {addRole.isPending ? 'Adding…' : 'Add'}
            </ActionButton>
          </form>

          {addingGroup ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (newGroup.trim()) addGroup.mutate(newGroup.trim())
              }}
              className="flex flex-wrap items-end gap-2"
            >
              <Field label="New group" className="min-w-48 flex-1">
                <input
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  autoFocus
                  placeholder="Worship Leaders, Backing Vocals, Band…"
                  className={inputClasses}
                />
              </Field>
              <ActionButton type="submit" tone="quiet" disabled={addGroup.isPending}>
                {addGroup.isPending ? 'Adding…' : 'Add group'}
              </ActionButton>
              <ActionButton
                tone="ghost"
                onClick={() => {
                  setNewGroup('')
                  setAddingGroup(false)
                }}
              >
                Cancel
              </ActionButton>
            </form>
          ) : (
            <div>
              <ActionButton
                size="sm"
                tone="ghost"
                onClick={() => setAddingGroup(true)}
                glyph={<span aria-hidden="true">+</span>}
              >
                Add a group
              </ActionButton>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">{error}</p>
      )}
    </section>
  )
}
