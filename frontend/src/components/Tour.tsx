import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { usePageAccess } from '../lib/usePageAccess'
import { useMyTeams } from '../lib/useMyTeams'
import { useTourContext } from '../lib/useTourContext'
import { ONBOARDING_KEY, fetchMyOnboarding, markChaptersSeen } from '../lib/onboarding'
import {
  chaptersFor,
  dueChapters,
  endTour,
  startTour,
  stepsOf,
  subscribeTour,
  tourStandingOf,
  type TourContext,
  type TourRun,
  type TourStep,
} from '../lib/tour'
import { showToast } from '../lib/toast'
import { Confetti } from './Confetti'
import { ChecklistIcon, TimerIcon, UserCheckIcon } from './icons'

/*
 * The tour, drawn.
 *
 * One step at a time: go to the step's page, find the thing it points at,
 * dim everything but that, and put the card beside it. Next and Back walk
 * the steps; Skip asks whether you mean this part or the whole thing.
 * Each chapter is marked seen on the account as it is finished or
 * skipped, so a tour abandoned halfway picks up where it stopped.
 *
 * It starts itself when chapters are due (lib/tour) and the person is
 * settled — on a team or not, allowed the pages or not — and it starts on
 * demand from the account menu. An Admin previewing somebody else is
 * never toured as them: the preview is theirs to look around in.
 */

const HOW_SUNDAY_WORKS = [
  {
    icon: UserCheckIcon,
    title: 'Say if you can serve',
    body: 'Your team asks each week. Two taps, and your head can plan the rota around real answers instead of guesses.',
    tone: 'var(--color-accent-green)',
  },
  {
    icon: TimerIcon,
    title: 'Know when to be there',
    body: 'Every team has a call time on the morning. The clock on the dashboard counts down to yours, not to the service.',
    tone: 'var(--color-accent-blue)',
  },
  {
    icon: ChecklistIcon,
    title: 'Work the list on the day',
    body: 'Your role comes with a checklist. It unlocks at your call time, so what is ticked is what has actually been done.',
    tone: 'var(--color-accent-indigo)',
  },
]

export function Tour() {
  const [run, setRun] = useState<TourRun | null>(null)
  useEffect(() => subscribeTour(setRun), [])
  const ctx = useTourContext()
  useAutoStart(run, ctx)
  if (!run) return null
  return <TourRunView key={run.id} run={run} ctx={ctx} />
}

/** Starts the tour when chapters are due and everything it needs is known. */
function useAutoStart(run: TourRun | null, ctx: TourContext) {
  const { profile, isSuperAdmin, viewAs } = useAuth()
  const { standing, settled } = usePageAccess()
  const { settled: teamsSettled } = useMyTeams()
  const myId = profile?.id
  const query = useQuery({
    queryKey: [...ONBOARDING_KEY, myId],
    queryFn: () => fetchMyOnboarding(myId!),
    enabled: !!myId,
  })
  // Chapters started this session: a tour that could not be marked seen
  // must not come straight back the moment it ends.
  const started = useRef(new Set<string>())

  useEffect(() => {
    if (run || viewAs || !profile || !profile.onboarded_at) return
    if (!settled || !teamsSettled || !query.isSuccess) return
    const standingNow = tourStandingOf({ isOwner: isSuperAdmin, standing })
    const due = dueChapters(chaptersFor(standingNow), query.data?.seen ?? {}, query.data?.pushed_at).filter(
      (c) => !started.current.has(c.key) && stepsOf(c, ctx).length > 0,
    )
    if (due.length === 0) return
    for (const c of due) started.current.add(c.key)
    startTour(due, 'auto')
  }, [run, viewAs, profile, settled, teamsSettled, query.isSuccess, query.data, ctx, isSuperAdmin, standing])
}

/* ---- One run of it ---- */

interface Position {
  chapter: number
  step: number
}

