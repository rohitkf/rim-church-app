# Security, sign-in, data, threats and the launch list

Five short documents in one file, because they answer to each other: what
the app refuses, who gets in and for how long, what it keeps, where
somebody could break in, and what is checked before a change reaches the
congregation. Each line is something that can be checked, and says where.
`AGENTS.md` is still the rulebook for how to change the app; this is the
account of how it stands. It was written on 26 November 2026 against the
live project and the code at that date. Change the app and change this.

Things marked **Open** are not done. Things marked **Owner** are choices
only the Owner can make.

## 1. Security rules

| Rule | How the app keeps it | Where to check |
| --- | --- | --- |
| Everything typed in is checked before it is saved | The page checks it (`zod`, the form's own rules); the database checks it again, because the page can be bypassed: constraints, triggers and `may()`-guarded functions refuse what the page would not have sent (migrations 0330 and 0331 closed eighteen such gaps) | `supabase/migrations`, `frontend/src/lib/*.test.ts` |
| Nothing typed in is ever run as code | React escapes every value it draws. The app never writes raw HTML: no `dangerouslySetInnerHTML`, no `innerHTML` | `grep -r dangerouslySetInnerHTML frontend/src` finds nothing |
| Secrets stay out of the code | The only key in the built app is Supabase's publishable key, which is meant to be public and can do nothing the row rules do not allow. The service key lives in the edge functions' environment and nowhere else. `.env` files are ignored by git | `.gitignore`, `supabase/functions/*/index.ts` (`Deno.env.get`) |
| Every table has row rules | 122 of 122 public tables have row level security on. Fifteen have it on with no policy at all: those are closed to the app and reached only through functions that check who is asking | Supabase's security advisor; `select count(*) from pg_class … where not relrowsecurity` |
| Functions that run with the database's own rights are pinned | Every `security definer` function sets its own `search_path` (0333 put back the one that had lost it; 0334 restates it on each function it replaces) | `select count(*) from pg_proc where prosecdef and proconfig is null` is 0 |
| Passwords | Eight characters at least, in the form and on the server (the server accepted six until 26 November 2026). Stored hashed by Supabase Auth | `GET /v1/projects/<ref>/config/auth` → `password_min_length` |
| Guessing a password | Supabase limits sign-in attempts per address it comes from. The sign-in form counts for itself too: five wrong passwords for one email in a quarter of an hour and it waits a minute before asking again, then five, then fifteen (`lib/signInTries`). A new password is checked against Have I Been Pwned's list of breached ones before it is sent to be stored; five characters of its fingerprint leave the device, never the password (`lib/breachedPassword`). **Open:** both of those are the form's, so somebody calling Supabase directly is held only by Supabase's own limit. A lock on the account itself needs Supabase's Team plan. A CAPTCHA (Cloudflare Turnstile) would hold on this plan; the Owner has said there is no need for one (26 November 2026), and none was ever built: the app has no CAPTCHA anywhere | `frontend/src/lib/signInProtections.test.ts`; Supabase › Authentication › Attack protection |
| Everything is encrypted | In transit: HTTPS only, with HSTS for two years (`strict-transport-security`, set by Vercel). At rest: Supabase encrypts the database and its storage | `curl -sI https://rim-church-app.vercel.app` |
| The browser is told what the site may do | No framing by other sites, no content-type guessing, a trimmed referrer, a `Permissions-Policy` that leaves the camera, microphone and location to this site alone, and a `Content-Security-Policy`: scripts run from this site only, none typed into the page and none made up as it runs, so text that somehow got past React's escaping still could not run. What the policy refuses is recorded with the app's other errors (Settings › App Health). Pictures, video and requests may still go to any `https` address, because event pictures and links are the church's own | `frontend/vercel.json`, `frontend/src/lib/contentPolicy.test.ts` |
| Files people upload | Seven storage buckets, six private. Each has a size limit and a list of allowed types set on the bucket itself, so the limit holds whatever the page sends. The one public bucket holds the pictures on public event pages | `select id, public, file_size_limit, allowed_mime_types from storage.buckets` |
| Updates are installed | Dependabot proposes updates every Monday into `develop`; a weekly job fails loudly if `npm audit` finds anything rated high; CI runs the same audit on every change. The edge functions' imports are pinned by hand and a test holds them to one version | `.github/dependabot.yml`, `.github/workflows/dependency-audit.yml` |

## 2. Sign-in rules

**Who signs in.** One kind of account, by email and password, confirmed by
a link sent to the address. What an account may do comes from its roles:

| Standing | What it is |
| --- | --- |
| Owner | One person. Holds everything, and is the only one who can hand the app over or take Admin away |
| Admin | Runs the app: people, teams, settings, the menu |
| Pastor | Reads what a pastor needs: private prayer requests, DBS and visa details |
| Head, Coordinator | Run one team: its rota, checklists and debriefs |
| Team member | Serves on a team: answers, sees the rota, ticks checklists |
| Church member | An account on no team: the Calendar, updates, giving, prayer |
| Nobody signed in | The public event pages only (`/register/…`, `/ticket/…`) and `/privacy` |

**What each can see.** Nobody sees more than their standing needs, and the
database decides, not the page: every read goes through a row rule or a
function that asks `may(user, right)`. The grid of rights is in Settings ›
Access & Privileges and in `frontend/src/lib/permissionMatrix.ts`. An
Admin can look at the app as any standing (View as) to check it.

**How long they stay signed in.** For as long as the device is in use.
A device nobody has opened the app on for thirty days is signed out the
next time it is opened, and the sign-in page says why (`lib/idleSignOut`,
since 26 November 2026). Thirty days and not the eight hours a bank would
use: volunteers open this on their own phones on a Sunday, and a limit
shorter than the gap between two Sundays is a sign-in every week. It is
the device's own memory, so it covers a phone that is lost or handed on;
a token copied off a device is not touched by it. **Open:** Supabase's own
time limit on a session, which would cover that, needs the Pro plan.

**A second step: built, and switched off.** A code from an authenticator
app after the password was built and released on 26 November 2026 (0334,
`lib/secondStep`), and the Owner said the same day that there is no need
for any two-step sign-in for now. So it is not offered: the card that sets
one up is not drawn (`SECOND_STEP_OFFERED`), nothing in the app mentions
it, and enrolment is off on the server (`mfa_totp_enroll_enabled`), so one
cannot be made by calling Supabase directly. Nobody had set one up. What
stays in place does nothing while no account has an authenticator: the
rule in `reject_removed_user()` that refuses a half signed-in account, and
the page that asks for the code. **Open, Owner:** the Owner, Admins and
Pastors can read contact, DBS and visa details behind a password alone.
Turning it back on is one constant, one server setting and the words in
the tour, the release note and `/privacy`.

## 3. Data rules

**What is kept, and why.** Only what running the services needs:

- The account: name, email, phone, date of birth, marital status and
  anniversary, a photo and an emergency contact if given.
- Serving: teams, rota places, answers, checklist ticks, clock-ins (the
  time and where the phone was, read once, at the press of Clock in).
- What people write: messages, chat, prayer requests, debriefs, issues,
  poll answers, feedback.
- Families: links between accounts, and children written in by name.
- For some who serve: DBS certificate details, visa type and expiry.
- Event registrations from the public: name, email, phone, what was
  booked, whether it is paid, a picture of a bank receipt if sent.
- **Never kept:** card numbers. Card payments happen on the payment
  company's own page; the app stores a link to it and nothing else.

**How it travels and where it sits.** Encrypted from the form to the
database (HTTPS), in Supabase's database in Ireland (`eu-west-1`), served
by Vercel. Registration emails go through Resend. Private files are read
through links that expire.

**When it is deleted.** By the clock, not by remembering: twenty-four
scheduled jobs. A service and everything about it goes a fortnight after
its date; chat, polls, clock-ins, closed prayer requests, feedback and
church events each on their own count of days, set in Settings and said on
each page; an account never confirmed after seven days; a registration's
name and contact details ninety days after its event. An account removed,
by the Owner or by the person themselves, goes at once and takes its rows
in forty-three tables with it; what the person wrote for a team stays
without their name.

**What people are told.** `/privacy`, "What the app keeps about you", open
without signing in and linked from signing up and signing in (added 26
November 2026; before that nothing said). It is a plain account of what
the app does, and names the Information Commissioner's Office as where a
complaint goes. Who to ask, the church's postal address and anything it
wants said in its own words are four boxes in Settings › General (0334,
`lib/privacyDetails`); the page shows whichever are filled in, as plain
words. **Open, Owner:** nothing is in those boxes until the church types
it, the church's reasons in law for keeping each thing are its own to
state there, and somebody qualified should read the page.

**Rules by country.** The church and its people are in the United
Kingdom, so UK GDPR and the Data Protection Act 2018 apply, and the data
is held in the EU, which the UK treats as adequate. A person can download
what is held about them and remove their own account, both from Settings ›
Your account (0334, `lib/myData`). The copy is every table whose rows are
deleted with the account, found from the database's own foreign keys and
not from a list, so a table added later is in it the day it is made. It
is given as a document in plain words (`lib/myDataReadable`: a heading for
each kind of thing, a name where the database keeps an id, nothing for a
blank), because the first version handed over the rows as stored and the
Owner could not read theirs; the rows as stored are still offered beside
it. A table or a column the document has not heard of is shown under its
own name, so it never holds less than the database gave. The
keys a browser was given for notifications and four tables of the
database's own bookkeeping are left out. Removing asks for the account's
email address to be typed, and the database checks it again and refuses
the Owner, who must hand the app on first.

## 4. Threat map

| Where somebody could get in | What they would try | What stands in the way | Tested |
| --- | --- | --- | --- |
| The sign-in page | Guessing passwords; signing up as somebody else | Email must be confirmed; eight-character minimum; per-address limits. No lockout, no CAPTCHA, and no second step (built, switched off: section 2) | Audit, November 2026 |
| The public event pages | Flooding registrations; reading other people's tickets; injecting text | No account needed by design. Tickets are reached by an unguessable code; every public function checks its own inputs; text is escaped | Audit, November 2026: 7 confirmed issues fixed (0330), 18 of 21 leads fixed (0331) |
| Any form, signed in | Sending what the page would not: a row already approved, another team's id | The database re-checks: row rules, triggers, `may()` | Each fix replayed against its attack on a local database before release |
| File uploads | A huge file, a script dressed as a picture | Size and type limits on the bucket; private buckets; proofs capped at five | Audit, November 2026 |
| The admin pages | A member opening Settings or People | Pages are gated in the app and, where it matters, in the database; an Admin's rights are rows the Owner can see | View as, each standing |
| The API itself (Supabase's REST and functions) | Calling a function directly with the public key | 318 functions that run with the database's rights are callable signed in and 19 signed out; each asks who is calling. The 19 are the public registration functions, two version checks, the error report, the request guard itself and what the church says on `/privacy` | Supabase's advisor, reviewed 26 November 2026; counted again after 0334 |
| The edge functions | Calling them without rights; making them send mail or pushes | Each checks its caller. Three need a signed-in person or the server's own key; the two the public event pages use do only what one registration allows. Push endpoints must be a real push service; mail is throttled | Smoke tests after each deploy |
| A lost or shared phone | Opening the app already signed in | Signed out after thirty days without use (section 2). Before that, the Owner can remove or block the account | Unit tests |
| A DBS check | Changing the details between the checker's reading and the checker's click, so details nobody looked at are marked verified | The mark is refused unless the details are still the ones shown (0335) | Replayed on a local database: refused, and the honest check still passes |
| Somebody's own account | Removing it, or copying its data, from a phone left unlocked | The copy holds only that account's rows. Removal needs the account's email address typed, is refused for the Owner, and cannot be done from inside a preview | `lib/myData.test.ts`, replayed on a local database |
| The people who build it | A poisoned package; a secret committed by mistake | Updates wait a week before they are proposed; `npm audit` weekly and in CI; `.env` ignored; a test reads every file the app is built from for the shape of a key and fails if it finds one (`contentPolicy.test.ts`) | CI, every run |

A full pass was run on 25 November 2026 and closed as *incomplete*: four
areas and fourteen tables were not reviewed. It left three questions for
the Owner. One is answered and done: a DBS mark is tied to the details
that were checked (0335; `verify_dbs()` is handed the fingerprint the
checker was shown and marks nothing if what is stored has changed). Two
are with the Owner: whether a payment an attendee reports counts as money
in when a refund is asked for, and whether "get my tickets" may say that
it sent.

## 5. Launch checklist

Before any change reaches `main`:

- [ ] Both type checks, the tests and the build pass (`AGENTS.md` §2).
- [ ] A migration has run on a local database, then as a dry run on
      production, then for real, before the page that needs it is merged
      (`AGENTS.md` §7).
- [ ] A new table has row rules; a new function sets `search_path` and
      asks who is calling.
- [ ] A new page has a rule for who may open it, a step in the tour, and
      was looked at as each standing (View as).
- [ ] Nothing new is typed into the page as HTML, and no key was added to
      the code.
- [ ] Supabase's security advisor shows nothing new.
- [ ] If what is kept about people changed, `/privacy` and section 3 say so.

Where the app stood against the five on 26 November 2026:

| Document | Standing |
| --- | --- |
| Security rules | Kept. Open: a lock on the account itself, which needs a paid plan. No CAPTCHA, at the Owner's word |
| Sign-in rules | Kept: thirty days without use signs a device out. A second step is built and switched off, at the Owner's word |
| Data rules | Kept, said to people, and in their own hands: a copy and removal from Settings. Open: the church's own wording in the four boxes, and a qualified reading |
| Threat map | This table, with no row open |
| Launch checklist | The seven lines above |
