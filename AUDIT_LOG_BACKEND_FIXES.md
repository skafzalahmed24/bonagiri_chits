# Audit Log — Backend Security Fixes Required

**For the backend team.** Reviewed `f533761` ("audit logger added"). Good news first: this
same commit also fixed the `adminRoutes.js` boot blocker from the last round — confirmed
directly, `node -c` passes and `MODULES.M_MEMBERS` / `MODULES.NOTIFICATIONS` both resolve
correctly at runtime now. That's fully resolved, no further action needed there.

The audit log feature itself is a good idea, reasonably built mechanically (non-blocking
via `res.on('finish')`, sensible action-type inference, doesn't log noisy READ actions),
but has **three compounding security bugs** that combine into: any authenticated user in
the system can currently read plaintext member passwords for any company. This needs to
be fixed before Antigravity builds a UI on top of it — a UI would actively surface this to
end users, not just leave it reachable via direct API calls.

---

## 1. `/audit-logs/get-all` has no permission gate at all

`src/routes/adminRoutes.js:76`:

```js
router.post('/audit-logs/get-all', authMiddleware.authenticateToken, adminController.getAllAuditLogs);
```

Every other sensitive route in this file is wrapped with
`authMiddleware.requirePermission(MODULES.X)`. This one only checks that *some* valid
token exists — a plain member, or a staff user with zero permissions granted, can call it
successfully. `modules.js` doesn't even have an audit-log module id yet to gate it with.

**Fix:** add `AUDIT_LOG` to `src/utils/modules.js` (matching the frontend's existing
`C_AUDIT_LOG` id in `src/features/company-admin/constants/modules.js` — same
byte-for-byte-match requirement as every other module id in this codebase), and gate the
route with `authMiddleware.requirePermission(MODULES.AUDIT_LOG)`.

---

## 2. Company scoping trusts the request body, not the authenticated user

`src/controllers/adminController.js`, `getAllAuditLogs`:

```js
const companyId = await adminService.getCompanyIdFromUser(req.user, req.body);
return await adminService.getAllAuditLogsService(res, user_id, action_type, min, max, search, companyId);
```

`getCompanyIdFromUser` is defined to prioritize `reqBody.company_id` over the
authenticated user's actual role/company:

```js
const getCompanyIdFromUser = async (userPayload, reqBody = {}) => {
  if (reqBody && reqBody.company_id) {
    return reqBody.company_id;
  }
  ...
```

That's the correct behavior for *data-association* calls (e.g. "which company should this
new record belong to"), but wrong here — this call is deciding *whose audit trail the
caller is allowed to see*, which is an authorization decision, not a data-association one.
Any authenticated user can pass `{ company_id: '<any other company's uuid>' }` in the
request body and read that company's entire audit trail — full cross-tenant IDOR, on top
of issue #1's missing permission check.

**Fix:** for this endpoint specifically, always derive `company_id` from `req.user`
directly (role-based: company → own id, staff → `req.user.company_id`, member → look up
via `Member.findByPk`) — never from `req.body`. Don't reuse `getCompanyIdFromUser` here at
all, or add a strict mode to it that refuses to trust the body for authorization contexts.

---

## 3. Member passwords are written to the audit log in plaintext

`src/middlewares/auditMiddleware.js` scrubs four field names before storing
`request_payload`:

```js
delete safeBody.password;
delete safeBody.company_password;
delete safeBody.old_password;
delete safeBody.new_password;
```

But `member/store-or-update` accepts the field as `other_info_user_password`
(`src/validations/adminValidation.js:196`), which isn't in that list. Every time a member's
password is set or changed via that endpoint, the **raw plaintext password** gets written
directly into `audit_logs.request_payload`.

Combined with #1 and #2, this means literally any authenticated session in the system —
any member, any low-privilege staff user, or anyone who can obtain another company's
`company_id` — could currently read plaintext member passwords by paging through
`/audit-logs/get-all`. This is the most severe of the three; treat it as the priority fix
even ahead of the other two, since #1/#2 only need to be closed once but every existing row
already containing a plaintext password needs to be dealt with too.

**Fix:**
- Add `other_info_user_password` to the scrub list in `auditMiddleware.js`.
- Grep for any other `*_password` field names across `adminValidation.js`/`userValidation.js`
  that aren't already covered (the four current entries were clearly enumerated by hand,
  not derived from the schema — worth switching to a pattern match, e.g. scrub any key
  whose name contains `password`, so a future new password field doesn't silently repeat
  this).
- **Data already at rest:** any `audit_logs` rows written since this commit shipped
  (`f533761`, 2026-07-19) may already contain plaintext passwords in `request_payload`.
  Before this goes further, either purge/redact those specific rows or clear the table
  (it's brand new, no historical value would be lost) and re-deploy with the fix in place.

---

## Also worth doing (not blocking)

- **No indexes on `audit_logs`.** The migration creates no indexes at all beyond the PK.
  Given the typical query is `where: { company_id }, order: [['createdAt', 'DESC']]`, add a
  composite index on `(company_id, createdAt)` before this table accumulates real volume —
  it logs every successful mutation across the whole app.
- **No date-range filtering.** `min`/`max` are pagination offset/limit, not a date range —
  there's no way to query "show me last Tuesday's activity" without paging through
  everything. Worth adding `date_from`/`date_to` params before this is genuinely useful as
  an audit tool.
- **`old_values`/`new_values` are defined on the model but never populated** — the
  middleware only ever writes `request_payload` (what was submitted), not a before/after
  diff. Fine for v1 scope, but don't market this as showing "what changed" until those are
  wired up.

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| 1 | Call `audit-logs/get-all` as a plain member (no staff/admin role) | Rejected — no permission |
| 2 | Call `audit-logs/get-all` as company A's admin, with `{ company_id: '<company B's uuid>' }` in the body | Still returns only company A's logs — body value ignored for scoping |
| 3 | Update a member's password via `member/store-or-update`, then inspect the resulting `audit_logs` row | `request_payload.other_info_user_password` is absent or redacted, not the plaintext value |
| 4 | Grant a staff user the new audit-log permission, log in as them, call the endpoint scoped to their own company | 200, correct company-scoped data |
