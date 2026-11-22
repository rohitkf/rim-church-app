import { useMemo, useState } from 'react'
import { fetchDbsRows, type DbsRow } from '../lib/dbs'
import { supabase } from '../lib/supabaseClient'
import { ActionButton, Overlay } from './Surface'
import { TeamMark } from './TeamMark'
import { fetchHouseholds } from '../lib/family'
import { sensitiveByUserSchema, type Department, type DepartmentMemberRow, type SensitiveByUser } from '../lib/types'
import type { UserRole } from '../auth/types'
import {
  buildVolunteerWorkbook,
  exportFileName,
  type ExportPerson,
} from '../lib/volunteerExport'
import { writeWorkbook } from '../lib/writeWorkbook'
import { fetchExportExtras } from '../lib/volunteerExportData'
import { useErrorText } from '../lib/useErrorText'

/**
 * Choosing what to take away.
 *
 * The page already shows every volunteer grouped by team, so the export
 * offers the same cut: tick the teams you want, or take the lot. Every
 * chosen team brings its people, their profile details, and what they are
 * allowed to do — the three things anyone opening this file is actually
 * after, on their own sheets rather than flattened into one wide table.
 *
 * And everything else that is known about them (the Owner, November 2026:
 * "as detailed as possible"): read when Export is pressed, each part for
 * whoever has the right to it (lib/volunteerExportData). The two sets of
 * personal records start ticked for whoever may have them — a file meant
 * to hold everything should not need two boxes found first — and can be
 * unticked for a file that is going further.
 */
