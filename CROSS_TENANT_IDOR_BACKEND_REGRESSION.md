# Cross-Tenant IDOR Fix — Regression Report (commit `6bfc76f`)

**Urgent. The backend cannot currently boot.** Reviewed the commit responding to
`docs/CROSS_TENANT_IDOR_BACKEND_FIXES.md` line by line, verified every claim directly
against the code (not just the diff) via `node -c` and direct reads — this is not a partial
success, the change as committed does not run at all.

---

## Blocker 1 — `adminController.js` and `fixedSchemeController.js` fail to parse

```
$ node -c src/controllers/adminController.js
src/controllers/adminController.js:37
      return await adminService.(res, id, companyId);
                                ^

SyntaxError: Unexpected token '('
```

Every `delete*` and `get*ById` controller function that was touched by this fix has the
same shape — the service function name between `adminService.` and `(res, id, ...)` is
missing entirely:

```js
// current code, e.g. deleteMember (adminController.js:119-124)
const deleteMember = async (req, res) => {
  try {
    const { id } = req.body || {};
    const companyId = await adminService.resolveCompanyIdForAuth(req.user);
      return await adminService.(res, id, companyId);   // <-- function name is gone
  } catch (error) { ... }
};
```

Confirmed by count, not estimate: **36 occurrences** in `adminController.js`
(`grep -c "adminService\.(res" src/controllers/adminController.js`) and **2 more** in
`fixedSchemeController.js` (`getFixedSchemeById`, `deleteFixedScheme`). This affects every
delete/get-by-id endpoint touched by the fix — members, routes, areas, chits groups,
cities, enrollments, upcoming chits, suit-file info, auctions, group-under-static-list,
account creation details, contact us, FAQ, self chit, business agent commission/history,
fixed schemes. **Node cannot even load this file — the entire admin API is down**, not
just the endpoints this fix targeted.

This looks like a scripted find-and-replace (e.g. a regex substitution) that matched the
function name as a capture group but didn't re-insert it in the replacement. Whatever
tooling generated this diff, the output needs to be re-generated with the function name
preserved, then re-verified with `node -c` on every touched file before committing again.

**This must be fixed and re-verified before anything else in this report matters** — right
now the server does not start.

---

## Blocker 2 — even with the syntax restored, every one of these functions will throw `ReferenceError: companyId is not defined`

The service-side half of the same fix changed the query but not the function signature:

```js
// adminService.js — representative example, same shape at ~30 sites
const deleteMemberService = async (res, id) => {          // <-- no companyId parameter
  try {
    const member = await Member.findOne({ where: { id, company_id: companyId } }); // <-- undefined
```

`companyId` is never declared as a parameter, local variable, or module-level constant
anywhere in `adminService.js` or `fixedSchemeService.js` (confirmed by grep — zero
matches for a declaration). Every function in this list needs its signature updated to
actually receive the value, e.g.:

```js
const deleteMemberService = async (res, id, companyId) => {
  try {
    const member = await Member.findOne({ where: { id, company_id: companyId } });
    ...
```

Confirmed affected in `adminService.js`: `deleteMemberService`, `deleteRouteService`,
`deleteAreaService`, `deleteChitsGroupService`, `deleteCityService`,
`deleteEnrollmentService`, `deleteUpcomingChitService`, `deleteSuitFileInformationService`,
`deleteAuctionService`, `deleteGroupUnderStaticListService`,
`storeOrUpdateAccountCreationDetailService` (the `id`-lookup branch),
`getAccountCreationDetailByIdService`, `deleteAccountCreationDetailService`,
`bulkEditAccountCreationDetailsService` (per-row lookup), `deleteSelfChitService`,
`storeOrUpdateConfigureBusinessAgentCommissionService` (the `id`-lookup branch),
`deleteConfigureBusinessAgentCommissionService`, `storeOrUpdateHistoryBusinessAgentService`
(the `id`-lookup branch), `deleteHistoryBusinessAgentService`,
`updateCollectionSubmissionStatusService`, `getCompanyByIdService`, `getMemberByIdService`,
`getRouteByIdService`, `getAreaByIdService`, `getChitsGroupByIdService`,
`getCountryByIdService`, `getStateByIdService`, `getDistrictByIdService`,
`getCityByIdService`, `getEnrollmentByIdService`, `getUpcomingChitByIdService`,
`getSuitFileInformationByIdService`, `getAuctionByIdService`, `logoutService` (all 3
role branches), `getGalleryByIdService`, `deleteGalleryService`,
`storeOrUpdateGalleryService` (the `id`-lookup branch). Same pattern in
`fixedSchemeService.js`: `getFixedSchemeByIdService`, `deleteFixedSchemeService`.

Every one of these needs (a) the caller (controller) to actually pass the resolved
`companyId` through as an argument — most controllers already do this now, since Blocker 1
shows `const companyId = await adminService.resolveCompanyIdForAuth(req.user);` being
computed right before the broken call — and (b) the service function signature to accept
and use it.

