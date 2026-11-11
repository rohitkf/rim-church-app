import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '../lib/usePermissions'
import { useNow } from '../lib/useNow'
import { useErrorText } from '../lib/useErrorText'
import {
  BODY_MAX,
  EMPTY_DRAFT,
  NOTICES_KEY,
  NOTICE_KINDS,
  TITLE_MAX,
  closureState,
  closureWords,
  draftOf,
  draftProblem,
  endNotice,
  fetchNotices,
  momentWords,
  noticeState,
  removeNotice,
  saveNotice,
  type Notice,
  type NoticeDraft,
  type NoticeKind,
} from '../lib/appNotices'
import { STANDING_KEY } from '../lib/standing'
import { useConfirmAction } from './ConfirmAction'
import { DateTimeField } from './DateTimeFields'
import { QueryState } from './QueryState'
import { ActionButton, Field, FieldGroup, Pill, Row, SectionTile, SegmentedControl, inputClasses, type PillTone } from './Surface'

/**
 * Settings › App Notices: a line at the top of every page, and for
 * maintenance, the times the app is closed (lib/appNotices, 0278).
 *
 * One form, three kinds. Maintenance is the only one with a door on it,
 * and closing the app is asked about once more before it is saved,
 * because it is the one thing here that stops other people working.
 * Whoever writes notices is never shut out by one, so a closure can
 * always be ended from this page by the person who began it.
 */

const KIND_TONE: Record<NoticeKind, PillTone> = { info: 'blue', warning: 'orange', maintenance: 'orange' }
const KIND_WORD: Record<NoticeKind, string> = { info: 'Information', warning: 'Warning', maintenance: 'Maintenance' }

