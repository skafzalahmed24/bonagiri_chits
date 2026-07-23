# Financial Calculation Audit — Backend Fixes

**Phase 21 — reported 2026-07-21. Critical.** This app's core financial engine — the
auction dividend math — has been computing the wrong number since it was written. Every
finding verified directly against the code and against `docs/CHIT_FUND_DOMAIN_REFERENCE.md`'s
own worked numeric example (section 4) before writing this up.

---

## Finding 1 (Critical) — Dividend formula uses the wrong operand: ~72% systematic under-billing of every NPS member, every month, on every Open Auction chit

`backend/bonagiri_chits/src/services/adminService.js:1678-1691` (`recordWinnerService`,
Open Auction path):

```js
const subscription = chitAmount / installments;
const commission = chitAmount * (companyCommissionPct / 100);
const gstPct = parseFloat(gst_number_percentage) || 18;
const gst = commission * (gstPct / 100);
const dividend = bid_amount - commission - gst;
...
const netPayable = subscription - (dividend / membersCount);
```

The domain doc's own worked example (`CHIT_FUND_DOMAIN_REFERENCE.md:118-128`, Chit Value
₹1,00,000, N=20, Winning Bid ₹82,000, Commission 5%, GST 18%):

```
Company Commission   = Chit Value × 5%           = ₹5,000
GST on Commission    = Commission × 18%          = ₹900
Bid Discount         = Chit Value − Winning Bid  = ₹18,000
Total Dividend       = Discount − Commission − GST = ₹12,100
Dividend per Member  = Total Dividend ÷ N        = ₹605

Net Monthly Payment  = Base Sub − Dividend       = ₹4,395  (what each NPS pays)
Winner Receives      = Winning Bid − Comm − GST  = ₹76,100 (net to the prized subscriber)
```

The code's `dividend = bid_amount - commission - gst` (82,000 − 5,000 − 900 = **76,100**)
is actually the doc's **"Winner Receives"** formula — the winner's own net payout — not
"Total Dividend." The code never computes `chitAmount - bid_amount` (the bid discount)
anywhere. That wrong value then feeds directly into the NPS billing calculation:

- Code's `netPayable` = 5,000 − (76,100 ÷ 20) = **₹1,195**
- Doc's correct value = 5,000 − (12,100 ÷ 20) = **₹4,395**

Every NPS member is billed roughly **72% less than they should be**, every month, on
every Open Auction chit group this endpoint has ever recorded a winner for. This also
**inverts the incentive structure**: a more aggressive (lower) winning bid should increase
the dividend and lower what NPS members pay — with this formula, a lower `bid_amount`
shrinks `dividend`, which *raises* `net_payable` instead. The economics run backwards.

**Corroborating evidence this is a bug, not a rename:** the `Auction` model already has
dedicated columns `bid_loss`, `bid_payable`, `dividend_payable`
(`models/auction.js:32-36`, validated in `adminValidation.js:694-698`) that map cleanly to
"discount", "winner's net payout", and "per-member dividend payable" — but
`recordWinnerService` never populates any of them, only the generic `dividend`/
`net_payable` pair computed with the wrong formula.

**Fix:**
```js
const bidDiscount = chitAmount - bid_amount;           // was missing entirely
const totalDividend = bidDiscount - commission - gst;   // "Total Dividend" per the doc
const dividendPerMember = totalDividend / membersCount;
const netPayable = subscription - dividendPerMember;
const winnerReceives = bid_amount - commission - gst;   // what the OLD code was computing

auctionData.bid_loss = bidDiscount;
auctionData.dividend_payable = totalDividend;
auctionData.bid_payable = winnerReceives;
auctionData.net_payable = netPayable;
```
(Field names above are illustrative — match whatever the actual `Auction` model columns
are; the point is discount/dividend/winner-payout need to be three distinct values, not
one formula reused for two different things.)

---

