import type { ComponentType, ReactNode } from 'react'

/**
 * The design system's primitives.
 *
 * Everything on a screen is one of five things: a Tile (content sitting on
 * the canvas), a Panel (a Tile with a titled header), a Row (a line inside
 * a Tile), a Pill (a status or a tag) or a Button. Pages compose these and
 * choose no colours of their own — which is what stops the tenth screen
 * from being the one that quietly invents a sixth grey.
 *
 * See DESIGN.md for the rules these encode.
 */

/* ------------------------------------------------------------------ *
 * Tile
 * ------------------------------------------------------------------ */

export type TileTone = 'plain' | 'accent' | 'warning' | 'danger' | 'success'

const TILE_TONES: Record<TileTone, string> = {
  // A hairline of light along the inside edge, not a border: the edge has
  // to read as the tile catching light, not as a line drawn around it.
  plain: 'bg-surface-lowest hairline',
  // A tone tile is the same tile with its own colour bled in from the top
  // left, so a hero or an alert lifts without becoming a coloured box.
  accent:
    'bg-[linear-gradient(155deg,color-mix(in_oklab,var(--color-accent-blue)_22%,transparent),var(--color-surface-lowest)_58%)] hairline-strong',
  warning: 'bg-[color-mix(in_oklab,var(--color-accent-orange)_9%,var(--color-surface-lowest))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-orange)_26%,transparent)]',
  danger: 'bg-[color-mix(in_oklab,var(--color-accent-red)_9%,var(--color-surface-lowest))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-red)_26%,transparent)]',
  success: 'bg-[color-mix(in_oklab,var(--color-accent-green)_9%,var(--color-surface-lowest))] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-accent-green)_26%,transparent)]',
}

export function Tile({
  children,
  className = '',
  tone = 'plain',
  interactive = false,
  padded = true,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  tone?: TileTone
  interactive?: boolean
  /** Off when the tile holds its own header/body structure. */
  padded?: boolean
  as?: 'div' | 'li' | 'section' | 'article'
}) {
  return (
    <Tag
      className={`group/tile rounded-[var(--radius-tile)] ${TILE_TONES[tone]} ${
        padded ? 'p-6 sm:p-7' : ''
      } transition-[transform,box-shadow] duration-500 ease-[var(--ease-glide)] ${
        interactive
          ? 'shadow-[var(--shadow-ambient)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lifted)] active:translate-y-0'
          : ''
      } ${className}`}
    >
      {children}
    </Tag>
  )
}

/**
 * A Card is a Tile that leaves its own padding to whatever is inside it —
 * the shape older pages were written against, kept so they stay correct
 * while they move over one at a time.
 */
export function Card(props: Parameters<typeof Tile>[0]) {
  return <Tile padded={false} {...props} />
}

/* ------------------------------------------------------------------ *
 * Labels and headers
 * ------------------------------------------------------------------ */

/** The mono micro-label above a heading or a number. */
export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-mono text-eyebrow uppercase text-on-surface-faint ${className}`}>
      {children}
    </span>
  )
}

/** The green dot that means "this is happening now". */
export function LiveDot({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-accent-green pulse-live ${className}`}
    />
  )
}

/**
 * A page's opening. Every page wears the same one, so moving between them
 * feels like one product rather than a set of screens.
 */
export function PageHeader({
  eyebrow,
  live,
  title,
  description,
  action,
}: {
  eyebrow?: ReactNode
  /** Puts the live dot before the eyebrow. */
  live?: boolean
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-7">
      <div className="max-w-2xl">
        {eyebrow && (
          <span className="flex items-center gap-2.5">
            {live && <LiveDot />}
            <Eyebrow>{eyebrow}</Eyebrow>
          </span>
        )}
        <h1 className="mt-2 text-headline-xl">{title}</h1>
        {description && <p className="mt-1.5 text-body-lg text-on-surface-variant">{description}</p>}
      </div>
      {action}
    </header>
  )
}

/* ------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------ */

export type ButtonTone = 'primary' | 'quiet' | 'success' | 'danger' | 'ghost'

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: 'bg-primary text-on-primary',
  quiet: 'bg-raised-strong text-on-surface hairline-strong',
  success: 'bg-accent-green text-accent-green-ink font-semibold',
  danger: 'bg-error text-on-error',
  ghost: 'text-on-surface-variant hover:text-on-surface',
}

/**
 * Every button in the app is a pill. Size is the only thing that changes
 * with importance — never the shape, and never more than one primary on a
 * screen.
 */
