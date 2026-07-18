# Fixed Chit — Member-Facing Bid/Winning Amount Display Spec

**For the backend team.** Follow-up to
`docs/FIXED_CHIT_INSTALLMENT_GENERATION_SPEC.md`, which fixed how much each
member is *billed* per month (`chits_installments.payable_amount`) — that
part is confirmed working correctly. This doc covers a **separate, still-open
gap**: what members are shown as the *winning/payout amount* and the
*original/profit* figures on their Bids and Chit Details screens is wrong
for fixed-scheme groups, and for one of the two figures, also wrong for
Open Auction groups. Neither issue touches installment billing — only
**display**.

Two functions, two distinct problems:

---

## Problem 1 — `bid_winning_amount` is raw, unvalidated frontend input

**File:** `backend/bonagiri_chits/src/services/userService.js`
**Functions:** `getBidDetailsService` (~line 654), `getChitDetailsService`
monthly activity block (~line 985)

```js
// getBidDetailsService
const bidWinningAmount = latestAuction ? parseFloat(latestAuction.bid_amount) : 0.00;

// getChitDetailsService — monthly activity
bid_winning_amount: parseFloat(auction.bid_amount) || 0.00,
```

`auction.bid_amount` is whatever the admin typed into the Auction form's
"Bid Amount" field. For a real Open Auction that's correct — it's an actual
bid. For a fixed-scheme group there is no bid at all; the payout for a given
month is already fixed by the template. Today, nothing computes or
validates that number server-side — the member-facing "winning amount" is
only as correct as whatever the admin happened to type in a field that
doesn't conceptually apply to their scheme.

*(Frontend will separately update the Auction form to auto-fill the correct
value for fixed-scheme groups before submission — but that's a client-side
convenience, not something the backend should depend on for financial
display data. Recommend deriving it server-side so the correct number
is guaranteed regardless of what the client sends.)*

### Fix

In both functions, when the group has a `scheme_configuration_id`, derive
the winning amount from the template instead of trusting `auction.bid_amount`:

```js
const schemeConfig = group.scheme_configuration_id
  ? await FixedSchemeChitsConfiguration.findByPk(group.scheme_configuration_id)
  : null;

function getSchemeWinningAmount(schemeConfig, auctionNumber) {
  if (!schemeConfig) return null; // caller falls back to auction.bid_amount
  const prices = typeof schemeConfig.prices === 'string' ? JSON.parse(schemeConfig.prices) : schemeConfig.prices;

  if (schemeConfig.scheme_type === 63) {
    const commission = parseFloat(schemeConfig.chit_value) * (parseFloat(schemeConfig.company_percentage) / 100);
    const companyMonths = parseInt(schemeConfig.company_chit) || 1;
    if (auctionNumber <= companyMonths) return null; // company month — no real "winner"
    const addingAmount = parseFloat(schemeConfig.chit_value) * (parseFloat(schemeConfig.adding_percentage) / 100);
    const winnersSoFar = auctionNumber - companyMonths - 1;
    return parseFloat(schemeConfig.chit_value) - commission + (winnersSoFar * addingAmount);
  }

  // 62, 64, 65 — read the tabulated payout column directly
  const row = prices?.[auctionNumber - 1];
  return parseFloat(row?.chit_amount) || 0;
}
```

Then:
```js
bid_winning_amount: getSchemeWinningAmount(schemeConfig, auction.auction_number) ?? (parseFloat(auction.bid_amount) || 0.00),
```

**Note on the Type 63 formula above:** this reuses the exact math verified
in the installment generation spec — a flat, one-time +adding per winner,
not compounding. Cross-check against the reference flyer before shipping:
winner of month 3 should show a winning amount of ₹96,000, month 20's
winner ₹1,13,000.

