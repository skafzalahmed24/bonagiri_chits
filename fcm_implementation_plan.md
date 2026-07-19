# Comprehensive FCM Push Notification Implementation Plan

This document outlines the complete end-to-end architecture for implementing Firebase Cloud Messaging (FCM). It is separated into Web (Admin) APIs and Mobile (User) APIs, utilizing your existing `members` and `staff_users` tables.

## 1. FCM Integration Setup (Node.js)

1. **Install SDK:** We will install the `firebase-admin` NPM package.
2. **Service Account:** Place the Firebase JSON key in a secure folder (e.g., `src/config/firebaseServiceAccount.json`).
3. **Core Service (`src/services/fcmService.js`):** 
   - We will build a unified service that exposes methods like:
     - `sendPushToMember(memberId, title, body, dataPayload)`
     - `sendPushToStaff(staffId, title, body, dataPayload)`
     - `sendPushToChitGroup(groupId, title, body)`

## 2. Database Modifications

Instead of creating complex separate token tables, we will use your existing tables to keep it simple, plus one table for the in-app history.

1. **Modify `members` Table (For Mobile App Users):**
   - **[ADD]** `fcm_token` (VARCHAR): Stores the member's current mobile device token.
2. **Modify `staff_users` Table (For Web Admins):**
   - **[ADD]** `fcm_token` (VARCHAR): Stores the staff member's browser/web push token.
3. **Create `notification_histories` Table:**
   - **Fields:** `id`, `user_id`, `user_type` ('MEMBER' or 'STAFF'), `company_id` (UUID), `title`, `body`, `is_read` (Boolean), `createdAt`.
   - *Why?* Storing `company_id` ensures strict multi-tenant isolation. Users can open the app and see a list of past notifications scoped exactly to their account.

## 3. Complete API Endpoints Documentation

We will build completely separate APIs for the Admin panel and the Mobile app.

### A. Mobile (User) Side APIs

These will be added to `src/routes/userRoutes.js` and use `userController.js`.

**1. Register Device Token**
- **Endpoint:** `POST /api/user/notifications/register-token`
- **Headers:** `Authorization: Bearer <member_token>`
- **Payload:**
  ```json
  { "fcm_token": "abc123deviceTokenXYZ" }
  ```
- **Action:** Updates the `fcm_token` column in the `members` table for the logged-in user.

**2. Get Notification History**
- **Endpoint:** `POST /api/user/notifications/history`
- **Headers:** `Authorization: Bearer <member_token>`
- **Payload:** `{ "page": 1, "limit": 20 }`
- **Action:** Returns past notifications for this member from `notification_histories`.

**3. Mark Notification as Read**
- **Endpoint:** `POST /api/user/notifications/mark-read`
- **Headers:** `Authorization: Bearer <member_token>`
- **Payload:** `{ "notification_id": "uuid-here" }`

### B. Web (Admin/Staff) Side APIs

These will be added to `src/routes/adminRoutes.js` and use `adminController.js`.

**1. Register Admin Web Token**
- **Endpoint:** `POST /api/admin/notifications/register-token`
- **Headers:** `Authorization: Bearer <admin_token>`
- **Payload:** `{ "fcm_token": "webPushTokenXYZ" }`
- **Action:** Updates the `fcm_token` column in the `staff_users` table.

**2. Send Manual Notification to Users**
- **Endpoint:** `POST /api/admin/notifications/send-manual`
- **Headers:** `Authorization: Bearer <admin_token>`
- **Payload:**
  ```json
  {
    "target_type": "ALL", // or "GROUP", "SPECIFIC_MEMBER"
    "target_id": null, // e.g., groupId or memberId if applicable
    "title": "Happy Diwali!",
    "body": "Office is closed tomorrow."
  }
  ```
- **Action:** Admin can manually type out a message and blast it to users. **(Strictly scoped to fetch and send only to members where `company_id` matches the admin's `company_id`).**

## 4. Automatic Notification Triggers (Codebase Integration)

Based on a review of your existing codebase, we will inject the `fcmService` into these specific files to trigger push notifications automatically:

1. **Member Enrolled in Chit Group**
   - **File:** `src/services/adminService.js` (inside `storeOrUpdateEnrollmentService`)
   - **Action:** Send push to Member: *"You have been successfully enrolled in Chit Group XYZ."*

2. **Auction Winner Recorded**
   - **File:** `src/services/adminService.js` (inside `recordWinner`)
   - **Action:** Send push to the Winner: *"Congratulations! You won the auction for Chit XYZ."*
   - **Action:** Send push to all other Group Members: *"The auction for Chit XYZ has concluded."*

3. **Customer Payment Received**
   - **File:** `src/services/userService.js` (inside where `CustomerPayment.create` occurs) or Admin side.
   - **Action:** Send push to Member: *"We have received your payment of Rs. X for Installment Y."*

4. **Chit Group Start/Commencement**
   - **File:** `src/services/adminService.js` (where Group status changes to running).
   - **Action:** Send push to all Group Members: *"Chit Group XYZ has officially commenced!"*

5. **Upcoming Installment Reminder (Requires Cron Job)**
   - **File:** A new cron job script (e.g., `src/jobs/reminderJob.js`).
   - **Action:** Runs daily, finds installments due in 3 days, and sends push: *"Reminder: Installment for Chit XYZ is due in 3 days."*

### Suggested Additional Triggers (For Your Review)

6. **Payment Overdue / Defaulter Warning (Cron Job)**
   - *Trigger:* 1-3 days after an installment due date if payment is not received.
   - *Action:* Send push to Member: *"URGENT: Your installment for Chit XYZ is overdue. Please pay immediately to avoid penalties."*
   
7. **Dividend Distribution Notification**
   - *Trigger:* Right after an auction finishes and dividends are calculated.
   - *Action:* Send push to Group Members: *"Good news! A dividend of Rs. X has been applied to your upcoming installment for Chit XYZ."*
   
8. **Chit Group Maturity / Completion**
   - *Trigger:* When the final auction/installment concludes and the group status is marked as completed.
   - *Action:* Send push to Group Members: *"Congratulations! Your Chit Group XYZ has successfully completed its term."*
   
9. **New Chit Group Launch (Marketing)**
   - *Trigger:* When a company admin creates a new Chit Group (before commencement).
   - *Action:* Send push to ALL Members in the company: *"A new Chit Group (5 Lakhs - 40 Months) is now open for enrollment! Join today."*

## 5. Implementation Next Steps

Based on your confirmation that the app currently uses a **single-device login policy** (no multi-device access), storing the `fcm_token` directly in the `members` and `staff_users` tables is the **perfect and most efficient approach**. It keeps the database clean and avoids the overhead of managing a separate device tokens table.

The plan is fully locked in! We are ready to begin execution whenever you give the green light.
