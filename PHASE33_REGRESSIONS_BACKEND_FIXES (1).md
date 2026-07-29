# Phase 33 Regressions — Backend Fixes

**Found 2026-07-28**, in commit `053662c`. Two separate bugs, both critical, both confined to
`backend/bonagiri_chits/src/services/adminService.js`. No frontend changes involved in either.

---

## Fix 1 — `enrollment_status` referenced but never declared in 10 functions (500s on every call)

An `enrollment_status`-based filter was correctly added to `getAllChitsGroupDetailsService`
(line 810, which *does* take `enrollment_status` as a parameter) — but the same snippet got
pasted into 10 unrelated functions that never declare it. Reading an undeclared variable throws
`ReferenceError` at runtime, so **all 10 of these endpoints 500 on every call today**.

### Keep this one — it's correct

`getAllChitsGroupDetailsService`, `adminService.js:810-817`:
```js
const getAllChitsGroupDetailsService = async (res, company_id, min, max, search, enrollment_status) => {
  try {
    ...
    const chitsGroups = await ChitsGroup.findAndCountAll({
      limit, offset, where: {
        is_deleted_status: 0,
        ...(enrollment_status === 1 ? { is_chit_full_status: 0 } : {}),   // ✅ keep — enrollment_status is a real param here
```

### Remove the line from these 10 — `enrollment_status` doesn't exist in any of them

| Function | Line | Signature (confirmed — no `enrollment_status` param) |
|---|---|---|
| `getAllMemberDetailsService` | 406 | `async (res, company_id, introduced_as, min, max, search)` |
| `getAllRouteDetailsService` | 516 | `async (res, company_id, min, max, search)` |
| `getAllAreaDetailsService` | 565 | `async (res, company_id, min, max, search)` |
| `getAllDistrictDetailsService` | 1001 | `async (res, company_id, min, max, search)` |
| `getAllCityDetailsService` | 1038 | `async (res, company_id, min, max, search)` |
| `getDistrictsListService` | 1055 | `async (res, company_id, state_id, search)` |
| `getAgentByAgentTypeService` | 2068 | `async (res, company_id, agent_type_id, min, max, search)` |
| `getAllSelfChitDetailsService` | 2755 | `async (res, company_id, min, max)` |
| `getAllContactUsService` | 3679 | `async (res, company_id, min, max, search)` |
| `getAllFAQService` | 3757 | `async (res, company_id, min, max, search)` |

In each of the 10, delete this exact line from the `where` object:
```js
...(enrollment_status === 1 ? { is_chit_full_status: 0 } : {}),
```
Nothing else in these functions needs to change — the line is a pure, isolated insertion; removing
it restores the `where` clause to exactly what it was before this commit.

**Sanity check before removing**: grep for `enrollment_status === 1` in the file afterward — it
should return exactly one match (line 817, inside `getAllChitsGroupDetailsService`).

---

## Fix 2 — `createInstallaments` never sets `group_id`, silently breaking Phase 30/32 for new groups

The same commit switched `recordWinnerService`'s WHERE clauses from `auction_number` to
`installment_no` (a good fix — `auction_number` is also never populated at creation, so this was
correct). But those same WHERE clauses still also filter on `group_id: auctionData.group_id`, and
`createInstallaments` never sets `group_id` when generating new installment rows:

```js
// adminService.js, inside createInstallaments — current code
installmentsJsonArray.push({
  enrollment_id: data.id,
  type: mappedType || 1,
  installment_no: i,
  due_date: new Date(dateIterator.getTime() - (dateIterator.getTimezoneOffset() * 60000)).toISOString().split('T')[0],
  over_due_days_count: 0,
  penalty_amount: 0.00,
  payable_amount: currentPayableAmount
});
```

No `group_id` field. So for any chit group created from this point forward, every
`ChitsInstallment.update({...}, { where: { group_id: auctionData.group_id, ... } })` call in
`recordWinnerService` (both the winner's current/future-month updates and the non-winner
dividend-adjustment loop) matches **zero rows** — Phase 30's dividend logic and Phase 32's
current-month exclusion silently do nothing, no error, just no effect.

