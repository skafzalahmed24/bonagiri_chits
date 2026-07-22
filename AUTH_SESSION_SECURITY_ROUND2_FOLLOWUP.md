# Auth & Session Security — Round 2 Follow-up (commits `92a1605`, `7a395a3`)

**Reviewed the two "auth bug fixes" commits responding to
`docs/AUTH_SESSION_SECURITY_BACKEND_FIXES.md` (Phase 20). Verified every claim directly
against the code.**

**🔴 DO NOT DEPLOY THIS AS-IS. The password-hashing migration will lock every user —
company, staff, and member — out of the entire application, because the login code was
never updated to compare against a hash.** Details below, most-critical first.

Real progress landed too (rate limiting, secret-env enforcement, two Round-3 fixes) — credited at the end — but the core of the auth work is scaffolding that was never wired to the actual login/reset/OTP logic.

---

## 🔴 Blocker 1 (Critical, app-bricking) — hashing migration + plaintext login = total lockout on deploy

Three things are individually true and catastrophic in combination:

**(a)** The migration `20260722100002-hash-existing-passwords.js` — the **last** migration,
so it runs on the next `db:migrate` — bcrypt-hashes every stored password:
```js
const hash = await bcrypt.hash(c.company_password, 10);
await queryInterface.sequelize.query(`UPDATE "companies" SET company_password = '${hash}' WHERE id = '${c.id}'`);
// same for member.other_info_user_password and staff_user.password
```

**(b)** `loginCompanyService` (`adminService.js:50-76`) was **not changed** — it still does a
raw SQL equality of the plaintext input against the password column:
```js
user = await Company.findOne({ where: { company_id: user_code, company_password: password, is_deleted_status: 0 } });
...
const staffUser = await StaffUser.findOne({ where: { user_code, password, is_deleted_status: 0 } });
...
user = await Member.findOne({ where: { other_info_user_code: user_code, other_info_user_password: password, is_deleted_status: 0 } });
```

**(c)** Confirmed via `grep -rn "bcrypt.compare\|bcrypt.hash" src/` (excluding migrations):
**zero results.** The `bcrypt` import added at the top of `adminService.js` is never used
anywhere in the service. No model has a `beforeSave`/`beforeCreate` hashing hook either
(the model diffs only add OTP columns).

**Net effect on deploy:** migration runs → every `company_password` /
`other_info_user_password` / `staff_user.password` becomes a bcrypt hash (`$2b$10$…`) →
login queries `WHERE company_password = '<plaintext>'`, which can never match a hash →
**100% of existing users are locked out, immediately and permanently.** There is no
in-app path back in except the reset-password endpoint, which is itself still broken (see
Blocker 2).

