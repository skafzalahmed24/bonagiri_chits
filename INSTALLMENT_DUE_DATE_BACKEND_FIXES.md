# Installment Due Date Gap — Backend Fix

**Phase 17 — reported 2026-07-21**

## The Problem

When a chit group is started (`chits_group_status` changed to `1`), `createInstallaments`
(adminService.js:521-609) generates installment records with due dates starting from
`chit_start_date` — installment #1's `due_date` equals the start date itself, meaning it's
due immediately the moment the group starts.

```js
// Current code (line 536, 561, 580-584):
const initialDateStr = group.chit_start_date || group.commencement_date || new Date().toISOString().split('T')[0];
const dateIterator = new Date(initialDateStr);
for (let i = 1; i <= noOfInstallments; i++) {
  installmentsJsonArray.push({
    due_date: new Date(dateIterator.getTime() - ...).toISOString().split('T')[0],
    // installment #1 due_date = chit_start_date (the day the group starts)
  });
  dateIterator.setMonth(dateIterator.getMonth() + 1); // advance AFTER pushing
}
```

This is wrong for two reasons:

1. **Domain rule:** the first month of a chit group goes to the company (foreman) — no
   auction, no member payment. The first member-facing installment should be due one period
   after commencement, not on the commencement date itself.

2. **The field `due_date_number_count` already exists** on `ChitsGroup` (model line 99,
   migration `20260328170315`, validation line 343) — it's an INTEGER meant to hold the
   day-of-month on which installments are due (e.g., `5` = "due on the 5th of every
   month"). But `createInstallaments` never reads it. The admin can set it during group
   creation, but it has zero effect on the generated installment schedule.

Combined with the time simulator (1440× acceleration, penalty cron running every minute),
this means members are marked overdue on installment #1 within seconds of a group starting.

---

## The Fix

Modify `createInstallaments` to:

1. **Read `due_date_number_count`** from the group record
2. **Start the schedule one period after commencement**, not on the commencement date
3. **Use `due_date_number_count` as the day-of-month** for monthly installments (when set)

### For monthly installments (`mappedType === 1`):

```js
const dueDayOfMonth = group.due_date_number_count; // e.g. 5 = "5th of every month"
const baseDate = new Date(initialDateStr);

// Start one month after commencement (month 1 goes to the company)
baseDate.setMonth(baseDate.getMonth() + 1);

// If due_date_number_count is set, use that day instead of the start date's day
if (dueDayOfMonth && dueDayOfMonth >= 1 && dueDayOfMonth <= 31) {
  baseDate.setDate(Math.min(dueDayOfMonth, daysInMonth(baseDate)));
}

const dateIterator = new Date(baseDate);

for (let i = 1; i <= noOfInstallments; i++) {
  installmentsJsonArray.push({
    enrollment_id: data.id,
    type: mappedType || 1,
    installment_no: i,
    due_date: new Date(dateIterator.getTime() - (dateIterator.getTimezoneOffset() * 60000)).toISOString().split('T')[0],
    over_due_days_count: 0,
    penalty_amount: 0.00,
    payable_amount: currentPayableAmount
  });

  // Advance to next month, preserving the due day
  dateIterator.setMonth(dateIterator.getMonth() + 1);
  if (dueDayOfMonth && dueDayOfMonth >= 1 && dueDayOfMonth <= 31) {
    dateIterator.setDate(Math.min(dueDayOfMonth, daysInMonth(dateIterator)));
  }
}
```

Helper needed:
```js
function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
```

### For weekly installments (`mappedType === 2`):

```js
// Start one week after commencement
dateIterator.setDate(dateIterator.getDate() + 7);
// Then the loop advances by 7 days as it already does
```

### For daily installments (`mappedType === 3`):

```js
// Start one day after commencement
dateIterator.setDate(dateIterator.getDate() + 1);
// Then the loop advances by 1 day as it already does
```

---

## Example

Group created with:
- `commencement_date`: `2026-07-21`
- `chit_start_date`: `2026-07-21`
- `due_date_number_count`: `5`
- `no_of_installments`: `20`
- Monthly schedule

**Current (wrong):**
| # | due_date |
|---|---|
| 1 | 2026-07-21 (due immediately!) |
| 2 | 2026-08-21 |
| 3 | 2026-09-21 |
| ... | ... |

**After fix:**
| # | due_date |
|---|---|
| 1 | 2026-08-05 (first month after start, on the 5th) |
| 2 | 2026-09-05 |
| 3 | 2026-10-05 |
| ... | ... |

If `due_date_number_count` is not set (null), fall back to the start date's day-of-month
but still offset by one period:
| # | due_date |
|---|---|
| 1 | 2026-08-21 (one month after start, same day) |
| 2 | 2026-09-21 |

---

## Edge cases to handle

1. **`due_date_number_count = 31`** and months with fewer days — clamp to the last day of
   that month (e.g., February → 28/29, April → 30). The `daysInMonth` helper above handles
   this.

2. **Existing groups that already have installments** — `createInstallaments` already
   checks `const existingInstallmentRecord = await ChitsInstallment.findOne(...)` and skips
   enrollment if installments already exist (line 558-559). So this change only affects
   newly-started groups, not ones already running. No migration of existing installment
   dates is needed.

3. **`due_date_number_count` is null/undefined** — fall back to the commencement date's
   day-of-month (same as current behavior for the day part), but still apply the one-period
   offset.

---

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Create a monthly group with `due_date_number_count = 5`, start it on July 21 | Installment #1 due = Aug 5, #2 = Sep 5, etc. |
| 2 | Create a monthly group with `due_date_number_count = 31`, start it in January | Feb due = Feb 28 (or 29 in leap year), Mar due = Mar 31 |
| 3 | Create a monthly group with `due_date_number_count = null`, start it on July 21 | Installment #1 due = Aug 21, #2 = Sep 21 (same day, offset by 1 month) |
| 4 | Create a weekly group, start it on July 21 | Installment #1 due = July 28, #2 = Aug 4 |
| 5 | Create a daily group, start it on July 21 | Installment #1 due = July 22, #2 = July 23 |
| 6 | Start a group that already has installments (from a prior start attempt) | No duplicate installments created (existing skip logic at line 558) |

---

## Related findings — same investigation, worth deciding alongside this fix

While tracing this gap, checked whether the domain rule "auction should happen before the
due date" (`CHIT_FUND_DOMAIN_REFERENCE.md`: monthly cycle is Auction → Collection →
Payment) is actually enforced anywhere. It isn't, in two different ways — neither is
blocking, but both are cheap to close out while this file is already open.

