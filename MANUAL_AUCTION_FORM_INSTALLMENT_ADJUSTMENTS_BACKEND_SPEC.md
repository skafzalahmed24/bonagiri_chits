# Manual Auction Form: Missing Installment Adjustments — Backend Spec

**Phase 34 — found 2026-07-29.** Reported live: a fresh test group ("chit test2"), member Afzal
recorded as a winner, Installment #1 still shows the full ₹66,667 with no reduction. Traced this
past the Phase 33 fixes (already confirmed correct) into a separate, previously-missed gap:
**`storeOrUpdateAuctionService`** — the function the manual Auction Form (`AuctionForm.jsx`) posts
to — never applies any of the `ChitsInstallment` adjustments that `recordWinnerService` (the
Spinner's path) does. Two distinct problems in the same function.

---

## Gap 1 — Open Auction manual creation never touches `ChitsInstallment`

`storeOrUpdateAuctionService`'s open-auction financial block (`adminService.js:1586-1616`)
computes `dividend_payable`, `net_payable`, `subscription_amount`, etc. and stores them on the
`Auction` row only:
```js
auctionData.subscription_amount = subscription;
auctionData.company_commission = commission;
auctionData.gst_amount = gst;
auctionData.bid_loss = bidDiscount;
auctionData.dividend_payable = totalDividend;
auctionData.dividend = totalDividend;
auctionData.bid_payable = winnerReceives;
auctionData.net_payable = netPayable;
```
Nothing in this function ever calls `ChitsInstallment.update(...)`. Compare to
`recordWinnerService`'s equivalent open-auction block (`adminService.js:1868-1925`), which — after
computing the same numbers — loops non-winning enrollments to reduce their future installments by
the dividend, and separately zeroes the winner's current-month installment while setting their
future installments to full subscription. None of that exists here. **Recording an Open Auction
winner via the manual form creates the `Auction` row correctly but leaves every
`ChitsInstallment.payable_amount` in the group completely untouched.**

### Fix

Extract the shared installment-adjustment logic from `recordWinnerService`
(`adminService.js:1871-1925`) into a small helper both functions call, e.g. in `schemeHelpers.js`:
```js
async function applyOpenAuctionAdjustments(auctionData, winnerEnrollmentId, groupId, transaction) {
  const allEnrollments = await Enrollment.findAll({ where: { group_id: groupId, delete_status: 0 }, transaction });
  const nonWinningEnrollments = allEnrollments.filter(e => e.id !== winnerEnrollmentId);
  const dividendPerMember = auctionData.dividend / (allEnrollments.length || 1);
  const subscription = auctionData.subscription_amount;

  for (const enrollment of nonWinningEnrollments) {
    const newPayable = subscription - dividendPerMember;
    await ChitsInstallment.update(
      { payable_amount: Math.max(0, newPayable) },
      { where: { enrollment_id: enrollment.id, installment_no: { [Op.gte]: auctionData.auction_number } }, transaction }
    );
  }

  await ChitsInstallment.update(
    { payable_amount: 0 },
    { where: { group_id: groupId, enrollment_id: winnerEnrollmentId, installment_no: auctionData.auction_number }, transaction }
  );
  await ChitsInstallment.update(
    { payable_amount: subscription },
    { where: { group_id: groupId, enrollment_id: winnerEnrollmentId, installment_no: { [Op.gt]: auctionData.auction_number } }, transaction }
  );
}
```
Call it from both `recordWinnerService` (replacing its inline block) and
`storeOrUpdateAuctionService`, right after `Auction.create` for a new, non-scheme auction with a
`bidder_id` present — mirroring exactly where the fixed-scheme call already sits
(`adminService.js:1672-1691`), just for the `!schemeConfig` case instead of `schemeConfig`.

Note: this also picks up the still-open Finding 1c (dividend divided by full member count instead
of `N − 1`) and the still-open dividend-compounding regression (Phase 30's `dividend_credit_balance`
not being accumulated) — both apply equally here once this path starts doing the same math. Fix
those once, in the shared helper, rather than duplicating whatever's currently wrong into a second
copy.

---

## Gap 2 — Phase 31's fixed-scheme rejection was never actually removed

`storeOrUpdateAuctionService:1627-1636`:
```js
if (auctionData.group_id) {
  // B9 Option (b): Block new rows for fixed-scheme groups
  const group = await ChitsGroup.findOne({ where: { id: auctionData.group_id, company_id: safeCompanyId }, transaction });
  if (group && group.scheme_configuration_id) {
    await transaction.rollback();
    return errorResponse(res, statusCodes.BAD_REQUEST, 'Cannot manually create auctions for fixed-scheme groups. Please use the Spinner (Record Winner) flow.');
  }
  ...
}
```
This still unconditionally rejects new fixed-scheme auctions — Phase 31's spec asked for this to
be removed. It was never done. Meanwhile, `storeOrUpdateAuctionService:1672-1691` already has:
```js
if (isNew && auctionData.group_id && auctionData.bidder_id) {
  ...
  if (schemeConfig) {
    const winnerEnrollment = await Enrollment.findOne({ where: { group_id: auctionData.group_id, subscriber_id: auctionData.bidder_id, delete_status: 0 }, transaction });
    if (winnerEnrollment) {
      await applyWinnerSchemeAdjustments(auctionData, schemeConfig, winnerEnrollment.id, transaction);
    }
  }
}
```
This is currently **unreachable dead code for creates** — `isNew` is only set `true` after
`Auction.create` succeeds (line 1661), and execution never reaches that far for a scheme-configured
group because the rejection at line 1633 already rolled back and returned. It looks like whoever
added this adjustment call assumed the rejection had already been removed elsewhere, but it wasn't.

### Fix

Remove the rejection block (lines 1627-1636), keeping the rest of the `else` branch (auction-number
auto-assignment, duplicate-winner guard) intact — this makes the already-written
`applyWinnerSchemeAdjustments` call at line 1688 finally reachable, closing both gaps together.

---

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Record an Open Auction winner via the **manual form** (not the Spinner) | Winner's current-month installment → `0`; non-winners' installments reduced by dividend — same effect as recording via the Spinner |
| 2 | Record a fixed-scheme (type 62/63/64/65) winner via the **manual form** | Succeeds (no more 400 rejection); winning month's installment matches the Phase 32 rule for that scheme type |
| 3 | Record via the **Spinner** for both scheme types | Unchanged — still works, ideally now sharing the same extracted helper as the manual path |
| 4 | Compare Spinner-recorded vs. manually-recorded winners in the same group | Identical resulting `ChitsInstallment.payable_amount` values regardless of which entry point was used |
