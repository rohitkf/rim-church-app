import { useMemo } from 'react'

/**
 * A shower of paper, drawn rather than fetched.
 *
 * Forty spans on their own fall, seeded once per mounting so no two look
 * alike and nothing re-randomises when the page around them re-renders.
 * Reduced-motion settings flatten the animation globally (see index.css),
 * so somebody who has asked for stillness gets the moment without the
 * shower.
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

export function Confetti({ count = 40 }: { count?: number }) {
  const flecks = useMemo(() => seedConfetti(count), [count])
  return (
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
  )
}
