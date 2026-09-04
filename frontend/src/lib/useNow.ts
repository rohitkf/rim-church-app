import { useEffect, useState } from 'react'

/**
 * The current time, re-read on a timer.
 *
 * For a page whose layout depends on the clock rather than on a number it
 * draws — a checklist that unlocks at seven, a service that becomes
 * "finished" at eleven. A component that only *shows* a countdown runs its
 * own second hand; this is for the ones that have to decide something.
 *
 * Half a minute by default: near enough that a checklist opens while
 * somebody is looking at it, far enough that a page of rows is not
 * re-rendered sixty times a minute for nothing.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
