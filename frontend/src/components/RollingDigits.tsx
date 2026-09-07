import { useEffect, useRef, useState } from 'react'

/**
 * A clock whose digits roll rather than blink.
 *
 * A countdown that replaces "42" with "41" tells you the number and
 * nothing else. One that rolls tells you it is *running* — the movement
 * is the information, which is why every station board and every petrol
 * pump has worked this way since long before anybody had a screen.
 *
 * Each digit is a strip of ten, ten characters tall, shifted so the one
 * you want sits in the window. The strip is doubled — 0-9 twice — for the
 * one property that makes it read as a mechanism rather than a slider:
 * it only ever moves one way. A seconds column counting 1, 0, 9 would
 * otherwise spin backwards through eight digits to reach the nine, which
 * looks like a mistake being corrected. Rolling forward past the seam and
 * silently stepping back a lap afterwards keeps it turning like a wheel.
 *
 * The face carries a seam across the middle and shade at both edges, so a
 * digit arrives out of the dark and leaves into it — the flap of a
 * split-flap board, drawn rather than hinged.
 */

/** Long enough to see it turn, short enough not to be waiting for it. */
const ROLL_MS = 420

function Digit({ value, tall }: { value: number; tall: boolean }) {
  // Which of the twenty rows is in the window. Only ever counts up, and
  // steps back a lap once the roll has finished and nobody is looking.
  const [row, setRow] = useState(value)
  const [animate, setAnimate] = useState(true)
  const previous = useRef(value)

  useEffect(() => {
    if (previous.current === value) return
    previous.current = value

    setRow((current) => {
      // How far down the strip the digit we want is from here. Never
      // zero: the value changed, so the digit did — a full lap rather
      // than standing still.
      const forward = (value - (current % 10) + 10) % 10 || 10
      return current + forward
    })
  }, [value])

  // Once a roll has crossed the seam, step back a lap — same digit, no
  // transition, nothing to see — so the strip always has room ahead of it.
  useEffect(() => {
    if (row < 10) return
    const id = window.setTimeout(() => {
      setAnimate(false)
      setRow((current) => current - 10)
      // Two frames: one for the jump to paint, one before movement is
      // allowed again, or the browser folds them into a single visible
      // slide back down the strip.
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)))
    }, ROLL_MS)
    return () => window.clearTimeout(id)
  }, [row])

  return (
    <span
      aria-hidden="true"
      className="relative inline-block overflow-hidden align-baseline"
      style={{ height: '1em', width: tall ? '0.62em' : '0.6em' }}
    >
      <span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{
          transform: `translateY(-${row}em)`,
          transition: animate ? `transform ${ROLL_MS}ms cubic-bezier(0.2, 0.9, 0.25, 1)` : 'none',
        }}
      >
        {Array.from({ length: 20 }, (_, i) => (
          <span key={i} className="flex h-[1em] items-center justify-center leading-none">
            {i % 10}
          </span>
        ))}
      </span>

      {/* The face: shade at the edges so a digit rises out of the dark,
          and a hairline where the two halves of a flap would meet. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--color-background)_55%,transparent),transparent_28%,transparent_72%,color-mix(in_oklab,var(--color-background)_55%,transparent))]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[color-mix(in_oklab,var(--color-background)_45%,transparent)]"
      />
    </span>
  )
}

/**
 * The whole clock. Digits roll; everything else — colons, "d", spaces —
 * is drawn as it is.
 *
 * The value is written once for a screen reader on whatever wraps this,
 * so every glyph in here is hidden from the tree: twenty rows of digits
 * per column is not something anybody should have read to them.
 */
export function RollingDigits({
  value,
  className = '',
  tall = false,
}: {
  value: string
  className?: string
  /** The dashboard's display-size clock, which wants a hair more room. */
  tall?: boolean
}) {
  return (
    <span className={`inline-flex items-baseline ${className}`}>
      {value.split('').map((char, i) =>
        /\d/.test(char) ? (
          <Digit key={i} value={Number(char)} tall={tall} />
        ) : (
          <span key={i} aria-hidden="true" className={char === ' ' ? 'w-[0.3em]' : ''}>
            {char === ' ' ? '' : char}
          </span>
        ),
      )}
    </span>
  )
}
