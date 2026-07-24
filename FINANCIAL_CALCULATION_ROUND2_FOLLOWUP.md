# Financial Calculation Fixes — Round 2 Follow-up (commit `596abab`)

**Reviewed the commit responding to `docs/FINANCIAL_CALCULATION_BACKEND_FIXES.md` (Phase
21). Strong pass overall — six of the seven findings addressed, most of them correctly,
verified against the domain doc's own worked example. But one of them introduces a
critical new crash. Read Blocker 1 before anything else — it breaks the single most
frequent core action in the entire app.**

---

## 🔴 Blocker 1 (Critical, new regression) — recording an auction winner now crashes for every plain Open Auction group

The Finding 2 fix (sync the corrected dividend to actual billed installments) queries
`ChitsInstallment` by two columns that don't exist on that model at all:

```js
// adminService.js:1845-1869 (recordWinnerService, inside the `else` branch — runs
// whenever the group has NO scheme_configuration_id, i.e. every plain Open Auction group)
const currentMonthInstallments = await ChitsInstallment.findAll({
  where: { group_id: auctionData.group_id, auction_number: auctionData.auction_number },
  transaction
});
for (const inst of currentMonthInstallments) { ... }

await ChitsInstallment.update(
  { payable_amount: auctionData.subscription_amount },
  { where: { group_id: auctionData.group_id, enrollment_id: winnerEnrollment.id,
             auction_number: { [Op.gt]: auctionData.auction_number } }, transaction }
);
```

Confirmed directly against `models/chitsinstallment.js` — the model's full attribute list
is `id, enrollment_id, type, installment_no, due_date, over_due_days_count,
penalty_amount, payable_amount`. **There is no `group_id` and no `auction_number` column.**
(An installment relates to a group only indirectly, via `enrollment_id → Enrollment →
group_id` — and installments are numbered by `installment_no`, which has no relationship
to an auction's `auction_number` at all; they're different sequences entirely, generated
independently by `createInstallaments`.)

`ChitsInstallment.findAll({ where: { group_id, auction_number } })` throws immediately —
Sequelize won't build a query against undeclared attributes. This is inside
`recordWinnerService`'s main `try` block, whose `catch` does:
```js
} catch (error) {
  await transaction.rollback();
  ...
  return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
}
```
So the sequence on every attempt is: Auction row created → bid-floor check passes →
dividend correctly computed → **crash on the `ChitsInstallment.findAll` call** →
**everything rolls back, including the Auction row that was just created** → 500 returned
to the admin.

**Scope, precisely — this is `recordWinnerService` only, not every path to recording a
winner.** `auction/record-winner` is called by the **Auction Spinner UI**
(`AuctionSpinner.jsx`) — confirmed that's what breaks. Separately, the **manual "Add
Auction" form** (`AuctionForm.jsx` → `storeOrUpdateAuctionService`) was also checked and
does *not* have this bug — its Finding 1b fix only writes to the `Auction` row, it never
touches `ChitsInstallment`. So manual entry for Open Auction groups still works; only the
Spinner path is broken. Still high priority — the test plan's E2/E3 cases suggest the
Spinner is meant to be the primary flow, not just a tie-break fallback, so this is a live
gap for the common case, not a total feature outage.

**Fix:** installments don't carry `group_id`/`auction_number` directly, so the query needs
to go through `enrollment_id`. Something like:

```js
// Get this group's enrollment ids first
const groupEnrollmentIds = (await Enrollment.findAll({
  where: { group_id: auctionData.group_id, delete_status: 0 },
  attributes: ['id'],
  transaction
})).map(e => e.id);

// "This month's" installment per enrollment — since there's no auction_number on
// ChitsInstallment, use installment_no matching the auction being recorded instead
// (confirm this mapping is actually 1:1 with auction_number for this group's schedule
// before shipping — if it isn't always true, this needs a different join, e.g. via
// due_date falling in the same period as auctionData.auction_date)
const currentMonthInstallments = await ChitsInstallment.findAll({
  where: {
    enrollment_id: { [Op.in]: groupEnrollmentIds },
    installment_no: auctionData.auction_number
  },
  transaction
});
...
await ChitsInstallment.update(
  { payable_amount: auctionData.subscription_amount },
  {
    where: {
      enrollment_id: winnerEnrollment.id,
      installment_no: { [Op.gt]: auctionData.auction_number }
    },
    transaction
  }
);
```

**Please double-check the `installment_no === auction_number` assumption above against
how `createInstallaments` actually assigns `installment_no`** (sequential 1..N per
enrollment) versus how `auction_number` is assigned in `recordWinnerService`
(`Math.max(lastRecorded, companyMonths) + 1`, per-group) — for a group with no fixed-scheme
company months and no skipped/rescheduled auctions, these should line up 1:1, but this is
exactly the kind of assumption worth a deliberate confirmation rather than inheriting
silently, since getting it wrong here would silently apply the wrong dividend to the wrong
month rather than crashing (a harder bug to notice than Blocker 1).

---

## 🟠 Issue 2 (Medium, will surface once Blocker 1 is fixed) — past winners get incorrectly re-discounted every month

Once Blocker 1's query is fixed, this logic bug is still present:

