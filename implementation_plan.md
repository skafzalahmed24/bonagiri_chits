# Payment & Transaction History Implementation Plan

This document outlines the plan to handle partial payments (daily, weekly, or ad-hoc amounts) and provide a complete, detailed transaction history (with dates and remaining balances) for chit installments.

## Current State Assessment

I have reviewed the current database schema, specifically the `ChitsInstallment` and `CustomerPayment` models. 
- **Good News:** The architecture already supports multiple partial payments. A single `ChitsInstallment` (e.g., a monthly 5 Lakhs chit) `hasMany` `CustomerPayment` records. This means if a user pays their monthly due via daily or weekly partial payments, we can simply add multiple `CustomerPayment` rows for the same installment.

## Open Questions

> [!IMPORTANT]
> Please review and clarify the following before we proceed:
> 1. Do we need to capture the **Payment Mode** (Cash, UPI, Bank Transfer, Cheque) and **Reference ID** for each partial payment?
> 2. For the Transaction History UI, do you want the history grouped by **Member**, by **Enrollment**, or by **Installment Month**?
> 3. Should the "Balance" be shown on a per-installment basis (e.g., Installment 1 has 10k pending) or a total running balance for the entire chit group enrollment?

## Proposed Changes

### 1. Database Model Updates (`CustomerPayment`)
While the table structure supports partial payments, we need to add a few fields to ensure the transaction history is accurate and professional:
- **[MODIFY]** `src/models/customerpayment.js`
  - Add `payment_date` (DATEONLY or DATE): To record exactly when the payment was made (crucial for collections entered a day late).
  - Add `payment_mode` (STRING/INTEGER): e.g., 'CASH', 'UPI', 'BANK'.
  - Add `transaction_reference` (STRING): For UPI/Bank reference IDs.

*(Note: We will need to create a Sequelize migration to add these columns safely to your existing database without losing data).*

### 2. API Endpoints

We need to implement the backend logic to retrieve the detailed history and compute the running balances.
- **[NEW] Endpoint:** `/admin/payments/history`
  - **Input:** `enrollment_id` or `chits_installment_id`
  - **Logic:** 
    - Fetch the `ChitsInstallment` details (`payable_amount`, `penalty_amount`, `due_date`).
    - Include all associated `CustomerPayment` rows (the partial payments), ordered by date.
    - Calculate the **Running Balance**: 
      `Balance = (payable_amount + penalty_amount) - sum(received_amount) - sum(penalty_paid)`.
  - **Output:** A flat or grouped array of transactions ready to be shown in a table UI.

- **[MODIFY] Endpoint:** `/admin/payments/store-or-update` (or similar collection logic)
  - Ensure the logic safely handles inserting *new* `CustomerPayment` rows for partial amounts instead of overwriting existing ones.

## Verification Plan

### Automated/Manual Testing
1. **Partial Payments:** Create a monthly installment of ₹10,000. Add three separate payments of ₹2,000, ₹3,000, and ₹5,000 on different dates.
2. **Balance Check:** Verify that after the ₹2,000 payment, the API reports a balance of ₹8,000. After all three, the balance should perfectly hit ₹0 and `payment_status` should update to `1` (Paid).
3. **History Output:** Hit the history API and verify it returns all 3 distinct rows with their respective dates, modes, and amounts.
