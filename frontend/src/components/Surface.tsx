import type { ComponentType, ReactNode } from 'react'

/**
 * The app's card.
 *
 * A card is built as two enclosures rather than one box: an outer tray with
 * a hairline edge and a soft ambient shadow, and an inner plate sitting in
 * it with its own surface and a one-pixel highlight along its top edge. The
 * two radii are concentric — the inner is the outer minus the tray's
 * padding — which is what stops a rounded card from looking like a
 * rectangle with the corners filed off.
 *
 * `interactive` adds the physics: the tray lifts on hover and presses in on
 * click, on the app's single easing curve.
 */
export function Card({
  children,
  className = '',
  interactive = false,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  interactive?: boolean
  as?: 'div' | 'li' | 'section' | 'article'
}) {
  return (
    <Tag
      className={`group/card rounded-[var(--radius-shell)] bg-surface-low p-1.5 ring-1 ring-black/5 transition-[transform,box-shadow] duration-500 ease-[var(--ease-glide)] dark:ring-white/10 ${
        interactive
          ? 'shadow-[var(--shadow-ambient)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lifted)] active:translate-y-0'
          : 'shadow-[var(--shadow-ambient)]'
      } ${className}`}
    >
      <div className="h-full rounded-[var(--radius-core)] bg-surface-lowest shadow-[inset_0_1px_0_rgb(255_255_255_/_0.7)] dark:shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)]">
        {children}
      </div>
    </Tag>
  )
}

/** The micro-label that precedes a heading: small, spaced, quiet. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * A page's opening: eyebrow, title, one line of orientation, and whatever
 * action belongs at that level. Every page wears the same one, so moving
 * between them feels like one product rather than a set of screens.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-8">
      <div className="max-w-2xl">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="mt-2 text-headline-xl">{title}</h1>
        {description && (
          <p className="mt-2 text-body-md text-on-surface-variant">{description}</p>
        )}
      </div>
      {action}
    </header>
  )
}

/**
 * The primary action, as a pill with its glyph nested in its own disc — the
 * detail that separates a button from a link with a background colour. The
 * disc drifts on hover, so the button has some internal life without
 * anything moving far enough to be a distraction.
 */
export function ActionButton({
  children,
  glyph,
  onClick,
  type = 'button',
  disabled,
  tone = 'primary',
  className = '',
}: {
  children: ReactNode
  glyph?: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  tone?: 'primary' | 'quiet' | 'danger'
  className?: string
}) {
  const tones = {
    primary: 'bg-primary text-on-primary ring-1 ring-black/10 dark:ring-white/10',
    quiet:
      'bg-surface-lowest text-on-surface ring-1 ring-black/8 hover:ring-black/16 dark:ring-white/10 dark:hover:ring-white/20',
    danger: 'bg-error text-on-error ring-1 ring-black/10',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`group/btn inline-flex items-center gap-2 rounded-full py-2.5 pl-5 pr-2.5 text-body-sm font-medium shadow-[var(--shadow-ambient)] transition-all duration-500 ease-[var(--ease-glide)] hover:shadow-[var(--shadow-lifted)] active:scale-[0.98] disabled:opacity-50 disabled:shadow-none ${tones[tone]} ${className}`}
    >
      {children}
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-[var(--ease-glide)] group-hover/btn:translate-x-0.5 group-hover/btn:scale-105"
      >
        {glyph ?? '→'}
      </span>
    </button>
  )
}

/** A field label + control, spaced the same way everywhere. */
export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <Eyebrow>{label}</Eyebrow>
      {children}
      {hint && <span className="text-label-sm text-on-surface-variant">{hint}</span>}
    </label>
  )
}

export const inputClasses =
  'w-full rounded-xl border-0 bg-surface-low px-3.5 py-2.5 text-body-md text-on-surface ring-1 ring-black/8 transition-shadow duration-300 ease-[var(--ease-glide)] placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-secondary dark:bg-surface-container dark:ring-white/10'

/** A titled panel — the tray, with a header strip inside the plate. */
export function Panel({
  title,
  icon: Icon,
  aside,
  children,
  className = '',
  bodyClassName = 'p-5',
}: {
  title: string
  icon?: ComponentType<{ className?: string; width?: number; height?: number }>
  aside?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Card className={className} as="section">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-black/5 px-5 py-3.5 dark:border-white/8">
        <span className="flex items-center gap-2.5">
          {Icon && <Icon className="shrink-0 text-secondary" width={15} height={15} />}
          <Eyebrow className="text-on-surface">{title}</Eyebrow>
        </span>
        {aside}
      </header>
      <div className={bodyClassName}>{children}</div>
    </Card>
  )
}