export function AppNoticesCard() {
  const mayWrite = usePermissions().can('settings.notices')
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const { ask, dialog } = useConfirmAction()

  const [draft, setDraft] = useState<NoticeDraft>(EMPTY_DRAFT)
  /** The notice being changed, or null for a new one. */
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const notices = useQuery({ queryKey: NOTICES_KEY, queryFn: fetchNotices, enabled: mayWrite })
  // Which list a notice is in depends on the time; the page keeps up with it.
  const now = useNow()

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: NOTICES_KEY })
    // Closing or opening the app changes where everybody stands, this person included.
    queryClient.invalidateQueries({ queryKey: STANDING_KEY })
  }
  const startOver = () => {
    setDraft(EMPTY_DRAFT)
    setEditing(null)
    setError(null)
  }

  const save = useMutation({
    mutationFn: () => saveNotice(draft, editing ?? undefined),
    onSuccess: () => {
      startOver()
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'The notice could not be saved.')),
  })
  const end = useMutation({
    mutationFn: (notice: Notice) => endNotice(notice),
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorText(err, 'The notice could not be ended.')),
  })
  const remove = useMutation({
    mutationFn: (id: string) => removeNotice(id),
    onSuccess: (_data, id) => {
      if (editing === id) startOver()
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'The notice could not be removed.')),
  })

  if (!mayWrite) {
    return (
      <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
        <p className="text-body-sm text-on-surface-variant">
          Writing notices for the whole app is not open to you. Whoever owns this app can write them, or give you the
          room in Access &amp; Privileges.
        </p>
      </section>
    )
  }

  const set = (patch: Partial<NoticeDraft>) => {
    setError(null)
    setDraft((was) => ({ ...was, ...patch }))
  }
  const problem = draftProblem(draft)
  const closes = draft.kind === 'maintenance' && draft.closesApp
  const busy = save.isPending || end.isPending || remove.isPending

  const submit = () => {
    if (problem) {
      setError(problem)
      return
    }
    if (!closes) {
      save.mutate()
      return
    }
    // The one thing here that stops other people working: said back, in full, before it is done.
    ask({
      title: 'Close the app for maintenance?',
      body: (
        <>
          From <strong className="font-medium text-on-surface">{momentWords(new Date(draft.closedFrom).toISOString())}</strong> until{' '}
          <strong className="font-medium text-on-surface">{momentWords(new Date(draft.closedUntil).toISOString())}</strong> nobody
          can use the app except you, and whoever holds “Use the app while it is closed” in Access &amp; Privileges
          (Admins, out of the box). Everybody else sees a page that says it is closed and when it opens. You can end
          it early from this page.
        </>
      ),
      confirmLabel: 'Close the app then',
      onConfirm: () => save.mutate(),
    })
  }

  const all = notices.data ?? []
  const groups: { title: string; rows: Notice[]; empty: string }[] = [
    { title: 'Showing now', rows: all.filter((n) => noticeState(n, now) === 'showing'), empty: 'Nothing is showing.' },
    { title: 'Scheduled', rows: all.filter((n) => noticeState(n, now) === 'scheduled'), empty: '' },
    { title: 'Over', rows: all.filter((n) => noticeState(n, now) === 'over').slice(0, 8), empty: '' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <SectionTile
        title={editing ? 'Change the notice' : 'Write a notice'}
        hint="It stands at the top of every page for everybody signed in, for as long as you say. To buzz phones as well, send an alert."
      >
        <div className="flex flex-col gap-4">
          <FieldGroup label="Kind">
            <SegmentedControl
              label="Kind of notice"
              value={draft.kind}
              onChange={(kind) => set({ kind })}
              options={NOTICE_KINDS.map((k) => ({ value: k.value, label: k.label, title: k.hint }))}
            />
            <span className="text-label-sm text-on-surface-faint">{NOTICE_KINDS.find((k) => k.value === draft.kind)?.hint}</span>
          </FieldGroup>

          <Field label="Title" hint={`${draft.title.trim().length}/${TITLE_MAX}`}>
            <input
              value={draft.title}
              onChange={(e) => set({ title: e.target.value.slice(0, TITLE_MAX) })}
              placeholder={draft.kind === 'maintenance' ? 'App maintenance on Saturday' : 'Carol service rehearsal moved to Friday'}
              className={inputClasses}
            />
          </Field>

          <Field label="Message" hint={`Optional. ${draft.body.length}/${BODY_MAX}`}>
            <textarea
              value={draft.body}
              onChange={(e) => set({ body: e.target.value.slice(0, BODY_MAX) })}
              rows={3}
              placeholder="What people need to know, in a line or two."
              className={`${inputClasses} resize-y`}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Show it from">
              <DateTimeField value={draft.startsAt} onChange={(startsAt) => set({ startsAt })} label="Show the notice from" />
              <span className="text-label-sm text-on-surface-faint">Empty is now.</span>
            </FieldGroup>
            <FieldGroup label="Until">
              <DateTimeField value={draft.endsAt} onChange={(endsAt) => set({ endsAt })} label="Show the notice until" min={draft.startsAt.slice(0, 10) || undefined} />
              <span className="text-label-sm text-on-surface-faint">
                {closes ? 'Empty is when the app opens again.' : 'Empty is until you end it.'}
              </span>
            </FieldGroup>
          </div>

          {draft.kind === 'info' && (
            <label className="flex items-start gap-3 text-body-sm text-on-surface">
              <input
                type="checkbox"
                checked={draft.dismissible}
                onChange={(e) => set({ dismissible: e.target.checked })}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
              />
              <span>
                People can put it away once they have read it
                <span className="block text-label-sm text-on-surface-faint">A warning or a maintenance notice always stays until it is over.</span>
              </span>
            </label>
          )}

          {draft.kind === 'maintenance' && (
            <div className="rounded-[var(--radius-row)] bg-raised p-4">
              <label className="flex items-start gap-3 text-body-sm text-on-surface">
                <input
                  type="checkbox"
                  checked={draft.closesApp}
                  onChange={(e) => set({ closesApp: e.target.checked })}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
                />
                <span>
                  Close the app while the work is done
                  <span className="block text-label-sm text-on-surface-faint">
                    Between the two times below nobody can use the app but you and whoever may keep working. The pages a
                    visitor opens from a link (a registration, a ticket) stay open.
                  </span>
                </span>
              </label>
              {draft.closesApp && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <FieldGroup label="The app closes">
                    <DateTimeField value={draft.closedFrom} onChange={(closedFrom) => set({ closedFrom })} label="The app closes" clearable={false} />
                  </FieldGroup>
                  <FieldGroup label="And opens again">
                    <DateTimeField
                      value={draft.closedUntil}
                      onChange={(closedUntil) => set({ closedUntil })}
                      label="The app opens again"
                      clearable={false}
                      min={draft.closedFrom.slice(0, 10) || undefined}
                    />
                  </FieldGroup>
                </div>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <ActionButton disabled={busy} onClick={submit}>
              {save.isPending ? 'Saving…' : editing ? 'Save changes' : closes ? 'Post it and schedule the closure' : 'Post the notice'}
            </ActionButton>
            {(editing || draft !== EMPTY_DRAFT) && (
              <ActionButton tone="ghost" disabled={busy} onClick={startOver}>
                {editing ? 'Cancel' : 'Clear'}
              </ActionButton>
            )}
          </div>
          <p className="text-label-sm text-on-surface-faint">
            A notice is not an alert: nobody’s phone buzzes and nobody has to press OK. For that,{' '}
            <Link to="/settings/alerts" className="text-accent-blue-soft hover:underline">
              send an alert
            </Link>
            .
          </p>
        </div>
      </SectionTile>

      <SectionTile title="Notices" hint="What is at the top of every page now, what is waiting, and what has finished.">
        <QueryState isLoading={notices.isLoading} error={notices.error} isEmpty={all.length === 0} emptyMessage="No notices yet.">
          <div className="flex flex-col gap-5">
            {groups
              .filter((g) => g.rows.length > 0 || g.empty)
              .map((group) => (
                <section key={group.title} aria-label={group.title}>
                  <h3 className="mb-2 font-mono text-eyebrow uppercase text-on-surface-faint">{group.title}</h3>
                  {group.rows.length === 0 ? (
                    <p className="text-body-sm text-on-surface-variant">{group.empty}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {group.rows.map((notice) => {
                        const state = noticeState(notice, now)
                        const closure = closureState(notice, now)
                        return (
                          <Row key={notice.id} as="li" stack>
                            <div className="flex flex-wrap items-center gap-2">
                              <Pill tone={KIND_TONE[notice.kind]}>{KIND_WORD[notice.kind]}</Pill>
                              {closure === 'running' && (
                                <Pill tone="red" dot>
                                  The app is closed
                                </Pill>
                              )}
                              {closure === 'ahead' && <Pill tone="orange">Closes the app</Pill>}
                            </div>
                            <p className="break-words text-body-md font-medium text-on-surface">{notice.title}</p>
                            {notice.body && <p className="whitespace-pre-line break-words text-body-sm text-on-surface-variant">{notice.body}</p>}
                            <p className="text-label-md text-on-surface-faint">
                              {state === 'scheduled' ? 'Shows from ' : state === 'over' ? 'Showed from ' : 'Showing since '}
                              {momentWords(notice.starts_at, now)}
                              {notice.ends_at ? ` until ${momentWords(notice.ends_at, now)}` : ', until it is ended'}
                              {notice.kind === 'info' && (notice.dismissible ? ' · can be put away' : ' · stays')}
                            </p>
                            {closureWords(notice, now) && <p className="text-body-sm font-medium text-on-surface">{closureWords(notice, now)}</p>}
                            <div className="flex flex-wrap items-center gap-2">
                              {state !== 'over' && (
                                <ActionButton
                                  size="sm"
                                  tone="quiet"
                                  disabled={busy}
                                  onClick={() => {
                                    setEditing(notice.id)
                                    setDraft(draftOf(notice))
                                    setError(null)
                                    window.scrollTo?.({ top: 0, behavior: 'smooth' })
                                  }}
                                >
                                  Change
                                </ActionButton>
                              )}
                              {state !== 'over' && (
                                <ActionButton
                                  size="sm"
                                  tone="quiet"
                                  disabled={busy}
                                  onClick={() =>
                                    ask({
                                      title: closure === 'running' ? 'Open the app again now?' : 'End this notice now?',
                                      body:
                                        closure === 'running'
                                          ? 'The closure ends at once and everybody can use the app again. The notice stops showing.'
                                          : closure === 'ahead'
                                            ? 'It stops showing, and the app will not close: the closure it scheduled is cancelled.'
                                            : 'It stops showing for everybody. It stays in the list below.',
                                      confirmLabel: closure === 'running' ? 'Open the app' : 'End it',
                                      onConfirm: () => end.mutate(notice),
                                    })
                                  }
                                >
                                  {closure === 'running' ? 'Open the app now' : 'End now'}
                                </ActionButton>
                              )}
                              <ActionButton
                                size="sm"
                                tone="danger-quiet"
                                disabled={busy}
                                onClick={() =>
                                  ask({
                                    title: 'Remove this notice?',
                                    body:
                                      closure === 'running' || closure === 'ahead'
                                        ? 'It goes for good, and its closure with it: the app opens, or never closes.'
                                        : 'It goes for good.',
                                    confirmLabel: 'Remove',
                                    onConfirm: () => remove.mutate(notice.id),
                                  })
                                }
                              >
                                Remove
                              </ActionButton>
                            </div>
                          </Row>
                        )
                      })}
                    </ul>
                  )}
                </section>
              ))}
          </div>
        </QueryState>
      </SectionTile>

      {dialog}
    </div>
  )
}
