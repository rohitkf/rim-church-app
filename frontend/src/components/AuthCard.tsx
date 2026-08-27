import type { ReactNode } from 'react'

/**
 * The frame every signed-out screen shares.
 *
 * A single glass card floating on a lit ground: the app's identity, one
 * heading, and the shortest possible form. Sign-in is the one screen a
 * volunteer meets before they trust the thing, so it gets the most
 * restraint — no navigation, no chrome, nothing to read that isn't the
 * task.
 */
export function AuthCard({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Two washes rather than one: the ground has a horizon. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_30rem_at_50%_-10%,color-mix(in_oklab,var(--color-accent-blue)_22%,transparent),transparent_62%),radial-gradient(30rem_24rem_at_20%_110%,color-mix(in_oklab,var(--color-accent-indigo)_16%,transparent),transparent_60%)]"
      />

      <div className="relative w-full max-w-[400px] rounded-[var(--radius-tile)] bg-[color-mix(in_oklab,var(--color-surface-lowest)_86%,transparent)] p-8 shadow-[inset_0_0_0_1px_var(--color-outline-variant),var(--shadow-lifted)] backdrop-blur-2xl sm:p-9">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(160deg,var(--color-accent-blue),color-mix(in_oklab,var(--color-accent-blue)_55%,black))] font-mono text-[13px] text-white"
          >
            RIM
          </span>
          <span className="text-body-md font-medium leading-5 text-on-surface-variant">
            Rehoboth International
            <br />
            Ministries
          </span>
        </div>

        <h1 className="mt-7 text-headline-lg">{title}</h1>

        <div className="mt-6">{children}</div>

        {footer && <p className="mt-6 text-label-md text-on-surface-faint">{footer}</p>}
      </div>
    </div>
  )
}

/** The label above an auth field: mono, spaced, quiet. */
export function AuthLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase leading-none tracking-[0.18em] text-on-surface-faint">
      {children}
    </span>
  )
}

/**
 * Auth inputs are taller and rounder than the app's, because they are the
 * only thing on the screen and a 50px target is what a cold thumb needs.
 */
export const authInputClasses =
  'h-[50px] w-full rounded-[var(--radius-chip)] border-0 bg-raised-strong px-4 text-body-md text-on-surface hairline-strong transition-shadow duration-300 ease-[var(--ease-glide)] placeholder:text-on-surface-faint focus:outline-none focus:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]'

export const authSubmitClasses =
  'flex h-[52px] w-full items-center justify-center rounded-full bg-primary text-body-md font-semibold text-on-primary transition-all duration-500 ease-[var(--ease-glide)] active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100'
