# Collection Submission — Cash Denominations & Transaction Reference Missing on Read

**Phase 23 — reported 2026-07-24.** User-reported: cash denominations entered on the
Collect screen don't appear anywhere after submission. Root cause confirmed directly
against the code — this is a read-side gap, not a write-side bug.

---

## The denominations are captured and stored correctly — they're just never returned

**Write path (correct, no changes needed):** the Collect screen
(`src/app/member/collections/collect/[memberId]/page.jsx`) captures a per-note count and
`useSubmitPayment` (`useCollectionAgent.js:94-108`) wraps it as
`cash: { amount, denominations: { "500": 10, "100": 5, ... } }` before submitting. This
matches `submitCollectionPaymentSchema`'s `cash: Joi.object().optional()`
(`userValidation.js:114`), and `submitCollectionPaymentService` stores it verbatim via
`CollectionAgentAmount.create({ ..., cash, ... })`. The `cash` column is `DataTypes.JSON`
(`models/collection_agent_amount.js:36-39`) — confirmed the full object, denominations
included, reaches the database intact.

**Read path (the actual bug) — both list endpoints strip it out before responding.**
`getAllCollectionSubmissionsService` (`adminService.js:3847-3885`, backs the admin
verification queue) and its near-identical twin `getSubmissionsService`
(`userService.js:1694-...`, backs the collection agent's own submission history) both do:

```js
const formatted = submissions.map(sub => {
  let amount = 0;
  if (sub.cash && sub.cash.amount) {
    amount = sub.cash.amount;              // pulls out only the total...
  } else if (sub.bank_details && sub.bank_details.amount) {
    amount = sub.bank_details.amount;
  }
  ...
  return {
    id: sub.id, member_name: ..., profile_image: ..., group_name: ..., amount,
    method: ..., date: ..., collection_id: ..., status: ..., status_note
    // ...sub.cash, sub.cash.denominations, sub.transaction_id, sub.cheque_number
    // are never included anywhere in this object
  };
});
```

Both functions read `sub.cash.amount` just to compute the display total, then discard the
rest of `cash` — the denominations breakdown never reaches the API response. Same story
for `transaction_id`/`cheque_number` (present on the model, written correctly on submit,
never read back out here).

**The frontend already knows this and has a documented workaround in place** —
`src/features/shared/mappers/collectionSubmission.mapper.js` hardcodes
`denominations: null` and `transaction_ref: null` on every row, with an explicit comment:
*"The backend shape is lossy — it does not return `transaction_ref`, `denominations`, a
real per-collection code, an agent name, `payment_mode` (numeric), or raw status dates.
Those fields are filled best-effort here and are tracked for the backend team."* This was
flagged back in Phase 2 of this engagement and has been open since, unrelated to any
recent work — the user just hit it directly while testing the Collect flow.

---

## Fix

Add the missing fields to the `formatted` object in **both** functions — they're
structurally identical, fix them together so they don't drift further apart:

```js
return {
  id: sub.id,
  member_name: sub.member ? sub.member.name : 'Unknown',
  profile_image: sub.member ? sub.member.upload_image : '',
  group_name: groupNames || 'No Group',
  amount,
  method: getPaymentMethod(sub.payment_type),
  date: formatDate(sub.createdAt),
  collection_id: collection_id_value,
  status: statusStr,
  status_note,
  denominations: sub.cash?.denominations || null,
  transaction_ref: sub.transaction_id || sub.cheque_number || null,
};
```

Once this ships, `collectionSubmission.mapper.js` should be updated to read these real
fields instead of hardcoding `null` — `denominations: row.denominations` and
`transaction_ref: row.transaction_ref` — tracked as a small frontend follow-up, not
blocking this backend fix.

---

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Submit a cash collection with a specific denomination breakdown (e.g. 10× ₹500, 5× ₹100) | Submission succeeds, as today |
| 2 | View that submission in the admin verification queue | `denominations` field present in the raw API response, matching what was entered |
| 3 | View the same submission in the collection agent's own submission history | Same — `denominations` present, matches |
| 4 | Submit a cheque payment with a cheque number, then view it in both list endpoints | `transaction_ref` present, equals the cheque number |
| 5 | Submit a UPI payment with a transaction id, then view it in both list endpoints | `transaction_ref` present, equals the transaction id |
