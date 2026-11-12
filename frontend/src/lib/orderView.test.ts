import { describe, expect, it } from 'vitest'
import { orderViewSchema } from './registrations'

/*
 * What registration_order_view() really sends — the ticket page's one
 * source. This is a production answer (0251, before 0252) with the
 * person's details swapped out. Every other ticket test feeds the page an
 * OrderView it made itself, past the schema, so none of them caught that
 * the database said null where the schema wanted false — and the page
 * showed "No such ticket" for every ticket.
 */
const live = (): Record<string, unknown> => ({
  "code": "ABCDEFGHJKMN",
  "date": null,
  "join": null,
  "name": "Ama Owusu",
  "email": "ama@example.org",
  "event": {
    "slug": "pastors-leaders-conference-2026",
    "dates": [
      {
        "id": "32658a2b-13ec-449e-a164-b70609d28231",
        "label": null,
        "ends_at": null,
        "starts_at": "2026-11-20T18:30:00+00:00"
      },
      {
        "id": "a0695bc3-0a3b-4d01-ae54-664189765d23",
        "label": null,
        "ends_at": "2026-11-21T20:00:00+00:00",
        "starts_at": "2026-11-21T10:00:00+00:00"
      }
    ],
    "title": "Pastors & Leaders Conference 2026",
    "status": "published",
    "location": {
      "name": "Church Hall",
      "address": "90-96 High Street North, E6 2HT, London Borough of Newham, Greater London, England, United Kingdom",
      "latitude": 51.5359982301591,
      "longitude": 0.0529738025824722
    },
    "date_mode": "all",
    "attendance": "in_person",
    "image_path": "events/3aaf1225-30f4-4a52-ba1f-3c64d8c142d0.jpg",
    "cancel_note": null,
    "image_focus": {
      "x": 45,
      "y": 93
    },
    "cancelled_at": null,
    "payment_note": null,
    "allow_pay_at_reception": true
  },
  "phone": "+447911123456",
  "source": "online",
  "status": "confirmed",
  "payment": {
    "links": [
      {
        "url": "https://example.org/pay",
        "label": "PayPal"
      }
    ],
    "accounts": [
      {
        "bic": null,
        "iban": null,
        "label": "General",
        "bank_name": "Example Bank",
        "sort_code": "00-00-00",
        "account_name": "THE CHURCH",
        "account_number": "00000000"
      }
    ]
  },
  "tickets": [
    {
      "kind": "paid",
      "type_name": "General admission",
      "attendee_name": null,
      "unit_price_pence": 3000
    }
  ],
  "proof_at": null,
  "quantity": 1,
  "logo_path": "logo/2f5d58eb-bf37-4c4e-8982-c6960f31d606.png",
  "refund_at": null,
  "can_cancel": true,
  "created_at": "2026-11-03T16:12:30.200555+00:00",
  "promo_code": null,
  "total_pence": 3000,
  "checked_in_at": null,
  "refund_status": null,
  "discount_pence": 0,
  "payment_method": "reception",
  "payment_status": "received",
  "subtotal_pence": 3000,
  "proof_reference": null,
  "refund_details_sent": false,
  "refund_details_wanted": null
})

describe('the ticket the database sends', () => {
  it('parses an order with no refund, where the refund fields come back null', () => {
    const raw = live()
    expect(raw.refund_details_wanted).toBeNull()
    const order = orderViewSchema.parse(raw)
    expect(order.refund_details_wanted).toBe(false)
    expect(order.refund_details_sent).toBe(false)
  })

  it('still reads true and false as they are', () => {
    expect(orderViewSchema.parse({ ...live(), refund_details_wanted: true }).refund_details_wanted).toBe(true)
    expect(orderViewSchema.parse({ ...live(), refund_details_sent: true }).refund_details_sent).toBe(true)
    expect(orderViewSchema.parse({ ...live(), refund_details_wanted: false }).refund_details_wanted).toBe(false)
  })

  it('takes an answer without the refund fields at all (before 0250)', () => {
    const raw = live()
    delete raw.refund_details_wanted
    delete raw.refund_details_sent
    expect(orderViewSchema.parse(raw).refund_details_wanted).toBe(false)
  })

  it('reads what became of the email, and whether the page may correct the address (0283)', () => {
    // A database from before the migration says nothing: nothing to say, nothing to fix.
    const before = orderViewSchema.parse(live())
    expect(before.email_state).toBe('none')
    expect(before.email_can_fix).toBe(false)
    for (const state of ['none', 'waiting', 'delivered', 'bounced'] as const) {
      expect(orderViewSchema.parse({ ...live(), email_state: state }).email_state).toBe(state)
    }
    expect(orderViewSchema.parse({ ...live(), email_state: 'bounced', email_can_fix: true }).email_can_fix).toBe(true)
    expect(orderViewSchema.parse({ ...live(), email_can_fix: null }).email_can_fix).toBe(false)
    // A word a later database might say: read as nothing, not as "No such ticket" for everybody.
    expect(orderViewSchema.parse({ ...live(), email_state: 'held' }).email_state).toBe('none')
  })
})
