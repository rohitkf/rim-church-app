import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import {
  GIVING_BUCKET,
  GIVING_KEY,
  accountRow,
  bankAccountProblem,
  isSafeLink,
  useGiving,
  type BankAccount,
  type GivingLink,
} from '../lib/giving'
import { AccountCard, LinkCard, UploadedQr } from '../pages/GivingPage'
import { useConfirmAction } from './ConfirmAction'
import { QueryState } from './QueryState'
import { ActionButton, inputClasses } from './Surface'

/**
 * What the Giving page says, kept by an Admin (0108).
 *
 * Every form draws the card exactly as members will see it, beside the
 * fields, so a wrong sort code or a link to the wrong PayPal is caught by
 * looking before it is saved rather than by a member afterwards.
 */
export function GivingSettingsCard() {
  const { isAdmin } = useAuth()
  const giving = useGiving()
  if (!isAdmin) return null
  return (
    <section id="giving" className="w-full scroll-mt-24 rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
      <h2 className="text-headline-md">Giving</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        What the Tithes &amp; offerings page shows every member. No payment goes through the app:
        a link opens the provider’s own page — a Stripe Payment Link offers Apple Pay and Google
        Pay there — so card details never reach the church’s app.
      </p>
      <QueryState isLoading={giving.isLoading} error={giving.error}>
        {giving.data && (
          <div className="mt-6 flex flex-col gap-8">
            <IntroSection intro={giving.data.page.intro} />
            <LinksSection links={giving.data.links} />
            <QrImageSection
              path={giving.data.page.qr_image_path}
              caption={giving.data.page.qr_image_caption}
            />
            <AccountsSection accounts={giving.data.accounts} />
          </div>
        )}
      </QueryState>
    </section>
  )
}

/* ------------------------------------------------------------------ */

function useGivingWrite<T>(fn: (v: T) => Promise<void>, failed: string, after?: () => void) {
  const queryClient = useQueryClient()
  const errorText = useErrorText()
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: fn,
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: GIVING_KEY })
      queryClient.invalidateQueries({ queryKey: ['giving-qr'] })
      after?.()
    },
    onError: (err: unknown) => setError(errorText(err, failed)),
  })
  return { mutation, error }
}

async function check(p: PromiseLike<{ error: unknown }>) {
  const { error } = await p
  if (error) throw error
}

function Heading({ title, blurb }: { title: string; blurb: string }) {
  return (
    <>
      <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">{title}</div>
      <p className="mt-1 text-label-md text-on-surface-faint">{blurb}</p>
    </>
  )
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
      {error}
    </p>
  )
}

function Preview({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="font-mono text-label-sm uppercase tracking-wide text-on-surface-faint">
        Preview — how members see it
      </div>
      <div className="mt-2 rounded-[var(--radius-chip)] bg-surface-lowest p-3 hairline">{children}</div>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  maxLength,
  mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  maxLength?: number
  mono?: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-body-sm font-medium text-on-surface">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`${inputClasses} ${mono ? 'font-mono' : ''}`}
      />
      {hint && <span className="text-label-sm text-on-surface-faint">{hint}</span>}
    </label>
  )
}

/* ---- the welcome line -------------------------------------------- */

