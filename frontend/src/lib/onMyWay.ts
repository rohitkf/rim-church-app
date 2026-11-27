import { z } from 'zod'
import { supabase } from './supabaseClient'

/*
 * On my way (0337).
 *
 * A team is called for seven. At seven some of it is in the building, and
 * the ones who are there do not know whether the rest are five minutes
 * off, half an hour off, or not coming. Somebody due in says "on my way"
 * with a number of minutes, or that they cannot make it, and their team
 * reads it beside their name.
 *
 * What is sent is the number, never the place. The estimate is worked out
 * here, on the phone, from the rounded distance the database already gives
 * "Am I at church?" (lib/whereAmI): it is a rough answer on purpose, and
 * the person can change it before it is sent.
 */

/** The longest the database takes: four hours. */
export const MOST_MINUTES = 240

/** Under this, somebody is near enough to be walking. */
const WALK_UNDER_M = 600
/** A road is not a straight line: a walk by this much, a drive by more. */
const WALK_WINDS = 1.3
const DRIVE_WINDS = 1.4
/** Metres a minute, on foot. */
const WALK_M_PER_MIN = 83
/** Parking, and the walk in from the car. */
const DOOR_MINUTES = 4

const upToFive = (minutes: number) => Math.ceil(minutes / 5) * 5

/**
 * Roughly how many minutes away somebody is, from how far away their
 * phone is in a straight line. On the late side, in fives: a team told
 * "about twenty minutes" that sees them in fifteen is not let down.
 *
 * A drive is slow over a short way and quicker over a long one (side
 * streets, then main roads), which is all the speed here tries to say.
 * It knows nothing of traffic, trains or the school run; the person does,
 * and can change the number before it is sent.
 */
export function minutesAway(distanceM: number): number {
  if (!Number.isFinite(distanceM)) return MOST_MINUTES
  const metres = Math.max(0, distanceM)
  if (metres < WALK_UNDER_M) return Math.max(5, upToFive((metres * WALK_WINDS) / WALK_M_PER_MIN))
  const roadKm = (metres / 1000) * DRIVE_WINDS
  const kmh = Math.min(60, 18 + roadKm * 1.5)
  return Math.min(MOST_MINUTES, Math.max(5, upToFive((roadKm / kmh) * 60 + DOOR_MINUTES)))
}

/** What to choose from by hand. */
export const MINUTE_CHOICES = [5, 10, 15, 20, 30, 45, 60]

/** The same, with an estimate that is not one of them put in its place. */
export function choicesWith(estimate: number | null): number[] {
  if (estimate === null || MINUTE_CHOICES.includes(estimate)) return MINUTE_CHOICES
  return [...MINUTE_CHOICES, estimate].sort((a, b) => a - b)
}

const personSchema = z.object({
  id: z.string(),
  first_name: z.string().nullable().transform((v) => v ?? ''),
  last_name: z.string().nullable().transform((v) => v ?? ''),
  /** Down for this team today, or on the team and turned up or said something. */
  on_rota: z.boolean().default(true),
  state: z.enum(['here', 'coming', 'not_coming', 'none']),
  /** Only while it is still a promise: once they are here it is the Clock In page's. */
  eta_at: z.string().nullable().default(null),
  said_at: z.string().nullable().default(null),
})
export type ArrivalPerson = z.infer<typeof personSchema>

const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable().default(null),
  /** Theirs: one they are down for today, are on, or head. */
  mine: z.boolean().default(false),
  on_duty: z.boolean().default(false),
  call_at: z.string(),
  people: z.array(personSchema).default([]),
})
export type ArrivalTeam = z.infer<typeof teamSchema>

export const teamArrivalsSchema = z.object({
  /** The church's switch (Settings › Clock In). */
  on: z.boolean(),
  on_date: z.string(),
  /** Whether this person is due in today: the same people who are given Clock in. */
  due: z.boolean(),
  first_call: z.string().nullable().default(null),
  closes_at: z.string().nullable().default(null),
  clocked: z.boolean().default(false),
  word: z.enum(['coming', 'not_coming']).nullable().default(null),
  eta_at: z.string().nullable().default(null),
  said_at: z.string().nullable().default(null),
  sees_all: z.boolean().default(false),
  teams: z.array(teamSchema).default([]),
})
export type TeamArrivals = z.infer<typeof teamArrivalsSchema>

