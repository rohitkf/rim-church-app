import { type FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { supabase } from '../lib/supabaseClient'
import { useErrorText } from '../lib/useErrorText'
import { Field, inputClasses } from './Surface'

export const DOC_BUCKET = 'inventory-docs'

const KINDS = [
  { value: 'invoice', label: 'Invoice / receipt' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'other', label: 'Other' },
] as const

const documentSchema = z.object({
  id: z.string(),
  item_id: z.string(),
  kind: z.enum(['invoice', 'insurance', 'warranty', 'other']),
  label: z.string().nullable(),
  link_url: z.string().nullable(),
  storage_path: z.string().nullable(),
  created_at: z.string(),
  uploader: z.object({ first_name: z.string(), last_name: z.string() }).nullable(),
})
type ItemDocument = z.infer<typeof documentSchema>

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
const MAX_BYTES = 20 * 1024 * 1024

async function fetchDocuments(itemId: string): Promise<ItemDocument[]> {
  const { data, error } = await supabase
    .from('inventory_documents')
    .select(
      'id, item_id, kind, label, link_url, storage_path, created_at, uploader:profiles!inventory_documents_uploaded_by_fkey(first_name, last_name)',
    )
    .eq('item_id', itemId)
    .order('created_at')
  if (error) throw error
  return z.array(documentSchema).parse(data)
}

/**
 * An item's paperwork.
 *
 * The invoice is in somebody's email and the insurance certificate is in a
 * drawer, so at the moment either is actually needed, neither can be found.
 * Both can live here — as a link to where the document already is, or as the
 * file itself. A link costs nothing and is often all anyone has; an upload is
 * for the ones that exist only as an attachment somebody will eventually
 * delete.
 */
export function ItemDocuments({
  itemId,
  departmentId,
  canManage,
}: {
  itemId: string
  departmentId: string
  canManage: boolean
}) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('invoice')
  const [label, setLabel] = useState('')
  const [link, setLink] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const documentsQuery = useQuery({
    queryKey: ['inventory-documents', itemId],
    queryFn: () => fetchDocuments(itemId),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['inventory-documents', itemId] })

  const addDocument = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser()
      const uploadedBy = userData?.user?.id ?? null

      if (file) {
        if (!ALLOWED.includes(file.type)) {
          throw new Error('That file type is not accepted — PDF, image or spreadsheet only.')
        }
        if (file.size > MAX_BYTES) throw new Error('That file is over 20MB.')
        // Filed under the team, so the path itself says who owns it — which
        // is what the storage rules read to decide who may write here.
        const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80)
        const path = `${departmentId}/${itemId}/${Date.now()}-${safe}`
        const { error: uploadError } = await supabase.storage
          .from(DOC_BUCKET)
          .upload(path, file, { contentType: file.type })
        if (uploadError) throw uploadError
        const { error: rowError } = await supabase.from('inventory_documents').insert({
          item_id: itemId,
          department_id: departmentId,
          kind,
          label: label.trim() || file.name,
          storage_path: path,
          uploaded_by: uploadedBy,
        })
        if (rowError) throw rowError
        return
      }

      const href = link.trim()
      if (!/^https?:\/\//i.test(href)) throw new Error('A link needs to start with http:// or https://')
      const { error: rowError } = await supabase.from('inventory_documents').insert({
        item_id: itemId,
        department_id: departmentId,
        kind,
        label: label.trim() || null,
        link_url: href,
        uploaded_by: uploadedBy,
      })
      if (rowError) throw rowError
    },
    onSuccess: () => {
      setAdding(false); setLabel(''); setLink(''); setFile(null); setError(null)
      refresh()
    },
    onError: (err: unknown) => setError(errorText(err, 'Could not add that document.')),
  })

  const removeDocument = useMutation({
    mutationFn: async (doc: ItemDocument) => {
      if (doc.storage_path) {
        await supabase.storage.from(DOC_BUCKET).remove([doc.storage_path])
      }
      const { error: deleteError } = await supabase
        .from('inventory_documents')
        .delete()
        .eq('id', doc.id)
      if (deleteError) throw deleteError
    },
    onSuccess: () => { setError(null); refresh() },
    onError: (err: unknown) => setError(errorText(err, 'Could not remove that document.')),
  })

  /** A stored file is private, so opening one needs a link minted per view. */
  async function openDocument(doc: ItemDocument) {
    if (doc.link_url) {
      window.open(doc.link_url, '_blank', 'noopener,noreferrer')
      return
    }
    if (!doc.storage_path) return
    const { data, error: signError } = await supabase.storage
      .from(DOC_BUCKET)
      .createSignedUrl(doc.storage_path, 300)
    if (signError || !data) {
      setError('Could not open that document.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!file && !link.trim()) return
    addDocument.mutate()
  }

  const docs = documentsQuery.data ?? []

  return (
    <section className="rounded-[var(--radius-card)] bg-surface-lowest p-5 hairline">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-headline-sm">Paperwork</h2>
        {canManage && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="tap rounded-full hairline px-3 py-1.5 text-label-md text-on-surface hover:border-secondary"
          >
            Add
          </button>
        )}
      </div>
      <p className="mt-1 text-label-md text-on-surface-faint">
        Invoices, insurance and warranties — a link to where it lives, or the file itself.
      </p>

      {error && (
        <p className="mt-3 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      {docs.length === 0 ? (
        <p className="mt-3 text-body-sm text-on-surface-variant">Nothing on file yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-[var(--radius-row)] bg-raised px-3.5 py-2.5 hairline"
            >
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="shrink-0 rounded-full bg-raised-strong px-2 py-0.5 font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                  {KINDS.find((k) => k.value === doc.kind)?.label ?? doc.kind}
                </span>
                <button
                  type="button"
                  onClick={() => openDocument(doc)}
                  className="min-w-0 break-all text-left text-body-sm font-medium text-secondary hover:underline"
                >
                  {doc.label ?? (doc.link_url ? 'Open link' : 'Open file')}
                </button>
                <span className="font-mono text-label-sm text-on-surface-faint">
                  {doc.link_url ? 'link' : 'file'}
                  {doc.uploader ? ` · ${doc.uploader.first_name} ${doc.uploader.last_name}` : ''}
                </span>
              </span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => removeDocument.mutate(doc)}
                  className="tap shrink-0 text-label-md text-on-surface-faint hover:text-error hover:underline"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && adding && (
        <form onSubmit={handleAdd} className="mt-4 flex flex-col gap-3 border-t border-border-subtle pt-4">
          <Field label="What is it">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className={inputClasses}
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Name it (optional)">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Invoice 2026-04, Thomann"
              className={inputClasses}
            />
          </Field>
          <Field label="Paste a link" hint="Where the document already lives.">
            <input
              type="url"
              value={link}
              onChange={(e) => { setLink(e.target.value); if (e.target.value) setFile(null) }}
              placeholder="https://…"
              className={inputClasses}
            />
          </Field>
          <Field label="…or upload the file" hint="PDF, image or spreadsheet, up to 20MB.">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setLink('') }}
              className="block w-full text-body-sm text-on-surface-variant file:mr-3 file:rounded-full file:border-0 file:bg-raised-strong file:px-3 file:py-1.5 file:text-body-sm file:text-on-surface"
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => { setAdding(false); setError(null) }}
              className="rounded-full px-3 py-1.5 text-label-md text-on-surface-variant hover:text-on-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={addDocument.isPending || (!file && !link.trim())}
              className="tap rounded-full bg-primary px-4 py-1.5 text-label-md font-medium text-on-primary disabled:opacity-40"
            >
              {addDocument.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