### 1. `Auction.due_date` has no server-side ordering check

`recordWinnerService` (adminService.js:1553) takes `due_date` straight from `reqBody` with
no validation that it's on/after `auction_date`:

```js
const { company_id, group_id, bidder_id, auction_date, pb_bo_proxy, gst_number_percentage, due_date, next_auction_date } = reqBody;
...
auctionData = {
  ...
  auction_date: auction_date || new Date().toISOString().split('T')[0],
  due_date,       // stored as-is, no check against auction_date
  next_auction_date
};
```

Today the frontend always sends a correct `due_date` (`auction_date + 7 days`, computed in
both `AuctionForm.jsx:110-119` and `AuctionSpinner.jsx:251-253`), so this doesn't surface as
a live bug. But nothing stops a direct API call from writing a `due_date` before the
`auction_date`. Suggest adding a basic check in `recordWinnerService`:

```js
if (due_date && auction_date && new Date(due_date) < new Date(auction_date)) {
  await transaction.rollback();
  return errorResponse(res, statusCodes.BAD_REQUEST, 'due_date cannot be before auction_date');
}
```

Low priority — `Auction.due_date` isn't read anywhere downstream today (not shown in
`AuctionsList.jsx`, not used in any penalty/overdue calculation), so an out-of-order value
wouldn't currently cause a functional bug. Worth closing anyway since the field and the
ordering expectation both exist.

### 2. `ChitsGroup.days` is a dead field — same shape as `due_date_number_count` was

Grepped the entire backend for any read of `group.days` (or `chitsGroup.days`) — no matches.
It's declared on the model (`days: DataTypes.INTEGER`), accepted by validation, exposed in
the frontend form ("Day" field, `ChitGroupForm.jsx:264`), and persisted on create/update —
but nothing ever reads it back. It looks like it may have been intended to serve the same
purpose `due_date_number_count` now serves (a day-of-month for the auction, maybe), but
whatever the original intent was, it currently does nothing.

Needs a decision, not just a fix:
- If `days` was meant to be the **auction**'s day-of-month (distinct from
  `due_date_number_count`, which is the **installment**'s day-of-month) — wire it into
  wherever the auction schedule gets computed, so it stops being silently ignored.
- If it's leftover/superseded by `due_date_number_count` — remove it from the model,
  validation, and form to avoid two competing "day" fields confusing whoever touches this
  code next.

Either answer is fine; the only bad outcome is leaving it as an unused field that looks
load-bearing.

### 3. `ChitsGroup.auction_date` and `ChitsInstallment.due_date` are fully independent schedules

`createInstallaments` never reads `group.auction_date`, and `recordWinnerService`/
`storeOrUpdateAuctionService` never touch `ChitsInstallment` rows. So a group's auction
timing can drift arbitrarily (auctions run early, late, or get skipped a cycle) with zero
effect on what members owe and when — the installment due-date schedule generated at group
start is fixed for the life of the group, regardless of actual auction dates.

This is worth an explicit decision rather than leaving it implicit:
- **If intentional** (members owe their fixed monthly subscription on a fixed schedule
  regardless of when the auction for that month actually happens) — that's a reasonable,
  common chit-fund design. Worth a one-line comment in `createInstallaments` saying so, so
  a future reader doesn't "fix" it into a coupling that wasn't wanted.
- **If not intentional** — then the due-date generator should factor in `auction_date` (or
  `auctions_per_month`/`auction_from`/`auction_to`), and this needs its own design pass,
  separate from the fix in this doc.

No code change requested here — just flagging it so the backend team can confirm which one
it is before more logic gets built on top of either assumption.

## Status (Related findings)

| # | Item | Priority |
|---|---|---|
| 1 | Add `due_date >= auction_date` check to `recordWinnerService` | Low — not currently exploitable in the UI, cheap insurance |
| 2 | Decide: wire up `ChitsGroup.days`, or remove it | Medium — currently a misleading dead field |
| 3 | Confirm: should `auction_date` ever influence `ChitsInstallment.due_date` generation? | Decision needed — no code change until answered |
