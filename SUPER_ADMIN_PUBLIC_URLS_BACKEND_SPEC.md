# Super Admin & Public URLs — Backend Spec

**For the backend team (Antigravity).**
Covers three new features added to the frontend in this sprint:

1. **Super Admin — Terms & Privacy** (platform-level, no company scope)
2. **Super Admin — Support Page** (platform-level Contact Info + FAQs)
3. **Public — Delete Account** (Android app WebView flow)

All URLs are already wired in the frontend. Backend only needs to implement
the endpoints listed here. No frontend changes are required after this.

---

## Overview

| # | Frontend route | Audience | Auth |
|---|---|---|---|
| 1a | `/super-admin/terms-privacy` | Super admin | Super admin Bearer token |
| 1b | `/super-admin/support` | Super admin | Super admin Bearer token |
| 2 | `/support` | Public (Android WebView) | Default API token |
| 3 | `/delete-account` | Public (Android WebView) | Default API token |

---

## Part 1 — Super Admin: Terms & Privacy

### What it does
The super admin edits **platform-level** Terms and Conditions and Privacy Policy
content. This is separate from company-level terms (which are managed in the
company-admin panel). The frontend calls these with the super admin Bearer token.

### 1.1 `POST super-admin/terms-privacy/get`

**Auth:** `authenticateSuperAdminToken` (same middleware used by other super-admin routes)

**Request body:**
```json
{ "type": 1 }
```

`type` values:
- `1` = Terms and Conditions
- `2` = Privacy Policy

**Response (success):**
```json
{
  "status": 1,
  "message": "Success",
  "data": {
    "id": 1,
    "type": 1,
    "content": "<h1>Terms and Conditions</h1><p>...</p>"
  }
}
```

**Response (not set yet — return empty, not 404):**
```json
{
  "status": 1,
  "message": "Success",
  "data": { "type": 1, "content": "" }
}
```

**DB table:** `platform_terms_privacy` (new table — see schema below)

---

### 1.2 `POST super-admin/terms-privacy/store-or-update`

**Auth:** `authenticateSuperAdminToken`

**Request body:**
```json
{ "type": 1, "content": "<h1>Terms...</h1>" }
```

**Behaviour:** upsert — if a row with `type = 1` exists, update it; otherwise insert.

**Response (success):**
```json
{
  "status": 1,
  "message": "Document updated successfully",
  "data": { "id": 1, "type": 1, "content": "..." }
}
```

---

### DB schema — `platform_terms_privacy`

