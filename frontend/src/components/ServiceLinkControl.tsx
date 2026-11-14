import { type FormEvent, useId, useState } from 'react'
import { ActionButton, Overlay, inputClasses } from './Surface'
import { LINK_LABEL_MAX, serviceLink, serviceLinkPatch } from '../lib/serviceLink'

/** The link itself: a pill that opens it in a new tab. */
export function ServiceLinkPill({
  service,
  tone = 'quiet',
}: {
  service: { link?: string | null; link_label?: string | null } | null | undefined
  /** `strong` beside a primary button on the Dashboard card; `quiet` under a heading. */
  tone?: 'quiet' | 'strong'
}) {
  const link = serviceLink(service)
  if (!link) return null
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={link.url}
      className={
        tone === 'strong'
          ? 'inline-flex max-w-full items-center gap-2 rounded-full bg-raised-strong px-5 py-3 text-body-sm font-medium text-on-surface hairline-strong transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms]'
          : 'tap inline-flex max-w-full items-center gap-2 rounded-full bg-raised-strong px-3.5 py-1.5 text-body-sm font-medium text-accent-blue-soft'
      }
    >
      <span className="truncate">{link.label}</span>
      <span aria-hidden="true">↗</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  )
}

/**
 * A service's link at the top of its running order (0289): the pill for
 * everybody, and for whoever plans the service a way to add, change or
 * remove it.
 *
 * The form is a sheet rather than two more fields in the heading: the
 * heading already holds the name and the date, and a link is set once and
 * then only pressed.
 */
export function ServiceLinkControl({
  service,
  canEdit,
  busy,
  error,
  onSave,
}: {
  service: { link?: string | null; link_label?: string | null } | null | undefined
  canEdit: boolean
  busy: boolean
  error: string | null
  onSave: (patch: { link: string | null; link_label: string | null }, done: () => void) => void
}) {
  const link = serviceLink(service)
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [tried, setTried] = useState(false)
  const reasonId = useId()

  if (!link && !canEdit) return null

  const start = () => {
    setUrl(service?.link ?? '')
    setLabel(service?.link_label ?? '')
    setTried(false)
    setOpen(true)
  }
  const patch = serviceLinkPatch(url, label)
  const wrong = tried && patch === false
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (patch === false) return
    onSave(patch, () => setOpen(false))
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      <ServiceLinkPill service={service} />
      {canEdit && (
        <button
          type="button"
          onClick={start}
          className="tap rounded-full px-3 py-1.5 text-label-md text-on-surface-variant hairline hover:text-on-surface"
        >
          {link ? 'Change link' : '+ Add a link'}
        </button>
      )}
      {open && (
        <Overlay label="The link for this service" align="sheet" onDismiss={() => setOpen(false)}>
          <form
            onSubmit={submit}
            noValidate
            className="w-full rounded-t-[var(--radius-card)] bg-surface-lowest p-6 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] sm:max-w-md sm:rounded-[var(--radius-card)]"
          >
            <h2 className="text-headline-md">A link for this service</h2>
            <p className="mt-2 text-body-sm text-on-surface-variant">
              The livestream, the slides, a shared folder. It shows here and on the service’s card on the
              Dashboard, for everybody who can see the service.
            </p>

            <label className="mt-4 block">
              <span className="text-label-md text-on-surface-variant">Web address</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                // Not type="url": the browser would refuse a bare www. address
                // before the form's own check could give it https.
                type="text"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                autoFocus
                placeholder="https://youtube.com/live/…"
                aria-invalid={wrong || undefined}
                aria-describedby={wrong ? reasonId : undefined}
                className={`${inputClasses} mt-1.5 ${wrong ? 'field-error' : ''}`}
              />
            </label>
            {wrong && (
              <p id={reasonId} className="mt-1.5 text-label-md text-error">
                That is not a web address. It should start with https:// or www.
              </p>
            )}

            <label className="mt-4 block">
              <span className="text-label-md text-on-surface-variant">
                What to call it <span className="text-on-surface-faint">(optional)</span>
              </span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={LINK_LABEL_MAX}
                placeholder="Livestream"
                className={`${inputClasses} mt-1.5`}
              />
            </label>

            {error && (
              <p role="alert" className="mt-4 text-body-sm text-error">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              {link && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSave({ link: null, link_label: null }, () => setOpen(false))}
                  className="tap mr-auto rounded-full px-4 py-2.5 text-body-sm font-medium text-error hover:underline disabled:opacity-50"
                >
                  Remove link
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="tap rounded-full px-4 py-2.5 text-body-sm font-medium text-on-surface-variant hover:text-on-surface"
              >
                Cancel
              </button>
              <ActionButton type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save link'}
              </ActionButton>
            </div>
          </form>
        </Overlay>
      )}
    </div>
  )
}
