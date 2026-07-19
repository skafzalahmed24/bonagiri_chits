# Admin Direct Payment — Backend Fixes Required

**For the backend team.** Building the frontend for "admin records a payment directly"
(same idea as Collection Agent submissions, but coming from an admin, so it's
auto-verified — no separate verification step). The endpoint for this already exists
(`customer-payment/store-direct`, built alongside the receipt-number fix) and the
auto-verify behavior is already correct. But reviewing it in detail to design the frontend
around it turned up one bug that blocks the primary user of this feature entirely, plus
three smaller issues worth fixing in the same pass.

---

## 1. Blocker — company admins cannot use this endpoint at all

`storeDirectPaymentService` (`src/services/adminService.js:3024`):

```js
const companyId = user.company_id;
if (!companyId) {
  return errorResponse(res, statusCodes.BAD_REQUEST, 'Admin company ID is required');
}
```

`user.company_id` is only populated in the JWT for `role !== 'company'` — company-role
tokens have `company_id: undefined` by design (their own identity lives in `user.id`; this
is the same fact behind the Phase 13 dashboard-scoping fix and the `getCompanyIdFromUser`
helper's company branch). Since this endpoint reads `user.company_id` directly instead of
branching on role, **every call from an actual company admin hits the `!companyId` guard
and gets rejected immediately** — only staff tokens (which do carry `company_id`) can
currently use this endpoint. Given company admins are the primary, most common user of a
"record a payment" screen, this needs fixing before the frontend can be usable at all.

**Fix:**
```js
const companyId = user.role === 'company' ? user.id : user.company_id;
```

---

## 2. No ownership/company scoping on the installment being paid

`storeDirectPaymentService` takes `chits_installment_id` from the request body and creates
a `CustomerPayment` against it with no check that the installment actually belongs to the
caller's own company:

```js
const { chits_installment_id, received_amount, ... } = data;
if (!chits_installment_id || received_amount === undefined) { ... }
// no lookup/verification of which company chits_installment_id belongs to
const newPayment = await CustomerPayment.create({ chits_installment_id, ... });
```

A staff/admin from Company A could currently pass an installment id belonging to Company
B (if they had it — e.g. leaked through another endpoint, or guessed) and record a payment
against it. This is the same missing-scoping pattern flagged repeatedly this engagement
(auction winner recording, audit logs, dashboard, collection submissions list) — worth
closing here too rather than adding a fifth instance to that list.

**Fix:** before creating the payment, resolve the installment's owning company (via
`ChitsInstallment → Enrollment → company_id`, same join shape already used elsewhere in
this file, e.g. `getInstallmentsByGroupService`) and reject if it doesn't match `companyId`
from fix #1.

---

## 3. `getInstallmentsByGroupService` reads a field that doesn't exist

`src/services/adminService.js:1352`, inside the row-mapping for already-paid installments:

```js
paid_amount: payment ? payment.amount : "0.00",
```

`CustomerPayment` has no `amount` column — the field is `received_amount`
(`src/models/customerpayment.js:22`). This always evaluates to `undefined` for any
already-paid installment, silently rendering as blank/undefined in whatever consumes this
field. Doesn't crash (Sequelize instances just return `undefined` for unknown attributes),
but it's a real display bug and this endpoint is exactly what the new frontend flow will
reuse to show "already paid" vs "pending" installments.

**Fix:** `paid_amount: payment ? payment.received_amount : "0.00"`.

---

## 4. No validation schema, and permission should be its own module

`adminRoutes.js:195`:
```js
router.post('/customer-payment/store-direct', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_COLLECTION_VERIFY), adminController.storeDirectPayment);
```

Two things:
- **No `validate(...)` wrapper at all** — every other mutating endpoint in this file goes
  through a Joi schema. Add one requiring `chits_installment_id` (uuid) and
  `received_amount` (number > 0), with `penalty_paid`/`payment_date`/`payment_mode`/
  `transaction_reference` optional, matching what the service already reads.
- **Reuses `MODULES.T_COLLECTION_VERIFY`** ("Agent Collections Verification") as its
  permission, but this is a conceptually different action — recording a fresh payment vs.
  verifying/rejecting one a collection agent already submitted. A company might reasonably
  want to grant one without the other. The frontend module registry
  (`src/features/company-admin/constants/modules.js`) already has a `T_MEMBER_RECEIPTS`
  entry reserved for exactly this screen, just not `ready: true` yet. Add a matching
  `T_MEMBER_RECEIPTS` id to `src/utils/modules.js` (same string, byte-for-byte — this
  exact mismatch has broken things twice already this engagement) and gate this route with
  that instead.

---

## Confirmed contract for the frontend to build against (once the above lands)

```
POST customer-payment/store-direct
Body: { chits_installment_id (uuid, required), received_amount (number, required),
        penalty_paid?, payment_date? (defaults to today), payment_mode? (1 cash/2 upi/
        3 cheque/4 bank/5 others, defaults to 1), transaction_reference? }
```
Creates a `CustomerPayment` with `payment_status: 1` (auto-verified) and a freshly
generated `receipt_number`, same generator/format already used for the collection-agent
verification path. `collection_agent_amount_id` stays `null` — that's how an admin-direct
payment is distinguished from a collection-agent-submitted one in the data.

Supporting read endpoints the frontend will chain together (both already live, no changes
needed beyond fix #3 above):
```
POST chits-group/get-all                          → pick a group
POST group/members        { group_id }             → pick a member/enrollment within it
POST chits-installment/get-by-group  { group_id, enrollment_id }  → list that member's installments, filter client-side to is_paid: false
```

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| 1 | Log in as company admin (not staff), record a direct payment | Succeeds — was previously a guaranteed 400 |
| 2 | As Company A staff, attempt to pass an installment id belonging to Company B | Rejected |
| 3 | View a group's installments where one is already paid | `paid_amount` shows the real amount, not blank/undefined |
| 4 | Submit the store-direct form missing `received_amount` | Clean 400 from Joi, not a generic 500 |
| 5 | Grant a staff user the "Member Receipts" permission only (not Collection Verification) | Can record direct payments, cannot access the verification queue |
