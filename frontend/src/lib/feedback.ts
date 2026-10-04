import type { ComponentType } from 'react'
import { z } from 'zod'
import { supabase } from './supabaseClient'
import type { BadgeTone, PillTone } from '../components/Surface'
import {
  BugIcon,
  FeedbackIcon,
  HeartIcon,
  LightbulbIcon,
  QuestionIcon,
  SparklesIcon,
} from '../components/icons'

/**
 * Feedback about the app itself, from the people on the teams (0124).
 *
 * Six kinds, in the order the Owner reads them: what is broken first, then
 * what is wanted, then the rest. The kinds and statuses are the database's
 * check constraints, word for word — `feedback.test.ts` reads the migration
 * and holds the two together.
 */

export const FEEDBACK_KINDS = [
  {
    value: 'bug',
    label: 'Bug',
    hint: 'Something is broken or wrong.',
    prompt: 'What happened, and what did you expect? Which page were you on?',
    icon: BugIcon,
    tone: 'red',
  },
  {
    value: 'idea',
    label: 'Idea',
    hint: 'Something new the app could do.',
    prompt: 'What would you like the app to do, and what would it save you?',
    icon: LightbulbIcon,
    tone: 'indigo',
  },
  {
    value: 'improvement',
    label: 'Improvement',
    hint: 'Make something that exists better.',
    prompt: 'Which part, and how could it be better?',
    icon: SparklesIcon,
    tone: 'blue',
  },
  {
    value: 'confusing',
    label: 'Confusing',
    hint: 'You couldn’t work out how.',
    prompt: 'What were you trying to do, and where did you get stuck?',
    icon: QuestionIcon,
    tone: 'orange',
  },
  {
    value: 'praise',
    label: 'Praise',
    hint: 'Something that works well — keep it.',
    prompt: 'What do you like? It tells us what not to change.',
    icon: HeartIcon,
    tone: 'green',
  },
  {
    value: 'other',
    label: 'Other',
    hint: 'Anything else about the app.',
    prompt: 'Tell us what’s on your mind.',
    icon: FeedbackIcon,
    tone: 'neutral',
  },
] as const satisfies readonly {
  value: string
  label: string
  hint: string
  prompt: string
  icon: ComponentType<{ className?: string; width?: number; height?: number }>
  tone: BadgeTone
}[]

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]['value']

export const FEEDBACK_STATUSES = [
  { value: 'new', label: 'New', tone: 'blue' },
  { value: 'looking', label: 'Looking into it', tone: 'orange' },
  { value: 'done', label: 'Done', tone: 'green' },
  { value: 'wont_do', label: 'Won’t do', tone: 'neutral' },
] as const satisfies readonly { value: string; label: string; tone: PillTone }[]

export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]['value']

export const kindOf = (value: string) => FEEDBACK_KINDS.find((k) => k.value === value) ?? FEEDBACK_KINDS[5]
export const statusOf = (value: string) => FEEDBACK_STATUSES.find((s) => s.value === value) ?? FEEDBACK_STATUSES[0]

/** Still somebody's to deal with. */
export const isOpen = (status: FeedbackStatus) => status === 'new' || status === 'looking'

export const MAX_BODY = 4000
export const MAX_REPLY = 2000

const person = z.object({ first_name: z.string(), last_name: z.string() }).nullable()

export const feedbackSchema = z.object({
  id: z.string(),
  kind: z.enum(FEEDBACK_KINDS.map((k) => k.value) as [FeedbackKind, ...FeedbackKind[]]),
  body: z.string(),
  created_by: z.string(),
  created_at: z.string(),
  status: z.enum(FEEDBACK_STATUSES.map((s) => s.value) as [FeedbackStatus, ...FeedbackStatus[]]),
  reply: z.string().nullable(),
  status_changed_at: z.string().nullable(),
  sender: person,
  replier: person,
})

export type Feedback = z.infer<typeof feedbackSchema>

export const FEEDBACK_KEY = ['feedback']

/**
 * Every piece this person may read: their own, or everybody's for the
 * Owner. Newest first. The database decides which (0125's select policy).
 */
export async function fetchFeedback(): Promise<Feedback[]> {
  const { data, error } = await supabase
    .from('app_feedback')
    .select(
      'id, kind, body, created_by, created_at, status, reply, status_changed_at, sender:profiles!app_feedback_created_by_fkey(first_name, last_name), replier:profiles!app_feedback_replied_by_fkey(first_name, last_name)',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return z.array(feedbackSchema).parse(data ?? [])
}

export async function submitFeedback(kind: FeedbackKind, body: string): Promise<string> {
  const { data, error } = await supabase.rpc('submit_feedback', { p_kind: kind, p_body: body })
  if (error) throw error
  return data as string
}

export async function markFeedback(id: string, status: FeedbackStatus, reply: string): Promise<void> {
  const { error } = await supabase.rpc('mark_feedback', { p_id: id, p_status: status, p_reply: reply })
  if (error) throw error
}

export async function deleteFeedback(id: string): Promise<void> {
  const { error } = await supabase.from('app_feedback').delete().eq('id', id)
  if (error) throw error
}

/**
 * Feedback by kind, in the kinds' own order, each kind newest first; a
 * kind with nothing in it is left out rather than shown empty.
 */
export function groupByKind(items: Feedback[]): { kind: (typeof FEEDBACK_KINDS)[number]; items: Feedback[] }[] {
  return FEEDBACK_KINDS.map((kind) => ({
    kind,
    items: items
      .filter((f) => f.kind === kind.value)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  })).filter((g) => g.items.length > 0)
}
