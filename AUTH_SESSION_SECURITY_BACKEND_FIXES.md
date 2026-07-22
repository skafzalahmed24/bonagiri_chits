# Authentication & Session Security Audit — Backend Fixes

**Phase 20 — reported 2026-07-21. Critical. Account-takeover severity — treat with the
same urgency as the Phase 18 cross-tenant IDOR findings, arguably higher, since this
bypasses the login step itself rather than abusing an authenticated session.**

Every finding below was verified directly against the running code before writing this up.

---

## Finding 1 (Critical) — `POST /reset-password` never checks that an OTP was verified: full unauthenticated account takeover

`backend/bonagiri_chits/src/services/adminService.js:197-223`:

```js
const resetPasswordService = async (res, user_code, type, password) => {
  try {
    let user, role;
    if (type === 1) {
      user = await Company.findOne({ where: { company_id: user_code, is_deleted_status: 0 } });
      role = 'company';
      if (!user) {
        user = await StaffUser.findOne({ where: { user_code, is_deleted_status: 0 } });
        role = 'staff';
      }
    } else {
      user = await Member.findOne({ where: { other_info_user_code: user_code, is_deleted_status: 0 } });
      role = 'member';
    }
    if (!user) return errorResponse(res, statusCodes.NOT_FOUND, 'User not found');
    if (role === 'company') await user.update({ company_password: password, mobile_otp: null });
    else if (role === 'staff') await user.update({ password: password, otp: null });
    else await user.update({ other_info_user_password: password, mobile_otp: null });
    return successResponse(res, statusCodes.OK, 'Password reset successfully');
```

And the Joi schema gating it (`adminValidation.js:115-119`):

```js
const resetPasswordSchema = Joi.object({
  user_code: Joi.string().required(),
  type: Joi.number().integer().valid(1, 2).required(),
  password: Joi.string().required()
});
```

There is no `otp` field anywhere in this schema, and `resetPasswordService` never checks
`mobile_otp`, an "otp_verified" flag, or anything else confirming `verifyOtpService` ran
first. **The `/forgot-password` → `/verify-otp` steps are pure UI convention — the actual
`/reset-password` endpoint doesn't require them to have happened at all.** Anyone who
knows a `user_code` (Company's `company_id`, a Member's `other_info_user_code`, or a
`StaffUser`'s `user_code`) can set that account's password directly.

The only thing in front of this endpoint is `authenticateDefaultToken` — a single static
token shared by the whole client app (necessarily embedded in every client build for
anyone to be able to log in at all), so it adds no attacker-specific friction. Worse,
these `user_code` values are **randomly-generated 6-digit numbers**
(`Math.floor(100000 + Math.random()*900000)` — confirmed in the code that generates
`company_id`/`user_code`/`other_info_user_code`), so the entire keyspace is 900,000
values — well within brute-force range, especially with zero rate limiting (Finding 3).

**Attack:** `POST /api/reset-password {"user_code": "<any 6-digit company_id>", "type": 1, "password": "attacker-chosen"}` using only the static default token → full takeover of that
company's login. Same mechanism works against any member or staff account.

**Fix:** `resetPasswordService` must require and verify a valid, unexpired,
previously-issued OTP (or a short-lived reset token minted by `verifyOtpService` upon
success) before touching the password. Do not accept `user_code`+`type`+`password` alone.

---

## Finding 2 (Critical) — Passwords are stored and compared in plaintext everywhere

No `bcrypt`, `argon2`, or any hashing library exists in `package.json` or anywhere in
`src/`. Login is a raw SQL equality against a plaintext column:

```js
// adminService.js:54 (loginCompanyService)
user = await Company.findOne({ where: { company_id: user_code, company_password: password, is_deleted_status: 0 } });
// adminService.js:58
const staffUser = await StaffUser.findOne({ where: { user_code, password, is_deleted_status: 0 } });
// adminService.js:68
user = await Member.findOne({ where: { other_info_user_code: user_code, other_info_user_password: password, is_deleted_status: 0 } });
```

Password change also compares plaintext directly (`adminService.js:3335`):
```js
if (user.company_password !== old_password) { ... }
```

`Company.company_password`, `Member.other_info_user_password`, and `StaffUser.password` are
all plain `STRING` columns with no hashing hook on save. Any database access (backup leak,
an unrelated SQL exposure, insider access, a misconfigured read replica) exposes every
account's real password in cleartext — and since people reuse passwords, this risk extends
beyond this app. Combined with Finding 1, an attacker doesn't even need this to take over
an account, but it's a severe standalone gap on its own (compliance, password-reuse
exposure, breach-notification obligations).

