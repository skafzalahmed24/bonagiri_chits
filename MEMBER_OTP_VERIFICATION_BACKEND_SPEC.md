# Member OTP Verification — Backend Spec

**For the backend team.** Implements FRS Section 3.3 — after a member is
registered, they're **Unverified** until an admin triggers an SMS OTP
challenge that also confirms the member has read the Terms & Conditions. An
unverified member cannot be enrolled in any chit group.

Companion doc for Antigravity: `docs/MEMBER_OTP_VERIFICATION_FRONTEND_IMPLEMENTATION.md`.

---

## Why this can't reuse the existing `mobile_otp` field

`Member` already has a `mobile_otp` column, used today by
`forgotPasswordService`/`verifyOtpService`/`resetPasswordService`
(`adminService.js:118-168`) for **password recovery**. Do not reuse it for
verification — two different flows writing to the same column race:

- A member requesting a password reset while an admin is mid-verification
  overwrites the admin's in-progress OTP (or vice versa).
- A member could use whichever OTP arrives last to satisfy either flow,
  since both check the same field.

This spec adds **dedicated columns**, scoped only to verification.

Also worth knowing (not in scope to fix here, flagging so it's not a
surprise): the existing password-recovery flow hardcodes the OTP to
`'123456'` (`adminService.js:126`, comment "Default as per request") and
never actually sends an SMS — no expiry, no attempt limit either. **Do not
copy that pattern for this feature.** Identity verification is the whole
point of this ask; a hardcoded OTP defeats it. See "SMS sending" below.

---

## 1. Data model — `Member` (migration + model update)

Add four columns to `member`:

| Column | Type | Default | Purpose |
|---|---|---|---|
| `is_verified` | BOOLEAN | `false` | The verification status itself |
| `verification_otp` | STRING | `null` | Hashed or plain 6-digit OTP (see note below) |
| `verification_otp_expires_at` | DATE | `null` | 5 minutes from send |
| `verification_otp_attempts` | INTEGER | `0` | Reset to 0 on each new send; incremented on each failed verify |

```js
// migration
await queryInterface.addColumn('member', 'is_verified', { type: Sequelize.BOOLEAN, defaultValue: false, allowNull: false });
await queryInterface.addColumn('member', 'verification_otp', { type: Sequelize.STRING, allowNull: true });
await queryInterface.addColumn('member', 'verification_otp_expires_at', { type: Sequelize.DATE, allowNull: true });
await queryInterface.addColumn('member', 'verification_otp_attempts', { type: Sequelize.INTEGER, defaultValue: 0, allowNull: true });
```

Mirror these in `models/member.js`'s `Member.init({...})`.

**Existing members (already in the DB before this migration ships):** default
`is_verified` to `false` for everyone — don't try to backfill `true` based on
any heuristic. The admin re-verifies existing members the same way as new
ones; this is a one-time, deliberately manual step, not a data migration
problem.

**No new endpoint needed for read access** — `getAllMemberDetailsService`
and `getMemberByIdService` both return `member.toJSON()` / full model
attributes already (`adminService.js:291`, `:2920`), so `is_verified` shows
up in `member/get-all` and `member/get-by-id` automatically once the column
exists. No service code changes needed there.

---

## 2. `member/verification/send-otp` (new endpoint, admin auth)

**Request:** `{ member_id }` (the `member.id` PK, not `member_id` the
display string).

**Server logic:**

1. Load the member. 404 if not found or `is_deleted_status !== 0`.
2. **Resend cooldown:** if `verification_otp_expires_at` is set and less than
   4 minutes old (i.e. the previous OTP was sent under 60 seconds ago —
   `expires_at - now < 4 minutes` given a 5-minute expiry), reject with a
   clear "Please wait before requesting another OTP" message. Don't rely on
   the frontend's countdown alone; this must hold server-side too.
3. Generate a **real random 6-digit OTP** — `Math.floor(100000 + Math.random() * 900000)` is fine for this purpose (not a cryptographic secret, just enough to prevent guessing within the attempt limit).
4. Set `verification_otp`, `verification_otp_expires_at = now + 5 minutes`, `verification_otp_attempts = 0`.
5. Send the SMS (see below). If sending fails, roll back the OTP fields and
   return an error — don't leave a live OTP the member never received.
6. Return success — **do not include the OTP in the response body.** It goes
   out over SMS only; the admin reads it back from the member, not from the
   API response.

**Response:** `{ member_id, mobile_number_masked: "98xxxxxx10" }` (masked, so
the admin UI can confirm which number the SMS went to without exposing the
full number back through the same channel that already has it — minor
hygiene, not critical).

