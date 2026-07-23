# Admin Direct Payment — Backend Follow-Up

**For the backend team.** Reviewed the latest pull against `docs/ADMIN_DIRECT_PAYMENT_BACKEND_FIXES.md`.
All four items from that doc are confirmed fixed correctly.

**Update 2026-07-23 — user-reported, still broken in production.** The user flagged real
issues on this exact screen. Re-verified directly against the current code (many unrelated
backend rounds have landed since this doc was first written — Phase 18 IDOR fixes, Phase
20/21 auth work — none of them touched this). **The `enrollment_id` gap described below is
still open, unchanged, after 6+ subsequent "bug fixes" commits.** This is the single fix
blocking the entire Direct Payment feature from working at all — it should be picked up
before anything else, since it's been sitting untouched the longest of any open item in this
engagement. A second, related issue was also found during this pass — see the new section
below the `enrollment_id` writeup.

**Update 2026-07-19:** the `adminValidation.js` boot-blocker below is now fixed too
(confirmed — the stray shorthand line was removed, only one `storeDirectPaymentSchema`
definition remains, and a scan of the rest of the file's `module.exports` found no other
instance of the same pattern). Leaving the write-up in place as a record of what happened
and why, since the same shape of mistake (a name exported once as a bare shorthand
reference, once as a real `key: value` definition, in the same object literal) has now hit
this file twice (`changePasswordSchema`, `storeDirectPaymentSchema`) — worth being alert to
next time an export is added near the bottom of this file.

**New finding, from building the frontend against the now-working endpoints:** `group/members`
doesn't return what the frontend needs to select an installment — see the new section near
the bottom of this doc.

---

## ✅ RESOLVED — `adminValidation.js` throw on load

`module.exports` in `src/validations/adminValidation.js` references `storeDirectPaymentSchema`
twice:

```js
module.exports = {
  storeDirectPaymentSchema,        // line 463 — shorthand property
  storeOrUpdateFAQSchema,
  ...
  storeDirectPaymentSchema: Joi.object({   // line 1023 — explicit key:value, later in the SAME object literal
    chits_installment_id: Joi.string().uuid().required(),
    ...
  }),
};
```

Line 463 is shorthand for `storeDirectPaymentSchema: storeDirectPaymentSchema` — it
requires a variable of that name to already exist in the surrounding scope at the moment
this object literal is evaluated. There's no `const storeDirectPaymentSchema = ...`
anywhere in the file (only the explicit key at line 1023, which is a property name inside
this same object, not a variable declaration in outer scope). Confirmed directly:

```
$ node -e "const foo = { storeDirectPaymentSchema, bar: 1 }; console.log(foo);"
ReferenceError: storeDirectPaymentSchema is not defined
```

This throws the instant anything does `require('./validations/adminValidation')` —
`adminRoutes.js` requires it at the top of the file, so this doesn't just break the direct
payment feature, it breaks the ability to load `adminRoutes.js` at all, which means the
entire admin/company API surface (login included) is currently down. `node -c` (syntax
check) passes clean, so this won't show up as a parse error — it only surfaces when the
module actually gets executed, which makes it easy to miss in a quick sanity check.

This is the same *shape* of bug as the earlier `changePasswordSchema` duplicate-key issue
(two definitions of the same export name inside one `module.exports` object), but more
severe — that one silently picked the wrong-but-valid schema; this one is an outright crash
because the first occurrence is a shorthand reference with nothing to resolve to, not a
second valid definition.

**Fix:** delete line 463 (`storeDirectPaymentSchema,`) — the real schema is already
correctly defined and exported at line 1023, that's the only one needed. While in there,
it's worth a quick scan of the rest of `module.exports` for any other export name that
appears both as a bare shorthand reference and as an explicit `key: value` later in the
same object — that combination is exactly what caused this, and it's easy to reintroduce
by pattern-matching off the working `key: value` style used everywhere else without
noticing an earlier shorthand line already claims the same name.

---

## ✅ Confirmed fixed — all four items from the original fix doc

- **Company-id derivation** — `const companyId = user.role === 'company' ? user.id : user.company_id;`. Company admins can now use this endpoint.
- **Ownership/company-scoping check** — added a lookup joining `ChitsInstallment → Enrollment → ChitsGroup.company_id`, rejects with 403 if it doesn't match the caller's company. Correct.
- **`getInstallmentsByGroupService`'s `payment.amount`** → `payment.received_amount`. Fixed.
- **Validation schema + dedicated permission module** — `storeDirectPaymentSchema` added (once the export bug above is fixed, this schema itself is correct: `chits_installment_id` uuid required, `received_amount` required, the rest optional, matching what was asked). `MODULES.T_MEMBER_RECEIPTS` added to `utils/modules.js`, and the route now gates on it instead of the unrelated `T_COLLECTION_VERIFY`.