```sql
CREATE TABLE platform_terms_privacy (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  type       TINYINT      NOT NULL UNIQUE,   -- 1 = Terms, 2 = Privacy
  content    LONGTEXT     NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

> **Why a new table?** The existing `terms_privacy` table is scoped by `company_id`.
> Platform-level content has no company. Mixing them with a nullable `company_id`
> causes ambiguity — a separate table is cleaner.

---

## Part 2 — Super Admin: Support Page (Contact Info + FAQs)

### What it does
The super admin sets platform-wide contact information and FAQs that appear on
the public `/support` page (opened by the Android app). No company scope.

---

### 2.1 `POST super-admin/support/contact/get`

**Auth:** `authenticateSuperAdminToken`

**Request body:** `{}` (empty)

**Response (success):**
```json
{
  "status": 1,
  "message": "Success",
  "data": {
    "id": 1,
    "address": "Bonagiri Chits HQ, Vijayawada, AP",
    "phone_numbers": ["+91 9876543210", "+91 8765432109"],
    "emails": ["support@bonagiri.com"],
    "website_link": "https://bonagiri.com",
    "social_media_links": {
      "facebook": "https://facebook.com/bonagiri",
      "twitter": null,
      "instagram": null,
      "linkedin": null
    }
  }
}
```

**Response (not set yet):**
```json
{ "status": 1, "message": "Success", "data": null }
```

---

### 2.2 `POST super-admin/support/contact/store-or-update`

**Auth:** `authenticateSuperAdminToken`

**Request body:**
```json
{
  "id": 1,
  "address": "Bonagiri Chits HQ, Vijayawada, AP",
  "phone_numbers": ["+91 9876543210"],
  "emails": ["support@bonagiri.com"],
  "website_link": "https://bonagiri.com",
  "social_media_links": {
    "facebook": "https://facebook.com/bonagiri",
    "twitter": null,
    "instagram": null,
    "linkedin": null
  }
}
```

`id` is optional — omit on first save, include on subsequent updates.

**Behaviour:** upsert on `id`. Since there is only one platform-level contact record,
you can also upsert on a fixed row — just make sure only one record exists.

**Response:**
```json
{
  "status": 1,
  "message": "Contact information saved",
  "data": { "id": 1, ... }
}
```

---

### 2.3 `POST super-admin/support/faq/get-all`

**Auth:** `authenticateSuperAdminToken`

**Request body:** `{}` (empty — no pagination filters needed for super admin)

**Response:**
```json
{
  "status": 1,
  "message": "Success",
  "data": {
    "count": 3,
    "rows": [
      { "id": 1, "question": "How does the bidding work?", "answer": "..." },
      { "id": 2, "question": "When is the dividend paid?", "answer": "..." }
    ]
  }
}
```

---

### 2.4 `POST super-admin/support/faq/store-or-update`

**Auth:** `authenticateSuperAdminToken`

**Request body (create — no `id`):**
```json
{ "question": "How does the bidding work?", "answer": "The highest bidder wins..." }
```

**Request body (update — include `id`):**
```json
{ "id": 1, "question": "How does bidding work?", "answer": "Updated answer..." }
```

**Response:**
```json
{
  "status": 1,
  "message": "FAQ created",
  "data": { "id": 1, "question": "...", "answer": "..." }
}
```

---

### 2.5 `POST super-admin/support/faq/delete`

**Auth:** `authenticateSuperAdminToken`

**Request body:**
```json
{ "id": 1 }
```

**Response:**
```json
{ "status": 1, "message": "FAQ deleted", "data": null }
```

---

### DB schema — `platform_support_contact`

```sql
CREATE TABLE platform_support_contact (
  id                  INT       AUTO_INCREMENT PRIMARY KEY,
  address             TEXT,
  phone_numbers       JSON,     -- array of strings e.g. ["+91 9876543210"]
  emails              JSON,     -- array of strings
  website_link        VARCHAR(500),
  social_media_links  JSON,     -- { facebook, twitter, instagram, linkedin }
  created_at          DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### DB schema — `platform_support_faq`

```sql
CREATE TABLE platform_support_faq (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  question   VARCHAR(500) NOT NULL,
  answer     TEXT         NOT NULL,
  sort_order INT          DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## Part 3 — Public: Support Page

### What it does
The Android app opens `/support` in a WebView. This page calls
`public/support` to fetch the contact info and FAQs set by the super admin
(Part 2 above). **No company ID. No authentication token.** Uses the default
API token (same as login endpoints).

---

### 3.1 `POST public/support`

**Auth:** `authenticateDefaultToken` (the same middleware used by `user/login`)

**Request body:** `{}` (empty)

**Response:**
```json
{
  "status": 1,
  "message": "Success",
  "data": {
    "contact": {
      "id": 1,
      "address": "Bonagiri Chits HQ, Vijayawada, AP",
      "phone_numbers": ["+91 9876543210"],
      "emails": ["support@bonagiri.com"],
      "website_link": "https://bonagiri.com",
      "social_media_links": {
        "facebook": "https://facebook.com/bonagiri",
        "twitter": null,
        "instagram": null,
        "linkedin": null
      }
    },
    "faqs": [
      { "id": 1, "question": "How does the bidding work?", "answer": "..." },
      { "id": 2, "question": "When is the dividend paid?", "answer": "..." }
    ]
  }
}
```

**When no data is set yet:**
```json
{
  "status": 1,
  "message": "Success",
  "data": { "contact": null, "faqs": [] }
}
```

> Just read from `platform_support_contact` and `platform_support_faq` tables
> and return them together. No filtering, no company scope.

---

## Part 4 — Public: Delete Account

### Background
Google Play Store requires apps to provide a way for users to request account
deletion. We satisfy this by providing a web URL that the Android app opens
in an in-app browser.

**Important:** We do NOT actually delete the member record. Chit fund regulations
(Chit Funds Act 1982, RBI guidelines) require financial records to be preserved.
Instead, we **disable login access** by setting `is_active = false` (or equivalent)
on the **member** record for that specific company. A member who belongs to multiple
companies (tenants) is only deactivated for the company whose `user_id` they enter —
their accounts at other companies are unaffected.

The Android app gives users this URL:  `https://<your-domain>/delete-account`

> **Why `user_id` and not `mobile`?** A mobile number can be registered across
> multiple companies. Using the company-specific `user_id` scopes the deletion to
> a single tenant, which is the correct behaviour.

---

### 4.1 `POST member/delete-account/send-otp`

**Auth:** `authenticateDefaultToken`

**Request body:**
```json
{ "user_id": "BNG-00123", "password": "member_password" }
```

`user_id` is the company-specific login ID the member uses to log in (the same
value they enter in the app's login screen — your `user_code` / `member_code`
column, whatever it is called in your schema).

**What it does:**
1. Find member by `user_id` (look up the login-code column, e.g. `user_code`).
2. Verify `password` against the stored hashed password (same bcrypt compare used in login).
3. If credentials are wrong → return error (see below).
4. Generate a 6-digit OTP, set expiry to **10 minutes** from now.
5. Store OTP (do NOT reuse `mobile_otp` — that column is shared with the
   password-reset flow; add a new column or dedicated table — see DB note below).
6. Send OTP via SMS to the mobile number registered for that `user_id`.
7. Return success.

**Response (success):**
```json
{
  "status": 1,
  "message": "OTP sent to your registered mobile number",
  "data": null
}
```

**Response (wrong credentials):**
```json
{
  "status": 0,
  "message": "Incorrect User ID or password. Please try again."
}
```

**Response (account already inactive):**
```json
{
  "status": 0,
  "message": "This account is already deactivated."
}
```

---

### 4.2 `POST member/delete-account/verify`

**Auth:** `authenticateDefaultToken`

**Request body:**
```json
{ "user_id": "BNG-00123", "otp": "482913" }
```

**What it does:**
1. Find member by `user_id`.
2. Check OTP matches and is not expired.
3. If OTP is wrong or expired → return error.
4. Set `is_active = false` on that member record (disables login for this company only).
5. Clear the stored OTP fields.
6. Return success.

**Response (success):**
```json
{
  "status": 1,
  "message": "Account deactivated successfully",
  "data": null
}
```

**Response (wrong OTP):**
```json
{
  "status": 0,
  "message": "Invalid OTP. Please check and try again."
}
```

**Response (OTP expired):**
```json
{
  "status": 0,
  "message": "OTP has expired. Please request a new one."
}
```

---

### DB changes for delete-account OTP

Add two columns to the `member` table (do NOT reuse `mobile_otp` — that column
is shared with the password-reset flow and will conflict):

```sql
ALTER TABLE member
  ADD COLUMN delete_account_otp            VARCHAR(10)  DEFAULT NULL,
  ADD COLUMN delete_account_otp_expires_at DATETIME     DEFAULT NULL;
```

Or store in a separate small table if you prefer:

```sql
CREATE TABLE member_delete_otp (
  id         INT          AUTO_INCREMENT PRIMARY KEY,
  member_id  INT          NOT NULL UNIQUE,
  otp        VARCHAR(10)  NOT NULL,
  expires_at DATETIME     NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (member_id) REFERENCES member(id) ON DELETE CASCADE
);
```

Either approach works. The two-column approach on `member` is simpler.

---

### Login guard — honour `is_active`

After this feature ships, the existing login endpoint (`POST user/login`) must
**check `is_active`** before issuing a token:

```js
if (!member.is_active) {
  return res.json({ status: 0, message: 'Your account has been deactivated. Please contact your branch.' });
}
```

> Check whether `is_active` is already validated in `user/login`. If not, add it
> now — otherwise a deactivated member can still log in by calling the API directly.

---

## Summary — new endpoints checklist

| Endpoint | Auth middleware | DB tables touched |
|---|---|---|
| `POST super-admin/terms-privacy/get` | `authenticateSuperAdminToken` | `platform_terms_privacy` |
| `POST super-admin/terms-privacy/store-or-update` | `authenticateSuperAdminToken` | `platform_terms_privacy` |
| `POST super-admin/support/contact/get` | `authenticateSuperAdminToken` | `platform_support_contact` |
| `POST super-admin/support/contact/store-or-update` | `authenticateSuperAdminToken` | `platform_support_contact` |
| `POST super-admin/support/faq/get-all` | `authenticateSuperAdminToken` | `platform_support_faq` |
| `POST super-admin/support/faq/store-or-update` | `authenticateSuperAdminToken` | `platform_support_faq` |
| `POST super-admin/support/faq/delete` | `authenticateSuperAdminToken` | `platform_support_faq` |
| `POST public/support` | `authenticateDefaultToken` | `platform_support_contact`, `platform_support_faq` (read-only) |
| `POST member/delete-account/send-otp` | `authenticateDefaultToken` | `member` (lookup by `user_id`, OTP write) |
| `POST member/delete-account/verify` | `authenticateDefaultToken` | `member` (`is_active = false` for that user_id) |

**New DB tables to create (migrations):**
- `platform_terms_privacy`
- `platform_support_contact`
- `platform_support_faq`

**Existing table to alter:**
- `member` — add `delete_account_otp` + `delete_account_otp_expires_at` columns

**Existing endpoint to update:**
- `POST user/login` — add `is_active` check if not already present

---

## Notes

- All `status: 0` responses should still return HTTP 200 (matching the existing
  convention used throughout the API — the frontend reads the `status` field).
- OTP expiry for delete-account is **10 minutes** (longer than login OTP since
  the user is navigating a WebView browser flow).
- The `/support` and `/delete-account` pages are completely public — they must
  work without any user session. Use `authenticateDefaultToken`, same as the
  login endpoint.
