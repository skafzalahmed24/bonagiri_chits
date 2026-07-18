# Auction Winner Recording — Backend: Required Fix + Next Phase

**For the backend team.** The B5–B9 pass (`84460f0`) is verified — B5, B6, B7,
and B9 are all correct, tested against the actual code, no changes needed
there. **B8 is incomplete in a way that reopens the same class of bug it was
meant to close**, just for a different token type. This is the one required
fix before this thread can be considered done. After that, a short "next
phase" section on hardening the pattern so it doesn't recur elsewhere.

---

## Required fix — B8 only protects `role: 'company'` tokens

### What's wrong

`recordWinnerService` (`adminService.js:1441`):

```js
const safeCompanyId = userToken.role === 'company' ? userToken.id : userToken.company_id;
```

This correctly resolves `company_id` when `userToken.role === 'company'`. But
for any other role, it reads `userToken.company_id` — **a field that does not
exist on the JWT payload for `member`-role tokens.** Confirmed by reading the
token construction directly (`loginCompanyService`, `adminService.js:65-70`):

```js
const payload = {
  id: user.id,
  user_id: type === 1 ? user.company_id : user.other_info_user_code,
  role,
  device_unique_id
};
```

No `company_id` field, ever, for `role: 'member'` — which is what every
ordinary member, business agent, and collection agent logs in with. So for a
member token, `safeCompanyId` resolves to `undefined`, and

```js
...(safeCompanyId && { company_id: safeCompanyId })
```

contributes nothing — the `ChitsGroup` lookup reverts to **no company
scoping at all**, the exact bug B8 was supposed to close.

This is directly exploitable: `authMiddleware.authenticateToken`
(`middlewares/authMiddleware.js:22-44`) does **no role checking whatsoever**
— any valid token, from any role, can call any admin route including
`POST /api/auction/record-winner`. So today, a completely ordinary member
login (the most common credential type in the system) can call this
admin-only endpoint against a `group_id` belonging to a **different company**
and it will succeed, with the response affecting real installment schedules.

### The fix

`record-winner` is an admin action — `/api/auction/*` sits in
`adminRoutes.js` for a reason. There is no legitimate case today for a
`member`-role token to call it (no Staff/RBAC module exists yet — see "Next
phase" below). The cleanest fix is to reject the request outright rather than
try to resolve a company scope that shouldn't apply:

```js
const recordWinnerService = async (res, reqBody, userToken) => {
  if (!userToken || userToken.role !== 'company') {
    return errorResponse(res, statusCodes.FORBIDDEN, 'Only company admin accounts can record auction winners');
  }
  const safeCompanyId = userToken.id;
  // ... rest unchanged, `safeCompanyId` is now guaranteed valid
```

Do **not** fall back to `reqBody.company_id` or any client-supplied value —
that reintroduces exactly the same hole via a different field. And do not
reuse the existing `getCompanyIdFromUser` helper here even though it looks
tempting — it deliberately prioritizes `reqBody.company_id` first
(`adminService.js:11-13`), which is correct for its actual purpose (data
association: "what company should this record belong to"), but wrong for
this purpose (authorization: "what is this authenticated caller actually
allowed to touch"). Those are different questions; don't conflate them here.

If there's a real product reason a `member`-role token needs to hit this
endpoint (e.g. an agent-initiated flow we haven't discussed), tell us and
we'll adjust — but as a security default, reject rather than silently widen
scope.

### Verification

| Scenario | Expected |
|---|---|
| `company`-role token, own group | Succeeds (unchanged) |
| `company`-role token, another company's `group_id` | 404 (unchanged, already correct) |
| `member`-role token, any `group_id` | 403, not a silent scope-widening success |
| No token / invalid token | 401 (unchanged, `authMiddleware` handles this) |

---

## Next phase — this bug pattern likely exists elsewhere, and the root cause is systemic

Two things worth doing now that this is on your radar, not because they block
the current thread:

### 1. `storeOrUpdateAuctionService` has the same unscoped-lookup gap, never touched by B5–B9

This was flagged in the original backend follow-up doc (B8) as a *known,
separate* residual gap and wasn't in scope for that pass — flagging again so
it doesn't get lost. `storeOrUpdateAuctionService`'s `ChitsGroup.findByPk(auctionData.group_id, ...)`
(used for the B9 fixed-scheme-block check and elsewhere) has no company
filter at all, and the controller (`storeOrUpdateAuction`,
`adminController.js:499-505`) only sets `data.company_id` for
`role === 'company'` — same shape of bug as B8, just on the older endpoint.
Worth a follow-up pass once B8 is confirmed fixed, applying the same
"reject non-company tokens" pattern (or a `company_id` filter on the
`ChitsGroup` lookup, if editing needs to stay open to other roles).

### 2. Add a route-level role guard instead of patching services one at a time

The actual root cause isn't any single service function — it's that
`authenticateToken` verifies the token but never checks `role`, so *every*
admin route is reachable by *any* authenticated user regardless of role.
Patching `recordWinnerService` (and `storeOrUpdateAuctionService`) closes
these two instances, but the same class of bug can reappear on the next new
admin endpoint. Consider a small `requireRole(...roles)` middleware:

```js
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return errorResponse(res, statusCodes.FORBIDDEN, 'Insufficient permissions');
  }
  next();
};
```

applied as `router.post('/auction/record-winner', authMiddleware.authenticateToken, requireRole('company'), adminController.recordWinner)` across `adminRoutes.js`. This is also the natural foundation for the
Staff/RBAC module (FRS Section 14) when that work starts — a role check at
the route layer is the first building block either way, so this isn't wasted
effort even if RBAC is a ways off.

Not blocking — B8's targeted fix above is sufficient to close the current
exposure. This is a "do when convenient" hardening note, not a new task with
a deadline.

---

## What's confirmed correct — no action needed

- **B5** (`getInstallmentsByGroupService`) — correct, matches spec, verified
  live.
- **B6** (unique constraints + `SequelizeUniqueConstraintError` translation)
  — correct on both `storeOrUpdateAuctionService` and `recordWinnerService`.
- **B7** (server-assigned `auction_number` in `store-or-update`) — correct,
  and correctly only reachable for Open Auction groups since B9's guard runs
  first.
- **B9** (block manual auction creation for fixed-scheme groups) — correct,
  matches the recommended option (b), editing existing rows remains
  unrestricted as intended.
