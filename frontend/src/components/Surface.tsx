import { useEffect, useId, useState } from 'react'
import { defaultNavLabel, useNavNames } from '../lib/navNames'
import { Chevron } from './Collapsible'
import { createPortal } from 'react-dom'
import type { ComponentPropsWithoutRef, ComponentType, ElementType, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { CheckIcon } from './icons'

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
      } transition-[transform,box-shadow] duration-300 ease-[var(--ease-glide)] ${
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
    <span className={`font-mono text-eyebrow text-on-surface-faint ${className}`}>
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
 * A dot that says yes, no or not sure — green, red, or a grey ring. Green
 * pulses like the live dot; the others hold still. Never the only signal:
 * whatever uses it says the same in a word beside it.
 */
export function StatusDot({ tone, className = '' }: { tone: 'green' | 'red' | 'grey'; className?: string }) {
  const look =
    tone === 'green'
      ? 'bg-accent-green pulse-live'
      : tone === 'red'
        ? 'bg-accent-red'
        : 'bg-transparent ring-[1.5px] ring-inset ring-on-surface-faint'
  return <span aria-hidden="true" className={`inline-block h-[9px] w-[9px] shrink-0 rounded-full ${look} ${className}`} />
}

/** The heading as the church calls the page. */
function useChurchPageName(title: string): string {
  const names = useNavNames()
  // The page's own address: a heading is drawn once per page, so the
  // address it is drawn at is the page it heads.
  const path = typeof window === 'undefined' ? '' : window.location.pathname
  if (path === '/' || !names[path] || !defaultNavLabel(path)) return title
  return names[path]
}

/**
 * A page's opening. Every page wears the same one, so moving between them
 * feels like one product rather than a set of screens.
 */
export function PageHeader({
  back,
  status,
  context,
  live,
  title,
  description,
  action,
}: {
  /** The way back to the page this one belongs to: a link, above the title. */
  back?: ReactNode
  /** Where this thing stands (a pill, a dot), above the title. */
  status?: ReactNode
  /**
   * A fact about what the page is showing just now — the day, the window,
   * whose answers — under the title. Not a name for the section: the
   * title is that.
   */
  context?: ReactNode
  /** Puts the live dot before the context. */
  live?: boolean
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  // A page the church has renamed (Settings › Menu) wears its new name at
  // its own address — Messages' "Message Board" included. The dashboard
  // keeps its greeting, and a page further in (a team, an item) its own.
  const shown = useChurchPageName(title)
  return (
    // `data-tour`: what the tour points at when a step is about the page itself.
    <header data-tour="page-title" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pb-5 sm:pb-7">
      <div className="max-w-2xl">
        {/* Nothing sits over the title to name the section (it used to: a
            small label in capitals, "CHURCH LIFE" over "Reception"). The
            title says where you are; a label above it said it twice, and
            is how a template opens a page. What may sit here is something
            to press or something true of this one thing: the way back,
            and where it stands. */}
        {back && <div className="text-label-md text-on-surface-variant">{back}</div>}
        {status && <div className={back ? 'mt-2' : ''}>{status}</div>}
        {/* Apple's Large Title, 34pt bold, on a phone as on a desk. */}
        <h1 className={`text-headline-xl ${back || status ? 'mt-2' : ''}`}>{shown}</h1>
        {context && (
          <p className="mt-1 flex items-center gap-2 font-mono text-label-sm text-on-surface-faint">
            {live && <LiveDot />}
            <span className="min-w-0">{context}</span>
          </p>
        )}
        {description && (
          <p className="mt-1.5 text-body-md text-on-surface-variant sm:text-body-lg">{description}</p>
        )}
      </div>
      {action}
    </header>
  )
}

/* ------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------ */

export type ButtonTone = 'primary' | 'quiet' | 'success' | 'success-quiet' | 'accent-quiet' | 'danger' | 'danger-quiet' | 'ghost'

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: 'bg-primary text-on-primary',
  quiet: 'bg-raised-strong text-on-surface hairline-strong',
  success: 'bg-accent-green text-accent-green-ink font-semibold',
  // The quiet button in a colour that says what kind of press it is, for a
  // list where each row has one of several (a registration: green lets
  // somebody in, blue records their money). Tinted, not filled: thirty rows
  // of filled buttons is thirty primaries on one screen.
  'success-quiet': 'bg-[color-mix(in_oklab,var(--color-accent-green)_16%,transparent)] text-accent-green-soft font-semibold hairline',
  'accent-quiet': 'bg-[color-mix(in_oklab,var(--color-accent-blue)_18%,transparent)] text-accent-blue-soft font-semibold hairline',
  danger: 'bg-error text-on-error',
  // Removing one row of a list is not the same act as erasing the app, and
  // a filled red button in a row of five says it is. This is the quiet
  // button wearing the error colour: the same shape as its neighbours,
  // reading as the one that takes something away.
  'danger-quiet': 'bg-raised-strong text-accent-red-soft hairline-strong',
  ghost: 'text-on-surface-variant hover:text-on-surface',
}

/** A button's look, for the two things that wear it: a `<button>` and a link that is one. */
function buttonClasses(tone: ButtonTone, size: 'sm' | 'md', className: string): string {
  // A small button is 32px tall, which a cursor hits and a thumb misses.
  // `tap` gives it the touch floor without changing how it looks on a
  // desktop; the medium size already clears it.
  const sizing = size === 'sm' ? 'tap px-3.5 py-1.5 text-label-md font-semibold' : 'px-5 py-3 text-body-sm font-semibold'
  return `inline-flex items-center justify-center gap-2 rounded-full transition-[transform,background-color,color,box-shadow,opacity] duration-200 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms] disabled:opacity-50 disabled:active:scale-100 ${BUTTON_TONES[tone]} ${sizing} ${className}`
}

/**
 * A link that is a button: somewhere to go, drawn as the pill a button
 * is. For a way out of the app (a ticket's own page, a receipt) that
 * stands beside buttons and should not read as a word in a sentence.
 * `newTab` opens it beside the app and says so with the arrow.
 */
export function ActionLink<C extends ElementType = 'a'>({
  as,
  children,
  tone = 'quiet',
  size = 'md',
  newTab = false,
  className = '',
  ...rest
}: {
  /**
   * What to draw it as, when a plain `<a href>` would leave the app: a
   * router's `Link`, with its own `to`. Surface.tsx knows no router.
   */
  as?: C
  children: ReactNode
  tone?: ButtonTone
  size?: 'sm' | 'md'
  newTab?: boolean
  className?: string
} & Omit<ComponentPropsWithoutRef<C>, 'as' | 'children' | 'className'>) {
  const Tag: ElementType = as ?? 'a'
  return (
    <Tag className={buttonClasses(tone, size, className)} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>
      {children}
      {newTab && <span aria-hidden="true">↗</span>}
    </Tag>
  )
}

/**
 * Every button in the app is a pill. Size is the only thing that changes
 * with importance — never the shape, and never more than one primary on a
 * screen. The label is semibold, as a button's is on the platform; and
 * the press is felt the moment it lands (the button sinks in 80ms) and
 * eases back over 200 once it lifts — the one transition is for the way
 * out, never a wait on the way in.
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
  'aria-expanded': ariaExpanded,
  'aria-controls': ariaControls,
  'data-tour': dataTour,
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
  /** For a button that opens something: a disclosure is still a button. */
  'aria-expanded'?: boolean
  'aria-controls'?: string
  /** What the tour calls this button, when it points at it (components/Tour). */
  'data-tour'?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      data-tour={dataTour}
      className={buttonClasses(tone, size, className)}
    >
      {/* Wrapped, because a text glyph ("+") beside text children would
          merge with them into one flex item and the gap would never land:
          "+Add a tag". */}
      {glyph != null && (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {glyph}
        </span>
      )}
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
  green: 'bg-[color-mix(in_oklab,var(--color-accent-green)_16%,transparent)] text-accent-green-soft',
  orange: 'bg-[color-mix(in_oklab,var(--color-accent-orange)_16%,transparent)] text-accent-orange-soft',
  red: 'bg-[color-mix(in_oklab,var(--color-accent-red)_16%,transparent)] text-accent-red-soft',
  indigo: 'bg-[color-mix(in_oklab,var(--color-accent-indigo)_20%,transparent)] text-accent-indigo-soft',
  solid: 'bg-on-surface text-background',
}

