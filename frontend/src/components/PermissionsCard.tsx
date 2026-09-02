import { useState } from 'react'
import {
  CHECKED_ON,
  PERMISSIONS,
  ROLES,
  type Allowed,
  type RoleKey,
} from '../lib/permissionMatrix'
import { Panel } from './Surface'
import { ShieldIcon } from './icons'

/**
 * Who can do what, on one page.
 *
 * The app has grown a standing, a team standing, a service-only standing
 * and an owner, spread across sixty-odd database policies. Nobody can hold
 * that in their head, and the question "wait — can a Head see DBS
 * details?" deserves an answer better than reading SQL.
 *
 * It does not change anything, and says so plainly rather than leaving
 * somebody to discover it by clicking. A grid of checkboxes that wrote
 * back would be the friendlier lie: permissions here are enforced by
 * Postgres on every query, which is the reason they hold at all, and there
 * is no settings row for a tick to land in.
 */

/** What a cell says. A tick is the loud one; everything else stays quiet. */
function Cell({ value }: { value: Allowed }) {
  if (value === 'yes') {
    return (
      <span className="text-success" aria-label="Yes">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    )
  }
  if (value === 'no') {
    // A dash rather than a cross. Most of this grid is "no", and eighty
    // red crosses reads as a list of faults instead of a description.
    return (
      <span className="text-on-surface-faint" aria-label="No">
        –
      </span>
    )
  }
  return (
    <span className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
      {value === 'own' ? 'own' : 'team'}
    </span>
  )
}

export function PermissionsCard() {
  const [open, setOpen] = useState(false)

  return (
    <Panel
      title="Who can do what"
      icon={ShieldIcon}
      aside={
        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-expanded={open}
          aria-controls="permissions-body"
          className="tap shrink-0 rounded-full px-2 py-1 text-label-sm text-on-surface-variant transition-colors hover:text-on-surface"
        >
          {open ? 'Hide' : 'Show'}
        </button>
      }
      bodyClassName={open ? 'mt-5' : 'mt-2'}
    >
      <p className="text-body-sm text-on-surface-variant">
        Every standing in the app and what it may do. These rules are enforced by the database on
        every request, not by this page — changing one means changing a policy, on purpose.
      </p>

      <div id="permissions-body" hidden={!open}>
        <dl className="mt-4 flex flex-col gap-2">
          {ROLES.map((role) => (
            <div key={role.key} className="flex flex-wrap items-baseline gap-x-2">
              <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface">
                {role.label}
              </dt>
              <dd className="min-w-0 flex-1 text-label-sm text-on-surface-variant">{role.blurb}</dd>
            </div>
          ))}
          <div className="flex flex-wrap items-baseline gap-x-2">
            <dt className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
              own / team
            </dt>
            <dd className="min-w-0 flex-1 text-label-sm text-on-surface-variant">
              Yes, but only for themselves, or only for a team they lead or belong to.
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col gap-7">
          {PERMISSIONS.map((area) => (
            <section key={area.area}>
              <h3 className="font-mono text-label-sm uppercase tracking-wide text-on-surface-variant">
                {area.area}
              </h3>
              {/* Eight columns will not fit a phone, and shrinking them to
                  make them fit is how a table becomes unreadable on every
                  device instead of one. It scrolls inside itself. */}
              <div className="mt-2 -mx-2 overflow-x-auto px-2">
                <table className="w-full min-w-[34rem] border-collapse text-body-sm">
                  <thead>
                    <tr>
                      <th className="w-[45%] px-2 pb-2 text-left font-normal text-on-surface-faint">
                        <span className="sr-only">Action</span>
                      </th>
                      {ROLES.map((role) => (
                        <th
                          key={role.key}
                          scope="col"
                          className="px-2 pb-2 text-center font-mono text-label-sm font-normal uppercase tracking-wide text-on-surface-variant"
                        >
                          {role.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {area.capabilities.map((capability) => (
                      <tr
                        key={capability.action}
                        className="border-t border-border-subtle align-top"
                      >
                        <th
                          scope="row"
                          className="px-2 py-2 text-left font-normal text-on-surface"
                        >
                          {capability.action}
                          {capability.note && (
                            <span className="mt-0.5 block text-label-sm text-on-surface-faint">
                              {capability.note}
                            </span>
                          )}
                        </th>
                        {ROLES.map((role) => (
                          <td key={role.key} className="px-2 py-2 text-center">
                            <Cell value={capability.can[role.key as RoleKey]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>

        {/* Said out loud, because a reference that quietly goes stale is
            worse than none: somebody would trust it. */}
        <p className="mt-6 border-t border-border-subtle pt-3 text-label-sm text-on-surface-faint">
          Read from the database&rsquo;s own policies on {CHECKED_ON}. Adding a rule later will not
          update this page by itself — if something here disagrees with what the app does, the app
          is right and this needs correcting.
        </p>
      </div>
    </Panel>
  )
}