**Bonus, not asked for but a real fix:** `getAllCollectionSubmissionsService` now takes a
`companyId` parameter and scopes the query through the `collection_agent` (Member)
association's `company_id` — this closes the cross-tenant leak on the Collections
Verification list that was flagged in Phase 15 (`docs/API_PAYLOAD_CONTRACT_FIXES_BACKEND.md`
item 1). Worth Antigravity double-checking their payload fix for that screen (dropping the
unrecognized `company_id` key) is safe to ship now that this scoping fix has landed.

---

## 🔴 New — `group/members` doesn't return what the payment flow needs

Building the actual Member Receipts page against the live endpoints surfaced a data-shape
gap in `getGroupMembersService` (`group/members`) that the original frontend spec got
wrong — worth owning that mistake, not just describing it as a frontend bug.

The step-2 member picker needs an **enrollment id** (to pass to
`chits-installment/get-by-group`'s `enrollment_id` filter, which matches against
`Enrollment.id`) and a display name. What `group/members` actually returns per row:

```js
{
  id: memberId,          // Member.id, NOT Enrollment.id
  name: e.subscriber?.name,
  position: e.group_position_number,
  has_won: !!winData,
  won_month: ...
}
```

There's no `enrollment_id` anywhere in this response. The frontend has no choice but to use
`m.id` as the value for step 2's selection, which means it's silently passing a **member
id** to a filter that expects an **enrollment id**. Since `Member.id` and `Enrollment.id`
are different UUID spaces, `chits-installment/get-by-group` never finds a matching
enrollment, and step 3 always renders "No pending installments for this member" — the
entire direct-payment flow is currently non-functional end-to-end, not because of a
frontend bug, but because the data needed to wire steps 2 and 3 together isn't in the
response.

(Also, purely cosmetic on top of that: the response doesn't have a `subscriber` object at
all, and the frontend's field names have been corrected to read `m.name`/`m.position`
directly rather than `m.subscriber?.name`/`m.group_position_number` — that part's fixed on
the frontend side already.)

**Fix:** add `enrollment_id: e.id` to the mapped object in `getGroupMembersService`
(`src/services/adminService.js`, the `enrollments.map(e => ({...}))` block around line
1362) — a small, additive, backward-compatible change; nothing else consuming this endpoint
needs to change.

---

## 🔴 New (found 2026-07-23) — `group/members` silently caps at 10 members, no pagination from the frontend

Independent of the `enrollment_id` gap above — found while re-verifying this screen.

```js
// getGroupMembersService, adminService.js:1333-1336
const getGroupMembersService = async (res, company_id, group_id, min, max) => {
  const limit = parseInt(max, 10) || 10;   // defaults to 10 if max isn't passed
  const offset = parseInt(min, 10) || 0;
```

`member-receipts/page.jsx`'s call to this endpoint sends no `min`/`max` at all:
```js
const res = await apiClient.post(ENDPOINTS.CHITS.GET_MEMBERS, { group_id: groupId });
```

So every call defaults to `max = 10`, and the frontend has no pagination UI for this
picker — it just renders whatever comes back. For any chit group with more than 10
enrolled members (the domain norm — most schemes run 11 to 25+ members, per
`docs/CHIT_FUND_DOMAIN_REFERENCE.md`), **members past position 10 never appear in the
Step 2 dropdown at all**, with no indication to the admin that the list is truncated. An
admin trying to record a direct payment for, say, position #15 in a 20-member group
currently cannot do so through this screen — that member simply isn't selectable.

**Fix:** either raise the default (this is an internal admin picker, not a paginated public
list — a group's member picker realistically never needs server-side paging; consider
defaulting `max` much higher, e.g. 200, or removing the cap for this specific call path),
or have the frontend explicitly request a high `max` since it's rendering a single-page
dropdown, not a paginated table. Recommend the backend default change since it protects
every current and future caller of this endpoint, not just this one screen.

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| 1 | `node -e "require('./src/validations/adminValidation')"` | Loads without throwing |
| 2 | Server boots, `/api/admin/login` responds | No crash on startup |
| 3 | Log in as company admin, record a direct payment | Succeeds |
| 4 | Company A staff attempts an installment id belonging to Company B | 403 |
| 5 | Company A admin loads Collections Verification | Only Company A's submissions |
| 6 | `group/members` response for any group | Each row includes `enrollment_id` |
| 7 | Full direct-payment flow: pick group → pick member → pick pending installment → submit | Step 3 actually shows that member's pending installments, not an empty state |
| 8 | `group/members` for a group with more than 10 enrolled members | All members returned, not just the first 10 |
