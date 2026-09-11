import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { SETTINGS_KEY, useAppSettings } from '../lib/appSettings'
import { BRANDING_BUCKET, useAppLogo } from '../lib/appLogo'
import { AppMark } from './AppMark'
import { useConfirmAction } from './ConfirmAction'

/** What a browser will draw, matched to the bucket's own mime list. */
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'
const MAX_BYTES = 2 * 1024 * 1024

const EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

/**
 * The church's own mark, chosen by whoever owns the app.
 *
 * The mark at the top-left is the one piece of the app that is about who
 * the church is rather than how it runs, which is why it is the owner's
 * and not every Admin's — the database enforces that, not this page (see
 * migration 0089). An Admin who lands here by URL gets told, rather than
 * a form that fails when they press Save.
 *
 * Taking it down is not a loss: the app has a mark of its own and falls
 * back to it, here and in the header, the moment there is no logo.
 */
export function AppLogoCard() {
  const { isSuperAdmin } = useAuth()
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const { ask, dialog } = useConfirmAction()
  const settings = useAppSettings()
  const { url } = useAppLogo()
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => {
    setError(null)
    queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    queryClient.invalidateQueries({ queryKey: ['app-logo'] })
  }

  const upload = useMutation({
    mutationFn: async (chosen: File) => {
      const ext = EXTENSION[chosen.type]
      if (!ext) throw new Error('That is not an image this app can draw.')
      if (chosen.size > MAX_BYTES) throw new Error('That file is over 2 MB.')

      // A new name every time. The same one would sit behind a signed URL
      // and a browser cache that both still point at the old picture, and
      // "I uploaded it and nothing changed" is the bug that follows.
      const path = `logo/${crypto.randomUUID()}.${ext}`
      const previous = settings.logo_url

      const { error: putErr } = await supabase.storage
        .from(BRANDING_BUCKET)
        .upload(path, chosen, { contentType: chosen.type })
      if (putErr) throw putErr

      const { error: saveErr } = await supabase
        .from('app_settings')
        .update({ logo_url: path })
        .eq('id', true)
      if (saveErr) {
        // Nothing points at the file we just put up, so take it back down
        // rather than leaving it in the bucket for good.
        await supabase.storage.from(BRANDING_BUCKET).remove([path])
        throw saveErr
      }

      if (previous) await supabase.storage.from(BRANDING_BUCKET).remove([previous])
    },
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorText(err, 'Could not set the logo.')),
  })

  const clear = useMutation({
    mutationFn: async () => {
      const path = settings.logo_url
      const { error: saveErr } = await supabase
        .from('app_settings')
        .update({ logo_url: null })
        .eq('id', true)
      if (saveErr) throw saveErr
      if (path) await supabase.storage.from(BRANDING_BUCKET).remove([path])
    },
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorText(err, 'Could not remove the logo.')),
  })

  if (!isSuperAdmin) {
    return (
      <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
        <h2 className="text-headline-md">App logo</h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          The mark at the top of every page is the owner&rsquo;s to choose. Ask whoever owns this
          app to change it.
        </p>
      </section>
    )
  }

  const busy = upload.isPending || clear.isPending

  return (
    <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
      <h2 className="text-headline-md">App logo</h2>
      <p className="mt-1.5 text-body-sm text-on-surface-variant">
        The mark at the top-left of every page. Yours to choose, and yours alone — an Admin can set
        the church&rsquo;s clocks but not its face.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-5">
        {/* The real thing, at the size it is actually drawn, on the
            surface it actually sits on. A logo previewed at 200px and
            shown at 36 is a logo nobody chose. */}
        <div className="flex items-center gap-3 rounded-[var(--radius-chip)] bg-surface-container px-4 py-3">
          <AppMark />
          <span className="text-label-sm text-on-surface-faint">
            {url ? 'In use' : 'The app’s own mark'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={file}
            type="file"
            accept={ACCEPT}
            // Hidden because the button above is the control anybody
            // actually presses; named because a hidden input is still an
            // input, and a screen reader arriving at it should be told
            // what it takes.
            aria-label="Logo image file"
            hidden
            onChange={(e) => {
              const chosen = e.target.files?.[0]
              // Cleared so choosing the same file twice still counts as a
              // change — otherwise a failed upload cannot be retried.
              e.target.value = ''
              if (chosen) upload.mutate(chosen)
            }}
          />
          <button
            type="button"
            onClick={() => file.current?.click()}
            disabled={busy}
            className="tap rounded-full bg-primary px-4 py-2.5 text-body-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-50"
          >
            {upload.isPending ? 'Uploading…' : url ? 'Replace logo' : 'Upload a logo'}
          </button>

          {settings.logo_url && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                ask({
                  title: 'Remove the app logo?',
                  body: 'The app goes back to drawing its own mark. You can upload another at any time.',
                  confirmLabel: 'Remove',
                  onConfirm: () => clear.mutate(),
                })
              }
              className="tap rounded-full px-4 py-2.5 text-body-sm font-medium text-error hover:underline disabled:opacity-50"
            >
              {clear.isPending ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      </div>

      <p className="mt-4 text-label-sm text-on-surface-faint">
        PNG, JPEG, WebP or SVG, up to 2 MB. It is drawn in a 36-pixel square and fitted rather than
        cropped, so a square mark works best.
      </p>

      {error && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      {dialog}
    </section>
  )
}
