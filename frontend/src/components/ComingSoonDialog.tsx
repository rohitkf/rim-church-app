import { useEffect, useMemo, useState } from 'react'
import { Overlay } from './Surface'
import { SparklesIcon } from './icons'

/**
 * What Ask says until Ask can answer.
 *
 * The assistant is built but not deployed, and the dock carried it as a
 * greyed-out label — which reads as a broken button rather than as a thing
 * on its way. A button that says "coming soon" when pressed is honest
 * about the same fact and answers the person who pressed it.
 *
 * The confetti is drawn rather than fetched: forty spans on their own
 * fall, seeded once per opening so no two look alike, and gone from the
 * DOM the moment the dialog closes. Reduced-motion settings flatten the
 * animation globally, so somebody who has asked for stillness gets the
 * dialog without the shower.
 */

const CONFETTI_COLORS = [
  'var(--color-accent-blue)',
  'var(--color-accent-green)',
  'var(--color-accent-orange)',
  'var(--color-accent-indigo)',
  'var(--color-accent-teal)',
  'var(--color-accent-red)',
]

interface Fleck {
  left: number
  delay: number
  duration: number
  drift: number
  spin: number
  color: string
  square: boolean
}

function seedConfetti(count: number): Fleck[] {
  return Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.9,
    duration: 2.2 + Math.random() * 1.6,
    drift: Math.random() * 120 - 60,
    spin: Math.random() * 720 - 360,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    square: Math.random() > 0.5,
  }))
}

export function ComingSoonDialog({ onClose }: { onClose: () => void }) {
  // One seeding per opening: re-randomising on every render would make the
  // confetti jump each time anything else on the page changed.
  const flecks = useMemo(() => seedConfetti(40), [])
  // The card arrives a beat after the confetti starts, so the shower reads
  // as the thing being celebrated rather than as decoration behind it.
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setLanded(true), 20)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <Overlay onDismiss={onClose} label="Ask is coming soon">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        {flecks.map((fleck, i) => (
          <span
            key={i}
            className="confetti-fleck absolute top-[-8vh]"
            style={{
              left: `${fleck.left}%`,
              width: fleck.square ? 8 : 6,
              height: fleck.square ? 8 : 10,
              background: fleck.color,
              borderRadius: fleck.square ? 2 : 9999,
              animationDelay: `${fleck.delay}s`,
              animationDuration: `${fleck.duration}s`,
              ['--confetti-drift' as string]: `${fleck.drift}px`,
              ['--confetti-spin' as string]: `${fleck.spin}deg`,
            }}
          />
        ))}
      </div>

      <div
        className={`relative w-full max-w-sm rounded-[var(--radius-shell)] bg-surface-lowest p-8 text-center shadow-[var(--shadow-lifted)] ring-1 ring-black/10 transition-all duration-500 ease-[var(--ease-glide)] dark:ring-white/12 ${
          landed ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-indigo)_22%,transparent)] text-accent-indigo-soft">
          <SparklesIcon width={22} height={22} />
        </span>
        <h2 className="mt-4 text-headline-md">Coming soon !!!</h2>
        <p className="mt-2 text-body-sm text-on-surface-variant">
          Ask will answer questions about the rota, the checklists and who is on this Sunday. It is
          built — it just is not switched on here yet.
        </p>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="mt-6 rounded-full bg-primary px-5 py-2.5 text-body-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
        >
          Can’t wait
        </button>
      </div>
    </Overlay>
  )
}
