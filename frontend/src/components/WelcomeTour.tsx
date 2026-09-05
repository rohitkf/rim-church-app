import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { useMyTeams } from '../lib/useMyTeams'
import { Overlay } from './Surface'
import { Confetti } from './Confetti'
import { UserCheckIcon, TimerIcon, ChecklistIcon, UsersIcon, SparklesIcon } from './icons'

/**
 * The first thirty seconds.
 *
 * A new volunteer's first sight of this app was a countdown to a Sunday
 * they have not been rostered for, on a dashboard whose other panels had
 * gone quiet because they are on no team yet. Nothing was wrong with that
 * page except that it explained nothing — what this is, what it will ask
 * of them, and the one thing they have to do to be part of it.
 *
 * So: three beats, in the order somebody actually needs them. Who you are
 * and where you have landed. What the app will ask of you, said as the
 * three things a Sunday is made of rather than as a feature list. And then
 * the single next step, with a button that takes it.
 *
 * Shown once, ever, and the "once" is a column on the profile rather than
 * something in this browser — sign in on a phone after doing it on a
 * laptop and you are not welcomed twice. Everybody who already had an
 * account was marked as welcomed by the migration that added the column;
 * a tour of an app you have used for weeks is a bug wearing a party hat.
 *
 * Every way out marks it: the buttons, the corner ×, Escape. Somebody who
 * dismisses this has been welcomed, whatever they thought of it, and being
 * shown it again on the next page load would be the app failing to listen.
 */

interface Beat {
  eyebrow: string
  title: string
  body: string
}

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
    body: 'Your role comes with a checklist. It unlocks at your call time — so what is ticked is what has actually been done.',
    tone: 'var(--color-accent-indigo)',
  },
]

