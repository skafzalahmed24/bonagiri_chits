# All Receipts — Unified Admin List — Backend Spec

**Phase 28 — new feature, added 2026-07-26.** There is currently no way for an admin to
browse a list of recorded payments at all — confirmed by direct search: no `get-all`
service exists for `CustomerPayment`, and no admin page consumes one. After recording a
Direct Payment, the only way to confirm it landed is opening the chit group's detail page
and checking the "Actual Installments" grid for a Paid badge — no receipt-level detail
(receipt number, date, mode, who recorded it) is visible anywhere.

This spec covers a single unified list combining **both** payment sources:
1. Payments recorded directly by an admin/staff (`customer-payment/store-direct`)
2. Payments that originated as a collection agent submission and were later verified by
   an admin/staff (`collection-agent/submissions/update-status`)

Every row must clearly indicate which source it came from, and who actually performed the
recording/verifying action.

---

## What already exists — reuse, don't rebuild

`CustomerPayment` (`models/customerpayment.js`) is already the single source of truth for
an actual paid receipt, regardless of how it got there:

```js
{
  id, chits_installment_id, received_amount, penalty_paid,
  collection_agent_amount_id,   // NULL = direct admin entry; set = came from a collection agent submission
  payment_status, payment_date, payment_mode, transaction_reference, receipt_number
}
```

