# Direct Payment: Partial Payments + Dividend-Adjusted Installments — Backend Spec

**Phase 30 — reported 2026-07-27**, from a screenshot of the Direct Payment screen:
1. *"showing this as installment wise is good but we need to allow partial payments"*
2. *"my monthly amount is 16,667 and this my auction dividend is 3000 — it should be 16667 - 3000"*

Both are real gaps, confirmed directly against the code — not quick fixes. Full detail below,
split into two independent pieces (they touch overlapping files but can ship separately).

---

## Part A — Partial Payments

### Current behavior (confirmed)

- `storeDirectPaymentService` (`adminService.js:3257-3322`) accepts any `received_amount` with
  **no validation against `payable_amount`**, and unconditionally sets
  `payment_status: 1 // Auto-verified for admin direct payments` (line 3307) regardless of
  whether the amount covers the installment or not.
- `getInstallmentsByGroupService` (`adminService.js:1382-1451`) computes:
  ```js
  const payment = inst.payments && inst.payments.length > 0 ? inst.payments[0] : null;
  is_paid: !!payment,
  paid_amount: payment ? payment.received_amount : "0.00",
  ```
  `is_paid` is **"does any payment row exist at all"** — not amount-aware, and only reads the
  *first* matched payment (not a sum, in case more than one partial payment exists).
- Net effect: record any payment, even ₹1, against an installment and it **vanishes from the
  pending list forever** — the shortfall is never tracked or shown again.
- The frontend's "Amount to Pay" field is already freely editable
  (`member-receipts/page.jsx:257-266`) — a partial amount can already be *submitted* today, the
  backend just silently closes the installment out regardless.

### What already works this way — reuse it

`submitCollectionPaymentService` (`userService.js:1810-1907`, the collection-agent lump-sum
flow) already implements correct partial/remaining-balance math:
```js
const paid = relatedPayments.reduce((sum, p) => sum + (parseFloat(p.received_amount) || 0), 0);
let pending_installment = payable - paid;
```
This exact `payable − sum(paid) = remaining` pattern should be extracted into a shared helper
(e.g. `getInstallmentBalance(installmentId)`) and reused by the direct-payment read path instead
of being reinvented.

### Fix

**1. Extract a shared balance helper** (new, e.g. `services/installmentBalanceHelper.js`):
```js
const getInstallmentBalance = async (installmentId) => {
  const paidRows = await CustomerPayment.findAll({
    where: { chits_installment_id: installmentId, payment_status: 1 },
  });
  const paidSoFar = paidRows.reduce((sum, p) => sum + parseFloat(p.received_amount || 0), 0);
  return paidSoFar;
};
```

