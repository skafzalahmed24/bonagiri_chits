# Enrollment into an Already-Started Group Never Generates Installments — Backend Spec

**Found 2026-07-30**, reported live: a member ("chit test4", Swathi, Ticket #3) who hasn't paid
anything shows "No pending installments for this member" on the Direct Payment screen — should
show all her installments as pending, not zero of them.

## Root cause

`createInstallaments` (`adminService.js`) is only ever called from three places, all group-level
actions:

| Call site | Trigger |
|---|---|
| `adminService.js:725` | `storeOrUpdateChitsGroupService` — updating an existing group |
| `adminService.js:791` | `storeOrUpdateChitsGroupService` — creating a new group |
| `adminService.js:885` | `updateChitsGroupStatusService` — explicit "Start Group" action |

`storeOrUpdateEnrollmentService` (`adminService.js:1116-1145`) — the function that actually adds a
member to a group — **never calls `createInstallaments` at all**, in either its create or update
branch. `createInstallaments` itself already correctly skips any enrollment that already has
installment rows (`adminService.js:631-632`, `if (existingInstallmentRecord) continue;`), so it's
safe to call broadly — the gap is purely that nothing ever calls it again after a group is already
running.

**Net effect**: enrolling a new member into a group that's already been started
(`chits_group_status === 1`) leaves that member with zero `ChitsInstallment` rows, permanently,
unless the group happens to get updated again for some unrelated reason afterward (which would
incidentally trigger `createInstallaments` and backfill them). Enrolling before the group starts is
unaffected — the "Start Group" action's `createInstallaments` call covers everyone enrolled by then.

## Fix

In `storeOrUpdateEnrollmentService`'s create branch (`adminService.js:1125-1139`), after creating
the enrollment, call `createInstallaments` if the group is already started. The group is already
being fetched a few lines later for the push notification (`adminService.js:1134`) — move that
fetch earlier and reuse it:
```js
const newEnrollment = await Enrollment.create(enrollmentData);
await checkAndUpdateChitFullStatus(newEnrollment.group_id);

const chitGroup = await ChitsGroup.findByPk(newEnrollment.group_id);
if (chitGroup && Number(chitGroup.chits_group_status) === 1) {
  await createInstallaments(newEnrollment.group_id, chitGroup.chits_group_status);
}

// Send push notification
if (subscriber && chitGroup) {
  fcmService.sendPushToMember(subscriber, 'Enrolled Successfully', `You have been successfully enrolled in Chit Group: ${chitGroup.chit_group_name}`, { type: 'ENROLLMENT', group_id: String(newEnrollment.group_id) });
}
```

## Remediation for already-affected enrollments

Any member enrolled into an already-started group before this fix ships has no installment rows at
all today. Find them:
```sql
SELECT e.id AS enrollment_id, e.subscriber_id, e.group_id, m.name, cg.group_name, cg.chits_group_status
FROM enrollments e
JOIN chits_groups cg ON cg.id = e.group_id
JOIN members m ON m.id = e.subscriber_id
LEFT JOIN chits_installments ci ON ci.enrollment_id = e.id
WHERE cg.chits_group_status = 1 AND e.delete_status = 0 AND ci.id IS NULL;
```
For each group returned, re-running `createInstallaments(group_id, 1)` will safely backfill only
the missing enrollments (existing members' installments are untouched, per the existing skip
check) — this can be done via a one-off script or by simply re-saving each affected group through
the normal update path, since that already calls `createInstallaments`.

## Verification checklist

| # | Test | Expected |
|---|---|---|
| 1 | Enroll a new member into a group that hasn't started yet | Unaffected — installments generated normally when the group starts, as today |
| 2 | Enroll a new member into an **already-started** group | Installments generated immediately for that member, matching the group's existing schedule |
| 3 | Run the remediation query against current data | Confirms which enrollments are currently missing installments (should include Swathi's "chit test4" enrollment) |
| 4 | Re-run `createInstallaments` for an affected group | Only the missing enrollments get installments created; existing members' rows are untouched |
