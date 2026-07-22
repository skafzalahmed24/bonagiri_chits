# Cross-Tenant IDOR Fix — Round 3 Follow-up (commit `3cc989f`)

**Reviewed commit `3cc989f`, the response to
`docs/CROSS_TENANT_IDOR_BACKEND_REGRESSION.md`.** Good news first: the server boots
again. Verified via `node -c` on every touched file — no syntax errors anywhere. The core
regression (missing function names) is fully fixed, `companyId` is now correctly threaded
from controller to service at all ~38 call sites, and `submitCollectionPaymentService` is
genuinely fixed (identity now comes from `userPayload.id`, not the request body). Three
things remain broken, though — one is a new crash, two are the original vulnerability
still open under a different shape.

---

## Issue 1 (New regression) — `getStateByIdService` now queries a column that doesn't exist; every call will 500

```js
// adminService.js:3227-3231
const getStateByIdService = async (res, id, companyId) => {
  const state = await State.findOne({ where: { id, company_id: companyId }, ... });
```

The `State` model (`models/state.js`) has exactly three columns: `id`, `state_name`,
`country_id` — **no `company_id` column at all**. States are a global geographic
reference table, not tenant-owned data (same category as `Country`, which this same
commit correctly fixed back to a plain `findByPk(id)` with no company filter — see below).
Querying `where: { company_id: companyId }` against a table with no such column will
throw a database error (`column "states"."company_id" does not exist` or equivalent) on
every single call to `/state/get-by-id`.