**2. Rewrite `getInstallmentsByGroupService`'s per-row mapping** (`adminService.js:1433,
1443-1444`) to use it:
```js
const paidSoFar = await getInstallmentBalance(inst.id); // or batch-computed for the whole list
const dueAmount = Math.max(0, parseFloat(inst.payable_amount) - paidSoFar);
return {
  ...,
  paid_amount: paidSoFar.toFixed(2),
  due_amount: dueAmount.toFixed(2),
  is_paid: dueAmount <= 0,
};
```
(Batch this — don't do one query per installment in a loop; fetch all `CustomerPayment` rows for
the enrollment's installments in one query and group in memory.)

**3. Guard `storeDirectPaymentService` against overpayment** (`adminService.js:3257`): before
inserting, compute the installment's current `dueAmount` via the same helper and reject (or cap)
if `received_amount > dueAmount + penalty_paid`. Today nothing stops an admin from recording
₹50,000 against a ₹16,667 installment.

**4. Pending-list filter**: the frontend currently does `.filter(i => !i.is_paid)`
(`member-receipts/page.jsx:62`) — no change needed there once `is_paid` correctly reflects
"fully covered," since a partially-paid installment will now correctly stay in the list with a
reduced `due_amount`.

### Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Record ₹5,000 against a ₹16,667 installment | Installment stays in the pending list, `due_amount` shows ₹11,667 |
| 2 | Record the remaining ₹11,667 | Installment now shows `is_paid: true`, drops off the pending list |
| 3 | Attempt to record ₹20,000 against a ₹16,667 (unpaid) installment | Rejected — overpayment guard |
| 4 | Record two ₹8,333.50 partial payments against the same installment | `paid_amount` correctly sums both (not just the first row) |

---

## Part B — Dividend-Adjusted Future Installments

### Current behavior (confirmed)

- `payable_amount` is set **once**, at installment generation (`createInstallaments`,
  `adminService.js:594-700`), and that function explicitly skips any enrollment that already has
  installment rows (`adminService.js:631-632`) — so nothing else in the codebase regenerates or
  bulk-updates it under normal operation except the paths below.
- Dividend math (`dividendPerMember = totalDividend / membersCount`,
  `netPayable = subscription - dividendPerMember`) is computed correctly in `recordWinnerService`
  and `storeOrUpdateAuctionService` (`adminService.js:1824-1825` and nearby) — **but only for the
  `Auction` row's own fields**, never persisted anywhere a future installment read could use it.
- For **open-auction groups**, `recordWinnerService` (`adminService.js:1842-1869`) does attempt
  to push the adjusted amount into `ChitsInstallment`, but:
  ```js
  const currentMonthInstallments = await ChitsInstallment.findAll({
    where: { group_id: auctionData.group_id, auction_number: auctionData.auction_number },
    transaction
  });
  ```
  **`ChitsInstallment` has no `group_id` or `auction_number` column** — confirmed against both
  the model (`models/chitsinstallment.js:12-47`: only `enrollment_id, type, installment_no,
  due_date, over_due_days_count, penalty_amount, payable_amount`) and its creation migration.
  This query runs inside the same transaction as the auction write and would fail at the DB
  level, **rolling back the entire "Record Winner" action for every open-auction group** — this
  code path is not just incomplete, it's currently broken as written.
  A workaround already exists elsewhere confirming this: `userService.js:1027` has a comment
  *"Use calculated profitAmountVal to guarantee accuracy even if DB installments aren't fully
  updated yet"* and recomputes the dividend-adjusted amount on the fly for member-portal display,
  rather than trusting `ChitsInstallment.payable_amount`.
- Even ignoring the broken query: as written, this logic only ever touches (a) the *current*
  auction-numbered installment for non-winners, and (b) the *winner's* future installments (reset
  to base, no dividend) — never a **non-winner's future** installments, which is exactly the case
  reported ("every subsequent month should be reduced").
- For **fixed-scheme groups**, `applyWinnerSchemeAdjustments`
  (`utils/schemeHelpers.js:39-74`) only ever updates the **winner's own** future `payable_amount`
  from the static price table — non-winners' amounts come from the pre-agreed schedule and
  currently have no dividend concept applied at all.

### Fix

**1. Add the missing linkage** (new migration on `chits_installments`):
```js
group_id: { type: DataTypes.UUID, allowNull: true },   // denormalized from enrollment for direct querying
auction_number: { type: DataTypes.INTEGER, allowNull: true },
```
Backfill both from the existing `enrollment_id` → `ChitsGroup` relationship and each row's
`installment_no` for existing data. This matches what the already-written (but currently broken)
`recordWinnerService` code assumes exists — the columns were apparently intended but never
migrated.

**2. Track a running dividend credit, not a one-time overwrite.** If a member doesn't win for
several months in a row, each auction's dividend should compound (16667 − 3000 − 2500 − ...), not
overwrite the previous adjustment. Add to `Enrollment`:
```js
dividend_credit_balance: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0.00 },
```
On each auction, for every non-winning, still-enrolled member: `dividend_credit_balance +=
theirDividendShare`, then recompute `payable_amount = base_subscription - dividend_credit_balance`
for every **not-yet-due** installment on that enrollment (i.e. `due_date > auction_date`, not just
the current month).

**3. Rewrite the open-auction block in `recordWinnerService`** (`adminService.js:1842-1869`) to:
```js
for (const enrollment of nonWinningEnrollments) {
  await enrollment.increment('dividend_credit_balance', { by: dividendPerMember, transaction });
  const newPayable = baseSubscription - (enrollment.dividend_credit_balance + dividendPerMember);
  await ChitsInstallment.update(
    { payable_amount: Math.max(0, newPayable) },
    { where: { enrollment_id: enrollment.id, due_date: { [Op.gt]: auctionData.auction_date } }, transaction }
  );
}
```
(Exact enrollment-fetch/eligibility logic should match whatever already determines "non-winning,
still-active members of this group" elsewhere in the same function.)

**4. Open product decision — fixed-scheme groups.** Today, fixed-scheme (`schemeConfig` present)
non-winners have no dividend concept; their price table already encodes a pre-agreed schedule.
**Confirm with the stakeholder whether fixed-scheme groups should ALSO get a running dividend
adjustment, or whether that concept is exclusive to open/custom-auction groups** (where the
group members set the discount and dividend by live bidding each month, versus a fixed scheme's
pre-agreed table). Don't guess on this — it changes whether `applyWinnerSchemeAdjustments` needs
touching at all.

**5. Read path** — once the write path is fixed, `getInstallmentsByGroupService` needs no special
dividend math; it already returns whatever `payable_amount` is stored (`adminService.js:1441`).
The `userService.js:1013-1029` on-the-fly recompute workaround can stay as extra safety but is no
longer load-bearing once installments are correctly persisted.

### Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Record an open-auction winner with dividend ₹3,000/member | Every non-winning member's **future** (not-yet-due) installments drop to ₹13,667; the current/past installments are unchanged |
| 2 | Run a second auction next month, another ₹2,500 dividend, same non-winner still hasn't won | Their future installments after auction #2 show ₹11,167 (16667 − 3000 − 2500), not a flat re-overwrite |
| 3 | The eventual auction winner (from test 1) | Their own future installments reset to the winning bidder's `subscription_amount`, unaffected by dividend |
| 4 | Direct Payment screen, any non-winning member, after test 1 | Shows the dividend-adjusted amount, not the flat original subscription |
| 5 | Fixed-scheme group | No change until the product decision in Fix #4 is made |
