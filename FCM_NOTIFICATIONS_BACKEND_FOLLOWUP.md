# FCM Push Notifications — Backend Follow-Up

**For the backend team.** Reviewed `fcm_implementation_plan.md` against the actual
codebase. The trigger list and overall scope are good — the suggested additional
triggers (overdue warnings, dividend notice, maturity, new-group marketing) are genuinely
useful additions, and proactively scoping `send-manual` to the caller's own `company_id`
is the right instinct. Six things need to change before this is ready to build against.

---

## 1. `notification_histories.user_id` can't be a single typed column — `Member.id` and `StaffUser.id` are different types

Checked both models directly:

- `Member.id` — no explicit `id` field in `Member.init()` (`models/member.js`), so
  Sequelize defaults it to an **auto-increment INTEGER**.
- `StaffUser.id` (`models/staffUser.js:3-6`) — explicitly declared **UUID**.

A single `user_id` column meant to hold either can't be natively typed as one or the
other without breaking for half the rows. Options:

- **(a)** Type `user_id` as `STRING`/`VARCHAR` and cast both id types to string on
  write/read. Works, but no FK constraint, no native join efficiency — acceptable for a
  notification-history table specifically (it's read by `user_id + user_type` as a
  compound lookup anyway, not joined heavily), just don't do this anywhere it matters more.
- **(b)** Two nullable FK columns instead of one polymorphic column —
  `member_id INTEGER NULL REFERENCES member(id)`, `staff_user_id UUID NULL REFERENCES
  staff_user(id)`, exactly one populated per row. Cleaner referential integrity, slightly
  more schema surface.

Recommend (a) for this specific table given it's a simple history/read-list use case, but
it's your call — just don't leave `user_id` untyped or guess a single UUID/INTEGER column
that'll silently break for one of the two user types.

## 2. Table name correction

The table is `staff_user` (singular) — confirmed in both the model
(`tableName: 'staff_user'`) and the migration
(`20260718155036-create-staff-user-table.js`). The plan says `staff_users` throughout —
fix before writing the actual migration for the `fcm_token` column, or it'll target a
table that doesn't exist.

## 3. Don't commit the Firebase service account key into `src/`

"Place the Firebase JSON key in a secure folder (e.g., `src/config/firebaseServiceAccount.json`)"
— checked `.gitignore`: it excludes `.env*` files but has no exclusion for JSON files
under `src/`, so this file is one broad `git add` away from landing in the repo with live
credentials.

This codebase already has an established secrets pattern — `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `DEFAULT_API_TOKEN` are all read via `process.env.X`
(`jwtHelper.js`, `authMiddleware.js`). Follow the same convention instead of a checked-in
file:

```js
// src/services/fcmService.js
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FCM_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL,
    privateKey: process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, '\n'), // env vars can't hold literal newlines
  }),
});
```

(The `\\n` → `\n` replace is the standard workaround for private keys stored in a single
env var line — flagging so it's not a surprise when the raw key doesn't parse.)

## 4. Handle stale tokens and non-blocking sends explicitly

Two behaviors the plan doesn't specify, both of which matter in production:

- **Stale token cleanup.** `firebase-admin` returns
  `messaging/registration-token-not-registered` for a token whose app was uninstalled or
  that rotated. Without catching this and clearing the stored `fcm_token`, the DB
  accumulates dead tokens and every future send to that user silently no-ops forever.
  Wrap every send in a catch that nulls the token on this specific error code.
- **Never let a notification failure block the business operation it's attached to.**
  None of the 5 triggers say whether the send is awaited inline. It must not be — if
  Firebase is slow or down, `recordWinnerService`, payment confirmation, or enrollment
  should never fail or hang because a push notification couldn't be delivered.
  Fire-and-forget (`fcmService.sendPushToMember(...).catch(err => console.error(...))`,
  not `await`ed as part of the main transaction) or a queued/best-effort job — either is
  fine, just make the choice explicit in the plan rather than leaving it to however each
  trigger happens to get wired.
- **Clear `fcm_token` on logout**, given this is a shared/family-device-prone user base —
  don't push-notify a device after the user has explicitly logged out of it.

## 5. Batch "send to all group members" — don't loop individual sends

Triggers #2 (auction winner → rest of group) and #4 (group commencement → all members)
both fan out to potentially 30-50 recipients. `firebase-admin` has
`sendEachForMulticast()` for exactly this (up to 500 tokens per call) — use it instead of
looping individual `send()` calls inside the request handler, which would make "Start
Group" or "Record Winner" noticeably slower and more failure-prone as group size grows.

## 6. Smaller corrections

- Trigger #2 says "inside `recordWinner`" — that's the **controller** function
  (`adminController.js:1167`). The actual logic lives in `recordWinnerService`
  (`adminService.js:1454`) — hook it there.
- The reminder cron job (#5) proposes a new `src/jobs/reminderJob.js`. This codebase
  already has `src/utils/cronJobs.js` with an established `node-cron` pattern
  (`startDailyPenaltyCron`, etc.) — add the reminder job there, following the same
  registration pattern, rather than starting a second, parallel job-running convention.
- `POST /api/admin/notifications/send-manual` should go through the same
  `authMiddleware.requirePermission(MODULES.X)` pattern every other admin mutation now
  uses (post-RBAC-v1) rather than shipping as one more ungated admin endpoint. Pick
  whichever existing module id fits best (likely a new one, since notifications don't map
  cleanly to an existing Masters/Transactions/Utilities entry — or company-only if you'd
  rather not add a new module id for v1).
- Trigger #3 (payment received) hedges between `userService.js`'s
  `CustomerPayment.create` call and "or Admin side" — this ties into a still-open
  question from the Payment History work (`docs/PAYMENT_HISTORY_RECEIPTS_BACKEND_SPEC.md`):
  it's not fully confirmed where the admin-direct payment path lives as a distinct
  function today. Worth resolving that as part of this pass rather than shipping a
  notification hook that only fires for one of the two payment-recording paths.

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| 1 | Notification history for a Member and a StaffUser both exist | Both readable correctly, no type coercion error |
| 3 | `git status` after adding the FCM service | No credential file shows up as untracked/added |
| 4 | Send to a token that's since been invalidated | `fcm_token` cleared on that user's record, no repeated failed attempts on subsequent sends |
| 4 | Firebase temporarily unreachable during `recordWinnerService` | Auction winner still recorded successfully; notification failure logged, not thrown |
| 5 | Start a 40-member group | Single batched call, not 40 sequential sends |
| 6 | `send-manual` called by a staff token with no relevant permission | Rejected, not silently allowed through |