export const TEAM_ARRIVALS_KEY = ['team-arrivals'] as const

/** Today's teams this person may read, each person as here, coming, not coming or no word. */
export async function fetchTeamArrivals(): Promise<TeamArrivals> {
  const { data, error } = await supabase.rpc('team_arrivals')
  if (error) throw error
  return teamArrivalsSchema.parse(data)
}

export type Say = { word: 'coming'; minutes: number; how: 'estimate' | 'chosen' } | { word: 'not_coming' }

/** Tell the team. A number of minutes and how it was arrived at: nothing about where. */
export async function sayOnMyWay(say: Say): Promise<void> {
  const { error } = await supabase.rpc('on_my_way_say', {
    p_word: say.word,
    p_minutes: say.word === 'coming' ? say.minutes : null,
    p_how: say.word === 'coming' ? say.how : 'chosen',
  })
  if (error) throw error
}

export interface ArrivalWords {
  label: string
  tone: 'green' | 'blue' | 'orange' | 'red' | 'neutral'
  /** A few words after the tag, or none. */
  detail: string | null
}

function inWords(minutes: number): string {
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `in ${hours} hr` : `in ${hours} hr ${rest} min`
}

/**
 * What a team reads beside a name. `clock` turns a moment into the
 * church's wall-clock time (lib/clockIn `churchClock`).
 */
export function arrivalWords(person: ArrivalPerson, now: number, callAt: string, clock: (iso: string) => string): ArrivalWords {
  switch (person.state) {
    case 'here':
      return { label: 'Here', tone: 'green', detail: null }
    case 'not_coming':
      return { label: 'Can’t make it', tone: 'red', detail: null }
    case 'coming': {
      if (!person.eta_at) return { label: 'On the way', tone: 'blue', detail: null }
      const minutes = Math.round((Date.parse(person.eta_at) - now) / 60_000)
      // The time they gave has gone, and they have not clocked in.
      if (minutes < -2) return { label: `Said ${clock(person.eta_at)}`, tone: 'orange', detail: 'not in yet' }
      return { label: `About ${clock(person.eta_at)}`, tone: 'blue', detail: minutes <= 2 ? 'any minute' : inWords(minutes) }
    }
    case 'none':
      // Before the call time nobody owes a word.
      return now >= Date.parse(callAt) ? { label: 'No word', tone: 'orange', detail: null } : { label: 'Not due yet', tone: 'neutral', detail: null }
  }
}

const RANK: Record<ArrivalPerson['state'], number> = { coming: 0, none: 1, not_coming: 2, here: 3 }

/** Who is still to come first, soonest first; who is here, last. */
export function orderPeople(people: readonly ArrivalPerson[]): ArrivalPerson[] {
  return [...people].sort(
    (a, b) =>
      RANK[a.state] - RANK[b.state] ||
      (a.state === 'coming' ? Date.parse(a.eta_at ?? '') - Date.parse(b.eta_at ?? '') || 0 : 0) ||
      a.first_name.localeCompare(b.first_name) ||
      a.last_name.localeCompare(b.last_name),
  )
}

/**
 * The teams to draw. The database has already left out what this person
 * may not read; a preview (View as) runs on the previewer's own answer, so
 * it is narrowed here to what that standing would have been given, and
 * the previewer's own place on the rota is not the preview's.
 */
export function teamsFor(data: TeamArrivals | undefined, who: { seesAll: boolean; teamIds: readonly string[]; previewing: boolean }): ArrivalTeam[] {
  if (!data) return []
  if (who.seesAll) return data.teams
  if (who.previewing) return data.teams.filter((t) => who.teamIds.includes(t.id))
  return data.teams.filter((t) => t.mine || who.teamIds.includes(t.id))
}

/** The card comes this long before the first of the teams is called. */
export const OPENS_MINUTES_BEFORE = 120

/** Whether the card is on the Dashboard now: from two hours before the first call until the day's services end. */
export function cardShows(data: TeamArrivals | undefined, teams: readonly ArrivalTeam[], now: number): boolean {
  if (!data || !data.on || teams.length === 0) return false
  const first = Math.min(...teams.map((t) => Date.parse(t.call_at)))
  if (now < first - OPENS_MINUTES_BEFORE * 60_000) return false
  return !data.closes_at || now < Date.parse(data.closes_at)
}