**One nuance to flag while this is being fixed:** `getCompanyByIdService`, `getCountryByIdService`,
`getStateByIdService` — these are not tenant-owned resources (Company, Country, State
aren't scoped to a single company), so adding a `company_id` filter to their `findOne`
would break them for legitimate lookups (a `Company` row's own `id` has no `company_id`
column on itself, for instance). Please double check these three specifically — they may
have been swept up by the same mechanical replacement without actually needing the fix.

---

## Blocker 3 — `submitCollectionPaymentService` fix is cosmetic, Finding 4's write-path IDOR is still open

The controller was updated:
```js
// userController.js
return await userService.submitCollectionPaymentService(res, req.body, req.user);
```
But the service function was not:
```js
// userService.js:1715 — signature unchanged
const submitCollectionPaymentService = async (res, payload) => {
  const { collection_agent_id, member_id, ... } = payload;   // still reads from the body
```
`req.user` is passed in but the function only declares 2 parameters, so it's silently
dropped. `collection_agent_id` is still taken entirely from the client-supplied body —
any authenticated user can still submit a payment "as" any collection agent. This needs
the service signature updated to accept the caller and use `userPayload.id` (or validate
`collection_agent_id === userPayload.id`) instead of trusting the body.

---

## Blocker 4 — `getMemberDuesService` fix broke the feature; wrong remedy for this endpoint

```js
// userService.js:1539
const getMemberDuesService = async (res, userPayload) => {
  const member_id = userPayload ? userPayload.id : null;   // always the CALLER's own id now
```

This endpoint is `POST /collection-agent/member-dues` (`userRoutes.js:38`) — grouped with
the other collection-agent endpoints (`group-dashboard`, `active-groups`,
`pending-members`). Its entire purpose is **a collection agent looking up a specific
member's dues before collecting from them** — it was never meant to be self-service. Fix
Round 1 applied the same "always use the caller's own id" remedy that correctly applies to
the actually-self-service functions in this same batch (`getHomeRecordService`,
`getPendingPaymentsService`, etc.), but this one isn't self-service, so the fix makes the
feature non-functional: a collection agent can no longer look up any member's dues at all
(`Member.findByPk(agentUserId)` will look up the agent's own user id as if it were a
`Member.id`, which is not what this endpoint needs).

**Correct fix:** keep `member_id` as a body parameter (this is legitimately a
cross-resource lookup, not an identity claim), but validate that the requested member is
one the calling collection agent is actually allowed to see — e.g. that member has an
active enrollment in a group where this agent is the assigned collection agent — before
returning their dues. This is the "genuinely needs cross-user access, so add an explicit
ownership/relationship check" case flagged as the alternative path in the original fix doc
(Finding 4's "what NOT to do" note), not the "always force self" case.

---

## Confirmed correctly fixed — no further action needed on these

- **Finding 1**: `POST /all-chits-groups` now has `authMiddleware.authenticateToken`
  (`userRoutes.js:12`). Verified.
- **Finding 2 structural split**: `getCompanyIdFromUser` fully replaced by
  `resolveCompanyIdForAssociation`/`resolveCompanyIdForAuth` — confirmed zero remaining
  references to the old name anywhere in the codebase, and all ~41 original call sites now
  use `resolveCompanyIdForAuth`. This part is done well.
- **Phase 13 (previously open, tracked since the dashboard-scoping fix doc)**:
  `getDashboardSummary` now uses `resolveCompanyIdForAuth(req.user)` — closed.
- **`recordWinnerService`**: `due_date >= auction_date` check added correctly, matches the
  suggested fix.
- **Phase 17 (`createInstallaments` due-date gap)**: implemented correctly — the
  one-period offset and `due_date_number_count` day-of-month logic both match the
  recommended fix. No issues found in this part.
- **Finding 4, the parts that were actually rewired correctly**: `getHomeRecordService`,
  `getAllHomeRecordsService`, `getCollectionAgentDashboardService`,
  `getCollectionAgentActiveGroupsService`, `getPendingMembersService`,
  `getPendingPaymentsService` — all now correctly derive identity from `req.user` instead
  of the request body.

---

## What to do next

1. **Fix Blocker 1 first** — restore the missing function names, then run
   `node -c` on every file this commit touched (`adminController.js`,
   `fixedSchemeController.js`, `adminService.js`, `fixedSchemeService.js`,
   `userController.js`, `userService.js`, `userRoutes.js`) before committing again. The
   server does not start until this is done — nothing else can even be tested.
2. **Fix Blocker 2** alongside it — add `companyId` to every affected service function's
   signature, thread it from the controller (which mostly already resolves it), and
   double-check the three non-tenant-scoped exceptions noted above.
3. **Fix Blocker 3** — update `submitCollectionPaymentService`'s signature to accept and
   use the caller identity.
4. **Fix Blocker 4** — revert `getMemberDuesService` to accept `member_id` from the body,
   add an ownership/relationship check instead of a hardcoded self-id swap.
5. Re-run the Phase 18 verification checklist from the original fix doc once the above
   land — none of those checks can currently pass since the server won't boot.

## Verification checklist for the next round

| # | Test | Expected |
|---|---|---|
| 1 | `node -c` on every file this fix touches | No syntax errors |
| 2 | Start the server | Boots successfully |
| 3 | Call any `delete*`/`get*ById` admin endpoint as a valid company user | Succeeds, no `ReferenceError` in logs |
| 4 | Call the same endpoint with another company's id in the body | 404/403, not the other company's data |
| 5 | `POST /collection-agent/member-dues` as a real collection agent, for a member they collect from | Returns that member's dues (not the agent's own, not an error) |
| 6 | Submit a collection payment with a `collection_agent_id` belonging to a different agent than the caller | Rejected, or recorded against the authenticated caller's own id |
