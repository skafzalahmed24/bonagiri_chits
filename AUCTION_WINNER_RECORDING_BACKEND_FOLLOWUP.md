# Auction Winner Recording — Backend Follow-Up (Corrections & Blockers)

**For the backend team.** This is a line-by-line review of the `aae6e74`
("record winner added") commit against
`docs/SCHEDULE_DISPLAY_AND_WINNER_RECORDING_BACKEND_SPEC.md` (B1–B4,
corrections C1–C4). Verified directly against `backend/bonagiri_chits/src`,
not against the summary that was sent over — a few claims in that summary
don't match the code. This doc says what's actually correct, then what still
needs work, in priority order.

---

## What shipped correctly — do not re-touch

Confirmed against the code, not just the commit message:

- **`getSchemeWinningAmount`** (`src/utils/schemeHelpers.js:4-19`) — Type 63
  formula (`chit_value − commission + winnersSoFar × adding`, company-month
  guard) matches C1/C2 exactly. Verified against the flyer numbers (month 3 →
  ₹96,000, month 20 → ₹1,13,000).
- **`applyWinnerSchemeAdjustments`** (`schemeHelpers.js:39-74`) — Type 62
  correctly overrides the winner's own future installments to `withdrawn`;
  Type 63 correctly increments the winner's future installments by the flat
  adding amount. It is correctly shared between `recordWinnerService` and
  `storeOrUpdateAuctionService` (not duplicated) — matches the spec's
  "refactor into a shared helper" instruction (B3, step 6).
- **Installment generation** (`adminService.js:504-517`) seeds `payable_amount
  = not_withdrawn` for Type 62 at creation time, which is exactly what
  `applyWinnerSchemeAdjustments` later overrides — the two ends of this chain
  are consistent.
- **C1 is now actually implemented** — `getChitDetailsService` includes the
  `scheme` block with parsed `prices` (`userService.js:1042-1045`), and
  `bid_winning_amount` goes through `getSchemeWinningAmount` instead of the
  raw `bid_amount` (`userService.js:671`, `:1003`). The member-display spec
  (`FIXED_CHIT_MEMBER_DISPLAY_SPEC.md`) that was previously flagged as
  unimplemented is now done — good, no follow-up needed there.

---

## B5 — `chits-installment/get-by-group` is not implemented (P0, blocking)

The route (`adminRoutes.js:192`) and controller
(`adminController.js:1157-1165`) exist, but the controller calls
`adminService.getInstallmentsByGroupService(...)`, and **that function does
not exist anywhere in `adminService.js`** — not declared, not exported. Every
call to this endpoint currently throws:

```
TypeError: adminService.getInstallmentsByGroupService is not a function
```

This is a 500 on every single call, not a partial implementation. Nothing
downstream — the admin installment grid, Section 8.8 schedule display for
started groups — can be built or tested until this exists.

This was already fully specced in B1 of the original backend spec doc
(request/response shape, `is_paid` derivation via the `customer_payments`
subquery, sort order, association pattern matching
`getGroupMembersService`). Re-read that section — nothing about the contract
has changed, it just needs to actually be written:

```js
const getInstallmentsByGroupService = async (res, group_id, enrollment_id, min, max) => {
  // ChitsInstallment where enrollment_id IN (enrollments of group_id, delete_status:0)
  // optionally filtered to enrollment_id if provided
  // include Enrollment -> Member (subscriber), same pattern as getGroupMembersService
  // is_paid / paid_amount / payment_date derived from customer_payments (payment_status=1)
  // sort: installment_no ASC, group_position_number ASC
};
```

Export it, add it to `module.exports` in `adminService.js`.

---

## B6 — No DB-level protection on the `auctions` table

`src/migrations/20260429152922-create-auction.js` has no unique constraint on
either `(group_id, auction_number)` or `(group_id, bidder_id)`. All duplicate
protection today is application-level (`Auction.findOne(...)` inside a
transaction, in both `recordWinnerService` and `storeOrUpdateAuctionService`).
That's fine as a first line of defense, but it doesn't protect against a race
condition (two concurrent requests both passing the `findOne` check before
either commits) or a direct DB write bypassing the service layer.

Add a migration:

```js
await queryInterface.addConstraint('auctions', {
  fields: ['group_id', 'bidder_id'],
  type: 'unique',
  name: 'auctions_group_bidder_unique'
});
await queryInterface.addConstraint('auctions', {
  fields: ['group_id', 'auction_number'],
  type: 'unique',
  name: 'auctions_group_auction_number_unique'
});
```

Wrap the `Auction.create(...)` calls in both services with a catch for the
resulting `SequelizeUniqueConstraintError` and translate it to the same
"already won" / "auction number already recorded" error message the
application-level guard already returns, so the API contract doesn't change.

---

## B7 — `storeOrUpdateAuctionService` doesn't server-assign `auction_number`

`recordWinnerService` computes `auction_number` itself
(`Math.max(lastRecorded, companyMonths) + 1`, `adminService.js:1392`) and
never accepts a client-supplied value — correct, matches spec.

