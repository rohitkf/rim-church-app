# RIM design system

The rules the app is built from. Read this before adding a screen; if you
find yourself writing a colour, a radius or a shadow by hand, the answer is
almost certainly already here under a name.

Everything lives in `frontend/src/index.css` (tokens) and
`frontend/src/components/Surface.tsx` (primitives). Pages compose the
primitives and choose nothing for themselves — which is what stops the
tenth screen from being the one that quietly invents a sixth grey.

---

## 1. The idea in one paragraph

A true-black ground. Content in **tiles** a step above it, each wearing a
hairline of light along its inside edge. One blue accent, spent only on
what is **live** or **actionable** — so it appears once or twice per screen
and never as decoration. Counts, times and tags are set in mono, which is
what makes a dense screen scannable. Depth comes from light, not shadow.

Dark is the reference. Light is the same structure with the ground
inverted; every component paints from tokens, so neither has to know which
one it is in.

---

## 2. Ground and tiles

Four surface steps, and no more — past four the eye stops telling depth
from decoration.

| Token | Dark | What sits here |
|---|---|---|
| `background` | `#000000` | the page |
| `surface-lowest` | `#141418` | **a tile** — the default home for content |
| `raised` | `white / 4.5%` | a row or a nested card inside a tile |
| `raised-strong` | `white / 8%` | a quiet button, a bar's empty track |
| `inset` | `black / 30%` | a row sunk into a tile (segmented controls) |

The hairline is not a border. Use the `hairline` utility
(`inset 0 0 0 1px`), never `border`: a tile's edge has to read as it
catching light, not as a line drawn around it.

```html
<!-- yes -->
<div class="rounded-[var(--radius-tile)] bg-surface-lowest hairline">
<!-- no -->
<div class="rounded-lg border border-gray-800 bg-neutral-900">
```

### The ambient wash

Each section lights the page a different colour, set by `--wash-hue` in
`AppShell`, so you know where you are before you read anything: Dashboard
and Planner blue, Checklists and Availability green, Teams and Volunteers
indigo, Inventory amber. It is light **behind** the tiles, never colour on
them. Adding a route means adding one line to `WASH`.

---

## 3. Colour

Blue is the only colour that means "act on this" or "this is live".
Everything else carries a fixed meaning and nothing else.

| Token | Meaning |
|---|---|
| `accent-blue` `#0a84ff` | the action, the live thing, the current page |
| `accent-green` `#30d158` | done, signed off, available, in service |
| `accent-orange` `#ff9f0a` | waiting on someone, needs attention |
| `accent-red` `#ff453a` | refused, missing, unanswered |
| `accent-indigo` `#5e5ce6` | the assistant, and the first checklist stage |

Each has a `-soft` variant for **text on a dark ground** — `#0a84ff` on
`#141418` is legible as a fill but not as a sentence, so text uses
`accent-blue-soft`. Tints are made with `color-mix`, not opacity on the
element, so nested content keeps its own contrast.

### The verification chain

The three-stage chain has its own tokens and its order never changes:

`status-pending` → `status-member` (indigo) → `status-head` (blue) →
`status-coordinator` (green)

These map 1:1 onto the `checklist_item_status` enum. If the enum ever
gains a stage, add a token — don't reuse an accent.

---

## 4. Form

### Radii step down as things nest

| Token | px | Used for |
|---|---|---|
| `--radius-tile` | 32 | a tile on the canvas |
| `--radius-card` | 28 | a card, a modal |
| `--radius-panel` | 24 | a panel nested in a tile |
| `--radius-row` | 20 | a row in a list |
| `--radius-chip` | 16 | an input, a small chip |
| `999px` | — | **every** button, pill and badge |

A nested thing is never rounder than its parent.

### Shadow

Two tokens: `--shadow-ambient` and `--shadow-lifted`. On dark they are
near-black and do almost nothing — the hairline carries the edge. Only
things that genuinely float (the dock, a modal, the sign-in card) get
`lifted`. Tiles that just sit there get neither.

### Motion

One easing curve for the whole app: `--ease-glide`. Nothing uses `linear`
or `ease-in-out`. Durations are 300ms for colour, 500ms for movement.
`prefers-reduced-motion` is honoured globally in `index.css` — you do not
need to handle it per component.

---

## 5. Type

