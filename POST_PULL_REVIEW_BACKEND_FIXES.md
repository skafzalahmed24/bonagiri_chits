# Post-Pull Review — Backend Fixes Required

**For the backend team.** Reviewed the latest pull (`444d750` → `ef03efb` / `6489b20` /
`0688a11` / `ddc165b`, the commits claiming Payment History, Dashboard, and FCM are done).
Most of this is genuinely solid — see the "Confirmed working" section at the bottom — but
one item is a hard blocker and three are unresolved asks from earlier docs. Fix #1 before
anything else ships.

---

## 1. BLOCKER — `adminRoutes.js` cannot be parsed, backend will not boot

`backend/bonagiri_chits/src/routes/adminRoutes.js` declares `MODULES` twice in the same
scope:

```js
const { MODULES } = require('../utils/modules');   // line 6
...
const authMiddleware = require('../middlewares/authMiddleware');
const uploadMiddleware = require('../middlewares/uploadMiddleware');
const adminValidation = require('../validations/adminValidation');
const MODULES = require('../utils/modules');        // line 10
```

This is a fatal `SyntaxError`, not a logic bug — confirmed directly:

```
$ node -c src/routes/adminRoutes.js
SyntaxError: Identifier 'MODULES' has already been declared
```

`require('./routes/adminRoutes')` will throw the moment the server tries to load this
file, taking down the entire admin API (login included) with it. This looks like it
happened when the FCM notification routes were added — someone added the destructured
import at line 6 without noticing the existing plain import at line 10 (note: line 6's
form is also wrong on its own — `utils/modules.js` exports the flat object directly, not
a `{ MODULES }`-keyed export, so destructuring it would yield `undefined` even without the
duplicate-declaration crash).

**Fix:** delete line 6 entirely; keep line 10 (`const MODULES = require('../utils/modules');`),
which is what every `MODULES.X` reference in the rest of the file already assumes.

---

## 2. `receipt_number` still not generated — third time asking

`updateCollectionSubmissionStatusService` (`src/services/adminService.js:2968`) is
byte-for-byte unchanged from the version flagged in
`docs/PAYMENT_HISTORY_RECEIPTS_BACKEND_FIXES.md` and reiterated in
`docs/PAYMENT_HISTORY_RECEIPTS_BACKEND_FOLLOWUP_2.md`. Grepping the whole backend for
`receipt_number` still only turns up read-only usages (`getPaymentHistoryService`,
`getPaymentReceiptService`) and the schema/migration — there is no write path anywhere.

The ask hasn't changed: generate the receipt number inside the `status === 2` branch of
`updateCollectionSubmissionStatusService`, per-row (not the current bulk
`CustomerPayment.update`), scoped by company + year, matching the format already approved
in the follow-up doc (`RCT-{YEAR}-{6-digit sequence}`). Generating it here (verification
time) rather than at initial `CustomerPayment.create()` avoids burning sequence gaps on
rejected submissions.

The frontend Payment History screens are already built and live — they render `—` in
place of a receipt number today because there's nothing to show. This is the one thing
standing between "feature built" and "feature usable."

---

## 3. Admin-direct-payment endpoint — still unlocated

Still asking for the same thing as `PAYMENT_HISTORY_RECEIPTS_BACKEND_FOLLOWUP_2.md` §3:
either point to the exact file/function for "where admins record direct payments," or
confirm explicitly that it doesn't exist yet and needs to be built as new work. Right now
`updateCollectionSubmissionStatusService` (the collection-agent path) is the only
confirmed way a payment becomes verified in this codebase.

---

## 4. New: `MODULES.NOTIFICATIONS` id doesn't match the frontend's module id

`src/utils/modules.js:14`:

```js
NOTIFICATIONS: 'a9e4e6b1-9f93-4a0f-b1e7-9a8c7b6d5e4f', // Added for FCM
```

Every other entry in this file is a plain string that matches its own key (`M_MEMBERS:
'M_MEMBERS'`, `T_AUCTIONS: 'T_AUCTIONS'`, etc.) — that convention exists specifically
because these ids have to match the frontend's module registry byte-for-byte, or staff
permission grants silently never take effect (this is the same class of bug fixed in
Phase 7 for 7 other modules). The frontend's `src/features/company-admin/constants/modules.js:219`
registers this module as `id: 'M_NOTIFICATIONS'` — a plain string, following the same
convention as everything else on the frontend side.

Right now, a company admin granting a staff member the "Push Notifications" permission via
Security > Users saves it under `M_NOTIFICATIONS`. `requirePermission(MODULES.NOTIFICATIONS)`
on `/admin/notifications/send-manual` checks for the UUID. These never match — staff can
never be granted this permission, regardless of what's toggled in the UI.

**Fix:** change line 14 to `NOTIFICATIONS: 'M_NOTIFICATIONS'`, matching the frontend.

---

## Confirmed working — no action needed

To be clear about what's *not* broken, so this isn't re-litigated:

- `fcmService.js` — env-var Firebase init, stale-token cleanup on both single and
  multicast sends, correct 500-token multicast chunking, fire-and-forget sends. Well built.
- `notification_histories` migration + model — correct `STRING` typing for the polymorphic
  `user_id` (Member INTEGER vs StaffUser UUID), correct indexes.
- `fcm_token` columns added to both `member` and `staff_user` via migration.
- All six FCM trigger call-sites wired correctly (new group, group commenced, group
  completed, enrollment, auction won, auction concluded).
- `send-manual` and `register-token` routes exist and are gated correctly (once #4 above
  is fixed).
- `logoutService` staff branch — fixed, staff logout no longer 400s.
- Member-side `notifications/history` and `notifications/mark-read` endpoints — not
  originally scoped, but a good addition; response shape is `{ count, rows }` (flagged to
  Antigravity separately, since the frontend currently reads `.items`).
- Dashboard summary endpoint (`getDashboardSummaryService`) — fully functional, response
  shape matches the frontend exactly.

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| 1 | `node -c src/routes/adminRoutes.js` | No syntax error |
| 2 | Server boots and `/api/admin/login` responds | No crash on startup |
| 3 | Collection agent submission gets verified (`status: 2`) | `CustomerPayment.receipt_number` populated, format `RCT-{YEAR}-{6-digit}` |
| 4 | Same submission gets rejected instead (`status: 3`) | No receipt number consumed — next verified submission continues the sequence with no gap |
| 5 | Grant a staff user the "Push Notifications" module permission, log in as that staff user, call `/admin/notifications/send-manual` | 200, not 403 |
