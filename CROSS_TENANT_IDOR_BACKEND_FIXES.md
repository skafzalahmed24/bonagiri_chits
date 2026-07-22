# Cross-Tenant / Cross-User Authorization Audit (IDOR) — Backend Fixes

**Phase 18 — reported 2026-07-21. Critical. This is the highest-priority item in the
entire engagement so far — read this before picking up anything else.**

## Why this is different from the previous IDOR fixes

Four instances of "trusts `req.body.company_id` for authorization" have already been found
and fixed one at a time across this engagement (auction `recordWinnerService`, Phase 12
audit-logs, Phase 13 dashboard — still open, Phase 15/16 collections). Each time, the fix
doc asked for a structural fix instead of another point patch. That never happened, so this
pass did a full sweep of every endpoint instead of waiting for the next one to surface
reactively. Result: **this is not 4 isolated bugs, it is one root-cause helper function used
at ~41 call sites, plus a second, independent bug class (zero scoping at all) at ~30 more
call sites, plus a third variant at the individual-member level, plus one completely
unauthenticated endpoint.** All four are described below, worst first.

Every finding below was verified directly against the current code (not just inferred) —
file, line, and the actual code are quoted.

---

## Finding 1 (Critical) — `POST /all-chits-groups` has no authentication at all

`backend/bonagiri_chits/src/routes/userRoutes.js:11-12`:

```js
router.post('/home', authMiddleware.authenticateToken, validate(userValidation.getHomeRecordSchema), userController.getHomeRecord);
router.post('/all-chits-groups',  validate(userValidation.getAllHomeRecordsSchema), userController.getAllHomeRecords);
```

Note the missing `authMiddleware.authenticateToken` on line 12 — every other route in this
file has it (including the line directly above it). The handler:

```js
// userController.js:17-25
const getAllHomeRecords = async (req, res) => {
  const { subscriber_id, type, min, max } = req.body;
  return await userService.getAllHomeRecordsService(res, subscriber_id, type, min, max);
```

`getAllHomeRecordsSchema` only requires `subscriber_id: Joi.string().required()` — no token,
no ownership check.

**Concrete exploit:** an anonymous, unauthenticated caller sends
`POST /all-chits-groups {"subscriber_id": "<any-member-uuid>"}` and receives that member's
chit-group enrollment and payment data. No login step required at all.

**Fix:** add `authMiddleware.authenticateToken` to this route, and once authenticated, stop
trusting the body's `subscriber_id` blindly — see Finding 3 below, this route has the exact
same "body id instead of `req.user.id`" problem as several `userService.js` functions once
auth is added back.

---

## Finding 2 (Critical) — root-cause helper `getCompanyIdFromUser` trusts the request body, used at ~41 call sites

`backend/bonagiri_chits/src/services/adminService.js:10-34`:

```js
const getCompanyIdFromUser = async (userPayload, reqBody = {}) => {
  if (reqBody && reqBody.company_id) {
    return reqBody.company_id;              // <-- caller-controlled, checked FIRST
  }
  if (!userPayload) return null;

  if (userPayload.role === 'company') {
    return userPayload.id;
  }
  if (userPayload.role === 'staff') {
    return userPayload.company_id;
  }
  if (userPayload.role === 'member') {
    const mem = await Member.findByPk(userPayload.id);
    return mem ? mem.company_id : null;
  }
  ...
};
```