function TourRunView({ run, ctx }: { run: TourRun; ctx: TourContext }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const queryClient = useQueryClient()

  // Settled once, when the run starts: a step must not vanish from under
  // somebody because the roster query refreshed.
  const [chapters] = useState(() =>
    run.chapters.map((c) => ({ chapter: c, steps: stepsOf(c, ctx) })).filter((c) => c.steps.length > 0),
  )

  const [pos, setPos] = useState<Position>({ chapter: 0, step: 0 })
  const [finished, setFinished] = useState(false)
  const [asking, setAsking] = useState(false)
  const seen = useRef(new Set<string>())

  const current = chapters[pos.chapter]
  const step: TourStep | undefined = finished ? undefined : current?.steps[pos.step]
  const total = chapters.reduce((n, c) => n + c.steps.length, 0)
  const before = chapters.slice(0, pos.chapter).reduce((n, c) => n + c.steps.length, 0) + pos.step
  const firstStep = pos.chapter === 0 && pos.step === 0
  // The welcome itself: the one card that says your name and throws
  // confetti. A run that starts further in (the team's chapters, for
  // somebody just put on a team) opens on its own first step, plainly.
  const welcoming = !finished && current?.chapter.key === 'welcome' && pos.step === 0

  /** Marked on the account, once each, and the dashboard's copy refreshed at the end. */
  const markSeen = useCallback(
    (keys: string[]) => {
      const fresh = keys.filter((k) => !seen.current.has(k))
      for (const k of fresh) seen.current.add(k)
      if (fresh.length === 0) return
      void markChaptersSeen(fresh)
        .catch(() => {
          // Being toured once more next time is the whole of the harm.
        })
        .finally(() => queryClient.invalidateQueries({ queryKey: ONBOARDING_KEY }))
    },
    [queryClient],
  )

  const close = useCallback(() => {
    endTour()
  }, [])

  function next() {
    if (!current) return close()
    const lastInChapter = pos.step === current.steps.length - 1
    if (!lastInChapter) return setPos({ chapter: pos.chapter, step: pos.step + 1 })
    markSeen([current.chapter.key])
    if (pos.chapter === chapters.length - 1) return setFinished(true)
    setPos({ chapter: pos.chapter + 1, step: 0 })
  }

  function back() {
    if (finished) {
      const last = chapters[chapters.length - 1]
      setFinished(false)
      return setPos({ chapter: chapters.length - 1, step: last.steps.length - 1 })
    }
    if (pos.step > 0) return setPos({ chapter: pos.chapter, step: pos.step - 1 })
    if (pos.chapter > 0) {
      const prev = chapters[pos.chapter - 1]
      setPos({ chapter: pos.chapter - 1, step: prev.steps.length - 1 })
    }
  }

  function skipChapter() {
    setAsking(false)
    if (!current) return close()
    markSeen([current.chapter.key])
    if (pos.chapter === chapters.length - 1) return setFinished(true)
    setPos({ chapter: pos.chapter + 1, step: 0 })
  }

  function skipAll() {
    setAsking(false)
    markSeen(chapters.slice(pos.chapter).map((c) => c.chapter.key))
    showToast('Tour skipped. Take it any time from the menu under your initials.')
    close()
  }

  // Each step lives on a page; go there — once. A page that sends the
  // tour somewhere else (a room that turned out to be shut) is not asked
  // again, or the two would argue for ever.
  const stepKey = `${pos.chapter}:${pos.step}:${finished}`
  const went = useRef<string | null>(null)
  useEffect(() => {
    if (!step || went.current === stepKey) return
    went.current = stepKey
    if (pathname !== step.path) navigate(step.path)
  }, [step, stepKey, pathname, navigate])

  const onPage = !step || pathname === step.path
  const anchor = useAnchor(step?.target, onPage, stepKey)

  // Keys: the arrows walk, Escape asks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setAsking((a) => !a)
      }
      if (asking) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (finished) close()
        else next()
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (chapters.length === 0) {
    close()
    return null
  }

  const rect = anchor.status === 'ready' ? anchor.rect : null
  const centred = finished || !step?.target
  const titleId = 'tour-step-title'

  return (
    <div
      className="fixed inset-0 z-[60]"
      data-tour-overlay="true"
      // What is being pointed at, said on the overlay, so a check from
      // outside (the verify drive) can tell a hit from a fallback.
      data-tour-target={step?.target ?? ''}
      data-tour-step={stepKey}
    >
      {/* The dark, with a hole where the thing is. */}
      {rect && !centred ? (
        <div
          aria-hidden="true"
          className="absolute rounded-[18px] ring-2 ring-primary shadow-[0_0_0_200vmax_rgba(0,0,0,0.66)] transition-[top,left,width,height] duration-300 ease-[var(--ease-glide)]"
          style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-black/66" />
      )}
      {/* Nothing underneath is for pressing while the tour has the floor. */}
      <div className="absolute inset-0" aria-hidden="true" />

      {anchor.status !== 'finding' && (
        <TourCard
          key={`${pos.chapter}:${pos.step}:${finished}`}
          rect={centred ? null : rect}
          titleId={titleId}
          eyebrow={
            finished
              ? 'That’s the tour'
              : `${current.chapter.title} · Part ${pos.chapter + 1} of ${chapters.length}`
          }
          counter={finished ? null : `${before + 1}/${total}`}
          wide={welcoming || finished}
          confetti={(welcoming && run.mode === 'auto') || finished}
        >
          {finished ? (
            <>
              <h2 id={titleId} className="text-headline-lg leading-tight">
                That’s the tour.
              </h2>
              <p className="mt-3 text-body-md text-on-surface-variant">
                You can take it again any time from the menu under your initials. Everything in it is live for
                you now.
              </p>
            </>
          ) : (
            <>
              <h2 id={titleId} className="text-headline-lg leading-tight">
                {welcoming && ctx.firstName ? `Welcome, ${ctx.firstName}.` : step!.title}
              </h2>
              <p className="mt-3 text-body-md text-on-surface-variant">{step!.body}</p>
              {step!.list === 'sunday' && <SundayList />}
            </>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            {asking ? (
              <div role="group" aria-label="Skip" className="flex w-full flex-wrap items-center gap-2">
                <span className="mr-auto text-body-sm text-on-surface-variant">Skip what?</span>
                <button type="button" onClick={skipChapter} className={QUIET}>
                  This part
                </button>
                <button type="button" onClick={skipAll} className={QUIET}>
                  The whole tour
                </button>
                <button type="button" autoFocus onClick={() => setAsking(false)} className={PRIMARY}>
                  Keep going
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={back}
                  disabled={firstStep}
                  className={`${QUIET} disabled:invisible`}
                >
                  Back
                </button>
                <span className="flex items-center gap-2">
                  {!finished && (
                    <button type="button" onClick={() => setAsking(true)} className={QUIET}>
                      Skip
                    </button>
                  )}
                  <button type="button" autoFocus onClick={finished ? close : next} className={PRIMARY}>
                    {finished ? 'Done' : 'Next'}
                    {!finished && <span aria-hidden="true">&rarr;</span>}
                  </button>
                </span>
              </>
            )}
          </div>
        </TourCard>
      )}
    </div>
  )
}

const QUIET =
  'tap rounded-full px-3.5 py-2 text-label-md text-on-surface-variant transition-colors hover:text-on-surface'
const PRIMARY =
  'tap inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-body-sm font-semibold text-on-primary shadow-[var(--shadow-ambient)] transition-transform duration-300 ease-[var(--ease-glide)] active:scale-[0.97] active:duration-[80ms]'

function SundayList() {
  return (
    <ul className="mt-5 flex flex-col gap-3.5">
      {HOW_SUNDAY_WORKS.map((thing, i) => (
        <li key={thing.title} className="welcome-stagger flex items-start gap-3.5" style={{ animationDelay: `${i * 90}ms` }}>
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: `color-mix(in oklab, ${thing.tone} 20%, transparent)`, color: thing.tone }}
          >
            <thing.icon width={17} height={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-body-md font-medium text-on-surface">{thing.title}</span>
            <span className="mt-0.5 block text-body-sm text-on-surface-variant">{thing.body}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ---- Finding and following the thing a step points at ---- */

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

type Anchor = { status: 'finding' } | { status: 'ready'; rect: Rect | null }

const FIND_FOR_MS = 4000
const SETTLE_FOR_MS = 1200
const ARRIVE_FOR_MS = 1500

/**
 * The element for `target` on the page, once the page is here, and its
 * box every frame after that — the page scrolls, the dock slides, a
 * panel opens, and the hole has to stay on the thing.
 *
 * Found within a moment, or not at all: a step whose anchor never turns
 * up (no rota to assign yet, a panel that needs data) still gets its card,
 * in the middle, rather than a tour stuck on a page saying nothing. The
 * page's own header is the second choice before giving up. A page that
 * never arrives gets the same.
 */
function useAnchor(target: string | undefined, onPage: boolean, stepKey: string): Anchor {
  // Keyed by step, so a new step is "finding" without anything having to
  // be reset: an answer for another step is no answer.
  const [found, setFound] = useState<{ key: string; rect: Rect | null } | null>(null)

  useEffect(() => {
    let frame = 0
    let timer = 0
    let stopped = false
    const began = Date.now()
    let el: Element | null = null
    let last: Rect | null = null

    const settle = (rect: Rect | null) => {
      if (!stopped) setFound({ key: stepKey, rect })
    }

    const follow = () => {
      if (stopped || !el) return
      const r = el.getBoundingClientRect()
      const next = {
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
      }
      if (
        !last ||
        last.top !== next.top ||
        last.left !== next.left ||
        last.width !== next.width ||
        last.height !== next.height
      ) {
        last = next
        settle(next)
      }
      frame = window.requestAnimationFrame(follow)
    }

    const find = () => {
      if (stopped) return
      const waited = Date.now() - began
      el =
        document.querySelector(`[data-tour="${target}"]`) ??
        (waited > SETTLE_FOR_MS ? document.querySelector('[data-tour="page-title"]') : null)
      if (el) {
        // jsdom has no scrollIntoView; a browser always does.
        el.scrollIntoView?.({ block: 'center', inline: 'nearest' })
        follow()
        return
      }
      if (waited > FIND_FOR_MS) return settle(null)
      timer = window.setTimeout(find, 100)
    }

    if (!onPage) {
      timer = window.setTimeout(() => settle(null), ARRIVE_FOR_MS)
    } else if (!target) {
      timer = window.setTimeout(() => settle(null), 0)
    } else {
      timer = window.setTimeout(find, 0)
    }
    return () => {
      stopped = true
      window.clearTimeout(timer)
      window.cancelAnimationFrame(frame)
    }
  }, [target, onPage, stepKey])

  if (!target && onPage) return { status: 'ready', rect: null }
  return found && found.key === stepKey ? { status: 'ready', rect: found.rect } : { status: 'finding' }
}

/* ---- The card, placed beside the thing ---- */

const PHONE = 640
/** The dock's height, which the card must clear at the bottom of a phone. */
const DOCK_CLEARANCE = 104
const GUTTER = 16

function TourCard({
  rect,
  children,
  eyebrow,
  counter,
  titleId,
  wide,
  confetti,
}: {
  rect: Rect | null
  children: React.ReactNode
  eyebrow: string
  counter: string | null
  titleId: string
  wide: boolean
  confetti: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const [landed, setLanded] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setLanded(true), 20)
    return () => window.clearTimeout(id)
  }, [])

  // Measured, then placed: below the thing if it fits, else above; on a
  // phone, docked to whichever end of the screen the thing is not at.
  useLayoutEffect(() => {
    const card = ref.current
    if (!card) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const w = card.offsetWidth
    const h = card.offsetHeight
    if (!rect) {
      setStyle({ top: Math.max(GUTTER, (vh - h) / 2), left: Math.max(GUTTER, (vw - w) / 2) })
      return
    }
    if (vw < PHONE) {
      const low = rect.top + rect.height / 2 > vh * 0.55
      setStyle(
        low
          ? { top: GUTTER + 8, left: GUTTER, right: GUTTER }
          : { bottom: DOCK_CLEARANCE, left: GUTTER, right: GUTTER },
      )
      return
    }
    const gap = 14
    const below = rect.top + rect.height + gap + h <= vh - GUTTER
    const top = below ? rect.top + rect.height + gap : Math.max(GUTTER, rect.top - gap - h)
    const left = Math.min(Math.max(GUTTER, rect.left + rect.width / 2 - w / 2), vw - w - GUTTER)
    setStyle({ top, left })
  }, [rect])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      style={style}
      className={`absolute overflow-hidden rounded-[var(--radius-shell)] bg-surface-lowest p-6 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 transition-[opacity,transform] duration-300 ease-[var(--ease-glide)] sm:p-7 dark:ring-white/12 ${
        wide ? 'w-[calc(100%-2rem)] max-w-lg' : 'w-[calc(100%-2rem)] max-w-sm'
      } ${landed ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}
    >
      {confetti && <Confetti count={36} />}
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-label-sm uppercase tracking-[0.16em] text-on-surface-faint">
            {eyebrow}
          </span>
          {counter && (
            <span className="shrink-0 font-mono text-label-sm text-on-surface-faint">{counter}</span>
          )}
        </div>
        <div className="welcome-beat mt-4">{children}</div>
      </div>
    </div>
  )
}
