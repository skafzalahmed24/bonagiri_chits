# Auction Winner: Current-Month Installment Exclusion — Backend Spec

**Phase 32 — reported 2026-07-28.** Reported directly off two screens: the admin's Direct
Payment installment picker still shows the winning month as a normal payable installment for a
member who just won that month's auction, and the same member still shows up in the Collection
Agent's pending-collection list for that month. Both need to stop — but **exactly how much they
should owe for the winning month depends on the chit's scheme type**, confirmed directly with the
stakeholder:

| Scheme | Winning month's own installment |
|---|---|
| Open Auction | `0` — fully excluded |
| Type 62 (Withdrawn/Not Withdrawn) | the `withdrawn` price for that specific month, **not zero** |
| Type 63 (Fixed Adding) | `0` for the win month; future months already correctly become `installment + addingAmount` (existing logic, no change needed there) |
| Type 64 (Auction Growing) / 65 (Growing Fixed) | `0` — fully excluded |

**This is backend-only.** Both the admin Direct Payment screen and the Collection Agent's pending
list already just display whatever `payable_amount`/`due_amount` the backend computes (confirmed
in the Phase 30 frontend doc) — no frontend math involved. Once the backend sets the right amount
at the right time, both screens correct themselves automatically once the two read-side gaps below
are also fixed.

---

## Fix 1 — Open Auction: current month should be `0`, not full subscription

`recordWinnerService`'s open-auction branch (`adminService.js:1883-1892`) currently does:
```js
// Set winner current and future installments to base subscription
await ChitsInstallment.update(
  { payable_amount: subscription },
  {
    where: {
      group_id: auctionData.group_id,
      enrollment_id: winnerId,
      auction_number: { [Op.gte]: auctionData.auction_number }
    },
    transaction
  }
);
```
This sets the **current** winning month to the full `subscription` amount (undiscounted) — should
be `0`. Future months (after this one) are correctly left at full `subscription` — that part is
right and shouldn't change; the winner keeps paying full subscription for every month *after* the
one they won, they just stop getting dividends. Split into two updates:
```js
// Winning month itself: 0, not paid at all
await ChitsInstallment.update(
  { payable_amount: 0 },
  {
    where: { group_id: auctionData.group_id, enrollment_id: winnerId, auction_number: auctionData.auction_number },
    transaction
  }
);
// Every month after the winning month: full subscription, unchanged from today
await ChitsInstallment.update(
  { payable_amount: subscription },
  {
    where: { group_id: auctionData.group_id, enrollment_id: winnerId, auction_number: { [Op.gt]: auctionData.auction_number } },
    transaction
  }
);
```

## Fix 2 — Type 62: include the winning month in the `withdrawn`-price update

`applyWinnerSchemeAdjustments`'s type 62 branch (`utils/schemeHelpers.js:53-65`) explicitly
excludes the win month via the shared `remainingWhere`:
```js
const remainingWhere = {
  enrollment_id: winnerEnrollmentId,
  installment_no: { [Op.gt]: winMonth },   // <- excludes the win month itself
  id: { [Op.notIn]: sequelize.literal(PAID_INSTALLMENT_SUBQUERY) }
};
```
For type 62 specifically, the win month needs the `withdrawn` price applied too — add a separate,
explicit update for just that one row (don't change `remainingWhere` itself, since types 63's
`increment` logic correctly relies on it staying `gt`):
```js
if (schemeConfig.scheme_type === 62 /* WITHDRAWN */) {
  const pricesArray = ...; // as already parsed
  const winMonthRow = pricesArray[winMonth - 1];
  if (winMonthRow?.withdrawn != null) {
    await ChitsInstallment.update(
      { payable_amount: parseFloat(winMonthRow.withdrawn) },
      { where: { enrollment_id: winnerEnrollmentId, installment_no: winMonth }, ...options }
    );
  }
  // ... existing future-months loop, unchanged
}
```

## Fix 3 — Type 63: zero out the winning month explicitly

`applyWinnerSchemeAdjustments`'s type 63 branch (`schemeHelpers.js:67-73`) only touches *future*
months (via the shared `remainingWhere`, `installment_no > winMonth`) — correctly leaves them at
`installment + addingAmount`, no change needed there. Add an explicit zero-out for the win month:
```js
if (schemeConfig.scheme_type === 63 /* FIXED_ADDING */) {
  await ChitsInstallment.update(
    { payable_amount: 0 },
    { where: { enrollment_id: winnerEnrollmentId, installment_no: winMonth }, ...options }
  );
  const addingAmount = parseFloat(schemeConfig.chit_value) * (parseFloat(schemeConfig.adding_percentage) / 100);
  await ChitsInstallment.increment(
    { payable_amount: addingAmount },
    { where: remainingWhere, ...options }
  );
}
```

## Fix 4 — Types 64/65: zero out the winning month

`applyWinnerSchemeAdjustments` currently has **no branch at all** for scheme types 64/65 — their
price tables are static from creation and never adjusted post-win (correct for future months,
per the template design). Add a branch that zeroes just the win month:
```js
if (schemeConfig.scheme_type === 64 || schemeConfig.scheme_type === 65) {
  await ChitsInstallment.update(
    { payable_amount: 0 },
    { where: { enrollment_id: winnerEnrollmentId, installment_no: winMonth }, ...options }
  );
}
```

## Fix 5 — Collection Agent's pending list needs to become amount-aware

`getPendingMembersService` (`userService.js:1477` onward) currently decides "pending" purely by
existence of a verified payment, with **no amount check**:
```js
const unpaidInstallments = await ChitsInstallment.findAll({
  where: {
    enrollment_id: { [Op.in]: enrollmentIds },
    id: { [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`) }
  }
});
```
A `0`-payable installment with no payment record still passes this filter today, and would still
count toward `pending_months` (`userService.js:1523`) even at `balance += 0` — **not the same as
being excluded from the list**. Add a `payable_amount: { [Op.gt]: 0 }` condition:
```js
const unpaidInstallments = await ChitsInstallment.findAll({
  where: {
    enrollment_id: { [Op.in]: enrollmentIds },
    payable_amount: { [Op.gt]: 0 },
    id: { [Op.notIn]: sequelize.literal(`(SELECT "chits_installment_id" FROM "customer_payments" WHERE "payment_status" = 1 AND "chits_installment_id" IS NOT NULL)`) }
  }
});
```
**Separately worth flagging**: this same function doesn't do the sum-of-payments/`due_amount`
computation that `getInstallmentsByGroupService` gained in Phase 30 — it's the same
"any payment exists = fully settled" gap that Phase 30 fixed on the admin side, just not yet
applied here. Not required to close today's specific ask, but this function will need the same
treatment before partial payments are consistent across both the admin and collection-agent views.

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Record an Open Auction winner | Winner's current-month installment shows `payable_amount: 0` in both the Direct Payment list and the Collection Agent's pending list (i.e. absent from the latter); their installments *after* this month remain at full subscription |
| 2 | Record a Type 62 winner | Winner's current-month installment shows the `withdrawn` price for that month, not `0` and not `not_withdrawn` |
| 3 | Record a Type 63 winner | Winner's current-month installment shows `0`; their next month onward shows `installment + addingAmount` |
| 4 | Record a Type 64 or 65 winner | Winner's current-month installment shows `0` |
| 5 | Collection Agent's pending list, any of the above | The member does not appear in "Members List (N Pending)" for the winning month if it was their only pending item that period |
