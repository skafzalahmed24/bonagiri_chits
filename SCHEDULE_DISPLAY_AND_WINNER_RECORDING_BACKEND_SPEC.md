# Installment Schedule Display & Auction Winner Recording — Backend Spec

**For the backend team.** This spec covers the backend side of the next flow
increment:

1. Monthly installment schedule visible to every stakeholder (company admin,
   member, business agent, collection agent — **not** super admin)
2. Recording a selected auction winner (from the spinner or the Auction form)
3. Recording the winner's payout amount correctly per scheme type
4. Supporting the spinner (eligible-member filtering)

Companion doc: `docs/SCHEDULE_DISPLAY_AND_WINNER_RECORDING_FRONTEND_SPEC.md`.

**Prerequisite / still open:** `docs/FIXED_CHIT_MEMBER_DISPLAY_SPEC.md` is
**not yet implemented** (verified 2026-07-15: `userService.js:660/985` still
returns raw `auction.bid_amount` as `bid_winning_amount`, and
`userService.js:416/779/917/1013` still reads the never-populated
`group.installment_amount`). That spec is part of this flow — the member-facing
amounts in item 1 are wrong until it ships. Everything below is additive to it.

All formulas referenced here are the ones already verified against the
reference flyers in `docs/FIXED_CHIT_INSTALLMENT_GENERATION_SPEC.md` (now
implemented — `adminService.js:478` and the winner-tracking block at
`adminService.js:1276-1320`). Do not re-derive them.

---

## B1 — New endpoint: `chits-installment/get-by-group` (admin schedule view)

There is currently **no endpoint at all** that returns `chits_installments`
rows to the admin frontend (verified: zero installment routes in
`src/routes/adminRoutes.js`). The admin cannot see the schedule that
`createInstallaments` generates, which makes items 1–3 unverifiable from the
UI.

**Route:** `POST /api/chits-installment/get-by-group` (admin auth, same
middleware as the other chits-group endpoints).

**Request:**

```json
{
  "group_id": "<uuid>",
  "enrollment_id": null,      // optional — filter to one member's schedule
  "min": 0,                   // offset (same convention as other list endpoints)
  "max": 100                  // limit
}
```

**Response `data`:**

```json
{
  "count": 400,
  "rows": [
    {
      "id": "<uuid>",
      "enrollment_id": 12,
      "subscriber": { "id": 34, "name": "..." },
      "group_position_number": 3,
      "installment_no": 1,
      "due_date": "2026-08-01",
      "payable_amount": "9800.00",
      "penalty_amount": "0.00",
      "is_paid": true,
      "paid_amount": "9800.00",
      "payment_date": "2026-08-02"
    }
  ]
}
```

Implementation notes:

- Query `ChitsInstallment` where `enrollment_id IN` (enrollments of the group,
  `delete_status: 0`); include `Enrollment` → `Member` (`subscriber`
  association, `attributes: ['id','name']`) the same way
  `getGroupMembersService` does (`adminService.js:1150`).
- `is_paid` / `paid_amount` / `payment_date`: derive from the existing
  `payments` association (`ChitsInstallment.hasMany(CustomerPayment)` — see
  `models/chitsinstallment.js:9`) with `payment_status = 1`. Same subquery
  pattern already used in `userService.js` and the winner-tracking block.
- Sort: `installment_no ASC, group_position_number ASC`.
- Use `count` (not `total_count`) for the pagination field — either works for
  the frontend, but pick one and keep it.
- Do **not** restrict to fixed-scheme groups. Open Auction groups have
  installment rows too and the admin schedule view will show both.

---

## B2 — Winner flags on `group/members`

`getGroupMembersService` (`adminService.js:1140-1175`) currently returns
`{ id, name, position }` per row. Both the Auction form's bidder dropdown and
the spinner need to know **who has already won** so previous winners can be
excluded (a subscriber can only be a prized bidder once per group).

Extend each row with:

```json
{ "id": 34, "name": "...", "position": 3, "has_won": true, "won_month": 4 }
```

Implementation: one extra query — `Auction.findAll({ where: { group_id },
attributes: ['bidder_id', 'auction_number'] })` — then map onto the rows.
(`bidder_id` stores `Member.id`; that is what the Auction form already
submits.) No pagination concerns: the members list is bounded by
`no_of_installments`.

This is backward-compatible — existing consumers ignore the new fields.

---

## B3 — New endpoint: `auction/record-winner` (+ guard on `store-or-update`)