## Finding 1b (Critical, discovered during frontend review) — `storeOrUpdateAuctionService` never recomputes the financial fields at all; it trusts whatever the client sends

While fixing the client-side mirror of Finding 1's bug (see the frontend note at the
bottom of this doc), found that the manual "Add/Edit Auction" path is worse than just
having the wrong formula — **it has no server-side formula at all**.

`AuctionForm.jsx` (the manual entry form used for Open Auction groups — fixed-scheme
groups are explicitly blocked from this path and must use the Spinner/`record-winner`
instead) computes `bidLoss`/`bidPayable`/`companyCommission`/`gstAmount`/
`dividendPayable`/`subscription`/`dividend`/`netPayable` **entirely client-side**
(`auctionCalculator.js`) and sends all of them directly in the submission payload.

`storeOrUpdateAuctionService` (`adminService.js:1461-1548`, backing `auction/store-or-update`)
does not recompute any of these — it just persists the request body verbatim:

```js
const { id, ...auctionData } = data;
...
auctionResult = await Auction.create(auctionData, { transaction });   // no recomputation
// or, for updates:
await auction.update(auctionData, { transaction });                    // same — trusts the body
```

And the Joi schema backing this route (`adminValidation.js:680-701`) accepts all of these
as plain optional numbers with no cross-field validation:
```js
bid_loss: Joi.number().precision(2).allow(null).optional(),
bid_payable: Joi.number().precision(2).allow(null).optional(),
company_commission: Joi.number().precision(2).allow(null).optional(),
gst_amount: Joi.number().precision(2).allow(null).optional(),
dividend_payable: Joi.number().precision(2).allow(null).optional(),
subscription_amount: Joi.number().precision(2).allow(null).optional(),
dividend: Joi.number().precision(2).allow(null).optional(),
net_payable: Joi.number().precision(2).allow(null).optional()
```

**This means for every Open Auction group recorded through the manual form, the official
financial record (commission, GST, dividend, net payable — the numbers that determine
what every member actually owes) is whatever the browser computed and sent, with zero
independent verification.** A modified client, a devtools-edited request, or simply a
future frontend bug can currently write any commission/dividend/net-payable figures
directly into the ledger. This is a data-integrity gap independent of whether the formula
itself is correct — even with Finding 1/1b's frontend fix applied, the server still isn't
checking anything.

**Fix:** `storeOrUpdateAuctionService` should recompute `bid_loss`, `bid_payable`,
`company_commission`, `gst_amount`, `dividend_payable`, `subscription_amount`, `dividend`,
and `net_payable` server-side from `bid_amount`, `chit_amount`, `installments`,
`company_commission` (the group's configured %), and the fixed 18% GST rate (per Finding
6) — the same corrected formula from Finding 1 — and ignore/reject any of these fields if
present in the request body, the same way `recordWinnerService` already computes them
itself rather than trusting the caller. The Joi schema should drop these fields from what
it accepts on write entirely (they're legitimate to *return* in a read response, just not
to *accept* as input).

---

## Finding 2 (Critical) — Even once corrected, the dividend never reaches actual billing for Open Auction groups

Independent of Finding 1: for plain Open Auction groups (no `scheme_configuration_id`),
the computed `net_payable` is **never written to `chits_installment.payable_amount`** —
the field collection actually charges against.

- `createInstallaments` (`adminService.js:539-606`) computes `payableAmount = chitAmount / noOfInstallments`
  **once**, at group start, as a flat value for every installment, every member, every
  month (line 542, fallback branch 585-597).
- `recordWinnerService` only calls `applyWinnerSchemeAdjustments` `if (schemeConfig)` —
  i.e., only for fixed-scheme groups (types 62/63). For raw Open Auction groups this is
  skipped entirely.
- Both `getInstallmentsByGroupService` and the payment-application logic in
  `userService.js` read `inst.payable_amount` directly — the same static flat value from
  group creation.

