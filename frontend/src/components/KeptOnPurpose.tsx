import { UPLOAD_LIMITS } from '../lib/uploadLimits'

/**
 * What the app keeps with no clock, and the limits nobody sets — said
 * under Page by Page › The app itself, beside the clocks that do delete.
 * It was the foot of the Data & Retention room before that folded in here.
 */
export function KeptOnPurpose() {
  return (
    <>
      <section aria-label="Kept until somebody deletes them">
        <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
          Kept until somebody deletes them
        </h3>
        <p className="mt-1 text-label-md text-on-surface-faint">Not on a clock, on purpose.</p>
        <ul className="mt-2 flex flex-col gap-2 text-body-sm text-on-surface-variant">
          {KEPT.map(([what, note]) => (
            <li key={what}>
              <span className="font-medium text-on-surface">{what}</span> — {note}
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Uploads and the app’s own logs">
        <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
          Uploads and the app’s own logs
        </h3>
        <p className="mt-1 text-label-md text-on-surface-faint">Fixed, so storage stays in hand.</p>
        <ul className="mt-2 flex flex-col gap-2 text-body-sm text-on-surface-variant">
          {UPLOAD_LIMITS.map(([what, limit]) => (
            <li key={what} className="flex items-baseline justify-between gap-3">
              <span>{what}</span>
              <span className="shrink-0 font-mono text-label-md text-on-surface">{limit}</span>
            </li>
          ))}
          <li className="mt-1 border-t border-border-subtle pt-3">
            Supabase’s own logs — the record of each phone notification sent and of each nightly job — keep
            one week, cleared every Tuesday.
          </li>
        </ul>
      </section>
    </>
  )
}

const KEPT: [string, string][] = [
  ['Inventory', 'items, their check-out history and purchase requests.'],
  ['Invitations and join requests', 'an Admin can remove accepted invitations and answered requests.'],
  ['Guests and events', 'removed from their own pages.'],
  ['Uploaded files', 'the logo, the Giving QR picture, handbooks and inventory documents stay until replaced or removed.'],
]