**Fix:** hash all three password columns with bcrypt (or argon2) on write, compare with
`bcrypt.compare` on login/change-password, and run a one-time migration to force a
password reset for all existing accounts (plaintext values can't be un-leaked, but they
can stop being stored that way going forward).

---

## Finding 3 (High) — No rate limiting or lockout anywhere: login, OTP, and reset are all brute-forceable

Confirmed via `package.json` (no `express-rate-limit`/`express-brute`/similar dependency)
and `app.js`'s middleware stack (`cors()`, `express.json()`, a body sanitizer, and the
audit logger — no throttling middleware at all). No `failed_login_attempts`/`locked_until`
columns exist on any user table. `/login`, `/refresh-token`, `/user/login`,
`/forgot-password`, `/verify-otp`, `/reset-password`, and `/change-password` all go
straight from the static-token/JWT check to the controller with zero attempt-counting in
between.

Given the 6-digit numeric `user_code` keyspace (Finding 1) and zero throttling, an
attacker can script a full brute-force of `/reset-password` end-to-end without ever
needing a valid password.

**Fix:** add rate limiting (e.g. `express-rate-limit`) on `/login`, `/user/login`,
`/forgot-password`, `/verify-otp`, `/reset-password`, and `/change-password` at minimum —
per-IP and per-`user_code` — plus an account-lockout counter after N failed attempts.

---

## Finding 4 (High) — The forgot-password OTP has no expiry and no attempt limit (unlike the member-verification OTP, which does this correctly elsewhere in the same file)

`Company`/`Member` models only have a `mobile_otp` column — no `mobile_otp_expires_at` or
`mobile_otp_attempts` at all. `forgotPasswordService` (`adminService.js:148-174`) sets
`mobile_otp = '123456'` (the already-known, intentional, hardcoded-pending-SMS-integration
value — not being re-flagged here) with no expiry timestamp, and `verifyOtpService`
(`adminService.js:176-195`) checks nothing but an exact match. Once real OTPs are wired
in, this OTP will never expire and has no attempt cap — brute-forceable at 1,000,000
combinations, made worse by Finding 3's lack of rate limiting, and moot anyway per Finding
1 since `resetPasswordService` doesn't even consult this flow's result.

**Proof the team already knows how to do this correctly** — the separate member-identity-
verification OTP (a different feature, `verifyMemberOtpService`, `adminService.js:3812-3819`)
correctly implements both:
```js
if (member.verification_otp_attempts >= 3) {
  return errorResponse(res, statusCodes.BAD_REQUEST, 'Too many failed attempts. Please request a new OTP after 15 minutes.');
}
const now = new Date();
if (now > new Date(member.verification_otp_expires_at)) {
  return errorResponse(res, statusCodes.BAD_REQUEST, 'OTP has expired, please resend');
}
```

**Fix:** add `mobile_otp_expires_at`/`mobile_otp_attempts` columns to whichever
tables need them, and apply the same expiry/attempt-limit pattern already proven correct
in `verifyMemberOtpService` to the forgot-password flow. This is necessary regardless of
Finding 1's fix — once `resetPasswordService` correctly requires OTP verification, that
verification step itself needs to be properly guarded.

---

## Finding 5 (Medium) — Refresh tokens have no rotation-invalidation or revocation store

`jwtHelper.js` issues a 1h access token and a 7d refresh token — both expiries are
reasonable, and neither is affected by the app's time simulator (confirmed:
`getSimulatedNow` is never referenced in the JWT/OTP expiry code path, so this isn't a
repeat of that already-known issue). But:

```js
// adminService.js:225-237 (refreshTokenService)
const decoded = verifyRefreshToken(refresh_token);
// On refresh, we could also verify if device_unique_id still matches the DB
const payload = { ...decoded };
delete payload.iat;
delete payload.exp;
const tokens = generateTokens(payload);   // issues a brand-new 7-day refresh token
```

The old refresh token is never invalidated — there is no server-side denylist or session
table, so a stolen refresh token remains valid up to its original 7-day expiry and can also
mint a fresh 7-day token via this endpoint, repeated indefinitely. The comment on the line
above confirms device-binding was considered and explicitly not implemented.

**Fix:** at minimum, invalidate the old refresh token when a new one is issued (rotation),
and consider binding refresh to `device_unique_id` (the check the code comment already
names) so a token stolen off one device can't be replayed from another.

---

## Finding 6 (Medium) — Logout throws a `ReferenceError` on every call and, even fixed, never revokes the JWT

```js
// adminService.js:3552-3568 (logoutService)
const user = await Company.findOne({ where: { id, company_id: companyId } });   // companyId undefined
```

