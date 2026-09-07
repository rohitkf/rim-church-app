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
 * Nothing is drawn over the digit. An earlier version shaded the window's
 * edges towards `--color-background` to suggest a flap, which only worked
 * where the clock happened to sit on the page background — on the
 * dashboard's raised tile it painted a visible grey box around every
 * digit instead. The movement is the effect; it does not need a bezel.
 */

/** Long enough to see it turn, short enough not to be waiting for it. */
const ROLL_MS = 420

function Digit({ value }: { value: number }) {
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
    // A column is as wide as a digit and one line tall, and it does not
    // clip: an inline-block that hides its overflow takes its baseline
    // from its bottom edge, which is what lifted the rolling digits off
    // the line their neighbours sit on — the "d" in "5d" most visibly.
    // The hidden nought below sizes the column in whatever face and size
    // it has been dropped into, and hands its own baseline to the line.
    // The clipping happens one level in, where it costs nothing.
    <span aria-hidden="true" className="relative inline-block text-left leading-none">
      <span className="invisible">0</span>
      <span className="absolute inset-0 overflow-hidden">
        <span
          className="absolute inset-x-0 top-0"
          style={{
            transform: `translateY(-${row}em)`,
            transition: animate ? `transform ${ROLL_MS}ms cubic-bezier(0.2, 0.9, 0.25, 1)` : 'none',
          }}
        >
          {Array.from({ length: 20 }, (_, i) => (
            // One em tall on a one-em line, exactly like the nought that
            // sized the column, so every row lands on the same baseline
            // as the text around it.
            <span key={i} className="block h-[1em] leading-none">
              {i % 10}
            </span>
          ))}
        </span>
      </span>
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
export function RollingDigits({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span className={`inline-flex items-baseline ${className}`}>
      {value.split('').map((char, i) =>
        /\d/.test(char) ? (
          <Digit key={i} value={Number(char)} />
        ) : (
          <span key={i} aria-hidden="true" className={char === ' ' ? 'w-[0.3em]' : ''}>
            {char === ' ' ? '' : char}
          </span>
        ),
      )}
    </span>
  )
}
