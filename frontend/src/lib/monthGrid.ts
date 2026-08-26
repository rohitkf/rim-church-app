export interface MonthCell {
  iso: string // YYYY-MM-DD
  day: number
  inMonth: boolean
}

function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayIso(): string {
  return toIso(new Date())
}

/** Monday-first calendar grid for a month (month is 0-based), padded with
 * the surrounding days so every week is a full row of 7. */
export function monthGrid(year: number, month: number): MonthCell[][] {
  const first = new Date(year, month, 1)
  const mondayOffset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - mondayOffset)

  const weeks: MonthCell[][] = []
  const cursor = new Date(start)
  do {
    const week: MonthCell[] = []
    for (let i = 0; i < 7; i++) {
      week.push({ iso: toIso(cursor), day: cursor.getDate(), inMonth: cursor.getMonth() === month })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  } while (cursor.getMonth() === month)
  return weeks
}

export function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