The body value is checked and returned **before** the JWT role is ever consulted. This is
not a narrow theoretical gap — `adminValidation.js` explicitly declares `company_id` as an
allowed/optional key on the majority of admin schemas, so `validate()` (which rejects
*unknown* keys but not this one, since it's declared) does not block it. It is a fully wired,
first-class supported input on nearly every admin endpoint.

Confirmed 39 call sites in `adminController.js` (via direct grep, not estimate) and 2 more
in `fixedSchemeController.js`. **Any authenticated caller of any role — company, staff, or
even a plain member token — can impersonate any other company** by adding
`"company_id": "<victim-company-uuid>"` to the request body. This affects both reads and
writes:

**Writes (cross-tenant data corruption):**
- `storeOrUpdateRouteService`, `storeOrUpdateAreaService`, `storeOrUpdateDistrict/City` —
  create/edit another company's places data
- `storeOrUpdateAccountCreationDetailService` / `bulkEditAccountCreationDetails` — write to
  another company's **financial ledger**
- `storeOrUpdateFixedScheme` (fixedSchemeController.js) — edit another company's chit scheme
  configuration
- `storeOrUpdateContactUs` / `storeOrUpdateFAQ` / `storeOrUpdateTermsPrivacy`
- **`deleteStaffService`** (adminService.js:3895) / **`deleteRoleService`** (3980) — both do
  `where: { id, company_id: companyId }` gated only by `userToken.role === 'company'` (any
  company account, not the owning one). A malicious company admin can soft-delete another
  company's staff account or permission role — account lockout / DoS for the victim tenant.

**Reads (cross-tenant data leak):**
`getAllMemberDetailsService` (member PII), `getAllChitsGroupDetails`, `getGroupMembers`,
`getAllSuitFileInformation`, `getAllAuctions`, `getAllStaff`/`getStaffById`,
`getAllRole`/`getRoleById`, `getAllAccountCreationDetails`/`getAllAccountTree` (financial
ledger balances), `getAllFixedSchemes`, and about 15 more `getAllX`/`getXById` functions
following the identical pattern.

**Also confirmed still open (tracked since Phase 13, unfixed):**
`getDashboardSummaryService` via `adminController.js:1295` — same helper, same exposure,
any caller can view another company's full revenue/collection/defaulter dashboard.

### Recommended fix — structural, not another point patch

This is the third time a fix doc for this engagement has asked for this exact structural
change (Phase 13, Phase 15 item, now this one) — please implement it this time rather than
patching individual call sites again, since new call sites keep getting added faster than
the reactive patches land.

Split the one helper into two, with names that make the security property obvious at the
call site:

```js
// Use when resolving WHICH company a new/updated row should be associated with
// (e.g. creating a record where company_id is a legitimate foreign key input from
// a trusted internal caller, or from a role that's allowed to specify it explicitly).
// Body-first is fine here because this is not an authorization decision.
const resolveCompanyIdForAssociation = async (userPayload, reqBody = {}) => {
  if (reqBody && reqBody.company_id) return reqBody.company_id;
  return resolveCompanyIdForAuth(userPayload);
};

// Use for EVERY permission/ownership/scoping decision — "is this caller allowed to
// see/edit/delete this row." NEVER reads the body. Role-derived only.
const resolveCompanyIdForAuth = async (userPayload) => {
  if (!userPayload) return null;
  if (userPayload.role === 'company') return userPayload.id;
  if (userPayload.role === 'staff') return userPayload.company_id;
  if (userPayload.role === 'member') {
    const mem = await Member.findByPk(userPayload.id);
    return mem ? mem.company_id : null;
  }
  return null;
};
```

Then: every one of the 39 `adminController.js` call sites and 2 `fixedSchemeController.js`
call sites needs to be individually reviewed and switched to
`resolveCompanyIdForAuth(req.user)` — **not** kept on the association variant — because
every one of them currently uses the result to scope a `get-all`/`get-by-id`/`delete`
query or to stamp `company_id` on a write. None of the confirmed call sites in this codebase
are a case where body-first is actually the correct behavior; if the backend team finds one
that genuinely needs it (e.g. a superadmin cross-company tool that doesn't exist yet), it
should be the rare, explicit exception, not the default.

---

## Finding 3 (Critical) — ~30 delete/get-by-id functions with zero company scoping, independent of Finding 2

Distinct bug: these don't even call the (broken) helper — they do a raw `findByPk(id)` with
**no `company_id` filter whatsoever**. Fixing Finding 2 alone would not fix these; even a
perfectly-derived `company_id` is never checked here at all.

**Delete (soft or hard delete any tenant's row by id):**

```js
// adminService.js:401 — representative example, same shape at all sites below
const deleteMemberService = async (res, id) => {
  const member = await Member.findByPk(id);
  if (!member) return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
  await member.update({ is_deleted_status: 1 });
  ...
```

Same pattern (verified by line number) at: `deleteRouteService` (453),
`deleteAreaService` (509), `deleteChitsGroupService` (753), `deleteCityService` (969),
`deleteEnrollmentService` (1081), `deleteUpcomingChitService` (1176),
`deleteSuitFileInformationService` (1427), `deleteAuctionService` (1771 — hard `.destroy()`,
not soft delete), `deleteGroupUnderStaticListService` (2254),
`deleteAccountCreationDetailService` (2429 — deletes a financial ledger row),
`deleteSelfChitService` (2529), `deleteConfigureBusinessAgentCommissionService` (2664),
`deleteHistoryBusinessAgentService` (2765), `deleteContactUsService` (3395),
`deleteFAQService` (3470), `deleteGalleryService` (3725), `deleteFixedSchemeService`
(fixedSchemeService.js).

**Reads (leak of another tenant's record by id, including PII and financial data):**

`getMemberByIdService` (3099), `getRouteByIdService` (3153), `getAreaByIdService` (3164),
`getChitsGroupByIdService` (3177), `getCityByIdService` (3225), `getDistrictByIdService`
(3212), `getEnrollmentByIdService` (3238), `getUpcomingChitByIdService` (3256),
`getSuitFileInformationByIdService` (3267), `getAuctionByIdService` (3283),
`getContactUsByIdService` (3381), `getFAQByIdService` (3456), `getGalleryByIdService`
(3714), `getGroupUnderStaticListByIdService` (2268), `getAccountCreationDetailByIdService`
(2409), `getSelfChitByIdService` (2511), `getConfigureBusinessAgentCommissionByIdService`
(2632), `getHistoryBusinessAgentByIdService` (2752).

### Why Finding 2 + Finding 3 chain into a full compromise

Finding 2 lets an attacker **list** a target company's records (via a spoofed `company_id`
on a `get-all` endpoint), which leaks their UUIDs. Finding 3 then lets that same attacker
**read or delete those specific records directly by id**, with no ownership check at all —
so fixing only one of the two still leaves the other exploitable on its own (Finding 3
doesn't even need Finding 2 — an attacker who obtains an id any other way, e.g. from a
notification, a shared link, or brute-forcing sequential/guessable ids, can hit these
directly).

### Recommended fix

Every function in this list needs a `company_id` (or equivalent ownership) filter added to
its query, derived via `resolveCompanyIdForAuth(userPayload)` from Finding 2's fix — these
two findings should be fixed together since the new helper is exactly what these functions
are missing. Pattern:

```js
const deleteMemberService = async (res, id, companyId) => {
  const member = await Member.findOne({ where: { id, company_id: companyId } });
  if (!member) return errorResponse(res, statusCodes.NOT_FOUND, 'Member not found');
  await member.update({ is_deleted_status: 1 });
  ...
```

(Requires passing `companyId`, derived in the controller from `resolveCompanyIdForAuth(req.user)`,
down into each of these ~30 functions — a signature change at every call site, not just the
service body.)

---

## Finding 4 (High) — member/agent-level version of the same bug, in `userService.js`

Same root pattern as Finding 2, but at the individual member/agent level rather than
company level — and it affects some **already-authenticated** endpoints too, since the
scoping id is still read from the body instead of cross-checked against `req.user.id`.

```js
// userService.js:314-323
const getPendingPaymentsService = async (res, userPayload, bodySubscriberId, min = 0, max = 10) => {
  let subscriber_id = bodySubscriberId;
  if (!subscriber_id) {
    if (!userPayload) {
      return errorResponse(res, statusCodes.BAD_REQUEST, 'Subscriber ID is required');
    }
    subscriber_id = userPayload.id;
  }
  ...
```

The body value takes priority over the authenticated caller's own id — any logged-in member
can view another member's full pending-payments/penalty breakdown by supplying their
`subscriber_id`, no relationship to the caller required.

Same shape confirmed at:
- **`getHomeRecordService`** (userService.js:8, route `/home` — authenticated, but
  `subscriber_id` from body is never compared to `req.user.id`)
- **`getMemberDuesService`** (userService.js:1514) — `member_id` param, no ownership check,
  exposes `total_due`/`balance`/`penalty` for any member
- **`getCollectionAgentDashboardService`** (userController.js:160-168) — `collection_agent_id`
  from body, leaks another agent's full collection portfolio
- **`getCollectionAgentActiveGroupsService`**, **`getPendingMembersService`**,
  **`getSubmissionsService`**, **`getCollectionAgentGroupDashboardService`**,
  **`getBidDetailsService`** — same shape, scoping id taken from body
- **`getBusinessListUnderMembersService`** (via `userController.js:107-115`) —
  `business_agent_id` from body, unchecked (contrast with the correctly-written sibling
  `getBusinessAgentCommissionSummary` at line 117-126, which uses `req.user.id` — so the
  correct pattern already exists in this same file, it just wasn't applied consistently)

**Write instance (fraudulent payment injection):**

```js
// userService.js:1689-1692
const submitCollectionPaymentService = async (res, payload) => {
  const { collection_agent_id, member_id, payment_type, amount, ... } = payload;
  const submission = await CollectionAgentAmount.create({ collection_agent_id, member_id, ... status: 0 });
```

Called with the raw `req.body` as `payload` — `collection_agent_id` is entirely
attacker-controlled. Any authenticated user can submit a pending collection-payment
"as" any collection agent for any member, which then feeds into installment-clearance
logic once an admin approves it. Severity is moderated by the admin-approval gate, but the
submission itself is unauthenticated-by-identity.

### Recommended fix

Same principle as Finding 2/3: for every one of these, derive the scoping id from
`req.user`/`userPayload`, never from the body, for any endpoint whose entire purpose is
"show/act on **my own** data." If a route is genuinely meant to let one role look up another
user's data (e.g. an admin dashboard), that access needs an explicit permission check, not
an implicit "whatever id is in the body."

---

## What was checked and found correct (no action needed)

Confirmed via direct read, not assumption:
- `getBidsService`, `getChitDetailsService`, `getPaymentHistoryService`,
  `getPaymentReceiptService`, `getUpcomingChitsService`, `submitChitInterestService`,
  `registerDeviceTokenService`, `getNotificationHistoryService`,
  `markNotificationReadService` — correctly derive identity from `req.user`/`userPayload`.
- `storeOrUpdateMember/ChitsGroup/SuitFileInformation/Auction/AgentTargetEntry/SelfChit` —
  force `data.company_id = req.user.id` when `role === 'company'`. **Follow-up needed:**
  these do *not* set `company_id` for `role === 'staff'` callers — worth explicitly
  confirming the underlying `...Service` functions don't fall back to trusting whatever
  `company_id` is already sitting in the body for staff callers, since that would reopen
  the same hole through a different role. Not confirmed broken, flagged for a quick check.
- `storeOrUpdateStaffService`, `storeOrUpdateRoleService` — correctly use `userToken.id`,
  ignore the body.
- `requirePermission` middleware (`authMiddleware.js:46-51`) is a pure module-ACL check
  (`req.user.permissions[moduleId].view`) — confirmed it never performs an
  ownership/company check, so it does not mitigate any finding above. This middleware and
  the fixes above are solving two different problems (can this role touch this *type* of
  data at all, vs can this specific caller touch *this* row) — both are needed, one doesn't
  substitute for the other.

---

## Priority order for the backend team

1. **Finding 1** (unauthenticated route) — one-line fix (`authMiddleware.authenticateToken`),
   do this first, today, regardless of how long the rest takes.
2. **Finding 2 + Finding 3 together** — the structural helper split, then apply
   `resolveCompanyIdForAuth` across all ~41 + ~30 call sites. This is a large but mechanical
   change; consider doing it as one dedicated pass rather than mixing it into unrelated
   feature work, since partial application (fixing some call sites, missing others) leaves
   the exact same exploit surface, just smaller.
3. **Finding 4** — same principle, `userService.js`, smaller surface (~8 functions).
4. **Follow-up check** — confirm staff-role writes don't reopen Finding 2 through
   `storeOrUpdateMemberService`/etc. (see "what was checked" above).

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | `POST /all-chits-groups` with no `Authorization` header | 401, not member data |
| 2 | Log in as Company A, call any `getAllX`/`getXById`/`deleteX` admin endpoint with `company_id`/target id belonging to Company B in the body | 403/404/empty — never Company B's data or a successful mutation |
| 3 | Log in as a plain member, call an admin-only endpoint with a `company_id` in the body | Rejected by role check before `company_id` is ever consulted |
| 4 | Log in as Member A, call `pending-payments`/`chit-details`/etc. with Member B's `subscriber_id`/`member_id` in the body | Only Member A's own data returned, or 403 |
| 5 | Submit a collection payment as Agent A while authenticated as Member/Agent B | Rejected, or at minimum recorded against the authenticated caller's own agent id, not the body's |
| 6 | Re-run the original 4 already-fixed cases (auction, audit-logs, collections) plus the still-open dashboard case | All 4 now consistently fixed via the same shared helper, not 4 different one-off patches |