```js
for (const inst of currentMonthInstallments) {
  if (inst.enrollment_id === winnerEnrollment.id) {
    await inst.update({ payable_amount: auctionData.subscription_amount }, { transaction });
  } else {
    await inst.update({ payable_amount: auctionData.net_payable }, { transaction });
  }
}
```

This only distinguishes "the winner being recorded *this* auction" from "everyone else."
But "everyone else" includes members who **already won in an earlier month** — per the
domain doc (rule #5, "PS members pay a fixed higher installment; NPS members benefit from
dividends"), a past winner should still be paying the fixed `subscription_amount` every
month going forward, not the current month's discounted `net_payable`. As written, every
past winner gets incorrectly re-discounted alongside genuine NPS members on every
subsequent auction — undercharging every PS member every month after their own win.

(The separate "future installments" update a few lines down — which sets *only the
current winner's* future rows to `subscription_amount` — is correct in isolation and
doesn't have this bug; the problem is specifically the current-month loop's `else`
branch not distinguishing "true NPS" from "PS from a prior month.")

**Fix:** the `else` branch needs to check whether that enrollment has *any* prior auction
win in this group (e.g. via the same `Auction.findOne({ where: { group_id, bidder_id } })`
pattern already used elsewhere in this file, or a `has_won`-style lookup) — if so, apply
`subscription_amount`, not `net_payable`.

---

## 🟡 Issue 3 (Minor) — `storeOrUpdateAuctionService` can throw a raw `TypeError` instead of a clean 404 for a stale/invalid auction id

```js
// adminService.js:1554
const targetGroupId = auctionData.group_id || (id ? (await Auction.findByPk(id)).group_id : null);
```

If `id` is provided (an update) but no `Auction` with that id exists, `Auction.findByPk(id)`
resolves to `null`, and `.group_id` on `null` throws `TypeError: Cannot read properties of
null (reading 'group_id')` — **before** the function's existing, correct "not found" check
further down (`if (id) { const auction = await Auction.findByPk(id, ...); if (!auction)
return NOT_FOUND; }`) ever gets a chance to run. Net effect: updating a deleted/invalid
auction id now 500s instead of cleanly 404ing. Low severity (only trips on an already-
invalid id), but worth a null-guard:

```js
const existingAuction = id ? await Auction.findByPk(id) : null;
const targetGroupId = auctionData.group_id || existingAuction?.group_id || null;
```

---

## ✅ Confirmed correct — no action needed

- **Finding 1 (dividend formula)** — verified against the domain doc's worked example in
  both `recordWinnerService` and `storeOrUpdateAuctionService`: `bidDiscount = chitAmount -
  bid_amount`, `totalDividend = bidDiscount - commission - gst`, `netPayable = subscription
  - (totalDividend / membersCount)`, `winnerReceives = bid_amount - commission - gst`. All
  four map correctly to `bid_loss` / `dividend_payable` (& `dividend`) / `net_payable` /
  `bid_payable`. Matches exactly.
- **Finding 1b (server-side recomputation)** — `storeOrUpdateAuctionService` now strips
  all eight client-supplied financial fields from the input and recomputes them itself
  when `bid_amount` is present on a non-scheme group; the Joi schema for `store-or-update`
  no longer accepts those eight fields as input at all. Closes the trust gap correctly.
- **Finding 3 (penalty PS/NPS split)** — `cronJobs.js` now looks up each installment's
  winner status via `Auction.findOne`, cached per `group_id + subscriber_id` pair within
  the cron run (avoids N+1 across the loop), and selects `penality_for_ps` /
  `penality_for_nps` accordingly.
- **Finding 4 (bid-discount floor)** — `recordWinnerService` now rejects bids below
  `chitAmount * (1 - max_ceiling_in/100)` for non-scheme groups.
- **Finding 5 (5% commission cap)** — `chitsGroupValidator`'s `company_commission` now has
  `.max(5)` with a clear message.
- **Finding 6 (fixed 18% GST)** — both `recordWinnerService` and
  `storeOrUpdateAuctionService` now hardcode `gstPct = 18`; `gst_number_percentage` is no
  longer read from the request.
- **Phase 16 (unrelated feature, fixed in the same commit):** `getGroupMembersService` now
  returns `enrollment_id: e.id` per row, and its default `max` was raised from 10 to 200 —
  both of the Direct Payment blockers reported separately are resolved.

**Not touched by this commit:** Phase 17 (`createInstallaments` due-date offset) — the doc
file was added to the repo but the actual code change wasn't made; `createInstallaments`
is unchanged. Still fully open, tracked separately.

---

## Priority order

1. **Blocker 1** — fix immediately. The app cannot currently record an Open Auction
   winner at all.
2. **Issue 2** — fix in the same pass as Blocker 1, since it's in the exact code block
   being touched anyway.
3. **Issue 3** — cheap, fix whenever convenient.

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Record a winner for a plain Open Auction (non-fixed-scheme) group | Succeeds, no 500 |
| 2 | Check `ChitsInstallment.payable_amount` for that group's NPS members after recording | Reflects the new `net_payable`, not the flat group-creation value |
| 3 | Check the winner's *current month* installment | Set to `subscription_amount` |
| 4 | Record a second winner in a later month for the same group; check the *first* winner's installment that month | Still `subscription_amount` (fixed PS rate), not re-discounted to `net_payable` |
| 5 | Attempt to update (`store-or-update`) an auction id that doesn't exist | Clean 404, not a 500 |
