# Auth & Session Security — Round 3 Follow-up (commit `ed3e478`)

**Reviewed the commit responding to `docs/AUTH_SESSION_SECURITY_ROUND2_FOLLOWUP.md`.
This is a major, mostly-correct pass — the deploy-blocking hash/login mismatch is fixed,
the account-takeover is closed, OTP expiry/attempts are functional, and token revocation
is wired end-to-end. Two regressions remain, both narrow and specific, detailed below.**

Every claim verified directly against the code.

---

## ✅ Blocker 1 (Round 2) — RESOLVED: login now uses `bcrypt.compare`, safe to run the hashing migration

Confirmed directly — `loginCompanyService` (`adminService.js:50-82`) now does
`bcrypt.compare(password, user.company_password)` /
`bcrypt.compare(password, staffUser.password)` /
`bcrypt.compare(password, user.other_info_user_password)` for all three roles, correctly
nulling `user` on mismatch before falling through to the "not found" response.
`changePasswordService` (`:3406-3434`) and `resetPasswordService` (`:254-292`) both hash
with `bcrypt.hash(..., 10)` before storing. **The `hash-existing-passwords` migration is
now safe to run** — no more app-bricking risk.

## ✅ Blocker 2 (Round 2) — RESOLVED: `/reset-password` requires a verified OTP; account-takeover closed

`verifyOtpService` (`:191-252`) now checks `dbAttempts >= 3` and OTP expiry before
comparing, increments attempts on mismatch, clears the OTP on success, and issues a
`reset_token` via `generateResetToken({ user_code, type })`. `resetPasswordService`
requires that token (`adminValidation.js:115-120` — `reset_token: Joi.string().required()`),
verifies it, and — the important part — **derives the actual target user from the decoded
token payload**, not from the request body:
```js
decoded = verifyResetToken(reset_token);
user_code = decoded.user_code;   // overwrites whatever the body sent
type = decoded.type;
```
This closes the original vulnerability correctly — a caller can no longer choose an
arbitrary `user_code` to reset, since the token is bound to whoever actually completed OTP
verification.

## ✅ Issue 3 (Round 2) — RESOLVED: OTP expiry/attempts are functional, not just columns

`forgotPasswordService` now sets `mobile_otp_expires_at` (+15 min) and resets
`mobile_otp_attempts` to 0 when issuing an OTP (staff equivalents too). `verifyOtpService`
actually reads and enforces both. Matches the pattern already correct in
`verifyMemberOtpService`.

## ✅ Issue 4 (Round 2) — RESOLVED: logout now populates the revocation table

`logoutService` (see Issue 1 below for a caveat on this same function) now extracts the
token from `req.headers['authorization']`, decodes its `exp`, and inserts into
`revoked_tokens` with that expiry. `authMiddleware.authenticateToken`'s existing check
against this table (added in Round 2) now has real data to check against.

## ✅ Round-3 IDOR leftover — RESOLVED: all 9 unscoped functions now filter by `company_id`

Confirmed directly for all nine: `getGroupUnderStaticListByIdService`,
`getAccountCreationDetailByIdService`, `getSelfChitByIdService`,
`getConfigureBusinessAgentCommissionByIdService`, `getHistoryBusinessAgentByIdService`,
`getContactUsByIdService`, `deleteContactUsService`, `getFAQByIdService`,
`deleteFAQService` — every one now includes `company_id: companyId` in its `where`
clause. This closes out `CROSS_TENANT_IDOR_BACKEND_ROUND3_FOLLOWUP.md` Issue 2 entirely.

---

## 🔴 New Issue A (regression) — `logoutService` now fails for every company-role user

`logoutService` (`adminService.js:3633-3675`) added `companyId` scoping to fix the
long-standing "companyId is not defined" bug (tracked since Phase 18 Blocker 2):
```js
const { id, role } = userPayload;
const companyId = await resolveCompanyIdForAuth(userPayload);

if (role === 'company') {
  const user = await Company.findOne({ where: { id, company_id: companyId } });
```

`resolveCompanyIdForAuth` returns `userPayload.id` when `role === 'company'`
(`adminService.js:21-23`). Since `id` is destructured from the same `userPayload`, this
becomes `Company.findOne({ where: { id: <uuid>, company_id: <uuid> } })` — but confirmed
directly against the model, **`Company.company_id` is a separate business-facing code
column, distinct from the UUID primary key `id`** (`models/company.js:78` — same field
used as the login identifier, e.g. `company_id: user_code` in `loginCompanyService`).
Comparing that code column against the UUID `id` value can never match.

**Effect: every company-role logout will now hit `Company.findOne` returning null →
`errorResponse(NOT_FOUND, 'Company not found')` → logout fails server-side on every call**,
for the one role that's arguably used the most (every company admin session).

