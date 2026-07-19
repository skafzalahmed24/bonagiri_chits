# Comprehensive FCM Push Notification Implementation Plan

This document outlines the complete end-to-end architecture for implementing Firebase Cloud Messaging (FCM). It is separated into Web (Admin) APIs and Mobile (User) APIs, utilizing your existing `members` and `staff_user` tables.

## 1. FCM Integration Setup (Node.js)

1. **Install SDK:** We will install the `firebase-admin` NPM package.
2. **Service Account via ENV:** Do NOT commit the JSON key. We will use environment variables (`FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`) to initialize the admin SDK inside `src/services/fcmService.js`.
3. **Core Service (`src/services/fcmService.js`):** 
   - Expose methods like:
     - `sendPushToMember(memberId, title, body, dataPayload)`
     - `sendPushToStaff(staffId, title, body, dataPayload)`
     - `sendPushToMulticast(tokens, title, body, dataPayload)` (Uses `sendEachForMulticast` for batching 30-50 tokens efficiently)
   - **Error Handling & Stale Tokens:** All sends will be "fire-and-forget" (we will not `await` them in the main transaction, preventing business logic blockage). We will explicitly catch `messaging/registration-token-not-registered` errors and nullify the `fcm_token` in the database to prevent stale tokens from accumulating.

## 2. Database Modifications

1. **Modify `members` Table (For Mobile App Users):**
   - **[ADD]** `fcm_token` (VARCHAR): Stores the member's current mobile device token.
2. **Modify `staff_user` Table (For Web Admins):**
   - **[ADD]** `fcm_token` (VARCHAR): Stores the staff member's browser/web push token.
3. **Create `notification_histories` Table:**
   - **Fields:** `id` (UUID), `user_id` (VARCHAR - to support both INTEGER Member IDs and UUID StaffUser IDs), `user_type` ('MEMBER' or 'STAFF'), `company_id` (UUID), `title`, `body`, `is_read` (Boolean), `createdAt`.
   - *Why?* Storing `company_id` ensures strict multi-tenant isolation. Typing `user_id` as VARCHAR prevents type coercion crashes between different ID schemas.

## 3. Complete API Endpoints Documentation

### A. Mobile (User) Side APIs

Added to `src/routes/userRoutes.js`:

1. **Register Device Token** -> `POST /api/user/notifications/register-token`
2. **Get Notification History** -> `POST /api/user/notifications/history`
3. **Mark Notification as Read** -> `POST /api/user/notifications/mark-read`
4. **Logout Update:** Modify the existing user logout endpoint to clear the `fcm_token` to ensure shared devices don't receive incorrect pushes.

### B. Web (Admin/Staff) Side APIs

Added to `src/routes/adminRoutes.js`:

1. **Register Admin Web Token** -> `POST /api/admin/notifications/register-token`
2. **Send Manual Notification** -> `POST /api/admin/notifications/send-manual`
   - Will be gated by RBAC: `authMiddleware.requirePermission(MODULES.NOTIFICATIONS)`
   - Scoped strictly to the admin's `company_id`.

## 4. Automatic Notification Triggers (Codebase Integration)

1. **Member Enrolled in Chit Group**
   - **Location:** `src/services/adminService.js` inside `storeOrUpdateEnrollmentService`
2. **Auction Winner Recorded**
   - **Location:** `src/services/adminService.js` inside `recordWinnerService`
   - **Action:** Uses multicast to notify the rest of the group efficiently without blocking the transaction.
3. **Customer Payment Verified**
   - **Location:** `src/services/adminService.js` inside `updateCollectionSubmissionStatusService` (when an admin verifies a payment).
4. **Chit Group Start/Commencement**
   - **Location:** `src/services/adminService.js` (where Group status changes to running).
5. **Upcoming Installment & Overdue Reminders (Cron Jobs)**
   - **Location:** `src/utils/cronJobs.js` (using existing node-cron patterns).
6. **Dividend Distribution Notification**
   - **Location:** Inside `recordWinnerService` when dividends are applied.
7. **Chit Group Maturity / Completion**
   - **Location:** When group status changes to completed.
8. **New Chit Group Launch (Marketing)**
   - **Location:** When a group is created by the Admin.

> [!NOTE]
> All automated notification triggers will run asynchronously (fire-and-forget) so they never block or slow down core financial operations even if Firebase is down.

## User Review Required

Please review the updated plan above, which incorporates the Senior Reviewer's feedback (stale token cleanup, multicasting, non-blocking sends, env vars for secrets, and schema corrections). 

If you are satisfied, say the word and I will begin the execution phase immediately!
