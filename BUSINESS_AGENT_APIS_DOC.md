# Business Agent Commission & Referral Module - Frontend API Documentation

This document provides the complete API reference and integration details for the 4 Business Agent mobile/web screens.

---

## Screen Overview & Route Mapping

You can use either the **User Route** (recommended for mobile/user app) or the **Admin Route** (for admin web portals). Both endpoints accept identical payloads and return identical response structures:

| Screen # | Screen Description | User / App Endpoint | Admin Endpoint | Method |
| :--- | :--- | :--- | :--- | :---: |
| **Screen 1** | **Business Agent Dashboard** (4 KPI cards + Chit-wise list + Suggested members) | `/api/user/business-agent/summary` | `/api/configure-business-agent-commission/summary-by-agent` | `POST` |
| **Screen 2** | **Chit-wise Detail** (Chit group header + member referrals in that group) | `/api/user/business-agent/members-by-group` | `/api/history-business-agent/history-by-group-id` | `POST` |
| **Screen 3** | **Member-wise Detail** (Member profile header + chit groups joined by that member) | `/api/user/business-agent/chits-by-member` | `/api/member/businesslist-under-members` | `POST` |
| **Screen 4** | **Chit Details & Transaction History** (Referral card + payout payment history & proofs) | `/api/user/business-agent/chit-detail` | `/api/configure-business-agent-commission/chit-detail` | `POST` |

---

## Payout Status Integer Codes

The field `payout_status` is returned as an **integer** in all responses:

| `payout_status` (Integer) | Meaning | Calculation Condition | UI Badge Color Suggestion |
| :---: | :--- | :--- | :--- |
| **`1`** | **Paid** (Full payout completed) | `total_paid > 0 && total_pending === 0` | 🟢 Green (`#4CAF50` / `#E8F5E9`) |
| **`2`** | **Partial payout** (Partially paid) | `total_paid > 0 && total_pending > 0` | 🟠 Orange (`#FF9800` / `#FFF3E0`) |
| **`3`** | **Pending** (No payment made yet) | `total_paid === 0` | ⚪ Grey / Light Red (`#757575` / `#FFEBEE`) |

---

## Authentication & Headers
```http
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```
*(When called by a logged-in Member / Business Agent, the backend automatically extracts `business_agent_id` from their JWT token.)*

---

# 1️⃣ Screen 1: Business Agent Dashboard

Provides clean data containing:
1. `summary` (4 top KPI cards: `total_commission`, `paid_commission`, `pending_commission`, `member_joined`)
2. `chit_wise_commission` (Chit-wise commission list)
3. `members_you_have_suggested` (List of suggested members)

### 📍 Endpoint
- **URL (App):** `POST /api/user/business-agent/summary`  
  *(Admin URL: `POST /api/configure-business-agent-commission/summary-by-agent`)*
- **Method:** `POST`

### 📥 Request Payload (Optional)
```json
{
  "min": 0,
  "max": 10
}
```
*(Admin portal: can also pass `"business_agent_id": 25`)*

### 📤 Response Payload (`200 OK`)
```json
{
  "status": 1,
  "message": "Summary retrieved successfully",
  "data": {
    "summary": {
      "total_commission": 55000,
      "paid_commission": 52000,
      "pending_commission": 3000,
      "member_joined": 4
    },
    "chit_wise_commission": [
      {
        "group_id": "96de0013-caca-4fb3-bbda-9226186b0d84",
        "group_name": "bona 35 L",
        "chit_amount": 100000,
        "commission": 55000,
        "total_received": 52000,
        "total_pending": 3000,
        "payout_status": 2,
        "last_received_on": "23/07/2026",
        "members_count": 2
      }
    ],
    "members_you_have_suggested": [
      {
        "member_id": 52,
        "user_code": "667606",
        "name": "Swathi",
        "initial": "S",
        "profile_image": null,
        "commission": 5000,
        "received": 2000,
        "pending": 3000,
        "payout_status": 2,
        "joined_on": "12/07/2026",
        "groups_count": 1
      },
      {
        "member_id": 53,
        "user_code": "227975",
        "name": "Tulasi",
        "initial": "T",
        "profile_image": null,
        "commission": 50000,
        "received": 50000,
        "pending": 0,
        "payout_status": 1,
        "joined_on": "12/07/2026",
        "groups_count": 1
      },
      {
        "member_id": 49,
        "user_code": "774197",
        "name": "Afzal",
        "initial": "A",
        "profile_image": null,
        "commission": 0,
        "received": 0,
        "pending": 0,
        "payout_status": 3,
        "joined_on": "12/07/2026",
        "groups_count": 1
      },
      {
        "member_id": 48,
        "user_code": "923856",
        "name": "Gopala",
        "initial": "G",
        "profile_image": null,
        "commission": 0,
        "received": 0,
        "pending": 0,
        "payout_status": 3,
        "joined_on": "12/07/2026",
        "groups_count": 1
      }
    ]
  }
}
```