So for Open Auction chits — the product the domain doc calls "the core financial engine"
— the auction's `dividend`/`net_payable` figures are written to the `Auction` row as a
log entry, but never adjust what members are actually billed that month, and the winner is
never bumped to the documented "fixed higher PS installment" (domain doc rule #5) either.
The entire dividend-redistribution mechanism — the reason Open Auction chits work
differently from Fixed chits — currently has zero effect on real collections.

**Fix:** after recording a winner, update that month's `ChitsInstallment.payable_amount`
for every NPS enrollment to the corrected `netPayable` (Finding 1), and update the
winner's remaining unpaid installments to the fixed PS rate — mirroring what
`applyWinnerSchemeAdjustments` already does correctly for fixed-scheme groups (Scheme 1),
just for the Open Auction path.

---

## Finding 3 (High) — Penalty cron ignores the PS/NPS rate split; the wrong rate is what's actually charged

Domain doc (section 9): "Late payments incur penalties — different rates for PS and NPS
members." The schema supports this (`chits_group.penality_for_ps` /
`penality_for_nps`), and `userService.js` computes the split correctly **for display**:

```js
// userService.js:449-452 (and duplicated at 828-830)
const penaltyRate = isWinner
  ? (group ? parseFloat(group.penality_for_ps) || 0.00 : 0.00)
  : (group ? parseFloat(group.penality_for_nps) || 0.00 : 0.00);
```

But the cron job that actually accrues the chargeable `penalty_amount` on each installment
ignores prize status entirely:

```js
// cronJobs.js:55, 59 — confirmed directly, no isWinner/has_won check anywhere in this file
const penaltyAmountPerDay = parseFloat(group.penality_for_nps) || 0;
...
const newPenaltyAmount = parseFloat(installment.penalty_amount || 0) + penaltyAmountPerDay;
```

Every overdue installment — PS or NPS — accrues at `penality_for_nps`. This isn't
cosmetic: the payment-application logic in `userService.js` reads this same
cron-accumulated `penalty_amount` when actually charging a payment, so **real money
collected uses the wrong rate for every PS member**, while their dashboard (computed live,
correctly, elsewhere in the same file) shows a different number than what they're
actually billed. If `penality_for_ps` is set higher (plausible — PS members already
received the pooled money, so default is arguably worse), the company under-collects from
PS defaulters; if lower, PS members are systematically overcharged relative to the
company's own configured rate.

**Fix:** `cronJobs.js` needs to check each installment's enrollment's winner status
(`has_won`/equivalent) and select `penality_for_ps` vs `penality_for_nps` accordingly,
matching the logic already correctly written (twice) in `userService.js`.

---

## Finding 4 (Medium) — Bid-discount floor (statutory max-discount rule) is unenforced

Domain doc rule #3: "The winning bid must be ≥ (Chit Value − Maximum Discount %)." The
`chits_group` model has a dedicated `max_ceiling_in` field for exactly this, but
`recordWinnerService` only validates that `bid_amount` is a positive number
(`adminService.js:1672-1676`) — no comparison against `max_ceiling_in` or `chitAmount`
exists anywhere in the file. An admin can currently submit `bid_amount = 1` (or any value),
which the Chit Funds Act's discount cap is meant to prevent — and per Finding 1, an
artificially low bid currently *increases* what NPS members are charged rather than being
blocked, compounding the harm.

**Fix:** validate `bid_amount >= chitAmount * (1 - group.max_ceiling_in / 100)` before
accepting a winner.

---

## Finding 5 (Medium) — 5% statutory commission cap is not enforced anywhere

Domain doc: "Commission — capped at 5% of chit value by law." Confirmed no bound exists at
any layer: `adminValidation.js`'s `company_commission` field has no `.max(5)`,
`storeOrUpdateChitsGroupService` writes it through from the request body unchecked, and the
model column is `DECIMAL(5,2)` (a magnitude limit, not a percentage cap). Any company can
configure e.g. 15% commission and `recordWinnerService` will compute against it with no
objection.