function IntroSection({ intro }: { intro: string | null }) {
  // Null until typed in, so the saved line shows through without an
  // effect copying it into the field.
  const [typed, setText] = useState<string | null>(null)
  const text = typed ?? intro ?? ''
  const { mutation, error } = useGivingWrite(
    (value: string) =>
      check(supabase.from('giving_page').update({ intro: value.trim() || null }).eq('id', true)),
    'Could not save the welcome line.',
    () => setText(null),
  )
  const changed = (text.trim() || null) !== (intro ?? null)
  return (
    <div>
      <Heading title="Welcome line" blurb="The sentence under the page title. Left empty, the page thanks people and says every way reaches the church directly." />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
        rows={3}
        aria-label="Welcome line"
        placeholder="Thank you for giving. Choose whichever way suits you — every one reaches the church directly."
        className={`${inputClasses} mt-3`}
      />
      <div className="mt-2 flex justify-end">
        <ActionButton size="sm" onClick={() => mutation.mutate(text)} disabled={!changed || mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save welcome line'}
        </ActionButton>
      </div>
      <ErrorLine error={error} />
    </div>
  )
}

/* ---- links -------------------------------------------------------- */

type LinkDraft = { id?: string; label: string; url: string; note: string; show_qr: boolean; sort_order: number }

function LinksSection({ links }: { links: GivingLink[] }) {
  const [draft, setDraft] = useState<LinkDraft | null>(null)
  const { ask, dialog } = useConfirmAction()
  const save = useGivingWrite(
    (d: LinkDraft) => {
      const row = { label: d.label.trim(), url: d.url.trim(), note: d.note.trim() || null, show_qr: d.show_qr, sort_order: d.sort_order }
      return check(d.id ? supabase.from('giving_links').update(row).eq('id', d.id) : supabase.from('giving_links').insert(row))
    },
    'Could not save that link.',
    () => setDraft(null),
  )
  const remove = useGivingWrite(
    (id: string) => check(supabase.from('giving_links').delete().eq('id', id)),
    'Could not remove that link.',
  )

  return (
    <div>
      <Heading
        title="Giving links"
        blurb="A Stripe Payment Link, PayPal, a giving platform — anything with an https address. Each is a button on the page, and a QR code drawn from the link so somebody can scan it off a screen."
      />
      <ul className="mt-3 flex flex-col gap-2" aria-label="Giving links">
        {links.map((link) =>
          draft?.id === link.id ? (
            <li key={link.id}>
              <LinkEditor draft={draft} onChange={setDraft} onCancel={() => setDraft(null)} onSave={() => save.mutation.mutate(draft)} saving={save.mutation.isPending} />
            </li>
          ) : (
            <li key={link.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-chip)] bg-surface-container px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-medium text-on-surface">{link.label}</span>
                <span className="block truncate font-mono text-label-sm text-on-surface-faint">{link.url}</span>
              </span>
              <ActionButton size="sm" tone="quiet" aria-label={`Edit ${link.label}`} onClick={() => setDraft({ ...link, note: link.note ?? '' })}>
                Edit
              </ActionButton>
              <ActionButton
                size="sm"
                tone="danger-quiet"
                aria-label={`Remove ${link.label}`}
                onClick={() =>
                  ask({
                    title: `Remove ${link.label}?`,
                    body: 'It comes off the Giving page. The account at the provider is not touched.',
                    confirmLabel: 'Remove',
                    onConfirm: () => remove.mutation.mutate(link.id),
                  })
                }
              >
                Remove
              </ActionButton>
            </li>
          ),
        )}
      </ul>
      {draft && !draft.id ? (
        <div className="mt-3">
          <LinkEditor draft={draft} onChange={setDraft} onCancel={() => setDraft(null)} onSave={() => save.mutation.mutate(draft)} saving={save.mutation.isPending} />
        </div>
      ) : (
        <div className="mt-3">
          <ActionButton size="sm" tone="quiet" glyph="+" onClick={() => setDraft({ label: '', url: 'https://', note: '', show_qr: true, sort_order: links.length })}>
            Add a giving link
          </ActionButton>
        </div>
      )}
      <ErrorLine error={save.error ?? remove.error} />
      {dialog}
    </div>
  )
}