---

# 2️⃣ Screen 2: Chit-Wise Detail (Members in Group)

Displays group details at the top header and all member referrals enrolled in that chit group. Clicking a member item navigates to Screen 4 (Chit Details).

### 📍 Endpoint
- **URL (App):** `POST /api/user/business-agent/members-by-group`  
  *(Admin URL: `POST /api/history-business-agent/history-by-group-id`)*
- **Method:** `POST`

### 📥 Request Payload
```json
{
  "group_id": "96de0013-caca-4fb3-bbda-9226186b0d84",
  "min": 0,
  "max": 10
}
```

### 📤 Response Payload (`200 OK`)
```json
{
  "status": 1,
  "message": "Members in group retrieved successfully",
  "data": {
    "group_id": "96de0013-caca-4fb3-bbda-9226186b0d84",
    "group_name": "bona 35 L",
    "chit_amount": 100000,
    "group_status": 1,
    "members": [
      {
        "configure_business_agent_id": "1b104688-b000-4472-808b-f0f8c3d402fa",
        "member_id": 52,
        "name": "Swathi",
        "user_code": "667606",
        "profile_image": null,
        "mobile_number": "9876543210",
        "commission_amount": 5000,
        "total_paid": 2000,
        "total_pending": 3000,
        "payout_status": 2,
        "upload_document": "/uploads/document-1784827245880-178626244.pdf"
      }
    ],
    "count": 1
  }
}
```

---

# 3️⃣ Screen 3: Member-Wise Detail (Chits for Member)

Displays member profile header and all chit groups that specific member joined under this agent. Clicking a chit item navigates to Screen 4 (Chit Details).

### 📍 Endpoint
- **URL (App):** `POST /api/user/business-agent/chits-by-member`  
  *(Admin URL: `POST /api/member/businesslist-under-members`)*
- **Method:** `POST`

### 📥 Request Payload
```json
{
  "member_id": 52,
  "min": 0,
  "max": 10
}
```

### 📤 Response Payload (`200 OK`)
```json
{
  "status": 1,
  "message": "Chit groups for member retrieved successfully",
  "data": {
    "member": {
      "id": 52,
      "name": "Swathi",
      "user_code": "667606",
      "mobile_number": "9876543210",
      "profile_image": null
    },
    "chit_groups": [
      {
        "configure_business_agent_id": "1b104688-b000-4472-808b-f0f8c3d402fa",
        "group_id": "96de0013-caca-4fb3-bbda-9226186b0d84",
        "group_name": "bona 35 L",
        "chit_amount": 100000,
        "commission_amount": 5000,
        "total_paid": 2000,
        "total_pending": 3000,
        "payout_status": 2
      }
    ],
    "count": 1
  }
}
```

---

# 4️⃣ Screen 4: Chit Details & Transaction History

Displays detailed referral card (Chit Name, Total Commission, Paid, Pending, Member Info, Payout Status integer badge) and the complete history of payments received with proof attachments.

### 📍 Endpoint
- **URL (App):** `POST /api/user/business-agent/chit-detail`  
  *(Admin URL: `POST /api/configure-business-agent-commission/chit-detail`)*
- **Method:** `POST`

### 📥 Request Payload
Pass either `configure_business_agent_id` OR both `group_id` and `member_id`:

**Option A (by config ID):**
```json
{
  "configure_business_agent_id": "1b104688-b000-4472-808b-f0f8c3d402fa"
}
```

**Option B (by group & member IDs):**
```json
{
  "group_id": "96de0013-caca-4fb3-bbda-9226186b0d84",
  "member_id": 52
}
```

### 📤 Response Payload (`200 OK`)
```json
{
  "status": 1,
  "message": "Chit detail retrieved successfully",
  "data": {
    "configure_business_agent_id": "1b104688-b000-4472-808b-f0f8c3d402fa",
    "group_id": "96de0013-caca-4fb3-bbda-9226186b0d84",
    "group_name": "bona 35 L",
    "chit_amount": 100000,
    "commission_amount": 5000,
    "total_paid": 2000,
    "total_pending": 3000,
    "payout_status": 2,
    "member": {
      "id": 52,
      "name": "Swathi",
      "user_code": "667606",
      "mobile_number": "9876543210",
      "profile_image": null
    },
    "transaction_history": [
      {
        "id": "e49e4eb3-32fd-49e8-9f17-30df1234fbf8",
        "paid_amount": 2000,
        "payment_date": "23/07/2026",
        "created_at": "2026-07-23T18:02:13.630Z",
        "description": "Initial payout",
        "upload_document": "/uploads/document-1784827245880-178626244.pdf",
        "has_attached_proof": true,
        "attached_proof_url": "/uploads/document-1784827245880-178626244.pdf"
      }
    ]
  }
}
```