**Fix:** add `.max(5)` (or the company's actual legal ceiling, if it can legitimately
exceed 5% under some registration type) to the Joi schema, and consider a defensive check
in the service layer too.

---

## Finding 6 (Medium) — GST rate is caller-supplied per auction, not fixed at the statutory 18%

```js
// adminService.js:1575, 1684
const { ..., gst_number_percentage, ... } = reqBody;
const gstPct = parseFloat(gst_number_percentage) || 18;
```

The domain doc treats GST as a fixed statutory 18% on commission. The code only defaults
to 18 when the field is omitted — an admin can pass any value per auction, changing the
GST computed and stored for that specific transaction. This is both an under/over-
remittance risk and a data-integrity problem (GST filings would be inconsistent across
auctions of the same group). *(The formula shape itself — GST on commission only, never
on bid amount or chit value — is correct; this finding is only about the rate being
overridable, not the computation method.)*

**Fix:** hardcode 18% (or read from a company-level configured, admin-only-editable
setting, not a per-request field) rather than accepting it per auction call.

---

## Finding 7 (Low) — Dashboard "dividend distributed" stat is silently always zero

```js
// adminService.js:4099-4100
const dividendDistributed = await Auction.sum('dividend_payable', { where: { company_id: companyId } });
```

`recordWinnerService` never writes to `dividend_payable` (only the generic, wrongly-computed
`dividend` column — Finding 1). This dashboard figure returns null/0 for every company,
always. Resolves automatically once Finding 1's fix populates the correct column.

---

## Finding 8 (Low) — Penalty-rate field has ambiguous units, risking a 100x unintended penalty

```js
// userService.js:457-465, duplicated at 847-853
if (penaltyRate > 0) {
  if (penaltyRate <= 20) {
    // interpreted as a PERCENTAGE per day
    penaltyAmountPerDay = (penaltyRate / 100) * dueAmount;
  } else {
    // interpreted as a FLAT ₹ amount per day
    penaltyAmountPerDay = penaltyRate;
  }
}
```

A single decimal field (`penality_for_ps`/`penality_for_nps`) is silently reinterpreted
based on its magnitude — if a company intends a flat ₹15/day late fee, this code treats it
as 15%/day compounding instead, a drastically larger unintended penalty. There's no
explicit "percentage vs flat" flag; the heuristic is inherently ambiguous.

**Fix:** add an explicit `penalty_type` field (percentage vs flat) rather than inferring
it from the number's magnitude.

---

## Finding 9 (Low) — Scheme 3/4 prize schedules are unvalidated manual data entry

