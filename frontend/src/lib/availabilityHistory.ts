import { z } from 'zod'
import { supabase } from './supabaseClient'
import { availabilityStatusSchema, type AvailabilityStatus } from './types'

/*
 * Every time an answer was given, changed or taken away (0145).
 *
 * The database writes these from the answers themselves and decides who
 * may read them (`avail.history` in Settings › Access & Privileges), so
 * this only fetches what comes back and says it in words.
 */

export const availabilityHistorySchema = z.object({
  id: z.string(),
  user_id: z.string(),
  service_id: z.string(),
  department_id: z.string(),
  kind: z.enum(['answered', 'changed', 'note', 'removed', 'before_log']),
  status: availabilityStatusSchema.nullable(),
  previous_status: availabilityStatusSchema.nullable(),
  note: z.string().nullable(),
  changed_by: z.string().nullable(),
  by_request: z.boolean(),
  after_close: z.boolean().nullable(),
  changed_at: z.string(),
  changer: z.object({ first_name: z.string(), last_name: z.string() }).nullable().optional(),
})

export type AvailabilityHistoryEntry = z.infer<typeof availabilityHistorySchema>

/** What every reader of the log asks for, oldest first. */
export async function fetchAvailabilityHistory(serviceIds: string[]): Promise<AvailabilityHistoryEntry[]> {
  if (serviceIds.length === 0) return []
  const { data, error } = await supabase
    .from('availability_history')
    .select('*, changer:profiles!availability_history_changed_by_fkey(first_name, last_name)')
    .in('service_id', serviceIds)
    .order('changed_at')
  if (error) throw error
  return z.array(availabilityHistorySchema).parse(data ?? [])
}

/** One person's answer for one team at one service, oldest first. */
export function historyOf(
  entries: readonly AvailabilityHistoryEntry[],
  userId: string,
  serviceId: string,
  departmentId: string,
): AvailabilityHistoryEntry[] {
  return entries
    .filter((e) => e.user_id === userId && e.service_id === serviceId && e.department_id === departmentId)
    .sort((a, b) => a.changed_at.localeCompare(b.changed_at))
}

const SHORT: Record<AvailabilityStatus, string> = {
  available: 'Yes',
  tentative: 'Maybe',
  unavailable: 'No',
}

export interface HistoryLine {
  /** What happened: "Changed to No". */
  what: string
  /** What it said before, when that is worth saying: "was Yes". */
  was: string | null
  /** The note as it stood afterwards, for a line about the note. */
  note: string | null
  /** Who, when it was not the person themselves: "by Joel Skaria". */
  who: string | null
  /** The status the line leaves the answer at, for its colour. */
  status: AvailabilityStatus | null
  /** Done once answers had closed. */
  late: boolean
  /** The line written when the log began, which is not a moment anything was said. */
  beforeLog: boolean
}

/** One line of the log, in words. */
export function describeChange(entry: AvailabilityHistoryEntry): HistoryLine {
  const name = entry.changer ? `${entry.changer.first_name} ${entry.changer.last_name}`.trim() : null
  const someoneElse = entry.changed_by !== entry.user_id
  const who =
    entry.kind === 'before_log' || !someoneElse
      ? null
      : entry.by_request
        ? `approved by ${name ?? 'somebody no longer on the app'}`
        : entry.changed_by
          ? `by ${name ?? 'somebody'}`
          : 'by somebody no longer on the app'
  const was = entry.previous_status && entry.kind !== 'note' ? `was ${SHORT[entry.previous_status]}` : null
  const base = { who, status: entry.status, late: entry.after_close === true, beforeLog: false, note: null }

  switch (entry.kind) {
    case 'answered':
      return { ...base, what: `Answered ${SHORT[entry.status!]}`, was: null, note: entry.note }
    case 'changed':
      return { ...base, what: `Changed to ${SHORT[entry.status!]}`, was, note: entry.note }
    case 'note':
      // Plain, not the answer's colour: the answer did not move.
      return { ...base, what: entry.note ? 'Note changed' : 'Note removed', was: null, note: entry.note, status: null }
    case 'removed':
      return { ...base, what: 'Answer removed', was }
    case 'before_log':
      return {
        ...base,
        what: `${SHORT[entry.status!]} when this log began`,
        was: null,
        note: entry.note,
        beforeLog: true,
      }
  }
}

/** "Sat 11 Oct, 23:41", in the reader's own clock. */
export function formatChangedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
