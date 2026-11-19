import { describe, expect, it } from 'vitest'
import { COMMENT_MAX, bySession, commentProblem, seenBy, writerName, type SessionComment } from './sessionComments'
import migration from '../../../supabase/migrations/0308_a_pastor_comments_on_a_session.sql?raw'

const comment = (id: string, session: string, author: string | null, over: Partial<SessionComment> = {}): SessionComment => ({
  id,
  session_id: session,
  author,
  body: `said ${id}`,
  created_at: '2026-11-20T09:00:00Z',
  writer: author ? { first_name: 'Paul', last_name: 'Mensah' } : null,
  ...over,
})

const all = [comment('a', 's1', 'pastor'), comment('b', 's1', 'other'), comment('c', 's2', 'pastor'), comment('d', 's2', null)]

describe('comments on a session', () => {
  it('shows every comment to somebody who may read them', () => {
    expect(seenBy(all, { mayRead: true, myId: 'admin' }).map((c) => c.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('shows anybody else only their own — which is what a preview as them has to show too', () => {
    expect(seenBy(all, { mayRead: false, myId: 'pastor' }).map((c) => c.id)).toEqual(['a', 'c'])
    expect(seenBy(all, { mayRead: false, myId: 'member' })).toEqual([])
    // A comment whose writer has gone is nobody's own, signed in or not.
    expect(seenBy(all, { mayRead: false, myId: null })).toEqual([])
  })

  it('sorts them by the session each is on, in the order they were said', () => {
    const map = bySession(all)
    expect(map.get('s1')!.map((c) => c.id)).toEqual(['a', 'b'])
    expect(map.get('s2')!.map((c) => c.id)).toEqual(['c', 'd'])
    expect(map.get('s3')).toBeUndefined()
  })

  it('names who wrote it: You, their name, or that they have gone', () => {
    expect(writerName(all[0], 'pastor')).toBe('You')
    expect(writerName(all[0], 'admin')).toBe('Paul Mensah')
    expect(writerName(all[3], 'admin')).toBe('Somebody no longer here')
    expect(writerName(comment('e', 's1', 'x', { writer: { first_name: null, last_name: null } }), 'admin')).toBe('Somebody no longer here')
  })

  it('refuses an empty comment and one too long, before anything is sent', () => {
    expect(commentProblem('   ')).toBe('Write the comment first.')
    expect(commentProblem('Keep this to ten minutes')).toBeNull()
    expect(commentProblem('x'.repeat(COMMENT_MAX))).toBeNull()
    expect(commentProblem('x'.repeat(COMMENT_MAX + 1))).toMatch(/1000 characters at most; this is 1001/)
  })
})

describe('the table the comments are kept in (0308)', () => {
  it('allows the same length the app does', () => {
    expect(migration).toContain(`check (char_length(btrim(body)) between 1 and ${COMMENT_MAX})`)
  })

  it('is read by its writer or with the right, written only in your own name with the right, and deleted only by its writer', () => {
    const policy = (name: string) => migration.slice(migration.indexOf(`create policy ${name}`)).split(';')[0].replace(/\s+/g, ' ')
    expect(policy('service_session_comments_select')).toContain("author = (select auth.uid()) or (select public.may((select auth.uid()), 'svc.comment_read'))")
    expect(policy('service_session_comments_insert')).toContain("with check (author = auth.uid() and public.may(auth.uid(), 'svc.comment'))")
    expect(policy('service_session_comments_delete')).toContain('using (author = auth.uid())')
    // Never edited: no update policy and no update grant.
    expect(migration).not.toMatch(/for update/)
    expect(migration).toContain('grant select, insert, delete on public.service_session_comments to authenticated')
    // And nothing for somebody who is not signed in.
    expect(migration).toContain('revoke all on public.service_session_comments from anon')
  })
})