/**
 * A status, a tag, a count. Always mono, because a pill is read as a
 * label rather than as prose — and because that is what stops it
 * competing with the sentence beside it. In the words' own case: it was
 * set in capitals with wide tracking until November 2026, when the Owner
 * had the app's labels and pills put in sentence case; a pill is 12px
 * now, a step up from the 11 that capitals could carry.
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
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[0.75rem] font-medium leading-none ${PILL_TONES[tone]} ${className}`}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Steps
 * ------------------------------------------------------------------ */

export interface StepItem {
  key: string
  label: string
  state: 'done' | 'current' | 'todo'
}

/**
 * A few steps in a row, joined by a line: which are done, which one it is
 * now, which are still ahead. For a short path somebody walks once (a
 * registration: Register → Pay → Receipt → Ticket) — not a count, which is
 * a `Statistic`, nor a share of something, which is a `StackedBar`.
 *
 * Nothing is said by colour alone: a done step wears a tick and is read
 * out as done, the current one is `aria-current="step"`, bold, and
 * repeated in words by `caption`. Two to five steps; the labels are one
 * word each so four fit a 360px phone.
 */
export function Steps({ steps, caption, label = 'Progress', className = '' }: { steps: StepItem[]; caption?: ReactNode; label?: string; className?: string }) {
  return (
    <div className={className}>
      <ol aria-label={label} className="flex">
        {steps.map((step, i) => (
          <li key={step.key} aria-current={step.state === 'current' ? 'step' : undefined} className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
            {/* The line in from the step before: filled once this one is reached. */}
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`absolute left-[-50%] right-[50%] top-4 h-0.5 -translate-y-1/2 ${step.state === 'todo' ? 'bg-track' : 'bg-accent-green'}`}
              />
            )}
            <span
              aria-hidden="true"
              className={`relative flex h-8 w-8 items-center justify-center rounded-full font-mono text-label-md font-semibold ${
                step.state === 'done'
                  ? 'bg-accent-green text-accent-green-ink'
                  : step.state === 'current'
                    ? 'bg-primary text-on-primary shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-primary)_22%,transparent)]'
                    : 'bg-surface-lowest text-on-surface-faint hairline'
              }`}
            >
              {step.state === 'done' ? <CheckIcon aria-hidden="true" width={14} height={14} /> : i + 1}
            </span>
            <span
              className={`max-w-full px-0.5 text-label-md [overflow-wrap:anywhere] ${
                step.state === 'current' ? 'font-semibold text-on-surface' : step.state === 'done' ? 'text-on-surface-variant' : 'text-on-surface-faint'
              }`}
            >
              {step.label}
              <span className="sr-only">{step.state === 'done' ? ' — done' : step.state === 'current' ? ' — current step' : ' — still to do'}</span>
            </span>
          </li>
        ))}
      </ol>
      {caption && <p className="mt-3 text-body-sm font-medium text-on-surface">{caption}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Segmented control
 * ------------------------------------------------------------------ */

/** The track every segmented control sits in: the system's grey, 2px in. */
const segmentTrackBase = 'grid grid-flow-col gap-0.5 rounded-[9px] bg-track p-0.5'
export const segmentTrackClasses = `${segmentTrackBase} auto-cols-[minmax(0,1fr)]`
/**
 * A track with more to choose from than one line of a phone holds: the
 * segments keep the width of their labels and go on to a second line. It
 * hugs what it holds, so on a wide screen it is a short row and not a bar
 * stretched across the page. (It scrolled sideways once: nothing was cut,
 * and half the choices were out of sight until somebody thought to drag.)
 */
const segmentWrapTrackClasses = 'flex w-fit max-w-full flex-wrap gap-0.5 rounded-[9px] bg-track p-0.5'

/**
 * One segment. The chosen one is a raised plate — white on light, the
 * system's grey on dark — with a semibold label; the rest are plain text.
 * The label is 13pt, the system's size for a segmented control, which is
 * also what lets four of them share a phone's width. `tone` colours the
 * label of a chosen segment whose answer carries a meaning of its own
 * (Yes is green, No is red), and only then.
 *
 * A row of tabs — one that switches which part of a page is shown, not an
 * answer in a form — marks where you are in the blue the dock uses for
 * the current page: `look: 'tab'`. White on that blue is 4.7:1 in both
 * themes; the label is semibold to match the dock.
 */
export function segmentClasses(on: boolean, tone?: SegmentTone, padding = 'px-3', look: 'plate' | 'tab' = 'plate') {
  const chosen =
    look === 'tab'
      ? 'bg-primary font-semibold text-on-primary shadow-[0_3px_8px_rgb(0_0_0/0.16),0_3px_1px_rgb(0_0_0/0.04)]'
      : `bg-segment font-semibold shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)] ${tone ? SEGMENT_TONES[tone] : 'text-on-surface'}`
  return `flex min-h-8 min-w-6 items-center justify-center gap-1.5 truncate rounded-[7px] ${padding} text-[0.8125rem] leading-[1.125rem] font-medium transition-[background-color,color,box-shadow,opacity] duration-200 ease-[var(--ease-glide)] active:opacity-60 active:duration-0 disabled:opacity-50 ${
    on ? chosen : 'text-on-surface-variant hover:text-on-surface'
  }`
}

export type SegmentTone = 'green' | 'orange' | 'red' | 'blue'

const SEGMENT_TONES: Record<SegmentTone, string> = {
  green: 'text-segment-ink-green',
  orange: 'text-segment-ink-orange',
  red: 'text-segment-ink-red',
  blue: 'text-segment-ink-blue',
}

/** The meaning of a chosen answer, as a dot beside its word: the word's own colour is not enough on a dark plate. */
const SEGMENT_DOTS: Record<SegmentTone, string> = {
  green: 'bg-accent-green',
  orange: 'bg-accent-orange',
  red: 'bg-accent-red',
  blue: 'bg-accent-blue',
}

/**
 * A choice between a few answers, as one object with the chosen answer
 * standing up out of it — Apple's segmented control. Segments share the
 * width equally, the labels are nouns, two to five of them.
 *
 * `kind` is what the choice means to a screen reader: `radio` sets a
 * value, `tab` switches what is shown, `pressed` is a filter that can be
 * read as a set of toggles. The look is the same, except that the chosen
 * tab is blue rather than a grey plate.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  kind = 'radio',
  disabled,
  wraps = false,
  className = '',
}: {
  label: string
  value: T | null
  onChange: (next: T) => void
  options: { value: T; label: ReactNode; title?: string; tone?: SegmentTone; disabled?: boolean }[]
  kind?: 'radio' | 'tab' | 'pressed'
  disabled?: boolean
  /**
   * More segments than a phone can hold in a line: each keeps the width
   * of its label and the row wraps, so every choice is in sight. Without
   * it, five or more segments on a phone share the width and truncate.
   */
  wraps?: boolean
  className?: string
}) {
  const groupRole = kind === 'radio' ? 'radiogroup' : kind === 'tab' ? 'tablist' : 'group'
  // Four or five segments share a phone's width: the labels keep their size
  // and give up some of their room instead.
  const padding = wraps ? 'flex-none px-3' : options.length >= 4 ? 'px-1.5' : 'px-3'
  // Five equal shares of a phone are narrower than "By person": there each
  // segment takes what its label needs, and the short ones give up the room.
  // Not a track that wraps: that one is as wide as its labels already, and
  // squeezing it back into shares is what once cut every label on the
  // registrations filter ("To pay", "Receipt:o verify").
  const shares = !wraps && options.length >= 5 ? 'max-[420px]:w-full max-[420px]:auto-cols-[minmax(0,auto)]' : ''
  return (
    <div role={groupRole} aria-label={label} className={`${wraps ? segmentWrapTrackClasses : segmentTrackClasses} ${shares} ${className}`}>
      {options.map((o) => {
        const on = o.value === value
        const state =
          kind === 'radio'
            ? { role: 'radio', 'aria-checked': on }
            : kind === 'tab'
              ? { role: 'tab', 'aria-selected': on }
              : { 'aria-pressed': on }
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            className={segmentClasses(on, o.tone, padding, kind === 'tab' ? 'tab' : 'plate')}
            {...state}
          >
            {on && o.tone && <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEGMENT_DOTS[o.tone]}`} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Tables
 * ------------------------------------------------------------------ */

/**
 * The box a table scrolls in when it is wider than its card, or might be:
 * sideways for the columns a phone cannot hold, and up and down inside a
 * height of its own, so that its column headings can stay at the top
 * (`HEAD_IN_BOX`, lib/stickyHead.ts — which says when to use this and when
 * the page itself should scroll the table).
 *
 * A table shorter than the box is not changed by it. A sideways drag that
 * runs out stays in the box (it would otherwise go back a page); an up or
 * down one carries on into the page, so the box never traps a thumb.
 *
 * `isolate`: the pinned headings stand above the rows *inside the box*.
 * Without it their place in the stack is the page's, level with the app's
 * top strip, and as the page carried the box up under that strip the
 * headings were drawn across the search field.
 */
export function TableScroll({
  children,
  className = '',
  label = 'Table',
}: {
  children: ReactNode
  className?: string
  /** What the box holds, for a screen reader landing on it. */
  label?: string
}) {
  // Focusable, so a keyboard can scroll what a mouse wheel or a finger can.
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={label}
      className={`relative isolate max-h-[70svh] overflow-auto overscroll-x-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ${className}`}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Icon badges
 * ------------------------------------------------------------------ */

export type BadgeTone = 'blue' | 'green' | 'orange' | 'red' | 'indigo' | 'neutral'

const BADGE_TONES: Record<BadgeTone, string> = {
  blue: 'bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-accent-blue)_34%,transparent),color-mix(in_oklab,var(--color-accent-blue)_12%,transparent))] text-accent-blue-soft',
  green: 'bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-accent-green)_30%,transparent),color-mix(in_oklab,var(--color-accent-green)_10%,transparent))] text-accent-green-soft',
  orange: 'bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-accent-orange)_32%,transparent),color-mix(in_oklab,var(--color-accent-orange)_10%,transparent))] text-accent-orange-soft',
  red: 'bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-accent-red)_32%,transparent),color-mix(in_oklab,var(--color-accent-red)_10%,transparent))] text-accent-red-soft',
  indigo: 'bg-[linear-gradient(145deg,color-mix(in_oklab,var(--color-accent-indigo)_36%,transparent),color-mix(in_oklab,var(--color-accent-indigo)_12%,transparent))] text-accent-indigo-soft',
  // For the thing that is none of the above: present, and saying nothing.
  neutral: 'bg-raised-strong text-on-surface-variant',
}

/**
 * A glyph on a small tinted square: what lets a list of places be read by
 * shape and colour before a word of it is. Each tone keeps the meaning it
 * has everywhere else — red is the one that destroys things.
 */
export function IconBadge({
  icon: Icon,
  tone = 'blue',
  size = 'md',
  className = '',
}: {
  icon: ComponentType<{ className?: string; width?: number; height?: number }>
  tone?: BadgeTone
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const box = size === 'sm' ? 'h-7 w-7 rounded-[9px]' : size === 'lg' ? 'h-12 w-12 rounded-[15px]' : 'h-9 w-9 rounded-[11px]'
  const glyph = size === 'sm' ? 15 : size === 'lg' ? 24 : 18
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center hairline ${box} ${BADGE_TONES[tone]} ${className}`}
    >
      <Icon width={glyph} height={glyph} />
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
  stack = false,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode
  variant?: 'raised' | 'inset' | 'dashed' | 'bare'
  /** The row's content runs down rather than across: a title line, then
   *  what is attached to it. The surface and its padding do not change. */
  stack?: boolean
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
    <Tag
      className={`flex ${stack ? 'flex-col items-stretch gap-2' : 'items-center gap-3'} ${
        variants[variant]
      } ${className}`}
    >
      {children}
    </Tag>
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

/**
 * One titled block of a settings room: a heading, a single line saying
 * what it is for, and the controls. A room is a stack of these, so every
 * room reads the same way — and a block that needs a paragraph to explain
 * itself puts the paragraph behind a disclosure, not above the controls.
 */
export function SectionTile({
  title,
  hint,
  aside,
  children,
  id,
  tone = 'plain',
  className = '',
  collapsible = false,
  defaultOpen = true,
}: {
  title: ReactNode
  hint?: ReactNode
  aside?: ReactNode
  children: ReactNode
  id?: string
  tone?: TileTone
  className?: string
  /**
   * The heading opens and shuts the block. The hint stays in view when it
   * is shut, so it should say what is inside — a count, a date, a state —
   * and the body is not drawn at all until it is opened.
   */
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()
  const shown = !collapsible || open
  const heading = (
    <>
      <h2 className="text-body-lg font-semibold text-on-surface">{title}</h2>
      {hint && <p className="mt-0.5 text-body-sm text-on-surface-variant">{hint}</p>}
    </>
  )
  return (
    <Tile as="section" tone={tone} className={`scroll-mt-24 ${className}`}>
      <div id={id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((o) => !o)}
            className="tap -m-2 flex min-w-0 flex-1 items-start gap-3 rounded-[var(--radius-row)] p-2 text-left"
          >
            <span className="min-w-0 flex-1">{heading}</span>
            <span className="mt-0.5 text-body-lg">
              <Chevron open={open} />
            </span>
          </button>
        ) : (
          <div className="min-w-0 flex-1">{heading}</div>
        )}
        {shown && aside}
      </div>
      {shown && (
        <div id={bodyId} className="mt-5">
          {children}
        </div>
      )}
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
 * A tile's figure that is never wider than its tile.
 *
 * `text-numeral` is one size, and a figure is as long as it is: £180.00
 * sat in a quarter-width tile where £1255.00 ran out of it and under the
 * next (a tablet with four tiles in a row; a 320px phone with two). A
 * step smaller "on a phone" fixed one width for one length of sum.
 *
 * So the size is worked out from the tile's own width and how long the
 * figure is: each character is about 0.62em wide, so a figure of n
 * characters can be at most 160/n hundredths of the tile's width a
 * character — and never bigger than a tile's figure is anyway. The tile
 * is the container: give it `@container` (and `min-w-0`, in a grid).
 * Use it as a `Statistic`'s value.
 *
 * `chars` sizes it as if it were that long: two sums side by side, one a
 * character longer than the other, are given the longer one's length so
 * they come out the same size and not a point apart.
 */
export function FitFigure({ children, chars }: { children: string | number; chars?: number }) {
  const text = String(children)
  const most = Math.floor(1600 / Math.max(text.length, chars ?? 0, 1)) / 10
  return (
    <span className="block whitespace-nowrap leading-tight" style={{ fontSize: `min(var(--text-numeral), ${most}cqi)` }}>
      {text}
    </span>
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
              className={`${s.className} transition-[width] duration-300 ease-[var(--ease-glide)]`}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Overlays
 * ------------------------------------------------------------------ */

/**
 * Anything that covers the page: a sheet, a confirmation, a picker.
 *
 * It renders into `document.body` rather than where it is written, because
 * `position: fixed` is measured against the nearest ancestor carrying a
 * transform — and an interactive Tile lifts by 2px on hover, which is
 * enough to trap a dialog inside the card that opened it.
 *
 * `align` decides where it rests: `center` for a confirmation, `sheet` for
 * something dragged up from the bottom edge of a phone.
 */
/*
 * How many overlays are open, so nesting cannot unlock the page early.
 *
 * The first one to open locks the body and remembers where the page was;
 * the last one to close puts it back. Without the count, a dialog opened
 * from inside another would restore the scroll position on its own way
 * out and leave the page underneath moving again with a modal still up.
 */
let openOverlays = 0
let lockedScrollY = 0

function lockPageScroll() {
  openOverlays += 1
  if (openOverlays > 1) return
  lockedScrollY = window.scrollY
  const { body, documentElement } = document
  // The width the scrollbar was taking, so locking does not let the page
  // jump sideways on a desktop as it disappears.
  const gutter = window.innerWidth - documentElement.clientWidth
  body.style.position = 'fixed'
  body.style.top = `-${lockedScrollY}px`
  body.style.left = '0'
  body.style.right = '0'
  if (gutter > 0) body.style.paddingRight = `${gutter}px`
}

function unlockPageScroll() {
  openOverlays = Math.max(0, openOverlays - 1)
  if (openOverlays > 0) return
  const { body } = document
  body.style.position = ''
  body.style.top = ''
  body.style.left = ''
  body.style.right = ''
  body.style.paddingRight = ''
  // `position: fixed` threw the page back to the top; put it where it was.
  // Only when there is somewhere to go back to — a modal opened at the top
  // of a page needs no restoring, and jsdom has no scrollTo to call.
  if (lockedScrollY > 0) window.scrollTo(0, lockedScrollY)
}

export function Overlay({
  children,
  onDismiss,
  label,
  align = 'center',
  closable = true,
}: {
  children: ReactNode
  onDismiss: () => void
  label: string
  align?: 'center' | 'sheet'
  /** Off for a dialog that must be answered rather than waved away. */
  closable?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  /*
   * Hold the page still underneath.
   *
   * Without this a drag anywhere on the overlay scrolled the page behind
   * it instead of the dialog — on a phone, where a long form is exactly
   * the thing you have to drag through, that made the form unusable.
   * `overflow: hidden` on the body is not enough on iOS; taking the body
   * out of flow at its current offset is what actually holds.
   */
  useEffect(() => {
    lockPageScroll()
    return unlockPageScroll
  }, [])

  // Dismissing on a click outside the dialog, on either of the two
  // wrappers below — whichever the click actually landed on.
  const dismissIfOutside = (e: ReactMouseEvent) => {
    if (e.target === e.currentTarget) onDismiss()
  }

  return createPortal(
    /*
     * Two elements on purpose. The outer one scrolls; the inner one
     * centres. Centring and scrolling on the same element is the old
     * flexbox trap: `items-center` with content taller than the viewport
     * pushes both ends outside the scrollable area, so the top of a long
     * form cannot be reached at all. With the scroll on the outside and a
     * `min-h-full` flex row within, a short dialog still sits in the
     * middle and a tall one simply makes the overlay scroll.
     */
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={dismissIfOutside}
      className="overlay-scrim fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/55"
    >
      {/* The dialog grows into place, a sheet rises from the bottom edge —
          the keyframes in index.css — on the wrapper rather than the
          child, so every dialog arrives the same way without knowing. */}
      <div
        onClick={dismissIfOutside}
        className={`flex min-h-full justify-center ${
          align === 'sheet' ? 'overlay-sheet items-end sm:items-center sm:p-4' : 'overlay-dialog items-center p-4'
        }`}
      >
        {children}
      </div>

      {/*
        A way out that is always on screen.
        
        Tapping the backdrop is the usual one, and on a phone there is
        often no backdrop left to tap: a long form fills the width and
        runs past both ends of the screen, so every point on the glass
        belongs to the dialog. Escape is no help without a keyboard. This
        sits above the dialog, pinned to the corner of the window rather
        than to the top of a form that may have scrolled away, and clear
        of the notch.
      */}
      {closable && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          className="tap glass fixed right-3 z-10 flex h-10 w-10 items-center justify-center rounded-full text-on-surface shadow-[var(--shadow-lifted)] ring-1 ring-black/10 dark:ring-white/15"
          style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="m6 6 12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>,
    document.body,
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

/**
 * Field's look for a group that holds its own checkboxes or radios: Field
 * is a <label>, and one wrapped round them would toggle the first of them
 * whenever its heading was tapped.
 */
export function FieldGroup({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className={`flex flex-col gap-2 ${className}`}>
      <Eyebrow>{label}</Eyebrow>
      {children}
    </div>
  )
}

export const inputClasses =
  'w-full rounded-[var(--radius-chip)] border-0 bg-raised px-4 py-3 text-body-md text-on-surface hairline transition-shadow duration-200 ease-[var(--ease-glide)] placeholder:text-on-surface-faint focus:outline-none focus:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]'

/** A field that opens a sheet (a date, a time): an input's look, laid out as a button. */
export const fieldTriggerClasses = `${inputClasses} flex items-center justify-between gap-3 text-left disabled:opacity-60`