`collection_agent_amount_id` already gives us the source distinction for free — **no new
column needed for "is this a direct or collection-agent receipt."** When it's set, join to
`CollectionAgentAmount` (which has `collection_agent_id`, resolvable to the agent's name)
to show which agent collected it.

## What's missing — two new columns needed for "created by"

Neither write path currently records who performed the action:

- `storeDirectPaymentService` (`adminService.js`) creates the `CustomerPayment` row but
  never stores which admin/staff user (`req.user`) did it.
- `updateCollectionSubmissionStatusService` sets `CollectionAgentAmount.confirm_date` when
  a submission is verified, but never records *who* verified it — only *when*.

**Add to `CustomerPayment`** (new migration):
```js
recorded_by_id: { type: DataTypes.STRING, allowNull: true },   // company_id (UUID) or staff numeric id, depending on role
recorded_by_role: { type: DataTypes.STRING, allowNull: true }, // 'company' | 'staff' — only set on direct entries
recorded_by_name: { type: DataTypes.STRING, allowNull: true }, // denormalized display name, avoids a join back to Company/StaffUser at read time
```

**Add to `CollectionAgentAmount`** (same migration):
```js
verified_by_id: { type: DataTypes.STRING, allowNull: true },
verified_by_role: { type: DataTypes.STRING, allowNull: true },
verified_by_name: { type: DataTypes.STRING, allowNull: true },
```

(Denormalizing the display name at write time — rather than joining back to `Company`/
`StaffUser` on every read — matches the existing pattern already used elsewhere in this
codebase, e.g. audit log actor labeling was flagged with the same recommendation in an
earlier phase.)

### Populate on write

```js
// storeDirectPaymentService — when creating the CustomerPayment row
const newPayment = await CustomerPayment.create({
  ...,
  recorded_by_id: user.role === 'company' ? user.id : String(user.id),
  recorded_by_role: user.role, // 'company' or 'staff'
  recorded_by_name: user.role === 'company' ? company.company_name : staffUser.name, // fetch if not already loaded
});
```

```js
// updateCollectionSubmissionStatusService — when status flips to verified (2)
await submission.update({
  status: 2,
  confirm_date: new Date(),
  verified_by_id: userToken.role === 'company' ? userToken.id : String(userToken.id),
  verified_by_role: userToken.role,
  verified_by_name: /* resolve from userToken the same way */,
});
```

---

## New endpoint — `customer-payment/get-all-receipts`

```js
const getAllReceiptsService = async (res, companyId, filters = {}) => {
  const { min = 0, max = 20, source, group_id, member_id, payment_mode, date_from, date_to, search } = filters;

  const where = { payment_status: 1 };
  if (payment_mode) where.payment_mode = payment_mode;
  if (date_from || date_to) {
    where.payment_date = {};
    if (date_from) where.payment_date[Op.gte] = date_from;
    if (date_to) where.payment_date[Op.lte] = date_to;
  }
  if (source === 'direct') where.collection_agent_amount_id = null;
  if (source === 'collection_agent') where.collection_agent_amount_id = { [Op.ne]: null };

  const { count, rows } = await CustomerPayment.findAndCountAll({
    where,
    include: [
      {
        model: ChitsInstallment,
        as: 'installment',
        required: true,
        include: [{
          model: Enrollment,
          as: 'enrollment',
          required: true,
          where: { company_id: companyId, ...(member_id && { subscriber_id: member_id }) },
          include: [
            { model: Member, as: 'subscriber', attributes: ['id', 'name'] },
            { model: ChitsGroup, as: 'group', attributes: ['id', 'group_name'], where: group_id ? { id: group_id } : undefined }
          ]
        }]
      },
      {
        model: CollectionAgentAmount,
        as: 'collection_submission',
        required: false,
        include: [{ model: Member, as: 'collection_agent', attributes: ['id', 'name'] }]
      }
    ],
    limit: parseInt(max, 10) || 20,
    offset: parseInt(min, 10) || 0,
    order: [['payment_date', 'DESC'], ['createdAt', 'DESC']]
  });

  const formatted = rows.map(p => {
    const isDirect = !p.collection_agent_amount_id;
    return {
      id: p.id,
      receipt_number: p.receipt_number,
      payment_date: p.payment_date,
      payment_mode: p.payment_mode,
      transaction_reference: p.transaction_reference,
      received_amount: p.received_amount,
      penalty_paid: p.penalty_paid,
      total_paid: (parseFloat(p.received_amount) + parseFloat(p.penalty_paid)).toFixed(2),
      member_name: p.installment?.enrollment?.subscriber?.name || null,
      group_name: p.installment?.enrollment?.group?.group_name || null,
      installment_no: p.installment?.installment_no || null,
      source: isDirect ? 'direct' : 'collection_agent',
      recorded_by: isDirect
        ? { name: p.recorded_by_name, role: p.recorded_by_role }
        : { name: p.collection_submission?.verified_by_name, role: p.collection_submission?.verified_by_role },
      collected_by: isDirect ? null : { name: p.collection_submission?.collection_agent?.name || null },
    };
  });

  return successResponse(res, statusCodes.OK, 'Receipts retrieved successfully', { count, rows: formatted });
};
```

**Route** — gate on the same `T_MEMBER_RECEIPTS` module already used for the Direct
Payment screen (this is a closely related read view; split into its own module id later
if a real need arises to let someone browse receipts without also being able to record
direct payments):

```js
router.post('/customer-payment/get-all-receipts', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_MEMBER_RECEIPTS), validate(adminValidation.getAllReceiptsSchema), adminController.getAllReceipts);
```

```js
getAllReceiptsSchema: Joi.object({
  min: Joi.number().integer().min(0).optional(),
  max: Joi.number().integer().min(1).optional(),
  source: Joi.string().valid('direct', 'collection_agent').optional(),
  group_id: Joi.string().uuid().optional(),
  member_id: Joi.number().integer().optional(),
  payment_mode: Joi.number().integer().optional(),
  date_from: Joi.date().iso().optional(),
  date_to: Joi.date().iso().optional(),
})
```

Company scoping must derive strictly from `req.user` (via `resolveCompanyIdForAuth`), not
from any body field — this list surfaces financial data across the whole company, same
sensitivity class as the dashboard/collections endpoints that have had cross-tenant issues
before in this engagement. Don't repeat that mistake here.

---

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Record a Direct Payment as a company admin, then fetch `get-all-receipts` | Row appears with `source: 'direct'`, `recorded_by.name` = the company's name |
| 2 | Record a Direct Payment as a staff user, then fetch the same list | `recorded_by.role: 'staff'`, correct staff name |
| 3 | Verify a collection agent submission, then fetch the list | Row appears with `source: 'collection_agent'`, `collected_by.name` = the agent, `recorded_by.name` = whichever admin/staff verified it |
| 4 | Filter by `source: 'direct'` / `source: 'collection_agent'` | Only matching rows returned |
| 5 | Company A admin fetches the list | Never sees Company B's receipts, regardless of any body field supplied |
