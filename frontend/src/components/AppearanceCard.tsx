import type { ReactNode } from 'react'
import { useTheme } from '../lib/useTheme'
import { useTeamStyle } from '../lib/useTeamStyle'
import { THEME_CHOICES } from '../lib/theme'
import { TEAM_STYLE_CHOICES } from '../lib/teamStyle'
import { PushPermissionRow } from './PushPermission'
import { MoonIcon, SunIcon, BellIcon } from './icons'
import { Tile } from './Surface'

/**
 * How the app looks to you, and whether it may reach your phone.
 *
 * These lived only in the account menu (and as two unlabelled glyphs in
 * the top bar), which is where somebody who knows they exist finds them.
 * Somebody looking for "dark mode" opens Settings. Both places drive the
 * same shared preference, so they can never disagree.
 *
 * Nothing here is saved to the church: every choice is this browser's
 * own, and takes effect the moment it is tapped.
 */
export function AppearanceCard() {
  const { preference, choose } = useTheme()
  const { teamStyle, choose: chooseTeamStyle } = useTeamStyle()

  return (
    <div className="flex flex-col gap-4">
      <Setting
        title="Theme"
        hint="Auto follows your phone or computer, sunset and all."
        glyph={preference === 'light' ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
      >
        <Segmented
          label="Theme"
          value={preference}
          onChange={choose}
          options={THEME_CHOICES}
        />
      </Setting>

      <Setting
        title="Teams"
        hint="The same colours either way — a dot beside a name, or a wash across the row."
        glyph={
          <span className="flex gap-1" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-accent-blue" />
            <span className="h-2.5 w-4 rounded-full bg-[linear-gradient(90deg,var(--color-accent-indigo),transparent)]" />
          </span>
        }
      >
        <Segmented
          label="How teams are drawn"
          value={teamStyle}
          onChange={chooseTeamStyle}
          options={TEAM_STYLE_CHOICES}
        />
        <TeamPreview style={teamStyle} />
      </Setting>

      <Tile padded={false} className="overflow-hidden">
        <div className="flex items-start gap-3 px-5 pb-3 pt-5">
          <span className="mt-0.5 text-on-surface-variant" aria-hidden="true">
            <BellIcon width={18} height={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-body-md font-medium text-on-surface">Phone notifications</h2>
            <p className="mt-0.5 text-body-sm text-on-surface-variant">
              Rota changes, alerts and reminders, even while the app is closed. This device only.
            </p>
          </div>
        </div>
        <PushPermissionRow />
      </Tile>

      <p className="px-2 text-label-sm text-on-surface-faint">
        These are yours and this browser’s — nobody else’s screen changes.
      </p>
    </div>
  )
}

function Setting({
  title,
  hint,
  glyph,
  children,
}: {
  title: string
  hint: string
  glyph: ReactNode
  children: ReactNode
}) {
  return (
    <Tile as="section" padded={false} className="px-5 py-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-[18px] items-center text-on-surface-variant">{glyph}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-body-md font-medium text-on-surface">{title}</h2>
          <p className="mt-0.5 text-body-sm text-on-surface-variant">{hint}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </Tile>
  )
}

/**
 * A choice between a few answers, drawn as one object with the chosen
 * answer filled in — the shape DESIGN.md asks for, 44px tall for a thumb.
 */
function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (next: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-inset p-1 hairline">
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={`min-h-11 flex-1 rounded-full px-3 text-body-sm font-medium transition-colors duration-300 ${
              on ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** One rota row in each style, so the choice is made by looking. */
function TeamPreview({ style }: { style: 'dot' | 'gradient' }) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center gap-3 rounded-[var(--radius-row)] px-4 py-3 ${
        style === 'gradient'
          ? 'bg-[linear-gradient(90deg,color-mix(in_oklab,var(--color-accent-indigo)_32%,transparent),var(--color-raised)_70%)]'
          : 'bg-raised'
      }`}
    >
      {style === 'dot' && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-indigo" />}
      <span className="text-body-sm font-medium text-on-surface">Media</span>
      <span className="ml-auto font-mono text-label-sm text-on-surface-faint">Camera · Rohit</span>
    </div>
  )
}
