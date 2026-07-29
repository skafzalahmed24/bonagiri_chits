# Open Auction Dividend: Floor at Zero + De-duplicate the Calculation — Backend Fixes

**Found 2026-07-29**, reported live: a non-winning member's month-1 installment showed
₹72,567 — *above* the flat ₹66,667 subscription. Traced to the dividend formula going negative
when a winning bid is close to the full chit value (small `bidDiscount`, exceeded by
`commission + gst`), which then *adds* to the subscription instead of discounting it.

Two more issues found while fixing this: the exact same calculation is duplicated in two places
(the same class of bug that caused the last several rounds of drift), and the two copies already
disagree on the dividend divisor — one uses the correct `N − 1`, the other still uses the full
member count `N`.

---

## Fix 1 — floor the dividend at zero

A non-winner's subscription should only ever be *discounted*, never increased, regardless of how
small that month's bid discount was relative to commission + GST. If the discount pool doesn't
cover the company's commission, that's the company's shortfall to absorb, not something passed on
to other subscribers.

In both duplicated blocks (`adminService.js:1598` and `:1838`):
```js
const totalDividend = bidDiscount - commission - gst;
```
change to:
```js
const totalDividend = Math.max(0, bidDiscount - commission - gst);
```

## Fix 2 — extract the duplicated calculation into one shared function

`recordWinnerService` (`adminService.js:1592-1614`) and `storeOrUpdateAuctionService`
(`adminService.js:1592-1604`, confusingly overlapping line numbers because they're near-identical
— see the actual duplication at `:1586-1616` vs `:1825-1855`) compute `subscription`, `commission`,
`gst`, `bidDiscount`, `totalDividend`, `dividendPerMember`, `netPayable`, and `winnerReceives`
independently, from the same inputs, with the same formula. This is exactly the pattern that
already caused the last three rounds of bugs (one copy getting fixed, the other not). Extract into
`schemeHelpers.js` (or a new `openAuctionMath.js`):
```js
function calculateOpenAuctionFinancials({ chitAmount, installments, bidAmount, commissionPct, memberCount }) {
  const subscription = chitAmount / installments;
  const commission = chitAmount * (commissionPct / 100);
  const gstPct = 18; // Fixed GST rate
  const gst = commission * (gstPct / 100);
  const bidDiscount = chitAmount - bidAmount;
  const totalDividend = Math.max(0, bidDiscount - commission - gst);
  const divisor = memberCount > 1 ? memberCount - 1 : 1; // exclude the winner — Finding 1c
  const dividendPerMember = totalDividend / divisor;
  const netPayable = subscription - dividendPerMember;
  const winnerReceives = bidAmount - commission - gst;
  return { subscription, commission, gst, bidDiscount, totalDividend, dividendPerMember, netPayable, winnerReceives };
}
```
Call this from both `recordWinnerService` and `storeOrUpdateAuctionService`, replacing their
independent inline copies.

## Fix 3 — the divisor mismatch this surfaced

Both inline copies currently compute `dividendPerMember` (the value stored on `auctionData.dividend`
and shown as "Dividend Pool"/"Dividend per Subscriber" in the Auction detail view) using
`membersCount` (`Enrollment.count`, the **full** member count including the winner) — still the
original Finding 1c bug, never fixed here specifically. Meanwhile `applyOpenAuctionAdjustments`
(`schemeHelpers.js`, already fixed in the last round) correctly divides by
`nonWinningEnrollments.length` (`N − 1`) when actually adjusting `ChitsInstallment.payable_amount`.
**Net effect: the dividend number displayed on the Auction record doesn't match what members are
actually charged.** Folding both calculations into the shared `calculateOpenAuctionFinancials`
helper above (Fix 2) closes this automatically, since there'd only be one divisor computation for
both the display value and the installment adjustment to share.

---

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Record a winner with a bid close to full chit value (small discount, commission+GST exceeds it) | Non-winners' installments stay at or below base subscription — never above it |
| 2 | Record a normal winner (healthy discount) | Dividend distributes as before, unaffected by the floor |
| 3 | Compare the Auction detail view's "Dividend Pool"/"Dividend per Subscriber" against the actual `ChitsInstallment.payable_amount` reduction applied to a non-winner | The numbers agree — both computed from the same `N − 1` divisor |
| 4 | Record via both the Spinner and the manual form for equivalent scenarios | Identical results — confirms both are now calling the same shared function |