`-apple-system` / SF Pro for prose, **JetBrains Mono for anything
countable** — labels, counts, times, tags, IDs. That split is most of what
makes the app legible at a glance.

| Class | Size | Used for |
|---|---|---|
| `text-display` | 76 mono | the countdown, once per screen |
| `text-headline-xl` | 40/46 | the page title |
| `text-numeral` | 44 | a tile's headline figure |
| `text-headline-lg` | 28/34 | a hero tile's subject |
| `text-headline-md` | 22/28 | a section heading |
| `text-body-lg` | 17/26 | a page's opening sentence |
| `text-body-sm` | 15/22 | the app's ordinary text |
| `text-label-md` | 14 | buttons, links |
| `text-label-sm` | 12 mono | counts, timestamps |
| `text-eyebrow` | 11 mono, `.18em`, uppercase | every tile's label |

Use `tabular` on any number that changes, or the layout twitches as it
updates.

---

## 6. The primitives

Import from `components/Surface.tsx`. If a screen needs something that
isn't here, add it here rather than inline — that is the whole mechanism.

| Primitive | What it is |
|---|---|
| `Tile` | content on the canvas. `tone`: `plain` \| `accent` \| `success` \| `warning` \| `danger` |
| `Panel` | a Tile with a titled header strip (`title`, `icon`, `live`, `aside`) |
| `PageHeader` | every page's opening: eyebrow, title, one line, one action |
| `Eyebrow` | the mono micro-label above a heading or a number |
| `Row` | a line inside a tile. `variant`: `raised` \| `inset` \| `dashed` \| `bare` |
| `Pill` | a status or a tag. Always mono, uppercase, `dot` optional |
| `ActionButton` | every button. `tone`: `primary` \| `quiet` \| `success` \| `danger` \| `ghost` |
| `Statistic` | a headline figure with its unit |
| `StackedBar` | parts of a whole, in the order they happen |
| `LiveDot` | the pulsing green dot: this is happening now |
| `Field` / `inputClasses` | a labelled control |
| `Overlay` | anything covering the page: a sheet, a confirmation, a picker. `align`: `center` \| `sheet` |
| `TeamMark` | the mark beside a team's name — a dot, or a gradient spine |
| `TeamAvatar` | a team's initials on its own colour |
| `TeamChip` | a team's name as a tag |
| `TimelineRow` / `TimelineCard` | a running order as a vertical clock (`components/Timeline.tsx`) |
| `AssigneePill` | the person something belongs to, with their initials |

Two rules about buttons: **every button is a pill**, and **one primary per
screen**. If two things look equally important, one of them isn't.

### Three recurring shapes

Some patterns turn up on more than one screen, and when they do they look
the same on each:

- **A pairing** — a role and the person holding it, a label and its value —
  goes on **one line**, label left in `on-surface-variant`, value right in
  `on-surface`. Never two columns the reader has to join up themselves.
- **A sequence in time** is a `TimelineRow`: times locked to the rail,
  cards hanging off it. The gap between two dots is the shape of the thing.
  When the sequence is *happening*, the rail is also a clock: pass each row
  its `fill` (0–1) and the part that has already happened turns green, the
  session on now pulses, and the rest stays quiet. Each row fills its own
  segment, so nothing is ever measured and a phone draws what a monitor
  draws.
- **A choice between a few answers** is a segmented control — one object
  with the chosen answer filled in — not a row of separate buttons. The
  Availability Yes/Maybe/No is the reference; targets are 44px tall
  because they are tapped standing up.

Two rules about overlays. Everything that covers the page goes through
`Overlay`, which portals to `document.body` — a `fixed` child is measured
against the nearest ancestor carrying a transform, and an interactive Tile
lifts 2px on hover, which is enough to trap a dialog inside the card that
opened it. And **the OS's own dialogs are not part of this system**: a
native colour or date picker arrives with its own chrome, its own palette
and its own idea of what is legible. Where one is needed, build the choice
from `TEAM_COLORS`-style curated options instead — see
`components/TeamColorSheet.tsx`, which offers twelve named colours, each
one legible as a tint, as text and as a dot.

And one rule about states: **the thing that needs a person is the thing
that gets the colour.** A session with nobody on it, a team that hasn't
answered, an item in repair — these wear the amber tone; everything
settled stays quiet.

### Team identity: two ways of drawing one colour

