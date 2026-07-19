# Staff Module / RBAC — Backend Fixes (Round 2)

**For the backend team.** Reviewed `82604f0` ("staff added") line by line against
`docs/STAFF_RBAC_BACKEND_SPEC.md`. The data model, staff/role CRUD mutations, and the
shared-login-tab flow (including the forgot-password/OTP fallback extension) are all
correctly implemented — no changes needed there. Three things need fixing before this
actually works end-to-end.

---

## Fix 1 (🔴 critical) — Module-id mismatch breaks permission checks for 7 modules

`src/utils/modules.js` (the backend's mirror of the frontend's module-id list) uses
different strings than the actual frontend `modules.js` for 7 modules:

| Frontend id (what's actually saved in `Role.permissions`) | Backend id currently used |
|---|---|
| `M_CHITS` | `M_CHITS_GROUP` |
| `M_ENROLLMENTS` | `M_ENROLLMENT` |
| `M_UPCOMING` | `M_UPCOMING_CHIT` |
| `M_DISTRICTS` | `M_DISTRICT` |
| `M_CITIES` | `M_CITY` |
| `M_ROUTES` | `M_ROUTE` |
| `M_AREAS` | `M_AREA` |

The frontend's `RoleForm.jsx` builds the permission matrix directly from the frontend
`modules.js` registry and saves permissions keyed by those exact ids (`M_CHITS`, etc.).
The backend's `requirePermission(MODULES.M_CHITS_GROUP)` then checks
`req.user.permissions['M_CHITS_GROUP']?.view` — a key that will never be set, because
nothing ever writes to it. A staff user granted "Chit Group" access sees the module in
the UI (the frontend-side check is internally consistent) and then gets a 403 from the
actual API the moment the page tries to load data.

**Fix:** update `src/utils/modules.js` so every id matches the frontend's `modules.js`
exactly:

```js
module.exports = {
  // Masters
  M_MEMBERS: 'M_MEMBERS',
  M_CHITS: 'M_CHITS',                    // was M_CHITS_GROUP
  M_CHIT_CONFIG: 'M_CHIT_CONFIG',
  M_ENROLLMENTS: 'M_ENROLLMENTS',        // was M_ENROLLMENT
  M_UPCOMING: 'M_UPCOMING',              // was M_UPCOMING_CHIT
  M_SELF_CHITS: 'M_SELF_CHITS',
  M_AGENT_TARGETS: 'M_AGENT_TARGETS',
  M_AGENT_TRANSFER: 'M_AGENT_TRANSFER',
  M_SUIT_FILE: 'M_SUIT_FILE',
  M_ACC_GROUPS: 'M_ACC_GROUPS',
  M_ACCOUNTS: 'M_ACCOUNTS',
  M_OPENING_BAL: 'M_OPENING_BAL',
  M_ACC_TREE: 'M_ACC_TREE',
  M_DISTRICTS: 'M_DISTRICTS',            // was M_DISTRICT
  M_CITIES: 'M_CITIES',                  // was M_CITY
  M_ROUTES: 'M_ROUTES',                  // was M_ROUTE
  M_AREAS: 'M_AREAS',                    // was M_AREA

  // Transactions
  T_AUCTIONS: 'T_AUCTIONS',
  T_AGENT_SETUP: 'T_AGENT_SETUP',
  T_COLLECTION_VERIFY: 'T_COLLECTION_VERIFY',

  // Utilities
  U_CONTACT_US: 'U_CONTACT_US',
  U_FAQ: 'U_FAQ',
  U_TERMS_PRIVACY: 'U_TERMS_PRIVACY',
};
```

`M_COMPANY`, `M_COUNTRY`, `M_STATE` from the current file aren't in the frontend's
`ready: true` list at all — drop them, they don't correspond to anything checkable.

Every existing `requirePermission(MODULES.X)` call in `adminRoutes.js` that referenced a
renamed constant automatically picks up the fix once the constant values change — no route
file edits needed, just the constant definitions.

---

## Fix 2 (🔴 critical, security) — Role/Staff list endpoints have no access control

`getAllRoleService`, `getRoleByIdService`, `getAllStaffService`, `getStaffByIdService` —
none of them, and none of their routes, check the caller's role at all. Confirmed by
reading both the routes (`role/get-all`, `staff/get-all`, etc. only have
`authenticateToken`, no `requirePermission` or role check) and the service functions
themselves (only the *mutation* services — `storeOrUpdateRoleService`,
`storeOrUpdateStaffService`, `staffChangePasswordService` — have the
`userToken.role !== 'company'` guard).

Right now, any authenticated user — including a regular chit member — can call
`role/get-all` and see the company's full role/permission structure, or `staff/get-all`
and see the staff roster. Fix: add `requirePermission(MODULES.S_ROLES)` /
`requirePermission(MODULES.S_USERS)` to the four GET routes:

```js
router.post('/role/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.S_ROLES), validate(adminValidation.getAllRoleSchema), adminController.getAllRole);
router.post('/role/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.S_ROLES), validate(adminValidation.getByIdSchema), adminController.getRoleById);
router.post('/staff/get-all', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.S_USERS), validate(adminValidation.getAllStaffSchema), adminController.getAllStaff);
router.post('/staff/get-by-id', authMiddleware.authenticateToken, authMiddleware.requirePermission(MODULES.S_USERS), validate(adminValidation.getByIdSchema), adminController.getStaffById);
```

This requires adding `S_ROLES` and `S_USERS` to the `modules.js` constant list (Fix 1's
file) — they weren't there at all. Since `requirePermission` already lets `role === 'company'`
through unconditionally, this doesn't change anything for the company owner — it only
closes the gap for staff-without-permission and regular members.

**Also apply the same `role !== 'company'` guard `storeOrUpdateRoleService` already has**
to `deleteRoleService` and `deleteStaffService` — currently unguarded (any authenticated
caller who reaches the route could delete a role or staff account). Route-level
`requirePermission` isn't a substitute here since view-permission shouldn't imply
delete-permission in the FRS's eventual model — for now, since v1 is view-only
granularity, just gate the delete routes the same way the other mutations are gated:
company-only.

---

## Fix 3 (🟡 medium) — `deleteRoleService` doesn't check for assigned staff

Per the original spec: reject deletion if any `StaffUser.role_id` still references the
role. Currently `deleteRoleService` just deactivates unconditionally:

```js
const deleteRoleService = async (res, id, companyId) => {
  const role = await Role.findOne({ where: { id, company_id: companyId } });
  if (!role) return errorResponse(res, statusCodes.NOT_FOUND, 'Role not found');

  const assignedStaffCount = await StaffUser.count({ where: { role_id: id, is_deleted_status: 0 } });
  if (assignedStaffCount > 0) {
    return errorResponse(res, statusCodes.BAD_REQUEST, `Cannot delete this role — ${assignedStaffCount} staff user(s) are still assigned to it`);
  }

  await role.update({ status: 0 });
  return successResponse(res, statusCodes.OK, 'Role deleted successfully');
};
```

---

## Fix 4 (🟠 high) — 14 modules were never wired to `requirePermission` at all

`T_AUCTIONS`, `T_AGENT_SETUP`, `T_COLLECTION_VERIFY`, `U_CONTACT_US`, `U_FAQ`,
`U_TERMS_PRIVACY`, and 8 Masters modules (`M_CHIT_CONFIG`, `M_SELF_CHITS`,
`M_AGENT_TARGETS`, `M_AGENT_TRANSFER`, `M_ACC_GROUPS`, `M_ACCOUNTS`, `M_OPENING_BAL`,
`M_ACC_TREE`) are defined as module ids but their routes have no `requirePermission` call
— staff get unrestricted access regardless of what's granted. Confirmed by searching
`adminRoutes.js` for each constant reference and finding zero matches for these 14.

Apply the same pattern used on the Masters routes that already have it. Routes confirmed
to exist for these modules (add `authMiddleware.requirePermission(MODULES.X)` right after
`authenticateToken` on each):

| Module | Routes |
|---|---|
| `T_AUCTIONS` | `auction/store-or-update`, `auction/get-all`, `auction/delete`, `auction/get-by-id` (**not** `auction/record-winner` — stays company-only per the deferred note) |
| `T_AGENT_SETUP` | `configure-business-agent-commission/store-or-update`, `get-all`, `get-by-id`, `delete`, `summary-by-agent`, plus `agent-target-entry/store-or-update`, `agent/get-by-type`, `agent/get-enrollments`, `agent/transfer-agent` |
| `T_COLLECTION_VERIFY` | `collection-agent/submissions/get-all`, `collection-agent/submissions/update-status` |
| `U_CONTACT_US` | `contact-us/store-or-update`, `get-all`, `get-by-id`, `delete` |
| `U_FAQ` | `faq/store-or-update`, `get-all`, `get-by-id`, `delete` |
| `U_TERMS_PRIVACY` | `terms-privacy/store-or-update`, `terms-privacy/get` |
| `M_SELF_CHITS` | `self-chit/store-or-update`, `get-all`, `get-by-id`, `delete` |
| `M_ACC_TREE` | `account-tree/get-all` |
| `M_ACCOUNTS` / `M_ACC_GROUPS` | `account-creation-details/*` (confirm which of these two module ids this route group actually corresponds to — the frontend's `M_ACCOUNTS` vs `M_ACC_GROUPS` split wasn't obviously mapped to a single backend route group when I searched; worth a quick check against how `/admin/masters/accounts` vs `/admin/masters/account-groups` actually query data) |
| `M_CHIT_CONFIG`, `M_AGENT_TARGETS`, `M_AGENT_TRANSFER`, `M_OPENING_BAL` | Couldn't find an obvious matching route group by name in a quick search — locate the actual controller/route backing each of these four frontend pages and apply the same pattern. Flagging rather than guessing at the wrong route. |

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| Fix 1 | Grant a staff role `M_CHITS: {view: true}`, staff logs in, calls `chits-group/get-all` | Succeeds (currently 403s) |
| Fix 1 | Same for `M_ENROLLMENTS`, `M_UPCOMING`, `M_DISTRICTS`, `M_CITIES`, `M_ROUTES`, `M_AREAS` | All succeed |
| Fix 2 | A `member`-role token calls `role/get-all` | 403 (currently succeeds) |
| Fix 2 | A staff token with no `S_ROLES`/`S_USERS` permission calls `role/get-all`/`staff/get-all` | 403 |
| Fix 2 | Company owner calls any of the four GET routes | Unaffected, still succeeds |
| Fix 3 | Delete a role with 1+ assigned staff users | Rejected with a clear count in the message |
| Fix 3 | Delete a role with 0 assigned staff | Succeeds, unchanged |