export function WelcomeTour() {
  const { profile, refreshProfile } = useAuth()
  const { onATeam, settled } = useMyTeams()
  const navigate = useNavigate()

  const [beat, setBeat] = useState(0)
  // Dismissed here and now, before the write comes back: the one thing
  // worse than not being welcomed is a welcome that will not go away.
  const [dismissed, setDismissed] = useState(false)
  const [landed, setLanded] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setLanded(true), 20)
    return () => window.clearTimeout(id)
  }, [])

  const unwelcomed = !!profile && !profile.welcomed_at

  async function markWelcomed() {
    setDismissed(true)
    if (!profile) return
    const { error } = await supabase
      .from('profiles')
      .update({ welcomed_at: new Date().toISOString() })
      .eq('id', profile.id)
    // A failure here is not worth a dialog of its own: the welcome is
    // already gone for this session, and the worst case is being greeted
    // once more next time.
    if (!error) await refreshProfile()
  }

  if (!unwelcomed || dismissed) return null

  const beats: Beat[] = [
    {
      eyebrow: 'Rehoboth International Ministries',
      title: `Welcome, ${profile.first_name}.`,
      body: 'This is where Sunday is put together — who is serving, what time they are in, and what has to be ready before the doors open. You are in it now.',
    },
    {
      eyebrow: 'How a Sunday works here',
      title: 'Three things, and that is all of it.',
      body: '',
    },
    {
      eyebrow: 'One thing to do',
      title: onATeam ? 'You are already on a team.' : 'Find your team.',
      body: onATeam
        ? 'Everything above is live for you already. Your team’s page has its roster, its handbook and the kit it looks after.'
        : 'The rest of the app belongs to the teams — the register, the boards, your checklist. Ask to join yours and your head will let you in.',
    },
  ]

  const current = beats[beat]
  const last = beat === beats.length - 1

  function next() {
    if (last) void markWelcomed()
    else setBeat((b) => b + 1)
  }

  return (
    <Overlay onDismiss={() => void markWelcomed()} label="Welcome to Rehoboth">
      {beat === 0 && <Confetti count={44} />}

      <div
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') next()
          if (e.key === 'ArrowLeft') setBeat((b) => Math.max(0, b - 1))
        }}
        className={`sheen relative w-full max-w-lg overflow-hidden rounded-[var(--radius-shell)] bg-surface-lowest p-7 shadow-[var(--shadow-lifted)] ring-1 ring-black/10 transition-all duration-500 ease-[var(--ease-glide)] sm:p-9 dark:ring-white/12 ${
          landed ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.97] opacity-0'
        }`}
      >
        {/* A wash the colour of the beat you are on, so moving through
            them feels like moving rather than like text being replaced. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-40 transition-opacity duration-700"
          style={{
            background: `radial-gradient(120% 100% at 20% 0%, color-mix(in oklab, ${
              [
                'var(--color-accent-blue)',
                'var(--color-accent-green)',
                'var(--color-accent-indigo)',
              ][beat]
            } 26%, transparent) 0%, transparent 70%)`,
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--color-accent-blue)_22%,transparent)] font-mono text-label-md text-accent-blue-soft">
              {profile.first_name.charAt(0)}
              {profile.last_name.charAt(0)}
            </span>
            <span className="font-mono text-label-sm uppercase tracking-[0.16em] text-on-surface-faint">
              {current.eyebrow}
            </span>
          </div>

          {/* Keyed on the beat so React replaces the block rather than
              editing it in place, which is what lets it fade in each time. */}
          <div key={beat} className="welcome-beat mt-5">
            <h2 className="text-headline-lg leading-tight">{current.title}</h2>
            {current.body && (
              <p className="mt-3 text-body-md text-on-surface-variant">{current.body}</p>
            )}

            {beat === 1 && (
              <ul className="mt-5 flex flex-col gap-3.5">
                {HOW_SUNDAY_WORKS.map((thing, i) => (
                  <li
                    key={thing.title}
                    className="welcome-stagger flex items-start gap-3.5"
                    style={{ animationDelay: `${i * 90}ms` }}
                  >
                    <span
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: `color-mix(in oklab, ${thing.tone} 20%, transparent)`,
                        color: thing.tone,
                      }}
                    >
                      <thing.icon width={17} height={17} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-body-md font-medium text-on-surface">
                        {thing.title}
                      </span>
                      <span className="mt-0.5 block text-body-sm text-on-surface-variant">
                        {thing.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {beat === 2 && !onATeam && settled && (
              <p className="mt-4 flex items-center gap-2 rounded-[var(--radius-chip)] bg-surface-container px-3.5 py-2.5 text-body-sm text-on-surface-variant">
                <SparklesIcon width={15} height={15} aria-hidden="true" />
                Until then, the countdown on the dashboard is yours to watch.
              </p>
            )}
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
            {/* Where you are in three, as three dots. Pressable, because a
                progress indicator that cannot be pressed is a decoration. */}
            <div className="flex items-center gap-1.5">
              {beats.map((b, i) => (
                <button
                  key={b.title}
                  type="button"
                  onClick={() => setBeat(i)}
                  aria-label={`Step ${i + 1} of ${beats.length}`}
                  aria-current={i === beat}
                  className={`h-1.5 rounded-full transition-all duration-500 ease-[var(--ease-glide)] ${
                    i === beat ? 'w-6 bg-primary' : 'w-1.5 bg-on-surface-faint/40'
                  }`}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void markWelcomed()}
                className="tap rounded-full px-3.5 py-2 text-label-md text-on-surface-variant transition-colors hover:text-on-surface"
              >
                {last ? 'Look around first' : 'Skip'}
              </button>

              {last && !onATeam ? (
                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    void markWelcomed()
                    navigate('/departments')
                  }}
                  className="tap inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-body-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
                >
                  <UsersIcon width={16} height={16} aria-hidden="true" />
                  Find your team
                  <span aria-hidden="true">&rarr;</span>
                </button>
              ) : (
                <button
                  type="button"
                  autoFocus
                  onClick={next}
                  className="tap inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-body-sm font-medium text-on-primary shadow-[var(--shadow-ambient)] transition-transform duration-500 ease-[var(--ease-glide)] active:scale-[0.98]"
                >
                  {last ? 'Start looking around' : 'Next'}
                  <span aria-hidden="true">&rarr;</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Overlay>
  )
}
