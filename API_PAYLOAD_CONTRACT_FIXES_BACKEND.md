# API Payload Contract Fixes — Backend

**For the backend team.** Companion to `docs/API_PAYLOAD_CONTRACT_FIXES_FRONTEND.md` — a
full sweep of frontend API calls against the actual backend validation schemas turned up
three backend-side bugs that Antigravity can't fix themselves (missing schema exports, a
duplicate object key silently overriding a schema, and a genuine cross-tenant data leak).
Leading with the most severe.

---

## 1. Priority — Collections Verification list has no company scoping at all

`getAllCollectionSubmissions` (`adminController.js:1223`) and
`getAllCollectionSubmissionsService` (`adminService.js:3522`) — the endpoint behind
Masters > Transactions > Agent Collections Verification (`T_COLLECTION_VERIFY`) — never
derive or filter by company at all:

```js
const getAllCollectionSubmissions = async (req, res) => {
  const { collection_agent_id, type, min, max } = req.body;
  return await adminService.getAllCollectionSubmissionsService(res, collection_agent_id, type, min, max);
  // req.user is never consulted for scoping
};
```

```js
const getAllCollectionSubmissionsService = async (res, collection_agent_id, type, min, max) => {
  const whereClause = {};
  if (collection_agent_id) whereClause.collection_agent_id = collection_agent_id;
  // ...status filtering by type...
  // no company_id anywhere in the where clause
```

This hasn't been reachable in practice — the frontend currently sends `company_id` in the
body, which the schema doesn't declare, so every request 400s before reaching this code
(that's a separate, already-flagged frontend bug). But once that payload bug is fixed on
the frontend side (trivial — just stop sending the unrecognized key), this endpoint starts
succeeding, and it will return **every company's** collection submissions to **any**
company admin or permitted staff member. This is a cross-tenant data leak, not a
theoretical one — it's the fourth instance of this same missing-scoping pattern found in
this engagement (auction `recordWinnerService`, `audit-logs/get-all`, `dashboard/summary`,
now this).

**Fix:** derive the caller's company from `req.user` (role-based: company → `req.user.id`,
staff → `req.user.company_id`) in the controller, and add it to the service's `where`
clause. Since `CollectionAgentAmount` doesn't have a direct `company_id` column, scope via
the `collection_agent` (Member) association's `company_id`, same join pattern already used
in the dashboard leaderboard fix (`1092c98`):

```js
const getAllCollectionSubmissionsService = async (res, collection_agent_id, type, min, max, companyId) => {
  const whereClause = {};
  if (collection_agent_id) whereClause.collection_agent_id = collection_agent_id;
  // ...type filtering...
  const submissionsData = await CollectionAgentAmount.findAndCountAll({
    where: whereClause,
    include: [
      { model: Member, as: 'member' },
      { model: Member, as: 'collection_agent', where: { company_id: companyId }, required: true },
    ],
    ...
  });
```

Please coordinate with Antigravity on landing order — their payload fix (dropping the
unrecognized `company_id` key) and this scoping fix should ship together, not the frontend
fix alone first, or the page will "work" while leaking cross-company data for however long
the gap lasts.

---

## 2. `changePasswordSchema` is defined twice — the dead one is the one everyone assumes is real

`adminValidation.js` defines `changePasswordSchema` three times:
- Line 364: a `const changePasswordSchema = Joi.object({ old_password, new_password })`
- Line 471: included in `module.exports` via shorthand (`changePasswordSchema,`) — at this
  point it's the line-364 version
- Line 1008: **the same `module.exports` object literal** later re-declares
  `changePasswordSchema: Joi.object({ member_id: uuid required, new_password required })`

JavaScript object literals keep the last occurrence of a duplicate key — so the version
actually exported and enforced at runtime is the line-1008 one (`{member_id, new_password}`,
no `old_password` field at all), not the line-364 one. The line-364 `const` is dead code
that nobody hitting `/change-password` will ever actually validate against, even though
it's the version that reads like the "real" self-service change-password contract (old
password + new password).

The frontend's member-portal change-password screen was written against the line-364
shape (`old_password`/`new_password`) — currently 400s. The company-admin's staff
change-password flow (`useStaff.js`, via `/staff/change-password` — a different route
that happens to reuse this same schema name) was written against the actual line-1008
shape and works correctly.

**This needs a decision, not just a cleanup:**
- If `/change-password` is meant to be an **admin/staff-driven reset** (specify which
  `member_id`, no old-password check — consistent with how `/staff/change-password`
  already uses it): delete the dead line-364 `const` and the unused old-password Joi
  messages, and tell Antigravity the member-portal screen needs to be redesigned (or point
  it at the staff-style contract) since self-service password change without re-auth is a
  meaningful product/security choice worth being explicit about, not an accident of dead
  code.
- If self-service member password change is supposed to actually verify the member's
  current password: that's new logic entirely — a real `{old_password, new_password}`
  handler doesn't currently exist anywhere and would need to be built, probably as its own
  endpoint under `userRoutes.js` rather than reusing this admin-facing one.

Either way, resolve which one is correct and let Antigravity know — they're blocked on
`src/app/member/profile/change-password/page.jsx` until this is decided.

---

## 3. `registerTokenSchema` / `sendManualNotificationSchema` don't exist

`adminRoutes.js:224-225`:
```js
router.post('/notifications/register-token', ..., validate(adminValidation.registerTokenSchema), ...);
router.post('/notifications/send-manual', ..., validate(adminValidation.sendManualNotificationSchema), ...);
```

Neither `registerTokenSchema` nor `sendManualNotificationSchema` is defined or exported
anywhere in `adminValidation.js`. `validate(undefined)` calls `schema.validate(...)` on
`undefined`, which throws (`TypeError: Cannot read properties of undefined`) — both routes
currently 500 on every call, independent of anything the frontend sends. (The frontend
also has the path wrong — `admin/notifications/...` vs the registered `/notifications/...`
— tracked separately for Antigravity to fix once this schema fix lands, so they don't fix
the path and immediately hit a 500 instead of a 404.)

**Fix:** add both schemas to `adminValidation.js`. Based on what the controllers actually
read from `req.body` (`fcm_token` for register-token;
`target_type, target_id, title, body, data_payload` for send-manual, per `adminService.js`):

```js
registerTokenSchema: Joi.object({
  fcm_token: Joi.string().required(),
}),
sendManualNotificationSchema: Joi.object({
  target_type: Joi.string().valid('ALL', 'GROUP', 'SPECIFIC_MEMBER').required(),
  target_id: Joi.string().allow(null).optional(),
  title: Joi.string().required(),
  body: Joi.string().required(),
  data_payload: Joi.object().optional(),
}),
```

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| 1 | Company A admin loads Collections Verification | Only Company A's submissions, never Company B's |
| 2 | Decide + communicate the change-password contract | Antigravity unblocked on the member change-password screen |
| 3 | Admin registers an FCM token / sends a manual notification | 200, not 500 |