This is the same category of mistake flagged twice already in this engagement —
`getCompanyByIdService`/`getCountryByIdService`/`getStateByIdService` all needed to be
*exempted* from the generic `company_id` scoping pattern because they aren't tenant-owned
rows scoped by a `company_id` foreign key the way `Member`/`Route`/etc. are. `Company`
itself needs the same exemption here.

**Fix:** for the `role === 'company'` branch specifically, don't filter by `company_id` —
the row *is* the company, matched by its own `id`:
```js
if (role === 'company') {
  const user = await Company.findOne({ where: { id } });
```
Leave the `member`/`staff` branches as-is — those correctly use `company_id` as a real
foreign key on rows that belong to a company.

**Note on the frontend impact if this ships unfixed:** the frontend's `logout()`
(`useAuth.js`) already swallows this failure and redirects regardless — so users won't get
stuck, but the server-side session won't actually be cleared (`device_id`, and critically
the token revocation insert never fires, since it happens *after* the failed `Company`
branch's early `return`) — meaning the access token stays valid until natural expiry even
after a company user "logs out."

---

## 🟠 New Issue B (regression, IDOR fix vs. feature conflict) — `getMemberDuesService`'s fix closes the leak but blocks the legitimate collection-agent use case

```js
// userService.js:1539-1550
if (userPayload) {
  if (userPayload.role === 'member' && String(userPayload.id) !== String(member_id)) {
    return errorResponse(res, 403, 'You are not authorized to view this member\'s dues');
  } else if (userPayload.role === 'collection_agent') {
    // the assigned-agent relationship check — correct logic, but unreachable
    ...
  }
}
```

The new `role === 'member'` branch correctly closes the original IDOR (Round 3 Issue 3a) —
a plain member can no longer view another member's dues by supplying their id. But this
route (`POST /collection-agent/member-dues`) exists specifically **for collection agents
to look up a member they collect from** — and per this app's login model (confirmed
earlier in this engagement, still true), **collection agents authenticate with
`role: 'member'`**, not `role: 'collection_agent'` — that role string is never actually
issued by any login path.

So a real collection agent hitting this endpoint for a member who isn't themselves now
falls into the `role === 'member'` branch and gets a blanket 403 — the legitimate feature
this endpoint exists for no longer works. The `role === 'collection_agent'` branch (which
has the *correct* relationship-based check, via `GroupUnderStaticList` →
`ChitsGroup` → `Enrollment`) remains dead code, exactly as flagged in Round 3 — it's just
now unreachable behind an *earlier* rejection instead of silently doing nothing.

**Fix:** the two cases need to be distinguished by something other than a `role` string
that doesn't exist for this caller type. Options:
- Check the caller's `introduced_as` flags (the existing pattern this app uses elsewhere
  to distinguish member/business-agent/collection-agent, all under `role: 'member'`) — if
  the caller is flagged as a collection agent, run the relationship check instead of the
  self-only check.
- Or, simpler given this route is collection-agent-specific by design: only apply the
  self-only restriction when `member_id === userPayload.id` is the *only* valid case for a
  plain member token with no collection-agent flag; otherwise always run the relationship
  check.

```js
// illustrative — exact shape depends on how introduced_as is read elsewhere in this file
const isCollectionAgent = userPayload.introduced_as?.includes(COLLECTION_AGENT_FLAG);
if (String(userPayload.id) === String(member_id)) {
  // always fine — checking your own dues
} else if (isCollectionAgent) {
  // run the existing GroupUnderStaticList relationship check
} else {
  return errorResponse(res, 403, '...');
}
```

---

## Priority order

1. **New Issue A** — one-line fix, but currently breaks logout for every company user in
   production terms (silently, since the frontend masks it) — fix before the next deploy.
2. **New Issue B** — needs a small design decision (how to detect collection-agent status
   from a `role: 'member'` token) but is a real functional regression for an existing
   feature, not just a security gap.

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Log in as company, member, and staff after the hashing migration has run | All three succeed |
| 2 | Full forgot-password → verify-otp → reset-password flow, end to end | Succeeds; new password works, old one doesn't |
| 3 | `POST /reset-password` with a `user_code` in the body that differs from the one the `reset_token` was issued for | Token's own `user_code` wins — the body value has no effect |
| 4 | Guess an OTP wrong 3+ times, or wait past its 15-min expiry | Rejected in both cases |
| 5 | Log out as a **company** user, check the response | Currently fails — should succeed once Issue A is fixed |
| 6 | After logging out (any role), reuse the previous access token | Rejected — confirm the revoked-token check actually fires now that logout inserts a row (will only work for member/staff until Issue A is fixed for company) |
| 7 | Log in as a real collection agent, look up the dues of a member they're actually assigned to (not their own id) | Should succeed — currently 403s until Issue B is fixed |
| 8 | Log in as a plain member, attempt to look up another member's dues | 403 (this part already works correctly) |