**This was one of the three specific exceptions flagged in the original regression
report** ("please double check `getCompanyByIdService`, `getCountryByIdService`,
`getStateByIdService` specifically — they may not need the company filter at all").
`getCompanyByIdService` and `getCountryByIdService` were both correctly reverted to
`findByPk(id)` in this commit — `getStateByIdService` was missed.

**Fix:** same treatment as its two siblings:
```js
const getStateByIdService = async (res, id, companyId) => {
  try {
    const state = await State.findOne({ where: { id }, include: [{ model: Country }] });
```

---

## Issue 2 — 9 functions accept `companyId` as a parameter now (no longer crash) but never use it in the query — the underlying IDOR from Finding 3 is still fully open for these

The crash is gone, but the actual vulnerability this fix was supposed to close remains for
9 specific functions — confirmed by reading each one directly, not inferring from the
diff:

```js
// adminService.js:2296 — representative example, identical shape at the other 8
const getGroupUnderStaticListByIdService = async (res, id, companyId) => {
  try {
    const record = await GroupUnderStaticList.findOne({ where: { id, is_deleted_status: 0 } }); // companyId never referenced
```

Same shape (parameter accepted, never used in the `where`) confirmed at:
`getGroupUnderStaticListByIdService`, `getAccountCreationDetailByIdService`,
`getSelfChitByIdService`, `getConfigureBusinessAgentCommissionByIdService`,
`getHistoryBusinessAgentByIdService`, `getContactUsByIdService`,
`deleteContactUsService`, `getFAQByIdService`, `deleteFAQService`.

Any authenticated user can still read or soft-delete another company's group-under-
static-list entries, account creation ledger details, self-chit records, business-agent
commission configs/history, contact-us entries, and FAQ entries by id — unchanged from
before this round of fixes, just without the crash that made it obvious something was
wrong.

**Fix:** add `company_id: companyId` (or the appropriate ownership condition — some of
these may need to go through an association rather than a direct column, e.g. if
`ContactUs`/`FAQ` are scoped via a different relationship) to each of these 9 `where`
clauses, matching the pattern already correctly applied to the other ~20+ functions in
this same commit.

---

## Issue 3 — `getMemberDuesService`'s new ownership check can never fire, for two independent reasons

The fix itself is well-designed in isolation — a real relationship check via
`GroupUnderStaticList` → `ChitsGroup` → `Enrollment` confirming the calling collection
agent is actually assigned to a group the target member belongs to:

```js
// userService.js:1539-1560
const getMemberDuesService = async (res, member_id, userPayload) => {
  try {
    if (userPayload && userPayload.role === 'collection_agent') {
      const isAssigned = await GroupUnderStaticList.findOne({
        where: { collection_agent_id: userPayload.id, is_deleted_status: 0 },
        include: [{ model: ChitsGroup, as: 'group', required: true, include: [{
          model: Enrollment, as: 'enrollments', where: { subscriber_id: member_id, delete_status: 0 }, required: true
        }] }]
      });
      if (!isAssigned) return errorResponse(res, 403, 'You are not assigned as a collection agent for this member');
    }
    const member = await Member.findByPk(member_id);
```

This is the right idea, but it can't ever run, for two separate reasons:

**3a. This app never issues a JWT with `role: 'collection_agent'`.** Confirmed by
grepping every place `role` is assigned in the login flow (`adminService.js:55, 64, 72,
153, 156, 160, 202, 205, 209`) — only `'company'`, `'staff'`, and `'member'` are ever set.
Collection agents (and business agents) authenticate as `role: 'member'`, with the agent
type carried as an `introduced_as` flag on the `Member` row, not as a distinct JWT role
(this matches the existing, established pattern used throughout the rest of this
codebase's RBAC). The condition `userPayload.role === 'collection_agent'` is checking for
a value that this app's login flow never produces — the entire ownership check is
unreachable dead code as written.

**Fix:** check `userPayload.role === 'member'` combined with the caller's own
`introduced_as` flag indicating collection-agent status (same pattern used elsewhere for
distinguishing agent types), or — simpler, given this route (`/collection-agent/member-
dues`) is exclusively used by collection agents anyway — just apply the ownership check
unconditionally whenever `userPayload` is present, without gating on a role string that
doesn't exist for this caller type.

**3b. Independent of 3a: the controller was never updated to match the new function signature.**
`userService.js` changed `getMemberDuesService`'s signature from `(res, userPayload)` to
`(res, member_id, userPayload)`, but `userController.js` (not touched by this commit —
confirmed via `git diff --stat`, only `adminController.js`, `fixedSchemeController.js`,
`adminService.js`, `fixedSchemeService.js`, and `userService.js` changed) still calls it
with the old single-argument shape:

```js
// userController.js:200-208 — unchanged, still stale
const getMemberDues = async (req, res) => {
  try {
    const { member_id } = req.body;                              // destructured but never used
    return await userService.getMemberDuesService(res, req.user); // only ONE argument passed
```

With the new signature, this means `member_id` inside the service receives `req.user`
(the entire decoded JWT payload object) instead of an actual member id, and `userPayload`
is `undefined`. `Member.findByPk(member_id)` will be called with an object instead of an
integer id — Sequelize will very likely throw a type-cast error against the integer
primary key, so this endpoint will now 500 on every call, a new and different failure mode
from before (previously it silently used the caller's own id; now it just breaks).

**Fix:**
```js
const getMemberDues = async (req, res) => {
  try {
    const { member_id } = req.body;
    return await userService.getMemberDuesService(res, member_id, req.user);
  } catch (error) { ... }
};
```
This needs to land together with 3a's fix — updating just the controller call site
without also fixing the unreachable role check would leave the endpoint working again but
still with zero ownership protection (any collection agent could look up any member's
dues, back to the original Finding 4 gap from the first regression report).

---

## Confirmed correctly fixed — no further action needed

- All 38 previously-broken controller call sites (`adminService.(res, ...)` / 
  `fixedSchemeService.(res, ...)`) — function names restored, verified via `node -c` on
  every touched file (clean, zero errors).
- `companyId` now correctly threaded as a real parameter through ~30 `adminService.js`
  functions and 2 `fixedSchemeService.js` functions, matching each controller's already-
  resolved `resolveCompanyIdForAuth(req.user)` value.
- `getCompanyByIdService` / `getCountryByIdService` — correctly reverted to unscoped
  `findByPk(id)`, matching the earlier note that these aren't tenant-owned resources.
- `submitCollectionPaymentService` — now genuinely takes `collection_agent_id` from
  `userPayload.id` (the authenticated caller), not the request body. The write-path IDOR
  from the original Phase 18 Finding 4 is closed.

---

## Priority order

1. **Issue 1** (`getStateByIdService`) — one-line fix, but currently a guaranteed 500 on
   every call; quick to close.
2. **Issue 3** (`getMemberDuesService`) — fix both 3a and 3b together, in the same pass;
   fixing only one leaves the endpoint either broken or unprotected.
3. **Issue 2** (9 unscoped get/delete functions) — same mechanical pattern already applied
   correctly to ~20+ sibling functions in this same commit, just needs to be finished for
   the remaining 9.

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | `node -c` on every file in this and the previous fix commit | No syntax errors (already passing) |
| 2 | `POST /state/get-by-id` with any valid state id | Returns the state, no 500 |
| 3 | Call `get-by-id`/`delete` on the 9 listed resources (group-under-static-list, account-creation-detail, self-chit, business-agent-commission/history, contact-us, FAQ) with another company's id | 404/403, not that company's data |
| 4 | `POST /collection-agent/member-dues` as a real collection agent, for a member they're actually assigned to collect from | Returns that member's dues, no 500 |
| 5 | Same call, for a member the calling agent is NOT assigned to | Rejected (403), not returned |