function LinkEditor({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: LinkDraft
  onChange: (d: LinkDraft) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const safe = isSafeLink(draft.url)
  const typed = draft.url.trim() !== '' && draft.url.trim() !== 'https://'
  const ready = !!draft.label.trim() && safe
  return (
    <form
      aria-label={draft.id ? 'Edit giving link' : 'New giving link'}
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        if (ready) onSave()
      }}
      className="flex flex-col gap-4 rounded-[var(--radius-chip)] bg-surface-container p-4"
    >
      <TextField label="Button label" value={draft.label} onChange={(label) => onChange({ ...draft, label })} placeholder="Give by card" maxLength={60} />
      <TextField
        label="Link"
        value={draft.url}
        onChange={(url) => onChange({ ...draft, url })}
        placeholder="https://buy.stripe.com/…"
        hint={typed && !safe ? 'It has to start with https:// — that is what keeps a link on this page safe to press.' : 'Copy it from Stripe (Payment Links), PayPal, or your giving platform.'}
        mono
      />
      <TextField label="A line under it (optional)" value={draft.note} onChange={(note) => onChange({ ...draft, note })} placeholder="Card, Apple Pay or Google Pay" maxLength={300} />
      <label className="flex items-center gap-2 text-body-sm text-on-surface">
        <input type="checkbox" checked={draft.show_qr} onChange={(e) => onChange({ ...draft, show_qr: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
        Show a QR code for this link
      </label>
      {ready && (
        <Preview>
          <LinkCard link={{ id: 'preview', label: draft.label.trim(), url: draft.url.trim(), note: draft.note.trim() || null, show_qr: draft.show_qr, sort_order: 0 }} />
        </Preview>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton size="sm" tone="quiet" onClick={onCancel}>
          Cancel
        </ActionButton>
        <ActionButton size="sm" type="submit" disabled={!ready || saving}>
          {saving ? 'Saving…' : draft.id ? 'Save link' : 'Add link'}
        </ActionButton>
      </div>
    </form>
  )
}

/* ---- an uploaded QR picture --------------------------------------- */

const QR_TYPES = ['image/png', 'image/jpeg', 'image/webp']

function QrImageSection({ path, caption }: { path: string | null; caption: string | null }) {
  const [typed, setText] = useState<string | null>(null)
  const text = typed ?? caption ?? ''
  const [problem, setProblem] = useState<string | null>(null)
  const { ask, dialog } = useConfirmAction()

  const upload = useGivingWrite(
    async (file: File) => {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const next = `qr-${Date.now()}.${ext}`
      await check(supabase.storage.from(GIVING_BUCKET).upload(next, file, { contentType: file.type }))
      try {
        await check(supabase.from('giving_page').update({ qr_image_path: next }).eq('id', true))
      } catch (err) {
        // Nothing points at the new file; do not leave it behind.
        await supabase.storage.from(GIVING_BUCKET).remove([next])
        throw err
      }
      if (path) await supabase.storage.from(GIVING_BUCKET).remove([path])
    },
    'Could not upload that picture.',
  )
  const saveCaption = useGivingWrite(
    (value: string) => check(supabase.from('giving_page').update({ qr_image_caption: value.trim() || null }).eq('id', true)),
    'Could not save the caption.',
    () => setText(null),
  )
  const remove = useGivingWrite(
    async () => {
      await check(supabase.from('giving_page').update({ qr_image_path: null }).eq('id', true))
      if (path) await supabase.storage.from(GIVING_BUCKET).remove([path])
    },
    'Could not remove the picture.',
  )

  return (
    <div>
      <Heading
        title="A QR picture"
        blurb="For a code your bank or provider gave you as an image. If you have the link itself, add it above instead — the app draws its QR code for you, and it stays sharp."
      />
      <div className="mt-3 flex flex-col gap-4 rounded-[var(--radius-chip)] bg-surface-container p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-on-surface">{path ? 'Replace the picture' : 'Upload a picture'}</span>
          <input
            type="file"
            accept={QR_TYPES.join(',')}
            aria-label="QR picture"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              if (!QR_TYPES.includes(file.type)) return setProblem('A PNG, JPEG or WebP picture, please.')
              if (file.size > 2 * 1024 * 1024) return setProblem('That picture is over 2 MB.')
              setProblem(null)
              upload.mutation.mutate(file)
            }}
            className="text-body-sm text-on-surface-variant file:mr-3 file:rounded-full file:border-0 file:bg-raised-strong file:px-4 file:py-2 file:text-label-md file:text-on-surface"
          />
          <span className="text-label-sm text-on-surface-faint">PNG, JPEG or WebP, up to 2 MB.</span>
        </label>
        {path && (
          <>
            <TextField label="Caption" value={text} onChange={setText} placeholder="Scan to give" maxLength={120} />
            <Preview>
              <UploadedQr path={path} caption={text.trim() || null} />
            </Preview>
            <div className="flex flex-wrap justify-end gap-2">
              <ActionButton
                size="sm"
                tone="danger-quiet"
                onClick={() =>
                  ask({ title: 'Remove the QR picture?', body: 'It comes off the Giving page and the file is deleted.', confirmLabel: 'Remove', onConfirm: () => remove.mutation.mutate(undefined) })
                }
              >
                Remove picture
              </ActionButton>
              <ActionButton size="sm" onClick={() => saveCaption.mutation.mutate(text)} disabled={(text.trim() || null) === (caption ?? null) || saveCaption.mutation.isPending}>
                Save caption
              </ActionButton>
            </div>
          </>
        )}
        {upload.mutation.isPending && <p className="text-label-md text-on-surface-variant">Uploading…</p>}
      </div>
      <ErrorLine error={problem ?? upload.error ?? saveCaption.error ?? remove.error} />
      {dialog}
    </div>
  )
}

/* ---- bank accounts ------------------------------------------------ */

export type AccountDraft = {
  id?: string
  label: string
  account_name: string
  bank_name: string
  sort_code: string
  account_number: string
  iban: string
  bic: string
  reference: string
  notes: string
  sort_order: number
}

const blankAccount = (sort_order: number): AccountDraft => ({
  label: '',
  account_name: '',
  bank_name: '',
  sort_code: '',
  account_number: '',
  iban: '',
  bic: '',
  reference: '',
  notes: '',
  sort_order,
})

const draftOf = (a: BankAccount): AccountDraft => ({
  id: a.id,
  label: a.label,
  account_name: a.account_name,
  bank_name: a.bank_name ?? '',
  sort_code: a.sort_code ?? '',
  account_number: a.account_number ?? '',
  iban: a.iban ?? '',
  bic: a.bic ?? '',
  reference: a.reference ?? '',
  notes: a.notes ?? '',
  sort_order: a.sort_order,
})

function AccountsSection({ accounts }: { accounts: BankAccount[] }) {
  const [draft, setDraft] = useState<AccountDraft | null>(null)
  const { ask, dialog } = useConfirmAction()
  const save = useGivingWrite(
    (d: AccountDraft) =>
      check(d.id ? supabase.from('giving_bank_accounts').update(accountRow(d)).eq('id', d.id) : supabase.from('giving_bank_accounts').insert(accountRow(d))),
    'Could not save that account.',
    () => setDraft(null),
  )
  const remove = useGivingWrite(
    (id: string) => check(supabase.from('giving_bank_accounts').delete().eq('id', id)),
    'Could not remove that account.',
  )

  return (
    <div>
      <Heading title="Bank accounts" blurb="As many as the church has — a general fund, a building fund. Members can copy each number with one tap." />
      <ul className="mt-3 flex flex-col gap-2" aria-label="Bank accounts">
        {accounts.map((a) =>
          draft?.id === a.id ? (
            <li key={a.id}>
              <AccountEditor draft={draft} onChange={setDraft} onCancel={() => setDraft(null)} onSave={() => save.mutation.mutate(draft)} saving={save.mutation.isPending} />
            </li>
          ) : (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-chip)] bg-surface-container px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-medium text-on-surface">{a.label}</span>
                <span className="block font-mono text-label-sm text-on-surface-faint">
                  {[a.account_name, a.sort_code, a.account_number, a.iban].filter(Boolean).join(' · ')}
                </span>
              </span>
              <ActionButton size="sm" tone="quiet" aria-label={`Edit ${a.label}`} onClick={() => setDraft(draftOf(a))}>
                Edit
              </ActionButton>
              <ActionButton
                size="sm"
                tone="danger-quiet"
                aria-label={`Remove ${a.label}`}
                onClick={() =>
                  ask({ title: `Remove ${a.label}?`, body: 'Its details come off the Giving page.', confirmLabel: 'Remove', onConfirm: () => remove.mutation.mutate(a.id) })
                }
              >
                Remove
              </ActionButton>
            </li>
          ),
        )}
      </ul>
      {draft && !draft.id ? (
        <div className="mt-3">
          <AccountEditor draft={draft} onChange={setDraft} onCancel={() => setDraft(null)} onSave={() => save.mutation.mutate(draft)} saving={save.mutation.isPending} />
        </div>
      ) : (
        <div className="mt-3">
          <ActionButton size="sm" tone="quiet" glyph="+" onClick={() => setDraft(blankAccount(accounts.length))}>
            Add a bank account
          </ActionButton>
        </div>
      )}
      <ErrorLine error={save.error ?? remove.error} />
      {dialog}
    </div>
  )
}