### Fix

Add `group_id` to the pushed row. `chits_group_id` is already in scope as the function's first
parameter:
```js
const createInstallaments = async (chits_group_id, chits_group_status) => {
  ...
  installmentsJsonArray.push({
    enrollment_id: data.id,
    group_id: chits_group_id,
    type: mappedType || 1,
    installment_no: i,
    due_date: new Date(dateIterator.getTime() - (dateIterator.getTimezoneOffset() * 60000)).toISOString().split('T')[0],
    over_due_days_count: 0,
    penalty_amount: 0.00,
    payable_amount: currentPayableAmount
  });
```

### Existing groups already affected

Any group created between the Phase 30 migration (`20260727120000-add-group-and-auction-to-installments.js`)
landing and this fix will have `ChitsInstallment.group_id = NULL` for all their rows — the
migration's own backfill only ran once, at migration time, and only covered rows that existed
*then*. A one-off backfill for any groups created in that window is worth running once this fix
lands:
```sql
UPDATE chits_installments ci
SET group_id = e.group_id
FROM enrollments e
WHERE ci.enrollment_id = e.id AND ci.group_id IS NULL;
```

### Remediation for auctions already recorded while this bug was live

**The `group_id` backfill above does not, by itself, fix any installment that's already wrong.**
`recordWinnerService`'s current-month zero-out only runs *at the moment a winner is recorded* — it
silently no-op'd for every affected group's auctions (matched zero rows, no error), and backfilling
`group_id` afterward doesn't retroactively re-run that update. Confirmed live: a group named
"chit test1" (Ticket #2, member Tulasi) has an already-recorded auction winner whose Installment #1
still shows the full ₹33,333 + penalty as payable in the admin Direct Payment screen — this is
exactly this bug, live.

Find every already-recorded winner whose current-month installment was never zeroed out:
```sql
SELECT a.id AS auction_id, a.group_id, a.bidder_id, a.auction_number, e.id AS enrollment_id,
       ci.id AS installment_id, ci.payable_amount, cg.scheme_configuration_id
FROM auctions a
JOIN enrollments e ON e.group_id = a.group_id AND e.subscriber_id = a.bidder_id
JOIN chits_installments ci ON ci.enrollment_id = e.id AND ci.installment_no = a.auction_number
JOIN chits_groups cg ON cg.id = a.group_id
WHERE ci.payable_amount > 0;
```
For each row returned, correct `payable_amount` per the Phase 32 rule table:
- `scheme_configuration_id IS NULL` (Open Auction) → `0`
- Fixed scheme, type 63 → `0`
- Fixed scheme, type 64/65 → `0`
- Fixed scheme, type 62 → the `withdrawn` price for that specific month from
  `fixed_scheme_chits_configurations.prices[auction_number - 1].withdrawn` (**not** `0`) — pull
  this per-row rather than blanket-zeroing, since type 62 is the one exception to "zero"

This is a one-time cleanup query, not a recurring job — once Fix 2 above lands, new auctions will
correctly zero out the current month at record-time and won't need this.

---

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Call each of the 10 endpoints listed in Fix 1 (Members, Routes, Areas, Districts, Cities, District dropdown, Agent-by-type, Self-Chits, Contact Us, FAQ) | 200, not 500 |
| 2 | `getAllChitsGroupDetailsService` with `enrollment_status: 1` | Still correctly filters to `is_chit_full_status: 0` — unaffected by the other fixes |
| 3 | Create a brand-new chit group, generate its installments | Every row has `group_id` populated, not `NULL` |
| 4 | Record an auction winner in that new group (open auction) | Winner's current-month installment → `0`; non-winners' installments correctly reduced by the dividend — confirms Phase 30/32 actually take effect now, not just on pre-existing groups |
| 5 | Run the backfill SQL | No rows left with `group_id IS NULL` where a matching enrollment exists |
