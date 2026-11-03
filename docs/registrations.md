# How Registrations work

An event goes from a draft in the office to a ticket on someone's phone,
then to a scan at the door. If the event has to be called off, it ends
with refunds. Four parties take part: the **organisers** (the office),
the **attendee** (no account needed), **the app** (database rules and
emails), and **Reception** (at the door).

A visual version of this page, with a swimlane diagram, is in
[`registrations-overview.html`](./registrations-overview.html). Open it in
a browser. Keep the two in step: a change to one is a change to both.

## The whole flow

```mermaid
flowchart LR
  subgraph Office
    A[Create event<br/>dates · tickets · promo<br/>picture · online/in person] --> B[Publish<br/>open · close · reopen]
    E[Check payment<br/>mark Paid or Waived]
    K[Cancel event<br/>refunds owed → Refunded]
  end
  subgraph Attendee
    C[Register<br/>/register/… no sign-in] --> D[Pay<br/>bank · PayPal · cash<br/>upload receipt]
    G[Ticket page<br/>QR · countdown<br/>join link if online]
    L[Refund<br/>bank/PayPal: sent back<br/>cash: bank details form]
  end
  subgraph App
    H[Church diary]
    I[Order + email<br/>ticket code · sold-out push]
    F[Paid email<br/>join link if online]
    M[Tidy up<br/>names blanked after set days]
  end
  subgraph Reception
    J[Scan & check in<br/>paid: in, no tap<br/>owes: Paid now · walk-ins]
  end

  B -- diary sync --> H
  B -- share link / QR --> C
  C --> I
  D -- receipt --> E
  E --> F
  F --> G
  I -. free: nothing to pay .-> G
  G -- shows QR --> J
  E -. if it must be called off .-> K
  K -- email --> L
  J -. after the event .-> M
```

Solid arrows are the usual path. Dashed arrows are the branches: free
tickets skip paying, an event can be cancelled at any time, and personal
details are tidied away after the event.

## Who does what

### Organisers — Registrations → an event

- Build the event: one or several dates; ticket types (free, paid,
  donation) with limits; promo codes that apply to every paid ticket or
  only chosen ones.
- Upload a picture and set its focus point, so the important part of it
  stays in view.
- Choose in person, online or both. For in person, type the address and
  place the map pin; directions and the map go to the pin. For online, add
  the join link and details.
- Publish to get the share link and a QR code. Close and reopen sales; a
  countdown on the register page shows when sales close.
- Watch orders arrive, open receipts over the page, mark payments, add
  notes, and export to Excel. The event's page says up front what wants
  doing (receipts to check, payments awaited, refunds owed), and an order
  that needs a decision carries it as a button on its row.
- Cancel the event and settle refunds. An event can be deleted only once
  every paid order is refunded.

### Attendee — `/register/…` and `/ticket/…`, no account

- Opens the shared link, picks tickets and a date, adds names, and applies
  a promo code.
- Pays by bank transfer, the PayPal link, or at Reception, and uploads a
  receipt.
- Gets an email with an **Open ticket** button. The ticket page shows the
  QR code, the payment state, and a countdown to the start.
- For an online event, the join link appears once the ticket is confirmed
  and paid.
- Can cancel their own ticket until they are checked in.
- If the event is cancelled, bank and PayPal payers are refunded the way
  they paid, usually within 5–7 working days. If it has not come back by
  then, or they would rather have it in another account, they can send
  bank details from the ticket page. Cash payers must fill in that form,
  since cash has nowhere to go back to.

### Reception — `/door`

- Points the camera at a ticket's QR code, or types the code.
- A paid or free ticket for today checks in straight away, with no tap.
- A ticket that still owes is held up with **Check in** and **Paid now,
  check in**.
- Warns about cancelled tickets, tickets for another day, and people
  already checked in.
- Registers walk-ins on the spot, paid or free.

### The app — database rules and emails

- Creates the order and its ticket code, and sends the confirmation email.
- Puts the event on the church diary.
- Notifies the organisers when a ticket type sells out.
- Sends the "paid" email when a payment is marked, and the "cancelled"
  email to everyone if the event is called off.
- Blanks names, emails and phone numbers a set number of days after the
  event (`registration_anonymise()`). Counts and totals stay.

## Payments and refunds

Each order carries one payment state, which the organisers or Reception
move on.

| Order | States |
|---|---|
| A paid ticket | Awaiting payment → Receipt sent — being checked → **Paid**, or **Paid (waived)** |
| A free ticket, or 100% off with a promo code | **Nothing to pay** (Reception shows "Free with code …") |
| The event is cancelled | **Refund owed** → **Refunded** |

Bank details from the refund form can be seen only by people with the
Refunds right. They are wiped as soon as the order is marked Refunded.
The office sees on each refund whether details have come in, and the
refund sheet says where the money should go for every way of paying.

## Who is allowed to do what

Each part of the work is its own right (0251). Give a right to a role, or
to one person, in Settings → Access & Privileges. The database checks
every right (`registration_can()`), so hiding a button is never the only
protection.

| Right | Capability | What it lets someone do |
|---|---|---|
| Run registrations (all of it) | `reg.manage` | Everything below, except deleting an event |
| View & export | `reg.view` | See events, orders and promo codes; export to Excel; add notes |
| Make & edit events | `reg.edit` | Create and edit events, dates, tickets, promo codes and the picture |
| Approve payments | `reg.approve` | Mark Paid, waive, or set back to awaiting |
| Refunds | `reg.refund` | See refund details and mark orders Refunded |
| Cancel & delete | `reg.cancel` | Cancel or restore orders, cancel the event, delete it once refunds are done |
| Check people in | `reg.door` | Use Reception and the scanner |
| Take payments at the door | `reg.door_pay` | "Paid now, check in" at Reception |
| Register walk-ins | `reg.walk_in` | The Walk-in tab at Reception |

## Safety built in

- **No back door.** The register and ticket pages need no account, but they
  open nothing else. They can't sign anyone in or reach the app. A ticket
  page shows only that one order, found by its long random code.
- **Join link.** An online event's link is never on the public page. It
  appears only on a ticket that is confirmed and paid, and goes away if
  the event is cancelled.
- **No lost money.** A paid event can't be deleted while anyone is still
  owed a refund. Cancelling keeps every order and who paid.
- **Privacy.** Personal details are blanked after the event. Receipts and
  refund details are visible only to people with the right to see them.

## Where it lives

- Migrations `0244`–`0251` (`supabase/migrations/`).
- `supabase/functions/registration-email/` sends every email.
- `frontend/src/lib/registrations.ts` and `lib/registrationRights.ts`.
- Pages: `RegistrationsPage`, `RegistrationEditorPage`,
  `RegistrationEventPage`, `RegisterPage`, `TicketPage` and `DoorPage`.
