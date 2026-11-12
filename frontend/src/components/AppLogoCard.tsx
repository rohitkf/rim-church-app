import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { usePermissions } from '../lib/usePermissions'
import { useErrorText } from '../lib/useErrorText'
import { SETTINGS_KEY, updateSettings, useAppSettings } from '../lib/appSettings'
import { BRANDING_BUCKET, useAppLogo } from '../lib/appLogo'
import { AppMark } from './AppMark'
import { useConfirmAction } from './ConfirmAction'
import { Overlay } from './Surface'
import { normaliseLogo } from '../lib/logoImage'
import { applyPageIcons, syncAppIcons } from '../lib/appIcon'
import { APP_ICON_KEY, useAppIconStatus } from '../lib/useAppIconSync'

/** What a browser will draw, matched to the bucket's own mime list. */
const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'

import { UPLOAD_LIMIT_BYTES, limitText } from '../lib/uploadLimits'

/**
 * How big a file somebody may hand over: the church's upload limit for a
 * logo (0128), which the `branding` bucket enforces as well. What lands
 * in the bucket is usually far smaller, because the app trims and
 * rescales the picture before it uploads.
 */
export const MAX_BYTES = UPLOAD_LIMIT_BYTES.logo

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
  // Whoever the grid gives "Change the app’s logo" (0277): the Owner alone out of the box.
  const mayChange = usePermissions().can('settings.logo')
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

      const saveErr = await updateSettings({ logo_url: path }).then(
        () => null,
        (e: unknown) => e,
      )
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
      await updateSettings({ logo_url: null })
      if (path) await supabase.storage.from(BRANDING_BUCKET).remove([path])
    },
    onSuccess: refresh,
    onError: (err: unknown) => setError(errorText(err, 'Could not remove the logo.')),
  })

  if (!mayChange) {
    return (
      <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
        <p className="text-body-sm text-on-surface-variant">
          Changing the mark at the top of every page is not open to you. Whoever owns this app can
          change it, or give you the room in Access &amp; Privileges.
        </p>
      </section>
    )
  }

  const busy = upload.isPending || clear.isPending

  return (
    <section className="rounded-[var(--radius-card)] bg-surface-lowest hairline p-6">
      <p className="text-body-sm text-on-surface-variant">
        The mark at the top-left of every page, the icon the app wears once it is installed, and the
        church&rsquo;s face. Who may change it is its own row in Access &amp; Privileges — the Owner alone,
        out of the box.
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
            className="tap rounded-full bg-primary px-4 py-2.5 text-body-sm font-semibold text-on-primary shadow-[var(--shadow-ambient)] transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-50"
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
        PNG, JPEG, WebP or SVG, up to {limitText(MAX_BYTES)}. Whatever you upload is trimmed of its blank
        margin and resized for you, so it stands the same height as everything else in the header
        — any shape will do.
      </p>

      {error && (
        <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
          {error}
        </p>
      )}

      <InstalledIcon logoPath={settings.logo_url} />

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
              {megabytes(tooBig.size)}, and the limit is {limitText(MAX_BYTES)}. A logo exported at a
              sensible size is well under that — try the PNG or SVG your designer sent rather than a scan
              or a screenshot.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                autoFocus
                onClick={() => setTooBig(null)}
                className="tap rounded-full bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms]"
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


/**
 * The icon the app wears once it is installed, which is this logo.
 *
 * It is made from the logo by the app itself (lib/appIcon, and the app
 * shell does it without being asked), so there is nothing to choose here:
 * this says where it stands, shows the picture, and offers to make it now
 * when it has not caught up. The last line is the one thing nobody can do
 * from here: a phone keeps the icon it was installed with until the phone
 * decides to look again.
 */
function InstalledIcon({ logoPath }: { logoPath: string | null }) {
  const errorText = useErrorText()
  const queryClient = useQueryClient()
  const status = useAppIconStatus(logoPath)
  const make = useMutation({
    mutationFn: () => syncAppIcons(logoPath),
    onSuccess: (result) => {
      applyPageIcons(result.set)
      queryClient.invalidateQueries({ queryKey: APP_ICON_KEY })
    },
  })

  const behind = !!logoPath && status.loaded && !status.current
  return (
    <div className="mt-6 border-t border-border-subtle pt-5">
      <h3 className="text-body-md font-medium text-on-surface">The installed app’s icon</h3>
      <div className="mt-3 flex items-start gap-4">
        <img
          // The church's own when it is made; the app's own until then, and with no logo.
          src={logoPath && status.current && status.preview ? status.preview : '/icon-192.png'}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-[22%] hairline"
          // A link that has run out says nothing rather than a broken picture.
          onError={(e) => {
            e.currentTarget.style.visibility = 'hidden'
          }}
        />
        <div className="min-w-0">
          <p className="text-body-sm text-on-surface-variant">
            {!logoPath
              ? 'With no logo, the installed app wears the app’s own icon. Upload a logo and the icon becomes that logo.'
              : status.current
                ? 'Made from this logo. It is what a phone or a computer shows once the app is installed, and the icon on the browser’s tab.'
                : make.isPending
                  ? 'Making the icon from this logo…'
                  : 'Not made from this logo yet. The app does it by itself while you have it open; it should only take a moment.'}
          </p>
          {behind && (
            <button
              type="button"
              disabled={make.isPending}
              onClick={() => make.mutate()}
              className="tap mt-2 rounded-full bg-raised-strong px-3.5 py-1.5 text-label-md font-semibold text-on-surface hairline disabled:opacity-50"
            >
              {make.isPending ? 'Making it…' : 'Make it now'}
            </button>
          )}
          {make.isError && (
            <p role="alert" className="mt-2 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
              {errorText(make.error, 'The icon could not be made.')}
            </p>
          )}
        </div>
      </div>
      <p className="mt-3 text-label-sm text-on-surface-faint">
        A device that already has the app keeps the icon it was installed with until the device changes it; nothing
        the app can do hurries that. An Android phone changes it by itself within a day or two of the app being
        opened, and asks first. A computer offers it in the app window’s ⋮ menu. An iPhone or iPad never does: the
        app has to be removed from the Home Screen and added again. Everybody with the app installed is told, in
        their own device’s terms, the next time they open it.
      </p>
    </div>
  )
}
