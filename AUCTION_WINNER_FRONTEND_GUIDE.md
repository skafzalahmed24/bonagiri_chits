# Auction Winner Recording — Frontend Guide

This document outlines the recent backend changes and fixes (B5–B9) regarding the Auction Winner Recording and Installment Grid, specifically focusing on what the **Frontend Team** needs to know to integrate successfully.

---

## 1. Installment Grid API is Live
**Endpoint:** `POST /api/chits-installment/get-by-group`

The endpoint to fetch installment schedules is now fully operational. 
- It returns the generated installments for all enrollments in a group.
- It dynamically computes `is_paid`, `paid_amount`, and `payment_date` by cross-referencing successful `CustomerPayment` records.
- For Fixed Schemes, it accurately reflects the dynamic `payable_amount` changes (e.g., switching to "withdrawn" amounts once a member wins, or distributing the "adding" percentage).

**Frontend Action:** You can now safely integrate this endpoint to render the Installment Data Grid (Section 8.8 of FRS).

---

## 2. Strict Workflow for Fixed Schemes
**Endpoint:** `POST /api/auction/record-winner` vs `POST /api/auction/store-or-update`

To prevent data desynchronization with fixed scheme templates, the backend now **strictly enforces** how winners are recorded based on the scheme type:

- **Fixed Schemes (Type 62, 63, 64, 65):** You **MUST** use the Spinner flow and hit the `/api/auction/record-winner` endpoint. 
  - If you attempt to use the manual form (`/api/auction/store-or-update`) to create a *new* auction for a fixed scheme, the backend will reject it with a `400 Bad Request`.
- **Open Auctions:** The manual form (`store-or-update`) remains fully available for Open Auctions where bids vary dynamically.

**Frontend Action:** Ensure the UI restricts the manual creation of auctions for Fixed Scheme groups, funneling those users exclusively to the Spinner (Record Winner) flow.

---

## 3. `auction_number` is Server-Managed
You no longer need to send `auction_number` when creating new auctions via the manual form (`/api/auction/store-or-update`).

- The backend now auto-calculates the next sequential `auction_number` strictly on the server-side to prevent race conditions or client-side stale state bugs.
- If the frontend sends an `auction_number` during creation, the backend will safely ignore it.

**Frontend Action:** You can safely remove `auction_number` from the request payload when creating new manual entries.

---

## 4. Enhanced Error Handling for Duplicates
The database now has strict unique constraints to protect against race conditions:
1. A member cannot win twice in the same group.
2. The same auction number cannot be recorded twice in the same group.

If a duplicate is attempted (e.g., rapid double-clicks on the frontend), the backend will catch it at the database level and return a clean, user-friendly `400 Bad Request` with messages like:
- *"This member has already won an auction in this group"*
- *"This auction number has already been recorded for this group"*

**Frontend Action:** Ensure your API error handlers surface these `400` error messages directly to the user (e.g., in a Toast notification).