This is the **same `companyId`-undefined bug already reported in
`docs/CROSS_TENANT_IDOR_BACKEND_REGRESSION.md`** (Blocker 2's list includes
`logoutService`, all 3 role branches) — not a new, separate finding, just confirming it
from the auth-flow angle too: `/api/logout` currently always 500s and never actually
clears `device_id`/`device_unique_id`/`fcm_token`. Fix it alongside the rest of that
regression doc's Blocker 2 list, not as a separate task.

Worth naming as a fact once that bug is fixed, though: this design **only ever clears
device-tracking columns**, never revokes the issued JWT itself. There's no token
blocklist, so a previously-issued access token (up to 1h) and especially a refresh token
(up to 7d, see Finding 5) both continue to work fully after "logout" until natural
expiry. This may be an acceptable stateless-JWT tradeoff, but it should be a documented,
intentional decision, not an unexamined side effect.

---

## Finding 7 (Low) — Hardcoded fallback secrets for JWT signing and the API gate token

```js
// jwtHelper.js:3-4
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key_here';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your_super_secret_refresh_key_here';
// authMiddleware.js:5
const DEFAULT_API_TOKEN = process.env.DEFAULT_API_TOKEN || 'secure-default-rest-api-token';
```

If any deployment (including local/staging, which often reuse "convenient" defaults) ever
runs with these env vars unset, the fallback values are sitting directly in this source
tree — anyone with repo access could forge valid JWTs for any role/company.

**Fix:** fail startup loudly if these env vars are absent in production, rather than
silently falling back to a known string.

---

## Finding 8 (Low) — Hardcoded superadmin credentials in source

```js
// adminService.js:40-47 (loginAdminService)
const loginAdminService = async (res, email, password) => {
  if (email === 'superadmin@gmail.com' && password === 'superadmin@123') {
    const user = { email: 'superadmin@gmail.com', role: 'superadmin', company_id: null };
```

A privileged role with hardcoded, unrotatable-without-a-deploy credentials committed
directly in source, with no rate limiting (Finding 3) protecting it either.

**Fix:** move to an environment-configured credential at minimum, or a real superadmin
account with a hashed password in the database.

---

## Confirmed correct — no action needed

- **`authenticateToken`** middleware genuinely verifies the JWT signature (`jwt.verify`,
  not decode-without-verify), checks expiry, and only attaches the verified payload to
  `req.user`. No bypass found. (Minor cleanup note, not a security bug: it
  `console.log`s the full decoded token payload on every request — worth removing so
  tokens don't accumulate in server logs.)
- **`changePasswordService`** (self-service) correctly requires and checks `old_password`
  before allowing a change — inherits the plaintext-comparison issue (Finding 2) but has
  no IDOR of its own.
- **`staffChangePasswordService`** correctly scopes to `userToken.role === 'company'` and
  the target staff's own `company_id` — no cross-tenant gap here.
- **Member verification OTP** (a different feature from forgot-password) correctly
  implements both expiry and a 3-attempt/15-minute lockout — see Finding 4, this is the
  reference implementation the forgot-password flow should copy.
- JWT expiry values (1h/7d) are reasonable, and unaffected by the time simulator.

---

## Priority order

1. **Finding 1** — stop `/reset-password` from working without a verified OTP. This alone
   defeats the entire account-recovery security model; fix before anything else in this
   doc.
2. **Finding 2** — hash all password columns, force a reset for existing accounts.
3. **Finding 3 + Finding 4 together** — rate limiting and OTP expiry/attempts share the
   same root cause (nothing throttles repeated guesses); fix as one pass.
4. **Finding 5, 6** — refresh-token rotation and the (already-tracked) logout bug.
5. **Finding 7, 8** — hardening, lower urgency but cheap to close.

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | `POST /reset-password` with a valid `user_code` but no prior `/verify-otp` call | Rejected |
| 2 | `POST /reset-password` after a real, unexpired, correctly-verified OTP | Succeeds |
| 3 | Inspect the `company_password`/`other_info_user_password`/`password` columns directly in the DB after a fresh signup/reset | Hashed, not plaintext |
| 4 | Submit 10+ rapid failed logins for the same `user_code` | Throttled/locked, not silently allowed to continue |
| 5 | Request an OTP, wait past its new expiry window, then try to use it | Rejected as expired |
| 6 | Guess the OTP incorrectly 3+ times | Locked out, matching the existing member-verification OTP's behavior |
| 7 | Use a refresh token to mint a new one, then try the OLD refresh token again | Old one rejected |
| 8 | Call `/api/logout`, then use the still-unexpired access token afterward | Document actual behavior either way — revoked or explicitly accepted as a stateless-JWT tradeoff, not an accident |
