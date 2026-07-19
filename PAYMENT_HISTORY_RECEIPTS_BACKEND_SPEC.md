# Payment History & Receipts — Backend Spec

**For the backend team.** New feature, driven by a client call: members need to see their
own **day-wise, chit-group-wise payment history with receipt-level detail** — the
explicit goal is building member trust by being transparent about every rupee collected.
Reference: the Margadarsi Chits app screenshots the client shared — reviewed for
**content, not design** (the client was explicit about this). What those screens show
that we don't currently expose to a member: exact per-installment amounts, auction bid/
prize/dividend broken out line by line, and payment due dates stated plainly. This spec
is about the equivalent transparency for **payments already made**, not future dues
(`user/pending-payments` already covers what's owed).

Companion doc for Antigravity: `docs/PAYMENT_HISTORY_RECEIPTS_FRONTEND_IMPLEMENTATION.md`.

---

## Why this needs schema changes, not just a new read endpoint

Checked `CustomerPayment` (`models/customerpayment.js`) directly. It has:

```js
chits_installment_id, received_amount, penalty_paid, collection_agent_amount_id, payment_status
```

No `payment_date`. No `payment_mode`. No receipt number. The only place a payment "date"
exists is Sequelize's implicit `createdAt` — which is *when the record was inserted*, not
necessarily *when the member actually paid* (an admin backfilling a late entry, or a
collection agent's submission being verified days after the member paid in cash, would
both record a `createdAt` that doesn't match the real payment date). A trust-building
receipt screen showing the wrong date defeats the purpose.

Payment mode/reference *does* exist today, but only for the collection-agent path —
`CollectionAgentAmount` (`models/collection_agent_amount.js`) has `payment_type`, `cash`
(denominations), `transaction_id`, `cheque_number`, `bank_details`, `paid_date`. Confirmed
by reading `userService.js:1652` — when a collection-agent submission is verified, the
resulting `CustomerPayment` row links to it via `collection_agent_amount_id`. But
**admin/staff-direct payments never go through `CollectionAgentAmount`** — per
`docs/AMOUNT_COLLECTION` design (Section 10.2 of the FRS), those are recorded directly
and auto-verified, with no mode/reference captured anywhere today.

---

## 1. `CustomerPayment` — add the fields a receipt actually needs

```js
await queryInterface.addColumn('customer_payments', 'payment_date', { type: Sequelize.DATEONLY, allowNull: true });
await queryInterface.addColumn('customer_payments', 'payment_mode', { type: Sequelize.INTEGER, allowNull: true, comment: '1 cash, 2 upi, 3 cheque, 4 bank, 5 others' });
await queryInterface.addColumn('customer_payments', 'transaction_reference', { type: Sequelize.STRING, allowNull: true });
await queryInterface.addColumn('customer_payments', 'receipt_number', { type: Sequelize.STRING, allowNull: true, unique: true });
```

Same `payment_mode` numbering already used on `CollectionAgentAmount.payment_type` — keep
one vocabulary, don't invent a second enum.

**Backfill on write, both paths:**

- **Collection-agent path** (`userService.js:1652`, the verify-and-create block): populate
  `payment_date: submission.paid_date`, `payment_mode: submission.payment_type`,
  `transaction_reference: submission.transaction_id || submission.cheque_number || null`
  from the linked `CollectionAgentAmount` row — it's already sitting right there in the
  same function, this is just adding fields to an existing `.create()` call.
- **Admin/staff-direct path**: wherever that payment-recording endpoint lives (per the
  original collection-flow spec, Section 10.2 — locate the actual service function, it
  should be `storeOrUpdateCustomerPaymentService` or similarly named; if it doesn't exist
  yet as a distinct endpoint, that's a separate, earlier gap worth flagging back to us),
  accept `payment_date`, `payment_mode`, `transaction_reference` directly from the request
  body (the admin/staff already collects this on the existing collection form — the
  frontend spec for that flow, `docs/BONAGIRI_CHITS_FRS.md` §10.2, already has these
  fields on the form; they're just not being persisted).

**`receipt_number` generation** — sequential, human-readable, company-scoped:

```js
const generateReceiptNumber = async (companyId) => {
  const year = new Date().getFullYear();
  const count = await CustomerPayment.count({
    include: [{ model: ChitsInstallment, as: 'installment', include: [{ model: Enrollment, as: 'enrollment', where: { company_id: companyId } }] }]
  });
  return `RCT-${year}-${String(count + 1).padStart(6, '0')}`;
};
```

Format is a starting suggestion (`RCT-2026-000123`) — confirm with the client if they want
a specific format (some chit companies have a regulatory/audit convention for receipt
numbering under the Chit Funds Act's record-keeping requirements). Generate once, at
creation time, never regenerate.

**Existing rows:** no backfill attempted — `payment_date`/`payment_mode`/
`transaction_reference`/`receipt_number` are `null` for anything paid before this ships.
The history screen (below) should render those rows with the payment amount and
installment info it already has, and a "—" or "Details not available" for the new fields,
rather than fabricating a receipt number retroactively.

---

## 2. `user/payment-history` (new endpoint, member auth)

**Request:**

```json
{ "group_id": null, "min": 0, "max": 20 }
```

`group_id` optional — omit for a cross-group, day-wise feed (matches "day wise
transactions... chit group wise" — the client wants both views); provide it to scope to
one chit group (matches the reference screenshots' per-chit drill-down pattern).

**Server logic:**

1. Resolve the member's own enrollments (`subscriber_id = userPayload.id`), optionally
   filtered to `group_id`.
2. Query `CustomerPayment` where `payment_status = 1` (paid/verified only — a pending
   collection-agent submission isn't a receipt yet) joined through `ChitsInstallment` →
   `Enrollment` for those enrollment ids.
3. Order by `payment_date DESC` (fall back to `createdAt DESC` for legacy null-date rows).
4. Include `ChitsGroup` (name, chit amount) and `ChitsInstallment` (installment_no,
   due_date) via the join chain, for chit-group-wise grouping/display.

**Response `data`:**

```json
{
  "count": 42,
  "rows": [
    {
      "id": "<payment uuid>",
      "receipt_number": "RCT-2026-000123",
      "payment_date": "2026-07-15",
      "group_id": "<uuid>",
      "group_name": "TT049T D13",
      "installment_no": 28,
      "received_amount": "9800.00",
      "penalty_paid": "0.00",
      "total_paid": "9800.00",
      "payment_mode": 1,
      "transaction_reference": null
    }
  ]
}
```

`total_paid = received_amount + penalty_paid` — computed server-side so the frontend
doesn't duplicate the arithmetic.

---

## 3. `user/payment-receipt` (new endpoint, member auth) — single-receipt detail

For the "tap a row to see the full receipt" view. **Request:** `{ payment_id }`.

**Response** — everything from the list row, plus subscriber-facing detail worth showing
on a formal receipt: member name, chit group name, chit value, subscriber position
(`group_position_number`), company name (for the receipt letterhead-equivalent). Assemble
from the existing joins (`Enrollment` → `Member`, `Enrollment` → `ChitsGroup`,
`ChitsGroup` → `Company`) — no new tables needed for this, just a richer `include` than
the list endpoint uses.

**Explicitly out of scope for this spec:** PDF generation / downloadable file. This is an
on-screen, formatted receipt view only. If the client wants a downloadable/printable PDF,
that's a real follow-up worth its own scoping conversation (PDF generation library choice,
company branding/letterhead, etc.) — don't build it speculatively into this pass.

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| Migration | Existing `customer_payments` rows after migration | `payment_date`/`payment_mode`/`transaction_reference`/`receipt_number` all `null`, no data loss |
| Create (CA path) | Collection-agent submission gets verified | Resulting `CustomerPayment` row has `payment_date`/`payment_mode`/`transaction_reference` populated from the linked submission, plus a generated `receipt_number` |
| Create (admin path) | Admin records a direct payment | Same four fields populated from the admin's own form input |
| List | `user/payment-history` with no `group_id` | Payments across all the member's groups, most recent first |
| List | `user/payment-history` with `group_id` | Scoped to that one group only |
| List | A `payment_status != 1` row (pending CA submission) | Excluded — not a receipt yet |
| Detail | `user/payment-receipt` for a valid `payment_id` | Full receipt detail including member/group/company context |
| Detail | `payment_id` belonging to a different member | Rejected — scope by the authenticated member's own enrollments, not a raw lookup by id |