A team has exactly one colour, chosen once in the picker. **How much of a
row that colour is allowed to use is a viewer preference**, not a
per-screen decision. It has two controls, the same pair the theme has: a
one-tap toggle in the top bar (`TeamStyleToggle`, beside `ThemeToggle`) and
the full choice in the account menu. Stored per browser, read through
`useTeamStyle`:

- **Gradient** (the default) — the dot becomes a **spine** (a vertical bar, full colour
  at the top, fading down) and the row itself takes a **wash** of the team
  colour, strong at the leading edge and gone by the far end. A team is
  then identifiable from the shape of the row rather than from a circle you
  have to look for.
- **Dot** — a 10px circle beside the name. The quietest possible mark; the
  row stays neutral and only what needs a person is coloured.

Every recipe lives in `lib/teamGradient.ts` and derives from the one chosen
colour, so nothing new has to be picked when a team is created. Four rules
hold it together:

1. **Alpha is written as `rgb(r g b / a)`, not built with `color-mix`.** A
   gradient stop has to be a colour every CSS engine that touches these
   styles can parse, and the hex is already normalised.
2. **A wash is a `backgroundImage`, never a `background`.** It layers over
   whatever surface the caller already has, so a washed row keeps its own
   tile colour and fades to exactly that — in either theme, with no token
   to keep in sync.
3. **`teamWash` returns `undefined` in dot mode**, so a caller can spread
   it unconditionally and keep its classes.
4. **Attention still outranks identity.** A team that owes answers keeps
   its amber row; an empty rota keeps its dashed outline. The wash is who,
   not what needs doing — and where the two would compete, what needs doing
   wins.

Never read `dept.color` in a page. Use the primitives, or the app ends up
half dots and half gradients.

---

## 7. Navigation

A floating dock, not a sidebar (`components/DockNav.tsx`). It costs no
horizontal space, it sits where a thumb already is, and **only the
destination you are on wears a label** — which is what lets the others be
icons without the row becoming a puzzle. The row scrolls rather than
wraps: a dock that changes height moves the content underneath it.

Adding a destination is one entry in `navItems` in `AppShell.tsx`, plus its
wash colour.

**The top strip earns its background.** At the top of a page it sits on the
ground and needs nothing; once content is passing underneath it, the two
collide unless the strip stands on something. So on scroll it takes a
translucent ground with the page blurred behind it and a hairline along its
bottom edge (`useScrolled`), and gives it back at the top. Nothing else in
the app blurs its backdrop: a `backdrop-filter` makes an element the
containing block for any `fixed` descendant, which is how a dialog ends up
trapped inside the thing that opened it.

---

## 8. Writing

The interface talks like a person who knows the job.

- Say what happened, not what failed: *"Nobody has been checked in yet"*,
  not *"No data"*.
- Name the thing to do: *"2 still to answer"*, not *"Incomplete"*.
- Empty states say why it is empty and what fills it.
- Errors are role-aware — see `lib/humanError.ts`. Volunteers get plain
  words; Admins get those **plus** the raw message, because they are the
  ones who have to fix it.

---

## 9. Adding a screen

1. `PageHeader` with an eyebrow, a title, one line of orientation, and at
   most one action.
2. Content in `Tile`s. On a wide layout use the 12-column grid and the
   design's 7/5 rhythm — alternating the wide tile keeps a long page from
   reading as two stacked columns.
3. Lists are `Row`s inside a Tile, not their own cards.
4. Statuses are `Pill`s. Numbers are `Statistic`s. Progress is a
   `StackedBar` or a ring.
5. Add the route's wash colour to `WASH` in `AppShell.tsx`.
6. Check it at 393px wide. The dock overlays the page, so the last element
   needs room beneath it — `main` already reserves it.

### Checklist before you ship a screen

- [ ] No hand-written hex, radius or shadow
- [ ] No `border` where `hairline` belongs
- [ ] Exactly one primary button
- [ ] Every count in mono, every changing number `tabular`
- [ ] Readable at 393px, and in light as well as dark
- [ ] Nothing conveyed by colour alone — a pill carries a word too

---

## 10. Provenance

This system is the implementation of the Claude Design handoff
(`RIM Dashboard.dc.html`, screens 1a–4d). Where the prototype used inline
styles, the values live here as tokens; where it drew a screen, the app
composes the same shapes from primitives. The prototype is the reference
for *look*; this file is the reference for *rules*.
