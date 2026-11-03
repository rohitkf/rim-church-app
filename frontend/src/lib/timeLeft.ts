import { useEffect, useState } from 'react'

/*
 * A countdown (registration closing, the event starting): what is left
 * until a moment, in days, hours, minutes and seconds, and nothing once it
 * has passed.
 */

export interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function timeLeft(target: string | Date, now: Date = new Date()): TimeLeft | null {
  const ms = new Date(target).getTime() - now.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return null
  const total = Math.floor(ms / 1000)
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  }
}

/** The clock, ticking once a second while something is counting down. */
export function useNow(active = true, everyMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(new Date()), everyMs)
    return () => window.clearInterval(id)
  }, [active, everyMs])
  return now
}
