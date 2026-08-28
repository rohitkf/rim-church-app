import { useEffect, useRef, useState } from 'react'
import { DEFAULT_DEPT_COLOR } from '../lib/deptBadge'
import { Overlay } from './Surface'
import { normaliseHex, swatchesFor, teamColorName } from '../lib/teamColors'
import { teamAvatarStyle, teamWash } from '../lib/teamGradient'
import { inkOn } from '../lib/teamGradient'
import { useTeamStyle } from '../lib/useTeamStyle'

function CheckGlyph({ ink }: { ink: string }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 m-auto"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={ink}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  )
}

/**
 * Picking a team's colour, without the operating system's colour dialog.
 *
 * The native picker offers sixteen million colours, of which only a couple
 * of dozen stay legible as a tint behind two letters — so this offers the
 * palette instead, previews the result on the team's own tile, and only
 * commits when the admin says so.
 */
export function TeamColorSheet({
  teamName,
  current,
  saving,
  error,
  onSave,
  onClose,
}: {
  teamName: string
  current: string | null
  saving: boolean
  error: string | null
  onSave: (hex: string) => void
  onClose: () => void
}) {
  const start = normaliseHex(current) ?? DEFAULT_DEPT_COLOR
  const [chosen, setChosen] = useState(start)
  const closeRef = useRef<HTMLButtonElement>(null)
  const { teamStyle } = useTeamStyle()
  const swatches = swatchesFor(current)
  const initials = teamName.slice(0, 2).toUpperCase()
  const tint = (hex: string, pct: number) => `color-mix(in oklab, ${hex} ${pct}%, transparent)`

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <Overlay label={`Colour for ${teamName}`} onDismiss={onClose} align="sheet">
      <div className="w-full max-w-md rounded-t-[var(--radius-tile)] bg-surface-low px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--shadow-lifted)] hairline-strong sm:rounded-[var(--radius-tile)] sm:pb-6">
        {/* The grab handle: this sheet is dragged up from the bottom on a
            phone, and nothing else on the page looks like this. */}
        <div className="mx-auto mb-4 h-[5px] w-[38px] rounded-full bg-white/22 sm:hidden" />

        <div className="flex items-center gap-3.5">
          <span
            className="flex h-13 w-13 shrink-0 items-center justify-center rounded-[18px] font-mono text-label-md uppercase transition-colors duration-300 ease-[var(--ease-glide)]"
            style={teamAvatarStyle(chosen, teamStyle)}
            aria-hidden="true"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="text-eyebrow text-on-surface-faint">Team colour</p>
            <h2 className="mt-1 truncate text-headline-md">{teamName}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-raised-strong text-on-surface-variant transition-colors duration-300 ease-[var(--ease-glide)] hover:text-on-surface"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-6 gap-2" role="radiogroup" aria-label="Team colour">
          {swatches.map((swatch) => {
            const selected = swatch.hex === chosen
            return (
              <button
                key={swatch.hex}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={swatch.name}
                title={swatch.name}
                onClick={() => setChosen(swatch.hex)}
                className="relative aspect-square rounded-[var(--radius-chip)] transition-transform duration-500 ease-[var(--ease-glide)] active:scale-95"
                style={{
                  backgroundColor: swatch.hex,
                  // The ring is drawn outside a gap of the sheet's own
                  // colour, so a swatch reads as selected even when it is
                  // nearly the colour beside it.
                  boxShadow: selected
                    ? `0 0 0 3px var(--color-surface-low), 0 0 0 5px ${swatch.hex}`
                    : undefined,
                }}
              >
                {selected && <CheckGlyph ink={inkOn(swatch.hex)} />}
              </button>
            )
          })}
        </div>

        {/* The preview shows the colour the way the app is currently set to
            draw teams, so a wash is chosen against a wash. */}
        <div
          className="mt-5 flex items-center gap-3.5 rounded-[var(--radius-panel)] bg-raised px-4 py-3.5 hairline"
          style={teamWash(chosen, teamStyle)}
        >
          <span
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] font-mono text-label-sm uppercase transition-colors duration-300 ease-[var(--ease-glide)]"
            style={teamAvatarStyle(chosen, teamStyle)}
            aria-hidden="true"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="text-label-md">Preview</p>
            <p className="mt-0.5 font-mono text-[11px] leading-4 text-on-surface-faint">
              {teamColorName(chosen)} · used on tiles, rota &amp; checklists
            </p>
          </div>
          <span
            className="ml-auto shrink-0 rounded-full px-2.5 py-1.5 font-mono text-[10px] tracking-[0.12em] transition-colors duration-300 ease-[var(--ease-glide)]"
            style={{ backgroundColor: tint(chosen, 16), color: chosen }}
          >
            {chosen}
          </span>
        </div>

        {error && (
          <p className="mt-4 rounded-[var(--radius-chip)] bg-error-container px-3 py-2 text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => onSave(chosen)}
          disabled={saving}
          className="mt-4 flex h-13 w-full items-center justify-center rounded-full bg-primary text-body-lg font-semibold text-on-primary transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
        >
          {saving ? 'Saving…' : 'Set colour'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 flex h-12 w-full items-center justify-center rounded-full text-body-md text-on-surface-variant transition-colors duration-300 ease-[var(--ease-glide)] hover:text-on-surface"
        >
          Cancel
        </button>
      </div>
    </Overlay>
  )
}