Today the only way to record a winner is `auction/store-or-update`, where the
client sends **every** figure including `bid_amount`, and nothing prevents
recording the same member as winner twice or recording month 7 before month 3.
The spinner needs a safe, minimal endpoint, and the fixed-scheme amount should
be derived server-side (the same argument as in the member display spec:
financial figures shouldn't depend on what the client sends).

**Route:** `POST /api/auction/record-winner` (admin auth).

**Request:**

```json
{
  "company_id": "<id>",
  "group_id": "<uuid>",
  "bidder_id": 34,
  "auction_date": "2026-07-15",       // optional, default today
  "pb_bo_proxy": "Prized Bidder",     // optional, default 'Prized Bidder'
  "bid_amount": 85000,                 // REQUIRED for Open Auction groups,
                                       // IGNORED for fixed-scheme groups
  "gst_number_percentage": 18,         // optional, Open Auction only
  "due_date": null,                    // optional
  "next_auction_date": null            // optional
}
```

**Server logic, in order:**

1. **Group checks:** group exists, `is_deleted_status = 0`, and
   `chits_group_status === 1` (started). Reject otherwise — a winner cannot be
   recorded for a group with no installment schedule.
2. **Bidder checks:** an `Enrollment` exists for
   `{ group_id, subscriber_id: bidder_id, delete_status: 0 }`.
3. **Duplicate-winner guard:** no existing `Auction` row with the same
   `group_id` + `bidder_id`. Reject with a clear message ("This member has
   already won auction #N in this group").
4. **Auction number (server-assigned, not client-sent):**
   - `lastRecorded = MAX(auction_number)` over existing auctions for the group
     (0 if none).
   - Load the scheme config (if `scheme_configuration_id` is set):
     `companyMonths` = `company_chit` for Type 63, `1` for Type 64, `0` for
     Types 62/65 and Open Auction.
   - `auction_number = MAX(lastRecorded, companyMonths) + 1` — company months
     are skipped automatically; no Auction row is ever created for them.
   - Reject if `auction_number > no_of_installments` (scheme finished).
5. **Amount:**
   - Fixed-scheme group → `bid_amount = getSchemeWinningAmount(schemeConfig,
     auction_number)` — the **exact function specced in
     `docs/FIXED_CHIT_MEMBER_DISPLAY_SPEC.md`** (Types 62/64/65 read
     `prices[n-1].chit_amount`; Type 63 uses
     `chit_value − commission + winnersSoFar × adding`). Implement it once,
     export it, and use it in both places.
   - Open Auction group → require `bid_amount` in the request (reject if
     missing); compute and store the same derived columns
     `store-or-update` receives today (`subscription_amount`,
     `company_commission`, `gst_amount`, `dividend`, `net_payable`, …) using
     the standard formulas (`subscription = chit_amount / installments`,
     `commission = chit_amount × company_commission% `, `gst = commission ×
     gst%`, `dividend = bid_amount − commission − gst`). These are the same
     formulas the frontend's `auctionCalculator` uses.
6. **Create the `Auction` row**, then run the **same winner-tracking
   adjustments** as `storeOrUpdateAuctionService` (`adminService.js:1276-1320`)
   — refactor that block into a shared helper
   (`applyWinnerSchemeAdjustments(auction, group, schemeConfig)`) called from
   both endpoints rather than duplicating it.
7. Update `ChitsGroup.auction_date` from `next_auction_date` if provided (same
   behavior as `store-or-update`).

**Response:** the created auction row (same shape as `store-or-update`), plus
the server-assigned `auction_number` so the UI can display "Recorded as
auction #N".

**Also:** add the duplicate-winner guard (step 3) to
`storeOrUpdateAuctionService` itself, on the `isNew` path only — today it
happily records the same bidder twice and the winner-tracking increment then
fires twice, double-bumping a Type 63 member's installments. That is a live
data-integrity bug regardless of the new endpoint.

---

## B4 — Scheme template block in `user/chit-details`

Members (and the business-agent screens, which reuse the user endpoints) can
only see per-month amounts through `ChitsInstallment` rows — which exist only
after the group starts, and only for the requesting member. To render the full
month-by-month schedule table (item 1) the frontend needs the template.

In `getChitDetailsService` (`userService.js`), when the group has a
`scheme_configuration_id`, include in the response:

```json
"scheme": {
  "scheme_type": 62,
  "chit_value": "100000.00",
  "installment": null,
  "adding_percentage": null,
  "company_percentage": null,
  "company_chit": null,
  "prices": [ { "month": 1, "chit_amount": ..., "withdrawn": ..., "not_withdrawn": ... } ]
}
```

i.e. the raw `FixedSchemeChitsConfiguration` fields (parse `prices` if stored
as a string). `scheme: null` for Open Auction groups. The frontend renders the
schedule client-side from this — no per-month computation needed server-side.

Optional (nice-to-have, not blocking): include `scheme_type` on each group in
`user/all-chits-groups` so the explore screen can label groups by scheme.

---

## Out of scope

- Installment **generation** — already implemented and verified
  (`docs/FIXED_CHIT_INSTALLMENT_GENERATION_SPEC.md`).
- The "regenerate installments" admin action for groups started before the
  pricing fix — still tracked as a separate follow-up (Step 4 of the
  generation spec).
- Collection-agent dues endpoints — they already read
  `ChitsInstallment.payable_amount` and are correct post-fix; no changes.
- Super admin — explicitly excluded from this flow.

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| B1 | `chits-installment/get-by-group` for a started Type 62 group | Month 1 rows `9800.00`-style values matching `not_withdrawn`; `is_paid` reflects `customer_payments` |
| B1 | Same endpoint, `enrollment_id` filter | Only that member's rows |
| B2 | `group/members` after member X won month 3 | X has `has_won: true, won_month: 3` |
| B3 | `record-winner` twice for the same bidder | Second call rejected |
| B3 | `record-winner` on a Type 63 group (company_chit=1), first call | `auction_number = 2`, `bid_amount = 96000` for the flyer config (chit_value 100000, 5%, 1%) |
| B3 | `record-winner` on Type 63, month-20 winner | `bid_amount = 113000` |
| B3 | `record-winner` on an Open Auction group without `bid_amount` | Rejected |
| B3 | `record-winner` on a not-started group | Rejected |
| B3 | After `record-winner` on Type 63 | Winner's unpaid future installments +₹1,000 (flat, once) |
| B3 | `store-or-update` with an already-winning bidder | Rejected (new guard) |
| B4 | `chit-details` for a fixed-scheme group | `scheme` block present with parsed `prices` |
| B4 | `chit-details` for an Open Auction group | `scheme: null` |
