import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { PublicShell } from '../components/PublicShell'
import { CHURCH_NAME } from '../lib/churchName'
import { PRIVACY_DETAILS_KEY, fetchPrivacyDetails, tidyPrivacyDetails } from '../lib/privacyDetails'

/*
 * What the app keeps about you.
 *
 * Until November 2026 nothing in the app said. Somebody signing up gave
 * their name, phone number and date of birth with no page to tell them
 * who would see them or for how long, and somebody leaving had no page
 * saying what goes with them. This is that page: open to anybody, signed
 * in or not, linked from signing up, signing in and "About you".
 *
 * Every line is something the app does, checked against the database when
 * it was written (the tables, who may read them, what is deleted and
 * when). It is a plain account, not a legal notice: the church's reasons
 * in law for keeping each thing, who to ask and where to write are the
 * church's to say, and it says them in Settings › General (0334,
 * lib/privacyDetails); whatever it has filled in is shown here, as plain
 * words. Change the app and this page changes with it — a page that says
 * what used to be true is worse than no page.
 */

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-headline-md text-on-surface">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-body-md text-on-surface-variant">{children}</div>
    </section>
  )
}

const list = 'flex list-disc flex-col gap-1.5 pl-5'

export function PrivacyPage() {
  // What the church has said about itself. Nothing said, or the question
  // not answered: the page reads as it did before there was anything to say.
  const church = useQuery({ queryKey: PRIVACY_DETAILS_KEY, queryFn: fetchPrivacyDetails, retry: 0, staleTime: 5 * 60_000 })
  const said = tidyPrivacyDetails(church.data ?? {})
  const who = said.contact_name ?? (said.contact_email ? 'the church' : null)
  return (
    <PublicShell title="What the app keeps about you" logoPath={null}>
      <article className="mx-auto w-full max-w-2xl pb-16">
        <h1 className="text-headline-xl text-on-surface">What the app keeps about you</h1>
        <p className="mt-3 text-body-lg text-on-surface-variant">
          {CHURCH_NAME} runs this app to plan its services and look after the people who serve in them. This page says
          what it holds about you, who can see it, how long it is kept and how to have it removed.
        </p>

        <Part title="What you give it">
          <ul className={list}>
            <li>Your name, email address and a password. The password is stored scrambled; nobody can read it, the church included.</li>
            <li>Your phone number, date of birth and whether you are married, with the date if you add it.</li>
            <li>A photo, if you add one, and somebody to call in an emergency, if you name one.</li>
            <li>Your family, if you or the church link you: husband or wife, children, parents. A child who has no account is written in by name, with a date of birth, school and year if given.</li>
            <li>For somebody serving who needs one: details of a DBS certificate, and a visa type and expiry date where that applies.</li>
          </ul>
        </Part>

        <Part title="What it keeps as you use it">
          <ul className={list}>
            <li>The teams you are on, the services you are put on, and your answers when you are asked whether you can serve.</li>
            <li>What you tick on a checklist, and what you write: messages, team chat, prayer requests, debrief notes, issues, poll answers and feedback.</li>
            <li>When you clock in on a Sunday: the time, and where your phone was at that moment. Your location is read once, when you press Clock in, and never in the background.</li>
            <li>A line for each phone or computer you allow notifications on, so they can be sent.</li>
            <li>If the app breaks while you use it, what went wrong, on which page and on what kind of device, so it can be fixed.</li>
          </ul>
        </Part>

        <Part title="If you register for an event">
          <p>
            Registering needs no account. The church keeps your name, email address, phone number if you give it, what
            you booked and whether it is paid. If you pay by bank transfer you can send a picture of the receipt. Card
            payments are taken by the payment company on its own page: this app never sees or stores a card number.
          </p>
        </Part>

        <Part title="Who can see it">
          <ul className={list}>
            <li>Everybody signed in sees names, and the teams and services people are on. That is how a rota works.</li>
            <li>Email addresses, phone numbers and families are for the Owner of the app, and for whoever the Owner has given them to.</li>
            <li>DBS and visa details are yours, the Owner’s and a Pastor’s.</li>
            <li>A private prayer request is read by the pastors it was sent to. A team’s chat is read by that team.</li>
            <li>Nobody outside the church is given any of it, and none of it is sold or used for advertising.</li>
          </ul>
        </Part>

        <Part title="How long it is kept">
          <p>
            Most of it is kept for weeks, not years. A service and everything about it (its rota, answers, debriefs and
            issues) is deleted soon after its date. Chat, polls, clock-ins, closed prayer requests and feedback are
            cleared on their own timetables. Each page in the app says how long it keeps what is on it.
          </p>
          <ul className={list}>
            <li>An account whose email is never confirmed is removed after seven days.</li>
            <li>An event registration has its name and contact details taken off it some weeks after the event.</li>
            <li>Your account itself is kept for as long as you are part of the church’s teams.</li>
          </ul>
        </Part>

        <Part title="Where it is held">
          <p>
            The app’s database is in Ireland, in the European Union, with Supabase. The pages are served by Vercel.
            Emails about event registrations are sent through Resend, and notifications through the service your phone
            or browser uses for them. Everything travels encrypted, and the database is encrypted where it is stored.
          </p>
        </Part>

        <Part title="Your choices">
          <ul className={list}>
            <li>
              See and correct what you gave in <Link to="/settings/profile" className="font-medium text-accent-blue-soft">Settings, About you</Link>.
            </li>
            <li>Turn notifications and location off in your phone’s or browser’s own settings at any time.</li>
            <li>
              Download a copy of everything held about you, as one file, from{' '}
              <Link to="/settings/account" className="font-medium text-accent-blue-soft">Settings, Your account</Link>.
            </li>
            <li>
              Remove your account yourself, in the same place, or ask the Owner of the app to. It goes at once, and
              takes your details, answers, messages, clock-ins and prayer requests with it. A line you wrote for a
              team, such as a debrief note, stays without your name.
            </li>
            <li>
              Add a second step to signing in: a code from an authenticator app on your phone, asked for after your
              password.
            </li>
          </ul>
        </Part>

        {(who || said.postal_address) && (
          <Part title="Who to ask">
            <p>
              {who && (
                <>
                  For anything about your information, ask {who}
                  {said.contact_email && (
                    <>
                      {' '}
                      at{' '}
                      <a href={`mailto:${said.contact_email}`} className="font-medium text-accent-blue-soft [overflow-wrap:anywhere]">
                        {said.contact_email}
                      </a>
                    </>
                  )}
                  .{' '}
                </>
              )}
              {said.postal_address && <>By post: {said.postal_address.replace(/\s*\n\s*/g, ', ')}.</>}
            </p>
          </Part>
        )}

        {said.note && (
          <Part title={`From ${CHURCH_NAME}`}>
            <p className="whitespace-pre-line">{said.note}</p>
          </Part>
        )}

        <Part title="If something is not right">
          <p>
            Speak to the church first: the Owner of the app, or an Admin, can show you what is held and put it right.
            If you are still unhappy with how your information has been handled, you can complain to the Information
            Commissioner’s Office, the United Kingdom’s regulator for this, at ico.org.uk.
          </p>
        </Part>

        <p className="mt-10 text-body-sm text-on-surface-faint">
          This page describes what the app does. For anything it does not answer, speak to the church.
        </p>
      </article>
    </PublicShell>
  )
}