`getChitDetailsService` doesn't currently import
`FixedSchemeChitsConfiguration` — add it to the destructure at the top of
`userService.js` (it's already registered and used in `adminService.js`).

---

## Problem 2 — `original_amount` / `profit_amount` are effectively always zero

**File:** `backend/bonagiri_chits/src/services/userService.js`
**Function:** `getChitDetailsService`, monthly activity block (~line 917)

```js
const originalAmountVal = parseFloat(group.installment_amount) || 0.00;
```

This is a bigger issue than it looks, because `chits_groups.installment_amount`
is **never populated anywhere** for most groups:

- **Open Auction groups:** no frontend field ever sets it, and nothing on
  the backend derives it either (confirmed via grep — zero writes to
  `installment_amount` in `adminService.js`). It's permanently `null`.
- **Fixed-scheme groups:** the frontend only sets it for Type 63 (copied
  from the template's flat `installment` field). Types 62, 64, 65 leave it
  `null` too, since their per-month amount isn't a single scalar.

So today, `originalAmountVal` is `0.00` for every group **except** Type 63
fixed-scheme groups. That number then propagates into:

```js
const payableAmountVal = originalAmountVal - profitAmountVal;
...
const memberOriginal = originalAmountVal;   // used for every member in memberBreakdown
let memberProfit = memberOriginal - memberPayable;
```

So `original_amount`, `profit_amount` (both the top-level card and every
row in `member_breakdown`), and the `breakdown_summary` totals for those
two fields are all wrong (near-zero or negative) for **every Open Auction
group and three of the four fixed-scheme types**. Only `payable_amount`
figures are correct today, because those already read from
`ChitsInstallment.payable_amount` directly (confirmed correct per the
installment generation fix).

### Fix

Replace the single static lookup with a per-month, per-scheme-type
derivation — the same pattern as `payable_amount` generation:

```js
function getSchemeOriginalAmount(schemeConfig, auction) {
  if (!schemeConfig) {
    // Open Auction — use the per-auction subscription figure that's already
    // computed and stored (auctionMapper always submits `subscription_amount`,
    // = chit_amount / installments), instead of the never-populated
    // group.installment_amount.
    return parseFloat(auction.subscription_amount) || 0.00;
  }

  const prices = typeof schemeConfig.prices === 'string' ? JSON.parse(schemeConfig.prices) : schemeConfig.prices;

  if (schemeConfig.scheme_type === 63) {
    return parseFloat(schemeConfig.installment) || 0.00; // genuinely flat for this type
  }
  if (schemeConfig.scheme_type === 62) {
    const row = prices?.[auction.auction_number - 1];
    return parseFloat(row?.not_withdrawn) || 0.00; // pre-win rate; see note below
  }
  // 64, 65
  const row = prices?.[auction.auction_number - 1];
  return parseFloat(row?.installment) || 0.00;
}
```

```js
const originalAmountVal = getSchemeOriginalAmount(schemeConfig, auction);
```

**Note on Type 62:** this uses `not_withdrawn` unconditionally, which is
correct for members who haven't won yet. A member who already won and
switched to the `withdrawn` rate technically has a different "original"
figure for their own remaining months — but since `memberBreakdown` already
independently reads each member's real `payable_amount` from their own
`ChitsInstallment` row, `profit_amount` per member will still be internally
consistent even if `original_amount` uses the pre-win baseline for
everyone. If exact per-member original amounts matter here, the per-member
loop should look up the same `withdrawn`/`not_withdrawn` split per member
rather than using one `originalAmountVal` for all of them — flagging this
as a possible follow-up, not blocking the primary fix.

**The Open Auction part of this fix (`auction.subscription_amount` instead
of `group.installment_amount`) is unrelated to fixed chits** and was
already broken before this work started. Including it here since it's the
same line of code — happy to split it into a separate ticket if preferred.

---

## Verification checklist

| Scenario | Field | Expected |
|---|---|---|
| Type 65, any month | `original_amount` | ₹13,500 (flat) |
| Type 64, month 2 | `original_amount` | ₹14,050 |
| Type 64, month 2 | `bid_winning_amount` | ₹3,26,250 |
| Type 62, before any wins | `original_amount` | matches `not_withdrawn` for that month |
| Type 62, month 3's winner | `bid_winning_amount` | ₹10,500 |
| Type 63, any month | `original_amount` | ₹5,000 (flat) |
| Type 63, month 3's winner | `bid_winning_amount` | ₹96,000 |
| Type 63, month 20's winner | `bid_winning_amount` | ₹1,13,000 |
| Open Auction group | `original_amount` | matches `auction.subscription_amount`, not 0 |

Recommend testing against a real Chit Details screen (`/user/chit-details`)
for one group of each type, comparing the Monthly Activity card and its
member breakdown against these numbers.