function AccountEditor({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: AccountDraft
  onChange: (d: AccountDraft) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const problem = bankAccountProblem(draft)
  const [tried, setTried] = useState(false)
  const set = (key: keyof AccountDraft) => (value: string) => onChange({ ...draft, [key]: value })
  const row = accountRow(draft)
  return (
    <form
      aria-label={draft.id ? 'Edit bank account' : 'New bank account'}
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        setTried(true)
        if (!problem) onSave()
      }}
      className="flex flex-col gap-4 rounded-[var(--radius-chip)] bg-surface-container p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="What it is for" value={draft.label} onChange={set('label')} placeholder="Tithes and offerings" maxLength={60} />
        <TextField label="Account name" value={draft.account_name} onChange={set('account_name')} placeholder="Rehoboth International Ministries" maxLength={100} />
        <TextField label="Bank (optional)" value={draft.bank_name} onChange={set('bank_name')} placeholder="Barclays" maxLength={100} />
        <TextField label="Payment reference (optional)" value={draft.reference} onChange={set('reference')} placeholder="Your name + TITHE" maxLength={100} />
        <TextField label="Sort code" value={draft.sort_code} onChange={set('sort_code')} placeholder="40-11-62" mono />
        <TextField label="Account number" value={draft.account_number} onChange={set('account_number')} placeholder="12345678" mono />
        <TextField label="IBAN (for giving from abroad)" value={draft.iban} onChange={set('iban')} placeholder="GB29 NWBK 6016 1331 9268 19" mono />
        <TextField label="BIC / SWIFT (optional)" value={draft.bic} onChange={set('bic')} placeholder="NWBKGB2L" mono />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-body-sm font-medium text-on-surface">Anything else (optional)</span>
        <textarea value={draft.notes} onChange={(e) => set('notes')(e.target.value.slice(0, 500))} rows={2} className={inputClasses} placeholder="Gift Aid forms are at the welcome desk." />
      </label>
      {(tried || (!!draft.label && !!draft.account_name)) && problem && (
        <p className="text-label-md text-error">{problem}</p>
      )}
      {!problem && (
        <Preview>
          <AccountCard account={{ id: 'preview', ...row }} />
        </Preview>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <ActionButton size="sm" tone="quiet" onClick={onCancel}>
          Cancel
        </ActionButton>
        <ActionButton size="sm" type="submit" disabled={saving}>
          {saving ? 'Saving…' : draft.id ? 'Save account' : 'Add account'}
        </ActionButton>
      </div>
    </form>
  )
}