`changePasswordService` breaks identically — it compares
`user.company_password !== old_password` (hash `!==` plaintext → always "incorrect
password"), so no one can change their password either.

**Fix — these must land together, atomically, never one without the other:**
1. `loginCompanyService`: fetch the user by code only, then
   `await bcrypt.compare(inputPassword, user.company_password)` — for all three roles.
2. `changePasswordService`: `bcrypt.compare` for the old password, `bcrypt.hash` for the new.
3. `resetPasswordService` and any create-user path (company/member/staff creation):
   `bcrypt.hash` the password before storing.
4. Only then is the `hash-existing-passwords` migration safe to run. If any of 1–3 is
   missing when the migration runs, the app is bricked.

---

## 🔴 Blocker 2 (Critical) — the reset-password account-takeover (Phase 20 Finding 1) is STILL open

The fix helpers were created but never wired in. `jwtHelper.js` now exports
`generateResetToken` / `verifyResetToken`:
```js
const generateResetToken = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
const verifyResetToken = (reset_token) => jwt.verify(reset_token, JWT_SECRET);
```
But `grep -rn "verifyResetToken\|generateResetToken" src/` finds them **only in
jwtHelper.js itself** — nothing calls them. `resetPasswordService` (`adminService.js:197`)
and `verifyOtpService` (`:176`) are **unchanged** from Phase 20: `resetPasswordService`
still sets a new password given only `user_code` + `type`, with no OTP check of any kind.

So the original finding stands verbatim: anyone with a guessable 6-digit `user_code` can
still reset any company/staff/member password without verifying anything. And note the
interaction with Blocker 1: after the lockout, this unauthenticated endpoint (which writes
the new password as **plaintext**, so login's plaintext compare would then match it) becomes
the *only* way anyone can get into any account — an attacker included.

**Fix:** wire it as intended — `verifyOtpService`, on success, issues `generateResetToken`;
`resetPasswordSchema` requires that `reset_token`; `resetPasswordService` calls
`verifyResetToken` and derives the target user from the token payload, not from a body
`user_code`. (And hashes the new password, per Blocker 1.)

---

## 🟠 Issue 3 (High) — OTP expiry/attempt columns added, but no logic reads or writes them (Finding 4 not functional)

Migration `20260722100000-add-otp-security-columns.js` and the model diffs add
`mobile_otp_expires_at` / `mobile_otp_attempts` (Company, Member) and
`otp_expires_at` / `otp_attempts` (StaffUser). But `forgotPasswordService` (`:148`) and
`verifyOtpService` (`:176`) are **unchanged** — nothing sets an expiry when the OTP is
issued, nothing increments attempts, nothing checks either. The columns exist and are
inert. Finding 4 is not actually implemented, just scaffolded.

**Fix:** `forgotPasswordService` sets `mobile_otp_expires_at = now + N minutes` and resets
attempts; `verifyOtpService` rejects if expired or attempts ≥ limit, incrementing on each
failure — mirroring the pattern already correct in `verifyMemberOtpService`.

---

## 🟠 Issue 4 (High) — token revocation is half-wired: checked on every request, never populated (Finding 5/6)

`authMiddleware.authenticateToken` now checks a revocation table on **every** authenticated
request:
```js
const { RevokedToken } = require('../models');
const isRevoked = await RevokedToken.findOne({ where: { token } });
if (isRevoked) return errorResponse(res, statusCodes.UNAUTHORIZED, 'Token has been revoked or logged out');
```
But `grep -n "RevokedToken" src/services/adminService.js` finds **nothing** —
`logoutService` never inserts into `revoked_tokens`. So:
- Logout still does not actually revoke anything (the table is always empty).
- Every authenticated request now pays an extra DB round-trip to query a table that never
  has a matching row — pure overhead for zero benefit until logout is wired.

Also worth noting: this is an unindexed lookup on the full token string per request; if it
does get populated, it needs an index on `token` and a periodic purge of expired entries.

**Fix:** `logoutService` inserts the current access token (and ideally the refresh token)
into `revoked_tokens` with its expiry; add an index on `token`; purge expired rows on a
schedule. (And `logoutService` still has the `companyId`-undefined bug from the Round-3
regression doc — fix that in the same pass.)

---

## 🟠 Round-3 IDOR leftovers still open (from `CROSS_TENANT_IDOR_BACKEND_ROUND3_FOLLOWUP.md`)

These weren't touched by these two commits (confirmed — the `adminService.js` diff has only
three hunks, none covering them):

- **Issue 2 — 9 functions still accept `companyId` but never use it in the query**, so the
  IDOR remains open for: `getGroupUnderStaticListByIdService`,
  `getAccountCreationDetailByIdService`, `getSelfChitByIdService`,
  `getConfigureBusinessAgentCommissionByIdService`, `getHistoryBusinessAgentByIdService`,
  `getContactUsByIdService`, `deleteContactUsService`, `getFAQByIdService`,
  `deleteFAQService`. Still needs the `company_id: companyId` filter added to each.
- **Issue 3a — `getMemberDuesService`'s ownership check still never fires.** Good news:
  the controller crash (Issue 3b) *is* fixed — `getMemberDues` now correctly calls
  `getMemberDuesService(res, member_id, req.user)`. But the service still gates the check on
  `if (userPayload.role === 'collection_agent')`, and this app never issues that role
  (collection agents log in as `role: 'member'`), so the check is still dead code — any
  member can still read any member's dues. Fix the role condition (or apply the ownership
  check unconditionally for this route).

---

## ✅ What is genuinely fixed — credit where due

- **Rate limiting (Finding 3):** `authRateLimiter` (10 req / 15 min / IP) is correctly
  applied to `/login`, `/user/login`, `/forgot-password`, `/verify-otp`, `/reset-password`,
  and `/change-password`. Properly implemented and wired.
- **Secret env enforcement (Finding 7):** `jwtHelper.js` and `authMiddleware.js` now
  `process.exit(1)` at startup if `JWT_SECRET`/`JWT_REFRESH_SECRET`/`DEFAULT_API_TOKEN` are
  unset, instead of falling back to committed defaults. Good.
- **Round-3 Issue 1 (`getStateByIdService`):** fixed — the bogus `company_id` filter on the
  `State` table (which has no such column) was removed; it's back to `findOne({ where: { id } })`.
- **Round-3 Issue 3b (`getMemberDues` controller crash):** fixed (see above).
- **Removed** the `console.log` of the full decoded token payload on every request. Good.
- All changed files pass `node -c` — no syntax regressions this round.

---

## Priority order

1. **Blocker 1** — do not run the `hash-existing-passwords` migration until login /
   change-password / reset / create-user all use bcrypt. Right now deploying this bricks
   the app. This is the single most important item.
2. **Blocker 2** — wire the reset-token flow so `/reset-password` actually requires OTP
   verification (the account-takeover is still live).
3. **Issue 3, Issue 4** — actually implement the OTP expiry/attempts checks and the
   logout-side token revocation that the new columns/table were added for.
4. **Round-3 leftovers** — the 9 unscoped functions and the dead `getMemberDues` role check.

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | On a DB with the hashing migration applied, log in with a known-good company/staff/member credential | Succeeds (login uses `bcrypt.compare`) |
| 2 | Create a new user, inspect the stored password column | Bcrypt hash, not plaintext |
| 3 | Change password with correct old password | Succeeds; new value stored hashed |
| 4 | `POST /reset-password` without a prior verified OTP / reset token | Rejected |
| 5 | Request an OTP, wait past expiry, try to use it; and guess it wrong past the attempt limit | Rejected in both cases |
| 6 | Log out, then reuse the previous access token on any authenticated endpoint | Rejected (token in `revoked_tokens`) |
| 7 | `>10` login attempts from one IP in 15 min | Rate-limited (429) |
| 8 | Server start with `JWT_SECRET` unset | Process exits, does not boot with a default |