export function ActionButton({
  children,
  glyph,
  onClick,
  type = 'button',
  disabled,
  tone = 'primary',
  size = 'md',
  className = '',
  title,
  'aria-label': ariaLabel,
}: {
  children: ReactNode
  glyph?: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  tone?: ButtonTone
  size?: 'sm' | 'md'
  className?: string
  title?: string
  'aria-label'?: string
}) {
  const sizing = size === 'sm' ? 'px-3.5 py-1.5 text-label-md' : 'px-5 py-3 text-body-sm font-medium'

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center gap-2 rounded-full transition-all duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${BUTTON_TONES[tone]} ${sizing} ${className}`}
    >
      {glyph}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Pills
 * ------------------------------------------------------------------ */

export type PillTone = 'neutral' | 'blue' | 'green' | 'orange' | 'red' | 'indigo' | 'solid'

const PILL_TONES: Record<PillTone, string> = {
  neutral: 'bg-raised-strong text-on-surface-variant',
  blue: 'bg-[color-mix(in_oklab,var(--color-accent-blue)_18%,transparent)] text-accent-blue-soft',
  green: 'bg-[color-mix(in_oklab,var(--color-accent-green)_16%,transparent)] text-accent-green',
  orange: 'bg-[color-mix(in_oklab,var(--color-accent-orange)_16%,transparent)] text-accent-orange-soft',
  red: 'bg-[color-mix(in_oklab,var(--color-accent-red)_16%,transparent)] text-accent-red-soft',
  indigo: 'bg-[color-mix(in_oklab,var(--color-accent-indigo)_20%,transparent)] text-accent-indigo-soft',
  solid: 'bg-on-surface text-background',
}

/**
 * A status, a tag, a count. Always mono and uppercase, because a pill is
 * read as a label rather than as prose — and because that is what stops
 * it competing with the sentence beside it.
 */
export function Pill({
  children,
  tone = 'neutral',
  dot = false,
  className = '',
}: {
  children: ReactNode
  tone?: PillTone
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase leading-none tracking-[0.12em] ${PILL_TONES[tone]} ${className}`}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

/**
 * A line inside a tile: a role and its volunteer, an item and its status.
 * `inset` sinks it into the tile, `raised` lifts it — the two ways a list
 * can read without either needing a border.
 */
export function Row({
  children,
  variant = 'raised',
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode
  variant?: 'raised' | 'inset' | 'dashed' | 'bare'
  className?: string
  as?: 'div' | 'li'
}) {
  const variants = {
    raised: 'bg-raised rounded-[var(--radius-row)] px-4 py-3.5',
    inset: 'bg-inset rounded-[var(--radius-chip)] px-3.5 py-3',
    dashed:
      'rounded-[var(--radius-row)] border border-dashed border-outline-variant px-4 py-3.5 text-on-surface-faint',
    bare: 'border-b border-border-subtle py-3.5 last:border-0',
  }
  return (
    <Tag className={`flex items-center gap-3 ${variants[variant]} ${className}`}>{children}</Tag>
  )
}

/* ------------------------------------------------------------------ *
 * Panel
 * ------------------------------------------------------------------ */

/** A Tile with a titled header strip. */
export function Panel({
  title,
  icon: Icon,
  live,
  aside,
  children,
  tone = 'plain',
  className = '',
  bodyClassName = '',
}: {
  title: ReactNode
  icon?: ComponentType<{ className?: string; width?: number; height?: number }>
  live?: boolean
  aside?: ReactNode
  children: ReactNode
  tone?: TileTone
  className?: string
  bodyClassName?: string
}) {
  return (
    <Tile as="section" tone={tone} className={className}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <span className="flex items-center gap-2.5">
          {live && <LiveDot />}
          {Icon && <Icon className="shrink-0 text-on-surface-faint" width={14} height={14} />}
          <Eyebrow>{title}</Eyebrow>
        </span>
        {aside}
      </header>
      <div className={bodyClassName || 'mt-5'}>{children}</div>
    </Tile>
  )
}

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

/**
 * The headline figure of a tile: one big number, its unit beside it, and
 * nothing else competing. Numerals are tabular so a changing count doesn't
 * make the layout twitch.
 */
export function Statistic({
  value,
  unit,
  className = '',
}: {
  value: ReactNode
  unit?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${className}`}>
      <span className="text-numeral tabular">{value}</span>
      {unit && <span className="font-mono text-label-sm text-on-surface-faint">{unit}</span>}
    </div>
  )
}

/**
 * A segmented bar: parts of a whole, in the order they happen. Segments
 * that round to nothing are dropped rather than drawn as a sliver, which
 * would read as a value that isn't there.
 */
export function StackedBar({
  segments,
  height = 8,
  label,
}: {
  segments: { value: number; className: string; key: string }[]
  height?: number
  label?: string
}) {
  const total = segments.reduce((n, s) => n + s.value, 0)
  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      className="flex w-full overflow-hidden rounded-full bg-raised-strong"
      style={{ height }}
    >
      {total > 0 &&
        segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.key}
              className={`${s.className} transition-[width] duration-700 ease-[var(--ease-glide)]`}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Forms
 * ------------------------------------------------------------------ */

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
    <label className={`flex flex-col gap-2 ${className}`}>
      <Eyebrow>{label}</Eyebrow>
      {children}
      {hint && <span className="text-label-sm text-on-surface-faint">{hint}</span>}
    </label>
  )
}

export const inputClasses =
  'w-full rounded-[var(--radius-chip)] border-0 bg-raised px-4 py-3 text-body-md text-on-surface hairline transition-shadow duration-300 ease-[var(--ease-glide)] placeholder:text-on-surface-faint focus:outline-none focus:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]'