`schemeHelpers.js`'s fallback for scheme types 64/65 just reads whatever an admin typed
into a `prices` JSONB column (`fixedSchemeService.js` explicitly documents "stores all
fields as-is, no type validation"). The domain doc's documented arithmetic progression
(e.g. "Prize = ₹3,26,250 + (position − 2) × ₹6,250") is never actually computed or
validated server-side — a data-entry mistake in scheme configuration is invisible and
silently wrong for the life of the group. Lower priority than Findings 1-3, but worth a
server-side sanity check (does the entered schedule match the expected progression within
some tolerance) before this scheme type is used at scale.

---

## Confirmed correct — no action needed

- Base subscription (`chitAmount / installments`) — matches the doc.
- GST computed on commission only, never on bid or chit value — correct, per Finding 6's
  caveat about the rate being overridable (the formula shape itself is right).
- Division-by-zero guards on `installments` and `membersCount` — both safely default to
  ≥1, confirmed no crash risk here.
- Scheme 1 (Withdrawn/Not-Withdrawn) — `applyWinnerSchemeAdjustments` correctly switches
  the winner's future installments to the fixed PS rate on win, matching the doc.
- Scheme 2 (Fixed + Adding) — constant installment and growing-prize-by-adding-amount
  logic both match the documented economics.
- Duplicate-winner and duplicate-auction-number guards — enforced both in application code
  and via DB unique constraints. Solid.

---

## Priority order

1. **Finding 1 + Finding 1b together** — the dividend formula and the fact that the
   manual-entry path doesn't compute it server-side at all are two parts of the same
   problem. Fixing the formula without also adding server-side recomputation
   (Finding 1b) leaves the manual auction path still fully client-trusted for money
   values — fix both in the same pass.
2. **Finding 2** — connect the (corrected) dividend to actual billed installments; right
   now the auction math is disconnected from real collections entirely.
3. **Finding 3** — penalty cron's PS/NPS split.
4. **Finding 4, 5, 6** — the three unenforced statutory/compliance rules (bid floor,
   commission cap, GST rate) — same class of gap, worth fixing together.
5. **Finding 7, 8, 9** — lower urgency, fix opportunistically.

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Record a winner with the doc's worked example inputs (₹1,00,000 chit, 20 members, ₹82,000 bid, 5% commission, 18% GST) | `net_payable` = ₹4,395, not ₹1,195 |
| 2 | Submit `auction/store-or-update` with a manipulated `net_payable`/`dividend_payable` value that doesn't match the inputs (e.g. via a raw API call, not the UI) | Server-computed value used, client-supplied value ignored |
| 3 | Check `ChitsInstallment.payable_amount` for NPS members after that same recording | Reflects the new `net_payable`, not the flat group-creation value |
| 4 | Let a PS (already-won) member's installment go overdue | Penalty accrues at `penality_for_ps`, not `penality_for_nps` |
| 5 | Attempt to record a winner with a bid below the group's `max_ceiling_in` floor | Rejected |
| 6 | Attempt to set `company_commission` above 5% on a chit group | Rejected (or explicitly confirmed as an allowed exception, if some registration type permits it) |
| 7 | Attempt to pass a non-18 `gst_number_percentage` on `record-winner`/`store-or-update` | Ignored/rejected, GST computed at the fixed statutory rate |
| 8 | Check the dashboard's "dividend distributed" figure after Finding 1/1b/2 land | Non-zero, matches actual recorded dividends |

---

## Frontend — fixed directly, not just documented

`src/features/company-admin/auctions/utils/auctionCalculator.js` — the client-side
preview shown live in `AuctionForm.jsx` while an admin enters a bid — had the identical
bug to Finding 1, discovered while reviewing whether any frontend changes were needed for
this doc. Confirmed the same field names (`bid_loss`, `bid_payable`, `dividend_payable`,
etc.) are both the `Auction` model's columns and this calculator's output, and the
calculator's `bidLoss`/`bidPayable` were swapped relative to their labels:

```js
// before (wrong):
const bidLoss = safeBid;                                   // labeled "Bid Loss" but held the raw bid
const bidPayable = safeChit - safeBid;                      // labeled "Bid Payable" but held the discount
const dividendPayable = Math.max(0, bidLoss - companyCommission - gstAmount); // = bid - commission - gst ("Winner Receives", mislabeled as dividend)

// after (fixed):
const bidLoss = safeChit - safeBid;                          // Bid Discount
const bidPayable = safeBid - companyCommission - gstAmount;  // Winner Receives
const dividendPayable = Math.max(0, bidLoss - companyCommission - gstAmount); // now correctly Total Dividend, since bidLoss is now the discount
```

Verified against the domain doc's worked example (same inputs as Finding 1): now produces
`bidLoss` = ₹18,000, `bidPayable` = ₹76,100, `dividendPayable` = ₹12,100, `dividend` =
₹605, `netPayable` = ₹4,395 — matches exactly.

**This fix is necessary but not sufficient on its own** — per Finding 1b, the backend
currently doesn't recompute any of this, so this client-side fix is, for the moment, the
*only* correct calculation happening anywhere in the system for the manual Open Auction
path. Once Finding 1b's server-side recomputation lands, this frontend value becomes a
preview only (as it should always have been) rather than the actual source of truth.
