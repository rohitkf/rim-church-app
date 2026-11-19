import { z } from 'zod'
import { supabase } from './supabaseClient'

/**
 * What a Pastor said about one session of the running order (0308).
 *
 * A comment is not a note on the sheet. It is read by whoever wrote it and
 * by whoever holds "Read the comments on sessions" (`svc.comment_read`:
 * the Admins and the Owner out of the box) — never by the team, and it is
 * on neither the planner's Preview nor the exported sheet. Who may write
 * one is its own row, `svc.comment`: a Pastor's out of the box.
 *
 * **The database decides who reads what** (the table's read policy: your
 * own, or everybody's with the right). `seenBy` below is not that rule
 * said again: it is the same narrowing for a *preview*, where the queries
 * still run as the Admin looking (AGENTS.md §3, "View as") and would
 * otherwise show a previewed Team Member every comment there is.
 *
 * A comment is never edited — one the Admins have read does not change
 * under them — only deleted, by whoever wrote it.
 */

/** The longest a comment may be; the table's check says the same. */
export const COMMENT_MAX = 1000

/** The query key every read of comments sits under; `service_session_comments` in LIVE_TABLES marks it stale. */
export const SESSION_COMMENTS_KEY = ['session-comments'] as const

const commentSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  /** Null once the person who wrote it has gone. */
  author: z.string().nullable(),
  body: z.string(),
  created_at: z.string(),
  writer: z.object({ first_name: z.string().nullable(), last_name: z.string().nullable() }).nullable().default(null),
})

export type SessionComment = z.infer<typeof commentSchema>

/** Every comment on a service's sessions that the person asking may read, oldest first. */
export async function fetchSessionComments(serviceId: string): Promise<SessionComment[]> {
  const { data, error } = await supabase
    .from('service_session_comments')
    .select('id, session_id, author, body, created_at, writer:profiles(first_name, last_name), session:service_sessions!inner(service_id)')
    .eq('session.service_id', serviceId)
    .order('created_at')
  if (error) throw error
  return z.array(commentSchema).parse(data ?? [])
}

/** What is wrong with a comment before it is sent, or null. */
export function commentProblem(body: string): string | null {
  const said = body.trim()
  if (said === '') return 'Write the comment first.'
  if (said.length > COMMENT_MAX) return `A comment can be ${COMMENT_MAX} characters at most; this is ${said.length}.`
  return null
}

/** Says it, in the name of whoever is signed in (the column's default, and the only name the database takes). */
export async function addSessionComment(sessionId: string, body: string): Promise<void> {
  const wrong = commentProblem(body)
  if (wrong) throw new Error(wrong)
  const { error } = await supabase.from('service_session_comments').insert({ session_id: sessionId, body: body.trim() })
  if (error) throw error
}

export async function deleteSessionComment(id: string): Promise<void> {
  const { error } = await supabase.from('service_session_comments').delete().eq('id', id)
  if (error) throw error
}

/**
 * The comments this screen shows: all of them to somebody who may read
 * them, and otherwise only the viewer's own.
 */
export function seenBy(comments: readonly SessionComment[], viewer: { mayRead: boolean; myId: string | null }): SessionComment[] {
  if (viewer.mayRead) return [...comments]
  return comments.filter((c) => c.author !== null && c.author === viewer.myId)
}

/** The comments, by the session each is on. */
export function bySession(comments: readonly SessionComment[]): Map<string, SessionComment[]> {
  const out = new Map<string, SessionComment[]>()
  for (const c of comments) out.set(c.session_id, [...(out.get(c.session_id) ?? []), c])
  return out
}

/** Who wrote it, for whoever reads it. */
export function writerName(comment: SessionComment, myId: string | null): string {
  if (comment.author !== null && comment.author === myId) return 'You'
  const name = [comment.writer?.first_name, comment.writer?.last_name].filter(Boolean).join(' ').trim()
  return name || 'Somebody no longer here'
}