---

## 3. `member/verification/verify-otp` (new endpoint, admin auth)

**Request:** `{ member_id, otp }`

**Server logic, in order:**

1. Load the member. 404 if not found.
2. If `verification_otp` is null → "No OTP has been sent for this member."
3. If `verification_otp_attempts >= 3` → reject with a 15-minute lockout
   message, regardless of whether this attempt's OTP is correct. Track the
   lockout via `verification_otp_expires_at` (if attempts hit 3, treat the
   OTP as dead until 15 minutes after the *original* send, not a rolling
   window per attempt — simplest: once attempts hits 3, force the caller to
   request a fresh OTP after the cooldown, rather than building a separate
   lockout timestamp).
4. If `new Date() > verification_otp_expires_at` → "OTP has expired, please
   resend." (Do not increment attempts for an expired OTP — that's not a
   guessing attempt.)
5. If `otp !== verification_otp` → increment `verification_otp_attempts`,
   reject with "Invalid OTP" (include remaining-attempts count in the
   message if easy, e.g. "Invalid OTP, 2 attempts remaining").
6. On match: set `is_verified = true`, clear `verification_otp`,
   `verification_otp_expires_at`, `verification_otp_attempts` back to
   defaults.

**Response:** `{ member_id, is_verified: true }`.

---

## 4. SMS sending — the one piece that needs a real decision

There is currently **no SMS gateway integration anywhere in this codebase**
(checked `src/utils/` and `package.json` — nothing). The existing
password-recovery OTP flow ships with a `TODO: Call sendMesageOtpMobile(...)
if implemented` comment that was never implemented.

For this feature to actually do what it's for, it needs a working SMS send.
Two ways to proceed — tell us which and we'll adjust the doc:

- **(a) Wire a real provider now** (MSG91, Twilio, etc. — whatever the
  company already has an account with, if any). Add a
  `src/utils/smsHelper.js` exporting `sendSms(mobileNumber, message)`, called
  from step 5 of `send-otp`. This is the only way the feature is actually
  usable by an admin talking to a member on the phone.
- **(b) Ship without a real send for now, but be explicit about it** — log
  the OTP to the server console/logs (never return it in the API response)
  so it's usable in a dev/staging environment, and flag clearly in the
  response or a status field that SMS delivery isn't wired yet. This lets
  the frontend and the rest of the flow get built and tested end-to-end
  while the actual SMS account/provider decision happens separately.

Either way, **do not silently hardcode a fixed OTP value** the way
`forgotPasswordService` does — that pattern means anyone who knows the
convention can "verify" any member without ever touching their phone, which
defeats the entire point of this feature (confirming the admin actually
reached the member and the member actually read the T&Cs).

**SMS message template** (once wired):
```
Dear {name}, your OTP for Bonagiri Chits verification is {otp}. Please read our Terms & Conditions: {tnc_link}. Valid for 5 minutes.
```
`{tnc_link}` should point to the public Terms & Conditions page — confirm the
exact public URL with the frontend team (they'll have the route in their
implementation doc).

---

## 5. Enrollment guard — block unverified members server-side too

The frontend will filter unverified members out of the Subscriber dropdown
(defense in depth is still needed — the API shouldn't trust the client to
have filtered correctly). In `storeOrUpdateEnrollmentService`
(`adminService.js:935`), on the **create** path (no existing enrollment
`id`), before creating the record:

```js
const subscriber = await Member.findByPk(data.subscriber_id);
if (!subscriber || !subscriber.is_verified) {
  return errorResponse(res, statusCodes.BAD_REQUEST, 'Subscriber must be verified before enrollment');
}
```

Matches the FRS's explicit validation rule ("Subscriber must be registered
in Member Master" — extend that to "and verified").

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| Send | Send OTP for a member with a valid mobile number | New random OTP generated, 5-min expiry set, SMS sent (or logged, per whichever option (a)/(b) is chosen) |
| Send | Send OTP again within 60s of the last send | Rejected with cooldown message |
| Verify | Correct OTP within 5 minutes | `is_verified = true`, OTP fields cleared |
| Verify | Wrong OTP | Rejected, `verification_otp_attempts` incremented, member stays unverified |
| Verify | 4th attempt after 3 wrong guesses | Rejected regardless of correctness, must request a fresh OTP |
| Verify | Correct OTP after expiry (>5 min) | Rejected as expired, not counted as a wrong attempt |
| Enroll | Attempt to enroll an unverified member via the API directly (bypassing frontend) | Rejected, "Subscriber must be verified before enrollment" |
| List | `member/get-all` after the migration | Every row includes `is_verified` with no service code changes |
