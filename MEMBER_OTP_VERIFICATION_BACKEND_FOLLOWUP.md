# Member OTP Verification — Backend Follow-Up + Next Phase

**For the backend team.** Reviewed `3620172` ("verification otp added") against
`docs/MEMBER_OTP_VERIFICATION_BACKEND_SPEC.md`. The structure is right — migration,
model columns, routes, and the enrollment guard all match the spec exactly, and the
cooldown/lockout logic in `verifyMemberOtpService` is correctly implemented (nice reuse
of `verification_otp_expires_at` to also enforce the 15-minute lockout after 3 failed
attempts).

**Decision on the hardcoded OTP:** confirmed — `const otp = '123456';`
(`adminService.js:3557`) stays as-is for now, deliberately, until real SMS credentials
are available to wire a provider. Not a bug, not something to fix in this pass. When
credentials arrive, swapping it is a one-line change (`String(Math.floor(100000 +
Math.random() * 900000))`) in the same spot — the surrounding cooldown/lockout/expiry
logic doesn't need to change at all, it already operates on whatever value is in
`verification_otp` regardless of how it was generated. Flagging this explicitly so it
isn't mistaken for "done" later — the feature currently provides no real verification
security by design, only structural correctness, until that swap happens.

One required fix remains.

---

## Required fix — `verification_otp` leaks through the member list/detail endpoints

`getAllMemberDetailsService` (`adminService.js:294`) and the `get-by-id` equivalent call
`Member.findAndCountAll`/`findByPk` with no `attributes` restriction, so `member/get-all`
and `member/get-by-id` currently return the raw `verification_otp`,
`verification_otp_expires_at`, and `verification_otp_attempts` columns to the frontend.

This matters independently of the OTP being static or dynamic: once it's real, this lets
the admin read the OTP straight off the member list/detail screen instead of actually
calling the member and asking for it — defeating the phone-verification model a different
way than the hardcoded value does. Worth fixing now rather than after the dynamic swap, so
it isn't forgotten. Add an exclusion:

```js
Member.findAndCountAll({
  ...,
  attributes: { exclude: ['verification_otp', 'verification_otp_expires_at', 'verification_otp_attempts', 'other_info_user_password'] },
  ...
})
```

Apply the same exclusion to `getMemberByIdService`. (`other_info_user_password` is
included in that exclusion list too — it's a pre-existing leak, predates this feature,
not something this commit introduced, but it's the same one-line fix in the same spot, so
worth doing while you're touching this query. Not blocking if you'd rather track it
separately — your call.)

---

## What's confirmed correct — no changes needed

- Migration + model columns (`is_verified`, `verification_otp`,
  `verification_otp_expires_at`, `verification_otp_attempts`) — exact match to spec.
- Routes (`member/verification/send-otp`, `member/verification/verify-otp`) — correctly
  authenticated and validated.
- Resend cooldown (60s, via the `diffMs > 4 minutes` check) — correct.
- Attempt lockout (3 wrong guesses → 15-minute lockout, enforced via the shared expiry
  field blocking both verify and resend) — correct, cleaner than what the spec suggested.
- Expiry check on verify — correct, doesn't count an expired OTP as a wrong attempt.
- Success path clears all three OTP fields and sets `is_verified: true` — correct.
- Enrollment guard in `storeOrUpdateEnrollmentService` — exact match to spec.
- The static OTP decision (see above) — deliberate, not a defect.

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| Fix | `member/get-all` response | No `verification_otp`, `verification_otp_expires_at`, or `verification_otp_attempts` field on any row |
| Fix | `member/get-by-id` response | Same exclusion |
| Regression | Send OTP / verify OTP flow end-to-end | Still works identically — the exclusion only affects list/detail reads, not the verification endpoints themselves |

---

## Next phase

Once the one fix above lands, this thread is closed on the backend side (the static OTP
is an accepted, tracked, temporary state — not open work). Two things to know about for
what comes after:

1. **Whenever real SMS credentials land:** the swap is exactly the one line described
   above, plus wiring whatever `sendSms(mobile, message)` call the provider needs where
   the `console.log('[SMS MOCK]...')` line is today. No structural changes required — flag
   it to us when you're ready and we'll close the loop on the message template wording
   (`docs/MEMBER_OTP_VERIFICATION_BACKEND_SPEC.md` §4 has the draft copy).
2. **Staff Module / RBAC (FRS Section 14)** is the next unstarted feature area from the
   original request list — still no role/permission models in the codebase. The
   `requireRole` middleware idea noted as non-blocking in the auction-winner Phase 4
   follow-up (`docs/AUCTION_WINNER_BACKEND_FIXES_NEXT_PHASE.md`) is a natural first
   building block for that, whenever it's picked up — no spec written yet, we'll produce
   one when you're ready to start.