export function ExportVolunteersDialog({
  departments,
  people,
  memberships,
  grants,
  adminIds,
  ownerId,
  isOwner,
  seesContacts = isOwner,
  seesCompliance = isOwner,
  seesSetup = isOwner,
  seesBlocks = isOwner,
  seesMinors = isOwner,
  onClose,
}: {
  departments: Department[]
  people: ExportPerson[]
  memberships: DepartmentMemberRow[]
  grants: (UserRole & { user_id: string })[]
  adminIds: Set<string>
  ownerId: string | null
  /**
   * Contact details and compliance records are the Owner's alone (0126):
   * for anybody else the workbook leaves those columns and that sheet out
   * rather than shipping them empty.
   */
  isOwner: boolean
  /**
   * Since 0277 each is its own row in the grid — the Owner's out of the
   * box: contact details and households, and visa and DBS details. Left
   * out, they follow `isOwner`.
   */
  seesContacts?: boolean
  seesCompliance?: boolean
  /** Each its own right: whether details are finished, who is blocked, who is under 18. */
  seesSetup?: boolean
  seesBlocks?: boolean
  seesMinors?: boolean
  onClose: () => void
}) {
  const errorText = useErrorText()
  const [selected, setSelected] = useState<Set<string>>(() => new Set(departments.map((d) => d.id)))
  // Off unless asked for: ticking one team should export that team.
  const [includeUnassigned, setIncludeUnassigned] = useState(false)
  // On for whoever may have them: the export is asked to hold everything.
  const [includeCompliance, setIncludeCompliance] = useState(seesCompliance)
  const [includeFamily, setIncludeFamily] = useState(seesContacts)
  // Written, with something that could not be read left out: said, not hidden.
  const [leftOut, setLeftOut] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const countFor = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of memberships) counts.set(m.department_id, (counts.get(m.department_id) ?? 0) + 1)
    return counts
  }, [memberships])

  const allSelected = selected.size === departments.length && departments.length > 0
  const noneSelected = selected.size === 0

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleExport() {
    setBusy(true)
    setError(null)
    try {
      let sensitive: Map<string, SensitiveByUser> | undefined
      let dbs: Record<string, DbsRow> | undefined
      if (seesCompliance && includeCompliance) {
        const { data, error: readError } = await supabase
          .from('profile_sensitive')
          .select('user_id, visa_type, has_dbs, visa_has_expiry, visa_expiry, visa_note')
        if (readError) throw readError
        sensitive = new Map()
        for (const row of data ?? []) {
          const parsed = sensitiveByUserSchema.safeParse(row)
          const userId = (row as { user_id?: unknown }).user_id
          if (parsed.success && typeof userId === 'string') sensitive.set(userId, parsed.data)
        }
        // The details behind each yes, and who checked them (0324): the same reader's.
        dbs = await fetchDbsRows()
      }

      // Households come with contact details (0149, 0277); RLS returns them all.
      const family = seesContacts && includeFamily ? await fetchHouseholds() : undefined
      // Everything else that is known, each part for whoever may read it.
      const { leftOut: missed, ...extras } = await fetchExportExtras({
        contacts: seesContacts,
        setup: seesSetup,
        blocks: seesBlocks,
        minors: seesMinors,
      })

      const sheets = buildVolunteerWorkbook({
        ...extras,
        family,
        people,
        teams: departments.map((d) => ({ id: d.id, name: d.name })),
        memberships,
        grants,
        sensitive,
        dbs,
        selectedTeamIds: [...selected],
        adminIds,
        ownerId,
        includeUnassigned,
        includeContacts: seesContacts,
      })

      await writeWorkbook(sheets, exportFileName())
      // Something could not be read: the file is written without it, and says which.
      if (missed.length > 0) setLeftOut(missed)
      else onClose()
    } catch (err: unknown) {
      setError(errorText(err, 'Could not build the export.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Overlay label="Export volunteers" onDismiss={onClose} align="sheet">
      <div className="flex max-h-[85svh] w-full max-w-md flex-col rounded-t-[var(--radius-tile)] bg-surface-low shadow-[var(--shadow-lifted)] hairline-strong sm:rounded-[var(--radius-tile)]">
        {/* The grab handle: on a phone this comes up from the bottom, and
            it should look like the other sheets that do. */}
        <div className="mx-auto mt-3 h-[5px] w-[38px] shrink-0 rounded-full bg-white/22 sm:hidden" />
        <div className="px-6 pt-5">
          <h2 className="text-headline-md">Export volunteers</h2>
          <p className="mt-1.5 text-body-sm text-on-surface-variant">
            An Excel workbook with everything that is known: a sheet of people with their details, one of who is
            on which team, one of the teams, every time on the rota, and the guests.
          </p>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-6">
          <label className="flex items-center gap-3 rounded-[var(--radius-row)] bg-raised px-4 py-3 hairline">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(node) => {
                // Partly chosen is neither ticked nor empty, and the box
                // should say so rather than pretending one of them.
                if (node) node.indeterminate = !allSelected && !noneSelected
              }}
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(departments.map((d) => d.id)))
              }
              className="h-4 w-4"
            />
            <span className="text-body-sm font-medium text-on-surface">All teams</span>
            <span className="ml-auto font-mono text-label-sm text-on-surface-faint">
              {selected.size}/{departments.length}
            </span>
          </label>

          <ul className="mt-2 flex flex-col gap-1.5">
            {departments.map((department) => (
              <li key={department.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-row)] px-4 py-2.5 hover:bg-raised">
                  <input
                    type="checkbox"
                    checked={selected.has(department.id)}
                    onChange={() => toggle(department.id)}
                    className="h-4 w-4"
                  />
                  <TeamMark color={department.color} />
                  <span className="break-words text-body-sm text-on-surface">{department.name}</span>
                  <span className="ml-auto font-mono text-label-sm text-on-surface-faint">
                    {countFor.get(department.id) ?? 0}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col gap-2 border-t border-border-subtle pt-4">
            <label className="flex items-start gap-3 text-body-sm text-on-surface">
              <input
                type="checkbox"
                checked={includeUnassigned}
                onChange={(e) => setIncludeUnassigned(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Also include people on no team yet
                <span className="block text-label-md text-on-surface-faint">
                  Accounts that exist but haven’t been added to any team’s roster.
                </span>
              </span>
            </label>

            {seesCompliance && (
            <label className="flex items-start gap-3 text-body-sm text-on-surface">
              <input
                type="checkbox"
                checked={includeCompliance}
                onChange={(e) => setIncludeCompliance(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Include compliance details
                <span className="block text-label-md text-on-surface-faint">
                  Visa type, visa expiry, visa comment and DBS status, on their own sheet. Personal data — the
                  file won’t protect it, so keep it somewhere that will.
                </span>
              </span>
            </label>
            )}

            {seesContacts && (
            <label className="flex items-start gap-3 text-body-sm text-on-surface">
              <input
                type="checkbox"
                checked={includeFamily}
                onChange={(e) => setIncludeFamily(e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span>
                Include families and addresses
                <span className="block text-label-md text-on-surface-faint">
                  Address, spouse and children with dates of birth and ages, on a Families sheet and a
                  Children sheet. Personal data — keep the file somewhere safe.
                </span>
              </span>
            </label>
            )}
          </div>
        </div>

        {error && (
          <p className="mx-6 mt-4 rounded-[var(--radius-chip)] bg-error-container px-4 py-3 text-body-sm text-on-error-container">
            {error}
          </p>
        )}
        {leftOut && (
          <p role="status" className="mx-6 mt-4 rounded-[var(--radius-chip)] bg-raised px-4 py-3 text-body-sm text-on-surface hairline">
            The file is saved, without {leftOut.join(', ')}: that could not be read just now. Export again to try
            for it.
          </p>
        )}

        <div className="flex items-center justify-end gap-2 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
          <ActionButton tone="quiet" onClick={onClose}>
            {leftOut ? 'Done' : 'Cancel'}
          </ActionButton>
          <ActionButton onClick={handleExport} disabled={busy || noneSelected}>
            {busy ? 'Building…' : noneSelected ? 'Pick a team' : 'Export'}
          </ActionButton>
        </div>
      </div>
    </Overlay>
  )
}
