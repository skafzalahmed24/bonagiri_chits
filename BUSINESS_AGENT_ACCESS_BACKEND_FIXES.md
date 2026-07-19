# Business Agent Portal — Access Fix Required

**For the backend team.** User-reported: logging in as a Business Agent, every Business
Agent API call fails with "you don't have permission." Traced the root cause — it's a
routing mismatch, not an RBAC bug. While fixing it, found a second, more serious issue in
the same feature area that should be fixed in the same pass: an unauthenticated ownership
gap that lets any member read or write another business agent's commission data.

**This is the priority fix right now** per the user's direct request — leads with the
reported blocker.

---

## 1. Root cause of the reported "no permission" error

The Business Agent portal's `useBusinessSummary` hook
(`src/features/member-portal/hooks/useBusinessAgent.js`) calls:

```
POST configure-business-agent-commission/summary-by-agent
```

This path only exists in `adminRoutes.js` (mounted at `/api`), gated with:

```js
router.post('/configure-business-agent-commission/summary-by-agent', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.T_AGENT_SETUP), ...);
```

Business Agents log in through the **member** login (`role: 'member'` — same JWT shape as
a plain member; "Business Agent" is just an `introduced_as` flag on the Member record, not
a separate role). `requirePermission` only ever allows `role === 'company'` (always) or
`role === 'staff'` (if granted) — every other role, including `member`, is rejected
outright. This is why the summary call 403s for every business agent, every time,
regardless of what's configured anywhere — there's no permission grid entry that could
ever fix this, because the endpoint isn't supposed to be reachable by member-role tokens
at all. It's the wrong route for this caller, not a missing grant.

The other two endpoints this same hook file calls
(`history-business-agent/history-by-group-id`, `history-business-agent/store-or-update`)
happen to *not* 403 today, only because those two particular admin routes were never given
a `requirePermission` gate in the first place — see #2, that's not a safe accident.

**Fix:** add a new business-agent-facing route in `userRoutes.js` (mounted at
`/api/user`, no admin permission gate — same tier as the existing
`user/collection-agent/*` routes), and point the frontend at it instead of the admin
route:

```js
// userRoutes.js
router.post('/business-agent/commission-summary', authMiddleware.authenticateToken, userController.getBusinessAgentCommissionSummary);
```

```js
// userController.js
const getBusinessAgentCommissionSummary = async (req, res) => {
  try {
    const { min, max } = req.body || {};
    // Derive from the token, never from req.body — this is the caller's own data only.
    const business_agent_id = req.user.id;
    return await adminService.getBusinessAgentCommissionSummaryService(res, business_agent_id, min, max);
  } catch (error) {
    console.error('Error in getBusinessAgentCommissionSummary:', error);
    return errorResponse(res, statusCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
};
```

Reuses the existing `getBusinessAgentCommissionSummaryService` as-is — no service-layer
change needed for this one, just a new, correctly-scoped entry point. Leave the existing
admin route untouched; company/staff still need to be able to look up an arbitrary agent's
summary for reporting purposes, which is a legitimately different, broader use case.

**Frontend follow-up (small, will do once this ships):** update
`ENDPOINTS.AGENT_COMMISSION_CONFIG.SUMMARY_BY_AGENT` (or add a new
`ENDPOINTS.BUSINESS_AGENT.COMMISSION_SUMMARY`) to point at
`user/business-agent/commission-summary`, and stop sending `business_agent_id` in the
body for that call (harmless to leave it, but it'll be ignored server-side once the fix
above lands — worth removing so it's not misleading to read later).

---

## 2. Found while investigating — write-path ownership gap, same feature area

`history-business-agent/store-or-update` (used by the same hook, for a business agent to
upload a commission document) has **no permission gate and no ownership check**:

```js
// storeOrUpdateHistoryBusinessAgentService
const { id, ...historyData } = data;
const configId = historyData.configure_business_agent_id || ...;
const config = await ConfigureBusinessAgentCommission.findByPk(configId);
// ...proceeds to create/update a HistoryBusinessAgent row for whatever configId was given
```

There's no check anywhere in this path that the `configure_business_agent_id` in the
request body actually belongs to the calling member. Right now, **any authenticated
member** — not just business agents — can submit a `configure_business_agent_id`
belonging to a different agent (or a different company entirely) and create or modify that
agent's paid-commission history. This is a write operation, so it's a step above the
read-only leak in #1 — it can actually falsify commission-payment records.

`history-business-agent/history-by-group-id` (read-only) has the same missing-gate
pattern but lower severity — it leaks which agents are configured for a given group and
their payment history, scoped only by `group_id`, to any authenticated member.

**Fix:** for both, once caller is confirmed to be a member (business agent), verify the
`configure_business_agent_id` (or the resolved `business_agent_id` on the config record)
matches `req.user.id` before proceeding — reject otherwise. If the intent is for a
business agent to only ever touch their *own* config's history, the cleanest fix is the
same shape as #1: dedicated `user/business-agent/*` routes that derive identity from
`req.user`, rather than continuing to reuse the admin-mounted routes at all.

---

## Also worth a dedicated look, not blocking this fix

While tracing this, the exact same shape of issue — trusting a caller-supplied
`collection_agent_id` in the request body instead of deriving it from `req.user` — shows
up across essentially every hook in `useCollectionAgent.js`
(`user/collection-agent/dashboard`, `active-groups`, `pending-members`, `submit-payment`,
`submissions`, `member-visit/*`). None of these currently 403 (they're correctly mounted
under `userRoutes.js` with no permission gate), so there's no reported breakage — but
functionally, any authenticated member could currently pass a different `collection_agent_id`
and view or act on another collection agent's data. Not asking for this to be fixed in this
same pass — it's a wider surface than the two items above — but flagging it now since it's
the same root cause and will need its own pass at some point.

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| 1 | Log in as a Business Agent, load the Business Agent home screen | Commission summary loads, no "you don't have permission" error |
| 2 | Same session, inspect the network request for the summary call | Hits `user/business-agent/commission-summary`, not the admin route |
| 3 | As Business Agent A, attempt to submit a commission document with `configure_business_agent_id` belonging to Business Agent B | Rejected — not silently written to B's history |
| 4 | Company admin still looks up an arbitrary agent's summary via the existing admin masters/reports screen | Unaffected, still works exactly as before |
