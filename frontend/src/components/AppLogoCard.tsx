import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useErrorText } from '../lib/useErrorText'
import { SETTINGS_KEY, useAppSettings } from '../lib/appSettings'
import { BRANDING_BUCKET, useAppLogo } from '../lib/appLogo'
import { AppMark } from './AppMark'
import { useConfirmAction } from './ConfirmAction'
import { Overlay } from './Surface'
import { normaliseLogo } from '../lib/logoImage'

/** What a browser will draw, matched to the bucket's own mime list. */
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'

/**
 * How big a file somebody may hand over.
 *
 * Generous on purpose: what lands in the bucket is a few tens of
 * kilobytes whatever arrives, because the app trims and rescales the
 * picture before it uploads. The only thing this number has to do is
 * stop a browser being asked to decode something absurd — a scan, a
 * screenshot of a poster — and say so clearly when it does.
 */
export const MAX_BYTES = 30 * 1024 * 1024

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])

/** A size in the units people actually say out loud. */
function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
  /** The file somebody offered that this page will not take. */
  const [tooBig, setTooBig] = useState<{ name: string; size: number } | null>(null)

  const refresh = () => {
    setError(null)
    queryClient.invalidateQueries({ queryKey: SETTINGS_KEY })
    queryClient.invalidateQueries({ queryKey: ['app-logo'] })
  }

  const upload = useMutation({
    mutationFn: async (chosen: File) => {
      if (!ALLOWED.has(chosen.type)) throw new Error('That is not an image this app can draw.')

      /*
       * Resized before it is stored, never after.
       *
       * The header draws the mark 36 pixels tall, and it only looks level
       * with everything beside it if the picture's edges are the mark's
       * edges. So the blank margin comes off and the thing is scaled to
       * 512 pixels — whatever was uploaded, and whatever it was uploaded
       * at. See lib/logoImage.
       */
      const square = await normaliseLogo(chosen)

      // A new name every time. The same one would sit behind a signed URL
      // and a browser cache that both still point at the old picture, and
      // "I uploaded it and nothing changed" is the bug that follows.
      const path = `logo/${crypto.randomUUID()}.png`
      const previous = settings.logo_url

      const { error: putErr } = await supabase.storage
        .from(BRANDING_BUCKET)
        .upload(path, square, { contentType: 'image/png' })
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
              if (!chosen) return
              // Said with a dialog rather than a line of red under the
              // button: somebody who has just picked a file is watching
              // the file picker close, not reading the page.
              if (chosen.size > MAX_BYTES) {
                setTooBig({ name: chosen.name, size: chosen.size })
                return
              }
              setError(null)
              upload.mutate(chosen)
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
        PNG, JPEG, WebP or SVG, up to 30&nbsp;MB. Whatever you upload is trimmed of its blank
        margin and resized for you, so it stands the same height as everything else in the header
        — any shape will do.
      </p>

      {error && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      {tooBig && (
        <Overlay onDismiss={() => setTooBig(null)} label="That file is too big" closable={false}>
          <div
            role="alertdialog"
            aria-label="That file is too big"
            className="w-full max-w-sm rounded-[var(--radius-shell)] bg-surface-lowest p-7 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/12"
          >
            <h3 className="text-headline-md">That file is too big</h3>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              <strong className="font-medium text-on-surface">{tooBig.name}</strong> is{' '}
              {megabytes(tooBig.size)}, and the limit is 30&nbsp;MB. A logo exported at a sensible
              size is a fraction of that — try the PNG or SVG your designer sent rather than a scan
              or a screenshot.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                autoFocus
                onClick={() => setTooBig(null)}
                className="tap rounded-full bg-primary px-5 py-2.5 text-body-sm font-medium text-on-primary transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
              >
                Pick another
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {dialog}
    </section>
  )
}