But `storeOrUpdateAuctionService` (`adminService.js:1264-1329`), still used
by the manual `AuctionForm`, takes `auction_number` straight from
`...auctionData` with no validation at all. Since both endpoints write into
the same table and `recordWinnerService`'s numbering depends on
`MAX(auction_number)` over *all* existing rows for the group, one manual
entry with a wrong or duplicated number (client bug, typo, stale form state)
desyncs every subsequent `record-winner` call for that group — silently,
since there's currently nothing catching it.

Pick one:
- **(a)** Have `storeOrUpdateAuctionService` also compute `auction_number`
  server-side on the `isNew` path (same formula as `recordWinnerService`,
  factor it into a shared function), ignoring whatever the client sends.
- **(b)** Validate the client-supplied `auction_number` against the expected
  next value and reject on mismatch.

(a) is simpler and removes an entire class of bug — recommended unless the
manual form has a legitimate reason to backfill non-sequential auction
numbers (if the "editable field for backfills" note in the frontend spec's
FE-3.1 is actually load-bearing, tell us and we'll go with (b) instead).

---

## B8 — `recordWinnerService` has no company scoping (security)

`ChitsGroup.findOne({ where: { id: group_id, is_deleted_status: 0,
chits_group_status: 1 } })` (`adminService.js:1337-1340`) filters by `id`
only — no `company_id` check. The `company_id` stored on the created
`Auction` row is `company_id || group.company_id`
(`adminController.js:1170-1171`, `adminService.js:1402`), where `company_id`
is taken from the **request body**, not the JWT, for any token where
`req.user.role !== 'company'` (i.e. staff tokens fall through to whatever the
client sends).

This is the same class of gap already flagged in the earlier security review
(and the near-identical Phase 2 / Task 5 issue on
`getAllCollectionSubmissionsService`). Fix: derive `company_id` from
`req.user` unconditionally (not just for `role === 'company'`) and filter the
`ChitsGroup` lookup by it — reject with 404 rather than leaking whether a
group exists in another company.

---

## B9 — Decision needed: what does "record winner" actually confirm?

This is the one open design question, not a bug to just fix.

Today, `auctions` has no `status` column. The moment *either*
`auction/store-or-update` (manual bid entry) *or* `auction/record-winner`
(spinner / confirm) inserts a row for a bidder, `getGroupMembersService`
derives `has_won: true` for that bidder from the mere existence of the row
(`adminService.js:1172-1178`). There is no intermediate state representing
"bid amount recorded, prize not yet paid out."

That collapses the distinction the original ask was built around: *recording
the auction amount* (confirming payment was made to the winner) vs.
*recording the auction winner* (confirming who won, for schedule-display
purposes) were meant to be separable. Right now they aren't — any auction row
at all, from either endpoint, immediately flips `has_won` and immediately
triggers the Type 62/63 schedule adjustments.

Two ways to close this, functionally equivalent from the schema's
perspective — pick one and we'll update the frontend spec to match:

- **(a) Add a real status field.** `auctions.status`: `recorded` (bid amount
  known) → `winner_confirmed` (prize paid, schedule adjusted). Only
  `winner_confirmed` rows count toward `has_won` and trigger
  `applyWinnerSchemeAdjustments`. `record-winner` sets status directly to
  `winner_confirmed`; `store-or-update` creates rows as `recorded`, with a
  separate small "confirm payment" action to flip them. More faithful to the
  original ask, more surface area to build and test.
- **(b) Treat `record-winner` as the single source of truth for winners, and
  restrict `store-or-update` from creating new rows for fixed-scheme groups.**
  For fixed schemes, all winner recording goes through the spinner →
  `record-winner`, which is already atomic (record + confirm + adjust in one
  transaction). The manual form stays available for Open Auction groups
  (which don't have a template/schedule to keep in sync) and for **editing**
  existing rows regardless of scheme. Much smaller change, no schema
  migration, but it does mean the manual form's behavior changes for fixed
  schemes going forward.

We're leaning toward **(b)** — it's the simpler change and fixed schemes
arguably shouldn't need manual bid entry at all, since the amount is always
template-derived. But this changes user-facing behavior on the manual form,
so confirm before either side builds against it.

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| B5 | `chits-installment/get-by-group` for a started group | 200 with `{ count, rows }`, not a 500 |
| B5 | Same endpoint, `enrollment_id` filter | Only that member's rows |
| B6 | Two concurrent `record-winner` calls for the same bidder | Exactly one succeeds; the other gets a clean error, not a raw constraint stack trace |
| B6 | `store-or-update` with a duplicate `auction_number` for the group | Rejected |
| B7 | Manual `store-or-update` entry after 2 `record-winner` calls | Auction number matches what `record-winner` would have assigned next (whichever option (a)/(b) is chosen) |
| B8 | Staff token from Company A calls `record-winner` with a `group_id` from Company B (guessed/leaked UUID) | 404, not success |
| B9 | Once decided | Frontend spec updated to match before FE-4.3 (spinner confirm) is built |

---

## Priority order

1. **B5** — hard blocker, nothing else can be verified without it.
2. **B9** — needs a decision before we finalize the spinner's confirm-action UX (does it say "Record Winner" or "Record Auction" + a separate "Confirm Payment" step?).
3. **B7, B8** — no ambiguity, can ship independently of B9.
4. **B6** — defense in depth, not urgent but cheap to add alongside B7.
