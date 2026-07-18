# Bonagiri Chits — Functional Requirements Specification (FRS)

**Version:** 1.0
**Date:** 2026-07-18
**Audience:** Web Frontend, Backend, iOS, Android developers
**Document Owner:** Bonagiri Chits Engineering

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [User Roles & Portals](#2-user-roles--portals)
3. [Authentication & Security](#3-authentication--security)
4. [Admin Module — Masters](#4-admin-module--masters)
5. [Admin Module — Transactions](#5-admin-module--transactions)
6. [Admin Module — Utilities](#6-admin-module--utilities)
7. [Admin Module — Security, Reports, Enquiry, Consolidation](#7-admin-module--security-reports-enquiry-consolidation)
8. [Chit Schemes — Configuration & Business Logic](#8-chit-schemes--configuration--business-logic)
9. [Auction & Winner Recording](#9-auction--winner-recording)
10. [Amount Collection Flow](#10-amount-collection-flow)
11. [Member Portal](#11-member-portal)
12. [Business Agent Portal](#12-business-agent-portal)
13. [Collection Agent Portal](#13-collection-agent-portal)
14. [Staff Module (RBAC)](#14-staff-module-rbac)
15. [Super Admin Portal](#15-super-admin-portal)
16. [Notifications & Communication](#16-notifications--communication)
17. [Data Model Reference](#17-data-model-reference)
18. [Compliance & Legal](#18-compliance--legal)
19. [Platform-Specific Notes](#19-platform-specific-notes)
20. [Glossary](#20-glossary)

---

## 1. Product Overview

### 1.1 Purpose

Bonagiri Chits is a **chit fund management platform** that digitizes the complete lifecycle of chit fund operations — from group creation and member enrollment through monthly auctions/draws, installment collection, payment disbursement, and regulatory reporting.

### 1.2 What is a Chit Fund?

A chit fund is a **savings-cum-credit** financial instrument regulated under the **Chit Funds Act, 1982** (India). A group of `N` people contribute a fixed amount monthly for `N` months. Each month, one member receives the pooled amount (the "prize"). By the end, every member has both contributed and received once.

### 1.3 Key Terms

| Term | Meaning |
|---|---|
| **Chit Value** | Total pool amount per month (e.g., ₹1,00,000) |
| **Subscriber / Member** | A participant in the chit group |
| **Foreman** | The company (Bonagiri Chits) that organizes the chit |
| **Installment / Subscription** | Monthly payment by each member |
| **Prize / Chit Amount** | The amount a winner receives in a given month |
| **Auction / Draw** | Monthly event to determine who gets the prize |
| **Bid / Discount** | Amount a member forgoes to win early (open auction chits) |
| **Dividend** | Share of the discount distributed back to all members |
| **Prized Subscriber (PS)** | Member who has already won |
| **Non-Prized Subscriber (NPS)** | Member still waiting for their turn |
| **Commission** | Foreman's fee — capped at **5%** of chit value by law |
| **GST** | **18%** on the foreman's commission |
| **Withdrawn** | Member who has received their chit amount |
| **Not-Withdrawn** | Member still waiting for their turn |
| **Adding** | Extra amount contributed in fixed chits (increases prize for later winners) |
| **Company Chit** | Month(s) where the company takes the prize (no member auction) |

### 1.4 Platforms

| Platform | Technology | Status |
|---|---|---|
| Web (Admin/Staff) | Next.js 16 + React 19 + Tailwind CSS v4 | In development |
| Web (Member Portal) | Same stack, responsive mobile-first | In development |
| Backend API | Express + Sequelize + PostgreSQL | In development |
| iOS App | Native (Member + Agent portals) | Planned |
| Android App | Native (Member + Agent portals) | Planned |

### 1.5 Chit Fund Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    CHIT FUND LIFECYCLE                       │
│                                                             │
│  1. SETUP     → Create group, set value, members, scheme    │
│  2. CONFIG    → Set up scheme template (fixed chits only)   │
│  3. ENROLL    → Register N members, assign slots            │
│  4. VERIFY    → OTP verification of enrolled members        │
│  5. START     → Status: Not Started → Started               │
│                 (auto-generates installment schedule)        │
│  6. MONTHLY   → Auction/Draw → Record Winner →              │
│     CYCLE       Collection → Payment (repeats N times)      │
│  7. CLOSURE   → All members prized, group completed         │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. User Roles & Portals

### 2.1 Role Definitions

| Role | Portal | Access |
|---|---|---|
| **Super Admin** | `/super-admin/` | Platform owner. Manages company registrations, global settings. |
| **Company Admin** | `/admin/` | Full access to company operations: masters, transactions, reports, utilities, security. |
| **Staff** | `/admin/` (RBAC-restricted) | Subset of company admin — permissions assigned per staff member by the admin. |
| **Member** | `/member/` | Chit participation: view chits, bid, pay, see schedules, profile. |
| **Business Agent** | `/member/business/` | Recruitment agent: track referred members, commissions, chit performance. |
| **Collection Agent** | `/member/collections/` | Field agent: collect installments from members, submit to admin. |

### 2.2 Role Assignment

A person registered via **Member Registration** is assigned one or more roles through the **"Introduced As"** field:

| Selection | Roles Granted |
|---|---|
| All | Member + Business Agent + Collection Agent |
| Member | Chit participation only |
| Business Agent | Recruitment tracking + commissions |
| Collection Agent | Field collection activities |

A single person can hold multiple roles simultaneously. The portal navigation adapts based on the assigned roles.

---

## 3. Authentication & Security

### 3.1 Login Flows

#### 3.1.1 Company Admin / Staff Login

| Field | Type | Notes |
|---|---|---|
| Company Code | Text | Unique company identifier |
| User Code | Text | Staff/admin login code |
| Password | Password | Mandatory |

**Post Login:** Redirect to `/admin/` dashboard. Staff users see only the modules they have permission for (see [Section 14: Staff Module](#14-staff-module-rbac)).

#### 3.1.2 Member / Agent Login

| Field | Type | Notes |
|---|---|---|
| Mobile Number | Numeric (10 digits) | Registered mobile |
| Password | Password | Set during registration |

**Post Login:** Redirect to `/member/` portal. Navigation tabs adapt based on roles (Member, Business Agent, Collection Agent).

**Access Controls:**
- `mobile_access` toggle — if disabled, login from mobile app is blocked.
- `web_access` toggle — if disabled, login from web is blocked.
- If neither access is enabled: show message **"You don't have access to login"**.

#### 3.1.3 Super Admin Login

| Field | Type | Notes |
|---|---|---|
| Email | Text | Super admin email |
| Password | Password | Mandatory |

### 3.2 Password Recovery

**Flow:**
1. User enters registered mobile number / email.
2. System sends OTP via SMS/email.
3. User enters OTP for verification.
4. User sets new password + confirm password.
5. On success → redirect to login.

### 3.3 Member OTP Verification (NEW)

**Purpose:** After member registration, the member is in **"Unverified"** state. Verification ensures the member has read the Terms & Conditions and confirmed their identity.

**Trigger:** Admin clicks the **Verify** icon on the member list or member detail page.

**Flow:**

```
┌──────────────────────────────────────────────────────────────────┐
│  MEMBER OTP VERIFICATION FLOW                                    │
│                                                                  │
│  1. Admin clicks "Verify" icon on member list/detail page        │
│  2. System sends SMS to member's registered mobile number        │
│     SMS contains:                                                │
│       - OTP (6-digit, valid for 5 minutes)                       │
│       - Link to Terms & Conditions page                          │
│  3. Member receives SMS, reads Terms & Conditions via link       │
│  4. Admin asks member for the OTP (phone/in-person)              │
│  5. Admin enters OTP in the verification dialog                  │
│  6. System validates OTP                                         │
│     - If valid → member status changes to "Verified"             │
│     - If expired/invalid → show error, allow resend              │
│  7. Member can now be enrolled in chit groups                    │
└──────────────────────────────────────────────────────────────────┘
```

**UI Requirements:**

| Element | Behavior |
|---|---|
| **Member List** | Show verify icon (e.g., shield with checkmark) next to unverified members. Verified members show a green verified badge. |
| **Member Detail Page** | Show verification status banner. If unverified, show prominent "Verify Member" button. |
| **Verification Dialog** | Opens when admin clicks verify. Shows member name + mobile. "Send OTP" button → countdown timer (60s resend cooldown). OTP input field (6 digits). "Verify" submit button. |
| **SMS Message** | Template: `"Dear {name}, your OTP for Bonagiri Chits verification is {OTP}. Please read our Terms & Conditions: {link}. Valid for 5 minutes."` |

**Backend Requirements:**

| Endpoint | Method | Purpose |
|---|---|---|
| `member/send-otp` | POST | Generate OTP, store hashed, send SMS. Body: `{ member_id }` |
| `member/verify-otp` | POST | Validate OTP, update verification status. Body: `{ member_id, otp }` |

**Business Rules:**
- Unverified members CAN be created but CANNOT be enrolled in chit groups.
- OTP expires after 5 minutes.
- Maximum 3 OTP attempts before lockout (15-minute cooldown).
- Resend OTP allowed after 60 seconds.
- Member `verification_status` field: `0` = Unverified, `1` = Verified.
- Terms & Conditions link in SMS points to the public T&C page (same content as in-app T&C).

**Platform Notes:**
- **Web:** Verify icon in member list + verification dialog.
- **iOS/Android:** Same flow — admin app triggers OTP, enters received code.
- **Backend:** SMS integration via configured SMS gateway (e.g., MSG91, Twilio). OTP stored as hashed value with expiry timestamp.

### 3.4 Session Management

- JWT-based authentication. Access token + refresh token.
- Token refresh is automatic and transparent.
- `company_id` is injected from the JWT for most endpoints (some require it in the request body — see individual endpoint docs).
- Session timeout: configurable per company.

---

## 4. Admin Module — Masters

The Masters section maintains all foundational data used across the application.

### 4.1 Member Registration

**Navigation:** Masters → Members → Add Member

**Purpose:** Create a person in the system who can act as a Member, Business Agent, or Collection Agent.

#### Section 1: Personal Information

**Basic Details:**

| Field | Type | Validation | Notes |
|---|---|---|---|
| Title | Dropdown | Required | Miss, Mr, Mrs, Mnr, Dr., M/S |
| Name | Text | **Mandatory** | Full name |
| Relation Type | Dropdown | — | S/O, D/O |
| Relation Name | Text | — | Father/Spouse name |
| Date of Birth | Calendar | — | |
| Age | Auto-calculated | — | Derived from DOB |
| Gender | Selection | — | Male / Female |
| Mobile Number | Numeric | **Mandatory**, 10 digits | Used for login + OTP |
| Email | Text | Valid email format | |
| Marital Status | Toggle | — | If ON → Marriage Date required |

**File Uploads:**

| Field | Accepted Formats | Notes |
|---|---|---|
| Photo | jpg, jpeg, png | Must show preview after upload |
| Signature | jpg, jpeg, png | Must show preview |
| Passbook Copy | jpg, jpeg, png | Must show preview |

**Role Assignment (Introduced As):**

| Selection | Access Given |
|---|---|
| All | Member + Business Agent + Collection Agent |
| Member | Chit participation, bidding |
| Business Agent | Recruitment tracking, commissions |
| Collection Agent | Collection activities, document collection |

**Bank Account Details:**

| Field | Type |
|---|---|
| Account Number | Text |
| Account Holder Name | Text |
| Bank Name | Text |
| Branch Name | Text |
| IFSC Code | Text |

**Occupation:**

Dropdown: Business, Employee, Farmer, House Wife, Retired Officer, Others.

Additional fields per occupation:

| Occupation | Additional Fields |
|---|---|
| Business | Business Type, Firm Name, Capital, Income |
| Employee | Employee Type, Organization, Designation, Department, Employee ID, Date of Joining, Retirement Date, Net Salary |
| Farmer | Land in Acres, Annual Income, Description |
| House Wife | Annual Income, Description |
| Others | Annual Income, Description |

#### Section 2: Address Information

Two address blocks: **Residential** and **Office**.

| Field | Type |
|---|---|
| Door Number | Text |
| Street Name | Text |
| Address | Text |
| Country | Dynamic dropdown |
| State | Dynamic dropdown (filtered by country) |
| City | Dynamic dropdown (filtered by state) |
| District | Text |
| Pincode | Numeric |
| Phone Number | Numeric |

**Correspondence Address:** Checkbox options — "Same as Residential" or "Same as Office". Selecting either auto-copies the address.

#### Section 3: Other Information

**KYC Details:**

| Field | Type | Validation |
|---|---|---|
| KYC Type | Dropdown | **Mandatory**. Values: Aadhaar, Driving Licence, Electricity Bill, Gas Bill, PAN Card, Passport, Voter ID |
| KYC Number | Text | **Mandatory** |
| Upload File | Image (jpg, jpeg, png) | **Mandatory** |
| Reference | Text | Optional |
| Remarks | Text | Optional |

- Multiple KYC entries supported (Add/Delete buttons).
- **At least one KYC record is mandatory.**

**Access Settings:**

| Field | Type | Notes |
|---|---|---|
| Mobile Access | Toggle | If OFF → mobile app login blocked |
| Web Access | Toggle | If OFF → web login blocked |
| Password | Text | **Mandatory** |
| Confirm Password | Text | **Mandatory**, must match |

**Save Action:**
1. Validate mandatory fields.
2. Create member record with status = **Unverified** (see [Section 3.3](#33-member-otp-verification-new)).
3. Assign selected role(s).
4. Save personal, address, and KYC details.
5. Member appears in Members List with "Unverified" badge.

**Post-Save:** Member is visible in the list but cannot be enrolled until OTP verification is complete.

### 4.2 Member List

| Column | Notes |
|---|---|
| Member ID | Auto-generated (e.g., MEM123456) |
| Name | Full name |
| Mobile Number | |
| Role(s) | Member / Business Agent / Collection Agent |
| Verification Status | Unverified (with verify icon) / Verified (green badge) |

**Actions:** View, Edit, Verify (if unverified).

**Features:** Search, pagination, export (PDF, Excel, CSV).

### 4.3 Chit Group Entry

**Navigation:** Masters → Members → Chit Group Entry

**Purpose:** Create a new chit group by defining scheme details, company rules, auction schedule, and bank/FDR information.

#### Section 1: Chit Basic Information

| Field | Type | Validation | Notes |
|---|---|---|---|
| Chit Group Name | Text | **Mandatory**, unique | |
| Chit Amount | Numeric | **Mandatory** | Total chit value per person |
| No. of Subscribers | Numeric | **Mandatory** | Total members in the group |
| Installment Amount | Numeric | **Mandatory** | Monthly installment |
| No. of Installments | Numeric | **Mandatory** | Total duration |
| Chit Series | Dropdown | — | Short, Mid, Long term |
| Auction Type | Dropdown | — | Weekly, Monthly |
| CAR (Chit Agreement Number) | Text | Unique | |
| PSO Date | Calendar | — | |
| PSO Number | Numeric | — | |
| Enrollment | Text | Optional | |
| Commencement Date | Calendar | — | |
| Termination Date | Calendar | — | |

**Scheme Type Assignment:**

When creating a chit group, the admin can link it to a **Fixed Scheme Configuration** (see [Section 8](#8-chit-schemes--configuration--business-logic)). If linked, the group follows the fixed scheme rules; if not, it operates as an **Open Auction** group.

| Field | Type | Notes |
|---|---|---|
| Scheme Configuration | Dropdown | Optional. Links to a fixed scheme template. |

#### Section 2: Company Information

| Field | Type | Notes |
|---|---|---|
| Company Chit Number | Text | Number of company-reserved months |
| Auction Number (Company Lift) | Text | Which auction number(s) the company takes |
| Company Commission (%) | Numeric | Default 5%, capped by law |
| Max Ceiling (%) | Numeric | Maximum bid discount allowed |
| Penalty for Prized Subscriber (%) | Numeric | Late payment penalty rate for PS |
| Penalty for Non-Prized Subscriber (%) | Numeric | Late payment penalty rate for NPS |

#### Section 3: Auction Information

| Field | Type | Notes |
|---|---|---|
| Auctions per Month | Numeric | |
| Auction Date & Day | Dropdown | Monday – Sunday |
| Week Number | Dropdown | Week 1 – Week 5 |
| Installment Amount | Numeric | |
| Auction From Time | Time picker | |
| Auction To Time | Time picker | |
| Dividend | Radio | Same month / Next month |

#### Section 4: Bank / FDR Information

**Purpose:** Capture the Fixed Deposit Receipt (FDR) made by the company as financial security for the chit group.

| Field | Type | Notes |
|---|---|---|
| FDR Number | Text | |
| FDR Type | Dropdown | |
| FDR Date | Calendar | |
| FDR Amount | Numeric | |
| FDR Maturity Amount | Numeric | Final amount after interest |
| Maturity Date | Calendar | When FD ends |
| Interest Period | Numeric | Number of months |
| Rate of Interest | Numeric | |
| Bank Name | Text | |
| Branch Name | Text | |

**Save Action:**
1. Validate mandatory fields.
2. Ensure Chit Group Name is unique.
3. Create chit group with status = **Inactive** (0).
4. Display in Chit Group List.

**System Behavior:**
- Newly created groups are **Inactive** — the chit does NOT start automatically.
- Admin must explicitly start the chit (see [Section 4.3.1](#431-chit-group-lifecycle)).

**Restrictions for Running Groups:**
- Edit → Not allowed
- Cancel → Not allowed
- Delete → Not allowed

#### 4.3.1 Chit Group Lifecycle

| Status | Code | Description |
|---|---|---|
| Not Started | 0 | Group created, enrollment in progress |
| Started | 1 | Enrollment complete, installments generated, auctions can begin |
| Completed | 2 | All months complete, all members prized |

**Start Action:**
- Available only when `status = 0` AND all slots are filled (enrollment count = no. of subscribers).
- On start: system auto-generates the installment schedule for all enrolled members.
- Status changes to `1`.

**Complete Action:**
- Available only when `status = 1` AND all auctions/draws for all months are recorded.
- Status changes to `2`.

### 4.4 Chit Group List

| Column | Notes |
|---|---|
| Group Name | |
| Chit Amount | |
| Subscribers | Total count |
| Enrollment | Filled / Total |
| Status | Not Started / Started / Completed |
| Scheme Type | Open Auction / Fixed (with type label) |

**Actions:** View detail, Edit (if not started), Start (if enrollment complete), navigate to Auction Spinner.

### 4.5 Chit Group Detail Page

**Purpose:** View group overview, scheme schedule (for fixed schemes), and actual installment progress.

**Sections:**

1. **Header Stats:** Status, Enrollment count, Start/End dates, Chit Amount.
2. **Scheme Schedule (Template Preview)** — Only for fixed schemes. Shows the month-by-month installment and prize table based on the linked scheme configuration (see [Section 8](#8-chit-schemes--configuration--business-logic)).
3. **Actual Installments** — Shows real member installment data for started groups (populated from `chits-installment` records).

**Actions:** Edit, Spinner (link to auction spinner), Start Group (conditional).

### 4.6 Enrollment

**Navigation:** Masters → Enrollments

**Purpose:** Assign a registered, **verified** member to a chit group as a subscriber.

#### Section 1: General Information

| Field | Type | Validation | Notes |
|---|---|---|---|
| Group Name | Dropdown | **Mandatory** | Select chit group |
| Slot Number | Dropdown | **Mandatory** | Based on available slots |
| Subscriber Name | Searchable dropdown | **Mandatory** | From registered, **verified** members only |
| Business Type | Display | — | Auto-filled based on member type |
| Business Agent | Dropdown | Optional | |
| Collection Agent | Dropdown | Optional | |
| Enrollment Date | Calendar | **Mandatory** | Must be ≥ commencement date |
| Payment Mode | Dropdown | — | Monthly / Weekly |
| Intimation Card | Dropdown | — | Post / SMS |
| Area | Prefilled | — | From member info |
| Address Type | Radio | — | Home / Office |
| Address | Display | — | Auto-filled based on address type selection |

#### Section 2: Nominee Information

| Field | Type | Notes |
|---|---|---|
| Name | Text | **Mandatory** (at least name required) |
| Age | Numeric | |
| Relation | Text | |
| Door No | Text | |
| Street Name | Text | |
| City | Dropdown | |
| Address | Text | |
| Pincode | Numeric | |
| Mobile Number | Numeric | |
| Fill Subscriber Address | Checkbox | Auto-fills from member's address |

**Validation Rules:**
- Subscriber must be **registered AND verified** (OTP verification complete).
- Subscriber should not already occupy the selected slot.
- Slot must be available.
- Enrollment Date ≥ Chit Commencement Date.

**Business Rules:**
- One subscriber can occupy **one or more slots** per chit group.
- A subscriber **can enroll in multiple chit groups**.
- Business Agent and Collection Agent are used for tracking and commissions.

**Save Action:**
1. Validate all required fields.
2. Create enrollment record.
3. Assign subscriber to selected slot.
4. Store nominee details.
5. Update slot status as occupied.

### 4.7 Upcoming Chit Group Entry

**Navigation:** Masters → Members → Upcoming Chit Group Entry

**Purpose:** Create and publish upcoming chit schemes so members can express interest.

| Field | Type | Validation |
|---|---|---|
| Group Name | Text | **Mandatory** |
| Chit Amount | Numeric | **Mandatory** |
| No. of Installments | Numeric | **Mandatory** |
| Remarks | Text | Optional |

Members can view these in the Member Portal and express interest, helping the admin gauge demand.

### 4.8 Self Chits Entry

**Purpose:** Record company-reserved slots in chit groups (the company's own enrollment as foreman).

| Field | Type | Notes |
|---|---|---|
| Group Name | Dropdown | Select chit group |
| Slot Number | Dropdown | Available slots |
| Remarks | Text | Optional |

### 4.9 Agents Target Entry

**Navigation:** Masters → Members → Agents Target Entry

**Purpose:** Assign performance targets to agents.

**Primary Selection:**

| Field | Type | Notes |
|---|---|---|
| Agent Type | Dropdown | Business Agent / Collection Agent |
| Agent Name | Searchable dropdown | Filtered by agent type |

**If Business Agent:**

| Field | Type |
|---|---|
| Target Members Count | Numeric |
| From Date | Calendar |
| To Date | Calendar |

**If Collection Agent:**

| Field | Type |
|---|---|
| Target Amount | Numeric |
| From Date | Calendar |
| To Date | Calendar |

**Validations:**
- Agent Type mandatory.
- Agent Name mandatory.
- Target value > 0.
- From Date ≤ To Date.

### 4.10 Business / Collection Agent Transfer

**Navigation:** Masters → Members → Agent Transfer

**Purpose:** Reassign an agent from one chit group to another.

| Field | Type | Notes |
|---|---|---|
| Agent Type | Dropdown | Business Agent / Collection Agent |
| Agent Name | Searchable dropdown | Based on agent type |
| Group Name | Dropdown | Current group |
| Groups Filter | Radio | Running / Closed / Both |

**Retrieve Action:** Fetches groups assigned to the selected agent.

**Transfer Fields:**

| Field | Type |
|---|---|
| From Group | Display |
| To Group / New Assignment | Dropdown |
| Effective Date | Calendar |

**Business Rules:**
- After transfer, new agent is responsible from the effective date.
- Old agent association ends.
- Changes reflect in agent dashboards and mobile app.
- Transfer history is maintained.

### 4.11 Suit File Documentation

**Navigation:** Masters → Members → Suit File Info Entry

**Purpose:** Record legal case details for defaulting subscribers.

#### Section 1: Filing Details

| Field | Type | Validation |
|---|---|---|
| Group Name | Dropdown | **Mandatory** |
| Ticket Number | Text | **Mandatory**, unique |
| Subscriber | Searchable dropdown | **Mandatory** |
| Court Name | Text | Optional |
| Advocate Name | Text | Optional |
| Suit Cause | Text | Reason for legal case |
| Suit No | Text | Court case number |
| Suit File Date | Calendar | **Mandatory** |
| Legal Notice Date | Calendar | Optional |

#### Section 2: Financial Valuation

| Field | Type | Default |
|---|---|---|
| Principal Amount | Numeric | 0 |
| Cost of Legal | Numeric | 0 |
| Inc. Charges | Numeric | 0 |
| Interest Amount | Numeric | 0 |
| Claim Amount | Numeric | Total claim |

#### Section 3: Member Context (Read-only)

Auto-populated based on Subscriber + Group selection:

Subscriber Name, Address, Due Date, Paid Up To, Chit Amount, Less Paid, Less At Credit, Previous Due, Principal Amount, Add Interest, Total Due.

### 4.12 Places (Geography)

**Navigation:** Masters → Places

**Purpose:** Maintain the geographical hierarchy used across the system.

**Hierarchy:** Country → State → District → City → Area → Route

Each level is managed via a tabbed CRUD interface:

| Entity | Fields | Parent |
|---|---|---|
| Country | Name, Code | — |
| State | Name, Code | Country |
| District | Name | State |
| City | Name | District (via State) |
| Area | Name | City |
| Route | Name | Area |

**Business Rules:**
- Dropdowns cascade: selecting a Country filters States, etc.
- Areas and Routes are used for collection agent routing and member address auto-fill.

### 4.13 Accounts

#### 4.13.1 Account Group Entry

**Purpose:** Create account groups that define the hierarchical structure of ledger accounts.

| Field | Type | Validation |
|---|---|---|
| Account Group Name | Text | **Mandatory**, unique |
| Group Under | Dropdown | **Mandatory** — parent group |
| Account Order | Numeric | Optional, for sorting |

Account groups form a tree hierarchy. The "Group Under" dropdown shows predefined system groups and user-created groups.

#### 4.13.2 Account Group List

| Column | Notes |
|---|---|
| Group Name | |
| Higher (Parent) | |
| Group Order | |

**Actions:** View, Edit, search, export.

#### 4.13.3 Account Entry

**Purpose:** Create ledger accounts under defined account groups.

**Section 1: Account Details**

| Field | Type | Validation |
|---|---|---|
| Account Name | Text | **Mandatory**, unique |
| Account Group | Dropdown | **Mandatory** |

**Section 2: Address & Compliance**

| Field | Type |
|---|---|
| Person Name, Address 1-3, Pincode, Mobile, Email | Standard fields |
| HSN Code, TIN, PAN, GST, MFL Number | Compliance fields |
| IGST %, CGST %, SGST % | Tax rates |

#### 4.13.4 Account List

| Column | Notes |
|---|---|
| Account Name | |
| Account Group | |
| Mobile Number | |
| GST Number | |

**Actions:** View, Edit, search, export.

#### 4.13.5 Account Opening Balance

**Purpose:** Define initial balances for ledger accounts per financial year.

**Flow:**
1. Select **Financial Year** (dropdown, current year default).
2. Select **Account category** (searchable dropdown).
3. Click **Retrieve** → displays grid of ledger accounts.

**Grid Columns:**

| Column | Type |
|---|---|
| Account | Display |
| Group | Display |
| Opening Balance | Numeric (default 0) |
| Cr/Dr | Dropdown (Credit/Debit) |
| Action | Checkbox (select for save) |

**Default Cr/Dr by account type:**

| Account Type | Default |
|---|---|
| Assets | Dr |
| Expenses | Dr |
| Liabilities | Cr |
| Income | Cr |

**Rules:**
- Only checked rows are saved.
- No duplicate entries per account per financial year.
- Saved balances feed into Voucher Entries, Day Book, Ledger Reports, Trial Balance, Balance Sheet, P&L.

#### 4.13.6 Account Tree

**Purpose:** Visual tree view of the complete account hierarchy (groups → accounts). Read-only display.

---

## 5. Admin Module — Transactions

### 5.1 Auctions

See [Section 9: Auction & Winner Recording](#9-auction--winner-recording) for the complete auction flow including open auctions, fixed scheme auctions, winner recording, and the auction spinner.

### 5.2 Agent Setup & Commission

**Navigation:** Transactions → Agent Setup

**Purpose:** Configure and manage business agent commissions and payment history.

#### 5.2.1 Agent Commission Configuration

| Field | Type | Notes |
|---|---|---|
| Agent Name | Searchable dropdown | Business agents only |
| Commission Type | Dropdown | Per member / Percentage / Fixed |
| Commission Value | Numeric | Amount or percentage |
| Effective From | Calendar | |
| Effective To | Calendar | Optional |

#### 5.2.2 Agent Payment History

| Field | Type | Notes |
|---|---|---|
| Agent Name | Display | |
| Payment Date | Calendar | |
| Amount | Numeric | |
| Payment Mode | Dropdown | Cash / Bank Transfer / Cheque |
| Reference Number | Text | For non-cash payments |
| Upload Document | File | Payment proof |
| Remarks | Text | Optional |

### 5.3 Collections / Payments

See [Section 10: Amount Collection Flow](#10-amount-collection-flow) for the complete collection and payment verification flow.

### 5.4 Favorites

**Purpose:** Quick-access shortcuts to frequently used modules. Admin can pin/unpin modules.

---

## 6. Admin Module — Utilities

### 6.1 Auction Spinner

See [Section 9.4: Auction Spinner](#94-auction-spinner-lucky-draw).

### 6.2 Contact Us

**Purpose:** Manage contact information displayed to members in the app.

CRUD for contact entries:

| Field | Type |
|---|---|
| Title | Text |
| Contact Person | Text |
| Phone | Numeric |
| Email | Text |
| Address | Text |
| Description | Rich text |

### 6.3 FAQ

**Purpose:** Manage frequently asked questions displayed in the member portal.

CRUD for FAQ entries:

| Field | Type |
|---|---|
| Question | Text |
| Answer | Rich text |
| Category | Dropdown |
| Order | Numeric |
| Active | Toggle |

### 6.4 Terms & Privacy

**Purpose:** Manage Terms & Conditions and Privacy Policy content.

| Field | Type |
|---|---|
| Title | Text |
| Content | Rich text editor |
| Type | Dropdown (Terms / Privacy) |
| Version | Auto-increment |
| Published Date | Calendar |

**Important:** The Terms & Conditions page is publicly accessible (linked in OTP verification SMS — see [Section 3.3](#33-member-otp-verification-new)).

---

## 7. Admin Module — Security, Reports, Enquiry, Consolidation

### 7.1 Security

#### 7.1.1 User Management

Manage staff users and their access permissions. See [Section 14: Staff Module](#14-staff-module-rbac).

#### 7.1.2 Audit Log

Read-only log of all critical actions:
- Member creation/modification
- Group start/complete
- Auction recording
- Payment verification
- Role changes

### 7.2 Reports

**Categories:**

| Report | Description |
|---|---|
| Day Book | Daily transaction summary |
| Ledger | Account-wise transaction history |
| Trial Balance | All account balances |
| Balance Sheet | Assets vs Liabilities |
| Profit & Loss | Income vs Expenses |
| Collection Report | Per-agent, per-group collection summaries |
| Defaulter Report | Members with overdue payments |
| Auction Summary | Group-wise auction history |
| Member Statement | Individual member transaction history |

All reports support: date range filters, group filters, export (PDF, Excel, CSV).

### 7.3 Enquiry

Interactive lookup screens:
- Member Enquiry (search by name/ID/mobile)
- Group Enquiry (search by name/CAR)
- Account Enquiry (search by account name)
- Agent Enquiry (search by agent name)

### 7.4 Consolidation

Cross-group aggregated views:
- Multi-group member summary
- Company-wide collection summary
- Agent performance across groups

---

## 8. Chit Schemes — Configuration & Business Logic

### 8.1 Overview

Bonagiri Chits supports **5 chit types**: one open auction type and four fixed scheme types. Fixed schemes are pre-configured with a price template that determines monthly installments and prizes.

| Code | Scheme Name | Installment | Prize | Company Months |
|---|---|---|---|---|
| — | **Open Auction** | Varies (bidding) | = Winning bid | 0 |
| 62 | **Withdrawn / Not-Withdrawn** | Varies by position | From price table | 0 |
| 63 | **Fixed with Adding** | Fixed amount | Formula-based (grows) | `company_chit` (usually 1) |
| 64 | **Auction-Based Growing** | From price table | From price table | 1 |
| 65 | **Growing Prize & Fixed Installment** | From price table | From price table (grows) | 0 |

### 8.2 Scheme Configuration (Fixed Schemes)

**Navigation:** Masters → Chit Config → Add

**Purpose:** Create a scheme template that one or more chit groups can be linked to.

**Common Fields (all types):**

| Field | Type | Notes |
|---|---|---|
| Title | Text | Scheme template name |
| Scheme Type | Dropdown | Type 62 / 63 / 64 / 65 |
| Months Count | Numeric | Total months including company months |
| Members Count | Numeric | Usually same as months |
| Status | Toggle | Active by default |
| Description | Text | Optional |

**Type-specific fields and pricing are detailed below per scheme.**

### 8.3 Scheme Type 62 — Withdrawn / Not-Withdrawn

**Configuration Fields:**
- Months Count, Members Count (same), Status, Description.
- **Price Table:** For each month → `not_withdrawn` amount, `withdrawn` amount, `chit_amount`.

**Business Logic:**

Think of an 11-member, 11-month scheme:

- **Month 1:** 10 members pay the "not withdrawn" amount (e.g., ₹10,000), 1 member (the winner) pays the "withdrawn" amount (e.g., ₹10,500). Total collected = ₹1,10,500. Company gives ₹1,00,000 as chit amount. Remaining ₹10,500 = company profit.
- **Month 2:** 9 NPS members pay "not withdrawn" (e.g., ₹9,800), 2 PS members pay "withdrawn" (₹10,500 each). Total = ₹1,09,200. Chit amount = ₹1,00,000. Profit = ₹9,200.
- Continues until **Month 11**: the last winner pays only the "not withdrawn" amount (since they are the last person).

**Key points:**
- NPS installment **decreases** over time (more PS members means more "withdrawn" payers covering the pool).
- PS installment is **fixed** (the "withdrawn" amount).
- Each month's chit amount is defined in the price table.

**Installment Schedule Table Columns:**

| Month | Not-Withdrawn (NPS pays) | Withdrawn (PS pays) | Winner Gets (Chit Amount) |
|---|---|---|---|

### 8.4 Scheme Type 63 — Fixed with Adding

**Configuration Fields:**
- Months Count, Members Count, Status, Description.
- Chit Value (e.g., ₹1,00,000).
- Adding Percentage (e.g., 1%).
- Installment Amount (auto-calculated: `chit_value / members_count`).
- Company Commission (e.g., 5%).
- Company Chit (e.g., 1 — how many months reserved for company).

**Business Logic:**

Think of a 20-member, 20-month scheme with ₹1,00,000 chit value:

- **Month 1 (Company Month):** All 20 members pay ₹5,000 each = ₹1,00,000. Company takes the full amount. No auction, no adding.
- **Month 2 (First member auction):** All 20 members pay ₹5,000 = ₹1,00,000. Company commission = 5% = ₹5,000. Winner receives ₹95,000. No adding yet (first member winner).
- **Month 3:** 19 NPS members pay ₹5,000 each = ₹95,000. 1 PS member pays installment + adding (₹5,000 + ₹1,000 = ₹6,000). Total = ₹1,01,000. Minus commission = winner gets ₹96,000.
- **Each subsequent month:** More PS members → more adding payments → winner gets a larger amount.
- **Month 20:** Last winner gets the highest amount.

**Winning Amount Formula:**
```
winnerGets = chitValue − commission + (winnersSoFar × addingAmount)
```
Where:
- `commission = chitValue × companyCommission%`
- `addingAmount = chitValue × addingPercentage%`
- `winnersSoFar` = number of members who have already won (excluding company months)

**Price Table:** Not entered manually — calculated from the formula. The configuration stores only the parameters.

**Installment Schedule Table Columns:**

| Month | Installment (fixed) | Adding | Total Payment | Winner Gets |
|---|---|---|---|---|

### 8.5 Scheme Type 64 — Auction-Based Growing Amount

**Configuration Fields:**
- Months Count, Members Count, Status, Description.
- **Price Table:** For each month → `monthly_subscription`, `chit_amount` (net received by winner).

**Business Logic:**

Think of a 25-member, 25-month scheme:

- **Month 1 (Company Month):** All members pay a subscription (e.g., ₹20,000 each = ₹5,00,000). Company takes the full amount. No auction.
- **Month 2:** All members pay subscription (e.g., ₹14,050 each = ₹3,51,250). Chit amount given = ₹3,26,250. Remaining ₹25,000 = company profit.
- Subscription and prize grow each month per the price table.

**Key points:**
- Monthly subscription **varies** per month (from price table).
- Prize **grows** each month.
- Company profit is consistent (₹25,000/month in the example = 5% of ₹5,00,000).
- Company takes **1 month** (Month 1).

**Installment Schedule Table Columns:**

| Month | Installment (from table) | Winner Gets (Chit Amount) |
|---|---|---|

### 8.6 Scheme Type 65 — Growing Prize & Fixed Installment

**Configuration Fields:**
- Months Count, Members Count, Status, Description.
- **Price Table:** For each month → `installment_amount`, `chit_amount` (given amount).

**Business Logic:**

Think of a 30-member, 30-month scheme:

- **Month 1:** All members pay fixed installment (e.g., ₹13,500 each = ₹4,05,000). Given amount = ₹3,05,000. Remaining ₹1,00,000 = company profit.
- **Each month:** Same fixed installment. Prize increases per the price table.
- **Month 30:** Given amount = ₹5,00,000 (highest prize).

**Key points:**
- Monthly installment is **fixed** (same every month, from price table).
- Prize **grows** each month.
- Rewards patience — later winners get significantly more.
- No company months (company profit is built into each month's margin).

**Installment Schedule Table Columns:**

| Month | Installment (fixed from table) | Winner Gets (Chit Amount, grows) |
|---|---|---|

### 8.7 Open Auction (No Template)

Groups not linked to a fixed scheme operate as open auction groups.

**Auction Calculation:**
```
Base Subscription    = Chit Value ÷ N
Company Commission   = Chit Value × Commission%
GST on Commission    = Commission × 18%
Bid Discount         = Chit Value − Winning Bid
Total Dividend       = Discount − Commission − GST
Dividend per Member  = Total Dividend ÷ N
Net Monthly Payment  = Base Subscription − Dividend per Member
Winner Receives      = Winning Bid − Commission − GST
```

**Rules:**
- Monthly payment **varies** every month depending on the winning bid.
- Maximum bid discount is capped (configurable per group: 25%, 30%, 35%, or 40%).
- Bids increase in multiples of ₹100.
- If multiple bidders at max discount → selection by lottery (spinner).

### 8.8 Scheme Schedule Display

The installment schedule must be visible to **all stakeholders**:

| Stakeholder | Where They See It | What They See |
|---|---|---|
| **Company Admin** | Chit Group Detail Page, Section 1 | Full template schedule (all months, all columns) |
| **Staff** | Same as admin (if permitted) | Same |
| **Member** | Member Portal → Chit Details | Their group's schedule with their position highlighted |
| **Business Agent** | Business Agent → Chit History | Group schedule view |
| **Collection Agent** | Collection Agent → Group Detail | Schedule + who has paid this month |

The table adapts its columns based on scheme type (see sections 8.3–8.6 above).

---

## 9. Auction & Winner Recording

### 9.1 Auction Entry (Record Auction Amount)

**Navigation:** Transactions → Auctions → Add

**Purpose:** Record the monthly auction for a chit group. This captures the **bid amount** and calculates the financial breakdown.

**Fields:**

| Field | Type | Notes |
|---|---|---|
| Chit Group | Dropdown | **Mandatory** |
| Bidder | Dropdown | From enrolled members in the group |
| Ticket Number | Auto-fill | From bidder's slot number |
| Auction Number | Auto-calculated | `companyMonths + recordedAuctions + 1` |
| Auction Date | Calendar | **Mandatory** |
| Due Date | Auto-calculated | Auction date + 7 days |
| Next Auction Date | Auto-calculated | Auction date + 1 month |
| Minutes Filing Date | Auto-filled | Same as auction date |
| Bid Amount | Numeric | **Editable for open auction**, **read-only for fixed schemes** (from template) |
| GST (%) | Numeric | Only for open auction |
| PB / BO / Proxy | Dropdown | Prized Bidder / BO / Proxy |

**Auction Number Formula:**
```
nextAuctionNumber = companyMonths(schemeConfig) + recordedAuctionsCount + 1
```

Where `companyMonths` varies by scheme type:
- Type 63 (Fixed+Adding): `company_chit` value (usually 1)
- Type 64 (Auction Growing): 1
- Type 62, 65, Open Auction: 0

**For Fixed Schemes:**
- Bid Amount is **read-only** — pulled from the scheme template for the given auction number.
- Calculation panel shows: Winning Amount + Company Profit (if > 0).
- If the auction number corresponds to a company month, the form shows a warning: "This is the company's own month — no member wins."

**For Open Auction:**
- Bid Amount is **editable**.
- Real-time calculation panel shows: Installments, Chit Amount, Bid Loss, Bid Payable, Company Commission, GST Amount, Dividend Payable, Subscription, Dividend, Net Payable.

### 9.2 Record Auction Winner (NEW)

**Purpose:** Separate from recording the auction amount, this action **confirms that the prize amount has been paid to the winner**. This is critical because:

1. **Installment schedule display depends on it:** For example, in Withdrawn/Not-Withdrawn schemes, the system needs to know who has won in each month to correctly show which members pay "withdrawn" vs "not-withdrawn" amounts going forward.
2. **Winner exclusion:** Once recorded as a winner, a member cannot win again in the same group.
3. **Audit trail:** Creates a clear record of when the prize was disbursed.

**Flow:**

```
┌──────────────────────────────────────────────────────────────────┐
│  RECORD AUCTION → RECORD WINNER (Two-step process)               │
│                                                                  │
│  Step 1: RECORD AUCTION (existing)                               │
│    Admin records the auction entry with bid amount,              │
│    bidder, and auction details.                                  │
│    Status: Auction Recorded                                      │
│                                                                  │
│  Step 2: RECORD WINNER (new)                                     │
│    Admin confirms the prize has been paid to the winner.         │
│    - Marks the member as "prized" (has_won = true)               │
│    - Records the won_month                                       │
│    - Updates the installment schedule for all members            │
│    - The member becomes a PS (Prized Subscriber)                 │
│    Status: Winner Recorded + Paid                                │
│                                                                  │
│  Why two steps?                                                  │
│    The auction happens first (who won and for how much).         │
│    Payment may happen later (prize disbursement).                │
│    Separating them gives the admin flexibility and an            │
│    accurate audit trail.                                         │
└──────────────────────────────────────────────────────────────────┘
```

**Record Winner Action:**

| Trigger | Where |
|---|---|
| Button on Auction Detail page | "Record Winner" button (visible when auction is recorded but winner not yet confirmed) |
| One-click from Spinner | After spinning, the winner is auto-selected and recorded in one action |

**Backend Requirements:**

| Endpoint | Method | Purpose |
|---|---|---|
| `auction/record-winner` | POST | Mark auction as winner-paid. Server assigns `auction_number` and fixed `bid_amount` (for fixed schemes). |

**Request Body:**
```json
{
  "group_id": "uuid",
  "member_id": 123,
  "auction_date": "2026-07-15"
}
```

**Server Behavior:**
- Server computes `auction_number` (client must NOT send it).
- Server computes `bid_amount` for fixed schemes (client must NOT send it).
- Duplicate-winner guard: if member already has `has_won = true` for this group → reject with error.
- Finished-scheme guard: if all members already prized → reject.
- Updates `auction_date` on the auction record.
- Sets `has_won = true` and `won_month` on the member-group enrollment.

**Impact on Schedule Display:**
Once a winner is recorded, the installment schedule updates:
- **Type 62 (Withdrawn/Not-Withdrawn):** The winner's row switches from "not-withdrawn" to "withdrawn" amount for all future months.
- **Type 63 (Fixed+Adding):** The winner count increments, which increases the "adding" component for subsequent winners.
- **Type 64/65:** The winner is marked in the schedule; their position shows the actual prize received.
- **Open Auction:** The winner's monthly payment changes from the variable NPS amount to the fixed PS amount.

### 9.3 Recommended Flow Summary

```
┌───────────────────────────────────────────────────────────────┐
│                    MONTHLY AUCTION CYCLE                       │
│                                                               │
│  For OPEN AUCTION groups:                                     │
│    1. Admin opens Auction Form                                │
│    2. Selects group → sees eligible (non-prized) members      │
│    3. If multiple bidders at same amount → use Spinner         │
│    4. Records auction entry with winning bid                  │
│    5. After prize is paid → clicks "Record Winner"            │
│                                                               │
│  For FIXED SCHEME groups:                                     │
│    1. Admin opens Auction Form (or Spinner)                   │
│    2. Selects group → sees eligible (non-prized) members      │
│    3. Uses Spinner to randomly select winner                  │
│    4. Bid amount is auto-filled from template                 │
│    5. Records auction + winner in one step (via Spinner)      │
│       OR records auction first, then "Record Winner" later    │
│                                                               │
│  For COMPANY MONTHS:                                          │
│    No auction needed. Company automatically receives the      │
│    chit amount. Installments are collected as normal.         │
└───────────────────────────────────────────────────────────────┘
```

### 9.4 Auction Spinner (Lucky Draw)

**Navigation:** Utilities → Auction Spinner → Select Group
OR Chit Group Detail → Spinner button

**Purpose:** When multiple participants are eligible, the spinner provides a fair, random selection mechanism (lottery/lucky draw).

**Flow:**

```
┌──────────────────────────────────────────────────────────────────┐
│  AUCTION SPINNER FLOW                                            │
│                                                                  │
│  1. Admin navigates to Spinner for a specific group              │
│  2. System loads all NON-PRIZED members (has_won = false)        │
│  3. Admin selects participants for this round                    │
│     (checkboxes — select 2 or more members)                      │
│  4. Admin sets optional dates:                                   │
│     - Auction Date (default: today)                              │
│     - Due Date (default: today + 7 days)                         │
│     - Next Auction Date (default: today + 1 month)               │
│  5. Admin clicks "Spin"                                          │
│  6. Animated wheel/slot-machine spins through selected members   │
│  7. Winner is randomly selected and displayed                    │
│  8. Admin confirms → system calls `auction/record-winner`        │
│  9. Winner is marked as prized, schedule updates                 │
└──────────────────────────────────────────────────────────────────┘
```

**UI Elements:**

| Element | Description |
|---|---|
| **Group Header** | Group name, chit amount, current month, scheme type |
| **Member Selection** | List of eligible (non-prized) members with checkboxes. Shows: name, slot number, enrollment date. |
| **Date Fields** | Auction Date, Due Date, Next Auction Date — all with sensible defaults |
| **Spin Button** | Disabled until ≥ 2 members selected |
| **Spinner Animation** | Visual wheel or slot-machine animation |
| **Result Display** | Winner name, slot number, winning amount (from template for fixed, from last auction for open) |
| **Confirm Button** | Records the winner via `auction/record-winner` |

**Business Rules:**
- Only non-prized members can participate.
- Minimum 2 participants required to spin.
- The spinner is purely random — no weighting.
- After confirmation, the winner cannot participate in future spins for this group.

**Platform Notes:**
- **Web:** Full animated spinner with visual feedback.
- **iOS/Android:** Native spinner animation. Same flow — select members, spin, confirm.

---

## 10. Amount Collection Flow

### 10.1 Overview

Installment collection happens through two channels, each with different verification requirements:

| Channel | Created By | Auto-Verified? | Notes |
|---|---|---|---|
| **Admin/Staff Entry** | Admin or Staff user | **Yes** — auto-verified on creation | Trusted source, no approval needed |
| **Collection Agent Submission** | Collection Agent (field) | **No** — requires admin verification | Agent collects in the field, submits digitally, admin verifies when agent hands over the money |

### 10.2 Admin/Staff Collection Entry

**Navigation:** Transactions → Collections (Admin portal)

**Purpose:** When a member pays directly at the office, admin records the payment immediately.

**Fields:**

| Field | Type | Notes |
|---|---|---|
| Group Name | Dropdown | **Mandatory** |
| Member | Searchable dropdown | **Mandatory**, filtered by group |
| Installment Month | Dropdown | Current or overdue months |
| Amount | Numeric | Pre-filled with due amount, editable |
| Payment Mode | Dropdown | Cash / Bank Transfer / Cheque / Online |
| Transaction Reference | Text | Required for non-cash modes |
| Cash Denominations | Grid | Required for cash mode (see below) |
| Payment Date | Calendar | Default: today |
| Remarks | Text | Optional |

**Cash Denominations Grid** (when payment mode = Cash):

| Denomination | × Count | = Amount |
|---|---|---|
| ₹2,000 | input | calculated |
| ₹500 | input | calculated |
| ₹200 | input | calculated |
| ₹100 | input | calculated |
| ₹50 | input | calculated |
| ₹20 | input | calculated |
| ₹10 | input | calculated |
| **Total Cash** | | **must match amount** |

**Save Action:**
1. Validate amount > 0.
2. For cash: validate denominations total matches amount.
3. For non-cash: validate reference number present.
4. Create payment record with status = **Verified** (auto-verified).
5. Update installment record as paid.
6. Generate receipt (optional).

### 10.3 Collection Agent Submission

**Where:** Collection Agent Portal (mobile app or web)

**Flow:**

```
┌──────────────────────────────────────────────────────────────────┐
│  COLLECTION AGENT FLOW                                           │
│                                                                  │
│  1. Agent opens "Collect Now" → sees pending members             │
│  2. Agent visits member, collects payment                        │
│  3. Agent opens member's collection screen:                      │
│     - Sees due amount, paid history, balance                     │
│     - Enters amount received                                     │
│     - Selects payment mode (Cash/Bank/Cheque/Online)             │
│     - For Cash: enters denomination breakdown                    │
│     - For non-Cash: enters transaction reference                 │
│  4. Agent submits → record created as "PENDING" (unverified)     │
│                                                                  │
│  5. Agent physically hands over collected cash/cheques to admin  │
│  6. Admin opens verification queue:                              │
│     - Sees all pending submissions from all agents               │
│     - Reviews each: amount, mode, denominations, reference       │
│     - Admin can VERIFY (mark as confirmed) or REJECT             │
│  7. Verified records become official payment records              │
│     Rejected records are sent back with a reason                 │
└──────────────────────────────────────────────────────────────────┘
```

### 10.4 Admin Verification Queue

**Navigation:** Transactions → Collections (Admin portal, separate tab/view)

**Purpose:** Review and verify/reject collection agent submissions.

**List View (Tabs):**

| Tab | Filter | Description |
|---|---|---|
| All | type=1 | All submissions |
| Pending | type=2 | Awaiting verification |
| Verified | type=3 | Approved submissions |
| Rejected | type=4 | Rejected with reason |

**List Columns:**

| Column | Notes |
|---|---|
| Agent Name | Who collected |
| Member Name | Who paid |
| Group Name | Which chit group |
| Amount | Collected amount |
| Payment Mode | Cash / Bank / Cheque / Online |
| Submission Date | When agent submitted |
| Status | Pending / Verified / Rejected |
| Status Note | Reason (for rejections) |

**Actions per record:**

| Action | Effect |
|---|---|
| **Verify** | Status → Verified. Payment record created in installments. |
| **Reject** | Status → Rejected. Admin must provide a reason. Agent sees rejection in their records. |
| **View Details** | See full submission: denominations, reference, member dues, etc. |

### 10.5 Payment Status Flow

```
                    ┌─────────────┐
                    │   Created   │
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
      ┌───────▼───────┐       ┌────────▼────────┐
      │  Admin Entry  │       │  Agent Submit   │
      │ (auto-verify) │       │   (pending)     │
      └───────┬───────┘       └────────┬────────┘
              │                        │
              │               ┌────────┴────────┐
              │               │                 │
              │        ┌──────▼──────┐   ┌─────▼─────┐
              │        │  Verified   │   │ Rejected  │
              │        │  (by admin) │   │ (reason)  │
              │        └──────┬──────┘   └───────────┘
              │               │
              └───────┬───────┘
                      │
              ┌───────▼───────┐
              │   Official    │
              │   Payment     │
              │   Record      │
              └───────────────┘
```

### 10.6 Backend Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `user/collection-agent/submissions` | POST | Agent submits a collection. Body includes: `member_id`, `payment_type`, `amount`, `denominations` or `reference`. |
| `collection-agent/submissions/get-all` | POST | Admin fetches all submissions. Filter: `{ type: 1\|2\|3\|4 }`. |
| `collection-agent/submissions/update-status` | POST | Admin verifies (status=2) or rejects (status=3) a submission. |

### 10.7 Platform Notes

- **Web (Admin):** Full verification queue with tabbed view, bulk actions.
- **Web (Collection Agent):** Mobile-first collect screen with denomination grid.
- **iOS/Android (Collection Agent):** Native collect screen. Offline-capable (queue submissions when no network, sync when online).
- **iOS/Android (Member):** View payment history, see pending/verified status.

---

## 11. Member Portal

### 11.1 Dashboard (Home)

**URL:** `/member/`

**Layout:** Mobile-first hero card with gradient background.

**Sections:**

1. **Welcome Header** — Member name, profile photo, member ID.
2. **Active Chits Summary** — Count of active groups, total investment, next due date.
3. **Quick Actions** — My Chits, Pending Payments, Bids, Explore New Chits.
4. **Recent Activity** — Last 5 transactions/events.

### 11.2 My Chits

**URL:** `/member/chits/`

**Purpose:** List all chit groups the member is enrolled in.

**Card per group:**

| Field | Notes |
|---|---|
| Group Name | |
| Chit Amount | |
| Slot Number | Member's position |
| Status | Active / Completed |
| Monthly Installment | Current amount due |
| Next Due Date | |
| Progress | X of N months completed |

### 11.3 Chit Details

**URL:** `/member/chits/[id]/`

**Purpose:** Detailed view of a specific chit group enrollment.

**Sections:**

1. **Group Info** — Name, chit amount, duration, scheme type, commencement/termination dates.
2. **My Position** — Slot number, enrollment date, PS/NPS status.
3. **Installment Schedule** — Month-by-month table adapted by scheme type (see [Section 8.8](#88-scheme-schedule-display)). Member's position highlighted. Shows: month, installment amount, winner amount, who won (if recorded).
4. **Payment History** — List of payments made: date, amount, mode, status (verified/pending).
5. **Auction History** — Auction results for this group: month, winner, winning bid.

### 11.4 Bids

**URL:** `/member/bids/`

**Purpose:** View auction participation history and upcoming auctions.

**Tabs:** Upcoming / History

**Upcoming card:** Group name, auction date, time, eligible to bid (yes/no).

**History card:** Group name, auction date, bid amount, result (won/lost), winning amount.

### 11.5 Pending Payments

**URL:** `/member/pending/`

**Purpose:** View all overdue/upcoming payments across all groups.

| Column | Notes |
|---|---|
| Group Name | |
| Month | Due month |
| Amount Due | |
| Due Date | |
| Status | Overdue / Upcoming |
| Days Overdue | If overdue |

### 11.6 Explore New Chits

**URL:** `/member/explore/`

**Purpose:** Browse upcoming chit groups and express interest.

**Card per upcoming group:**

| Field | Notes |
|---|---|
| Group Name | |
| Chit Amount | |
| Installments | Monthly amount |
| Duration | Months |
| Interest Count | How many members expressed interest |

**Action:** "I'm Interested" button → creates an interest record.

### 11.7 Gallery

**URL:** `/member/gallery/`

**Purpose:** View chit launch event photos and flyers shared by the company.

### 11.8 Profile

**URL:** `/member/profile/`

**Sections:**
- Personal Information (read-only, except editable fields like email)
- KYC Documents
- Bank Details
- Address Information

**Sub-pages:**
- `/member/profile/documents/` — View/manage KYC documents
- `/member/profile/settings/` — Notification preferences, language
- `/member/profile/change-password/` — Change password form

### 11.9 Notifications

**URL:** `/member/notifications/`

**Purpose:** In-app notification center.

**Notification types:**
- Payment due reminders
- Auction date alerts
- Winner announcements
- Payment verification status updates
- New chit group announcements

### 11.10 Support Pages

- `/member/faq/` — Frequently asked questions
- `/member/contact-us/` — Company contact information
- `/member/terms-privacy/` — Terms & Conditions and Privacy Policy (also accessible via public link for OTP verification)

---

## 12. Business Agent Portal

**URL:** `/member/business/`

**Purpose:** Business agents recruit new members for chit groups. This portal tracks their performance and commissions.

### 12.1 Dashboard

**Sections:**
1. **Agent Summary** — Total referred members, active groups, total commission earned.
2. **Target Progress** — Current target vs actual (bar chart / progress ring).
3. **Quick Links** — My Members, Commissions, Chit History.

### 12.2 My Members

**URL:** `/member/business/members/`

**Purpose:** View all members referred by this agent.

| Column | Notes |
|---|---|
| Member Name | |
| Mobile | |
| Groups Enrolled | Count |
| Enrollment Date | |
| Status | Active / Inactive |

### 12.3 Commissions

**URL:** `/member/business/commissions/`

**Purpose:** View commission history and pending payouts.

| Column | Notes |
|---|---|
| Group Name | |
| Member Name | Referred member |
| Commission Amount | |
| Payment Date | When paid |
| Status | Paid / Pending |

### 12.4 Chit History

**URL:** `/member/business/chits/[id]/`

**Purpose:** View the performance of a specific chit group that the agent has referred members to.

Includes: group schedule display, member list, payment status overview.

---

## 13. Collection Agent Portal

**URL:** `/member/collections/`

**Purpose:** Field agents collect installments from members and submit them for admin verification.

### 13.1 Dashboard

**Sections:**
1. **Summary Stats:**
   - Total Pending Collection (from N members)
   - Today's Collection (from N groups)
   - Active Chit Groups count
2. **Quick Actions:**
   - Collect Now (→ pending members)
   - Collections (→ records with status tabs)
   - Customer Visits
   - Documents
   - Gallery
3. **Active Chit Groups** — Cards showing group name, pending amount, pending members, completion %.

### 13.2 Pending Members

**URL:** `/member/collections/pending-members/`

**Purpose:** List all members with pending payments assigned to this agent.

| Column | Notes |
|---|---|
| Member Name | |
| Group Name | |
| Amount Due | |
| Due Date | |
| Days Overdue | If overdue |
| Action | "Collect" button → navigates to collect screen |

### 13.3 Collect Screen

**URL:** `/member/collections/collect/[memberId]/`

**Purpose:** Record a collection from a specific member.

**Sections:**

1. **Member Summary** — Name, ID, group, photo avatar.
2. **Dues Summary** — Total Due, Paid, Balance.
3. **Oldest Due Alert** — Highlight if there are old overdue months.
4. **Payment Details:**
   - Amount (pre-filled with balance, editable)
   - Payment Mode (Cash / Bank Transfer / Cheque / Online)
   - If Cash → Denomination grid (₹2000, ₹500, ₹200, ₹100, ₹50, ₹20, ₹10 with count inputs, auto-calculated totals, must match amount)
   - If non-Cash → Transaction reference field
5. **Submit Button** — Creates record as "Pending" (unverified).

### 13.4 Collection Records

**URL:** `/member/collections/records/`

**Purpose:** View the agent's own submission history with status.

**Tabs:** Pending / Verified / Rejected

| Column | Notes |
|---|---|
| Member Name | |
| Group Name | |
| Amount | |
| Date | Submission date |
| Status | Pending / Verified / Rejected |
| Status Note | Admin's note (for rejections) |

### 13.5 Customer Visits

**URL:** `/member/collections/visits/`

**Purpose:** Log field visits to members (for tracking agent activity).

| Field | Type |
|---|---|
| Member / Enrollment | Dropdown |
| Visit Date | Calendar |
| Visit Type | Dropdown (Collection / Follow-up / Document) |
| Notes | Text |
| Photo | Camera/upload |

### 13.6 Document Collection

**URL:** `/member/collections/documents/`

**Purpose:** Collect and upload member documents (KYC, passbook, etc.) in the field.

| Field | Type |
|---|---|
| Member | Dropdown |
| Document Type | Dropdown (Aadhaar, PAN, etc.) |
| Document Number | Text |
| Upload | Camera/file |

### 13.7 Group Detail

**URL:** `/member/collections/groups/[id]/`

**Purpose:** View a specific group's collection status.

**Shows:** Group info, member list with payment status (paid/pending per month), scheme schedule, total collected vs total due.

---

## 14. Staff Module (RBAC)

### 14.1 Overview

The Staff Module implements **Role-Based Access Control (RBAC)** for company employees who need limited access to the admin portal.

**Key Concepts:**

| Concept | Description |
|---|---|
| **Staff User** | A person registered as a member with staff access enabled |
| **Role** | A named set of permissions (e.g., "Accountant", "Data Entry Operator") |
| **Permission** | Access to a specific module + action (e.g., "Members → View", "Auctions → Create") |

### 14.2 Role Management

**Navigation:** Security → Roles

**Purpose:** Admin creates roles and assigns module-level permissions.

**Create Role:**

| Field | Type | Notes |
|---|---|---|
| Role Name | Text | **Mandatory**, unique |
| Description | Text | Optional |
| Status | Toggle | Active/Inactive |

**Permission Matrix:**

Each role has a permission grid covering all admin modules:

| Module | View | Create | Edit | Delete | Export |
|---|---|---|---|---|---|
| Members | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ |
| Chit Groups | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ |
| Enrollments | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ |
| Auctions | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ |
| Collections | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ |
| Accounts | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ |
| Reports | ☑/☐ | — | — | — | ☑/☐ |
| Security | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ | — |
| Utilities | ☑/☐ | ☑/☐ | ☑/☐ | ☑/☐ | — |
| ... | ... | ... | ... | ... | ... |

### 14.3 Staff User Assignment

**Navigation:** Security → Staff Users

**Purpose:** Assign roles to users.

| Field | Type | Notes |
|---|---|---|
| User | Searchable dropdown | From registered members with staff access |
| Role | Dropdown | Created roles |
| Branch | Dropdown | If multi-branch (optional) |
| Effective From | Calendar | |
| Effective To | Calendar | Optional |

### 14.4 Access Enforcement

**Frontend:**
- Navigation menu hides modules the staff user has no "View" permission for.
- Action buttons (Create, Edit, Delete) are hidden based on permissions.
- Routes are guarded — if a staff user navigates directly to a URL they don't have access to, redirect to dashboard with "Access denied" message.

**Backend:**
- Every endpoint checks the user's role permissions from the JWT.
- Unauthorized access returns HTTP 403 with clear error message.

### 14.5 Staff Login

Staff users log in through the same Company Admin login form (Company Code + User Code + Password). The system detects their role and renders the admin portal with restricted navigation.

**Key Behavior Differences:**
- Staff sees only permitted modules in the sidebar.
- Staff cannot access Security → Roles (unless explicitly granted).
- Audit log records all staff actions.
- Staff cannot modify their own role or permissions.

### 14.6 Collection Verification by Staff

Staff users with "Collections → Edit" permission can verify/reject collection agent submissions, same as the admin. Payments created by staff are **auto-verified** (same as admin-created payments).

---

## 15. Super Admin Portal

### 15.1 Purpose

Platform-level management for the Bonagiri Chits platform owner.

### 15.2 Company Management

**URL:** `/super-admin/companies/`

**Purpose:** Register and manage chit fund companies on the platform.

| Field | Type | Notes |
|---|---|---|
| Company Name | Text | **Mandatory** |
| Company Code | Text | **Mandatory**, unique (used for login) |
| Registration Number | Text | Government registration |
| Address | Text | |
| Contact Person | Text | |
| Mobile | Numeric | |
| Email | Text | |
| Status | Toggle | Active / Inactive |
| Logo | Image upload | Company logo |

**Actions:** Create, View, Edit, Activate/Deactivate.

### 15.3 Platform Settings

- SMS Gateway configuration
- Email service configuration
- Default commission rates
- OTP settings (expiry time, max attempts)
- File upload limits

---

## 16. Notifications & Communication

### 16.1 SMS Notifications

| Trigger | Recipient | Message |
|---|---|---|
| OTP Verification | Member | OTP + T&C link |
| Payment Due Reminder | Member | Due amount, due date, group name |
| Payment Received | Member | Amount, group, receipt number |
| Auction Winner | Winner | Congratulations, prize amount |
| Auction Date Reminder | All group members | Date, time, group name |
| Payment Overdue | Member | Overdue amount, penalty warning |
| Collection Agent Assignment | Agent | Group name, member list |

### 16.2 In-App Notifications

All SMS triggers also create in-app notifications visible in the notification center.

### 16.3 Push Notifications (Mobile)

Same triggers as SMS, delivered via push notifications on iOS/Android.

---

## 17. Data Model Reference

### 17.1 Core Entities

```
company
  └── member (KYC, bank, photo, signature, verification_status)
  └── staff_user (role assignment)
  └── chits_group (value, duration, type, commission, status)
        ├── enrollment (member ↔ group, slot, agents, nominee)
        ├── chitsinstallment (monthly schedule per member)
        ├── auction (monthly auction records, winner status)
        └── customerpayment (payment records per member per month)
  └── fixed_scheme_chits_configuration (price tables for schemes 62-65)
  └── collection_submission (agent collections, verification status)
```

### 17.2 Supporting Entities

```
Geography:   country → state → district → city → area → route
Accounts:    account_group → account (ledger) → opening_balance
Agents:      agent_commission_config → agent_target → agent_transfer_history
Legal:       suit_file_information
Planning:    upcoming_chits → upcoming_chit_interest
Self-chits:  self_chit (company's own slots)
Content:     contact_us, faq, terms_privacy
Auth:        otp_verification (member OTP records)
RBAC:        role → role_permission → staff_role_assignment
Static:      static_dropdowns, static_subcategories
Notifications: notification_log
```

### 17.3 ID Types

| Type | Entities |
|---|---|
| **UUID** | district, city, chits_group, auction, suit_file, upcoming_chits, self_chit, fixed_scheme_config |
| **INTEGER** | member, route, area, enrollment, account, account_group |

**Critical:** Never blanket-coerce IDs with `Number()` — check the entity type.

### 17.4 Key Relationships

```
member ──┬── enrollment ──── chits_group
         │        │
         │        ├── chitsinstallment
         │        └── customerpayment
         │
         ├── otp_verification (1:many)
         ├── collection_submission (as agent → 1:many)
         └── agent_target_entry (1:many)

chits_group ──── fixed_scheme_chits_configuration (optional, 1:1)
chits_group ──── auction (1:many)

role ──── role_permission (1:many)
staff_user ──── role (many:1)
```

---

## 18. Compliance & Legal

### 18.1 Chit Funds Act, 1982

| Requirement | Implementation |
|---|---|
| Registration | CAR number, PSO number stored per group |
| Commission cap (5%) | Enforced in Auction form validation |
| Max bid discount (40%) | Configurable per group (Max Ceiling %) |
| Record-keeping | Full audit log, installment records, auction minutes |
| Annual audit | Reports module: Balance Sheet, P&L, Trial Balance |
| Digital draws | Auction Spinner with verifiable randomness |
| Minutes signing | Minutes Filing Date tracked per auction |

### 18.2 GST (18% on Commission)

- Calculated automatically in auction entries.
- Applied to foreman's commission only (not on member contributions or prizes).
- GST fields (IGST, CGST, SGST) in Account entries for invoicing.

### 18.3 KYC (Know Your Customer)

- Mandatory during member registration (at least 1 KYC document).
- Supported: Aadhaar, PAN, Voter ID, Passport, Driving Licence, Utility Bills.
- Photo + Signature mandatory.
- OTP verification ensures member identity confirmation.

### 18.4 Data Privacy

- Member personal data encrypted at rest.
- Passwords hashed (not plaintext).
- JWT tokens with expiry.
- Role-based access ensures data isolation.
- Mobile/web access toggles per member.

---

## 19. Platform-Specific Notes

### 19.1 Web Frontend (Next.js)

| Aspect | Detail |
|---|---|
| Framework | Next.js 16 + React 19 |
| Styling | Tailwind CSS v4, token-based theme |
| Forms | React Hook Form + Zod validation |
| State | Redux (auth), TanStack Query v5 (server state) |
| Architecture | Feature-based vertical slices |
| Build | Static export (`output: 'export'`) |
| Responsive | Mobile-first, breakpoints: sm (640), md (768), lg (1024), xl (1280) |

### 19.2 Backend (Express)

| Aspect | Detail |
|---|---|
| Framework | Express.js |
| ORM | Sequelize |
| Database | PostgreSQL |
| Auth | JWT (access + refresh tokens) |
| API Style | All POST endpoints under `/api/` |
| File Upload | Multer |
| SMS | Configurable gateway (MSG91/Twilio) |

### 19.3 iOS App

| Aspect | Detail |
|---|---|
| Portals | Member, Business Agent, Collection Agent |
| Offline | Collection submissions queued when offline |
| Camera | Document scanning, visit photos |
| Push | APNs for notifications |
| Biometric | Touch ID / Face ID for login (optional) |

### 19.4 Android App

| Aspect | Detail |
|---|---|
| Portals | Member, Business Agent, Collection Agent |
| Offline | Collection submissions queued when offline |
| Camera | Document scanning, visit photos |
| Push | FCM for notifications |
| Biometric | Fingerprint / Face unlock for login (optional) |

### 19.5 Shared API Contract

All platforms consume the same backend API. Platform-specific behavior (offline queuing, push notifications, biometrics) is handled client-side. The API contract is platform-agnostic.

---

## 20. Glossary

| Term | Meaning |
|---|---|
| PS | Prized Subscriber — has won the prize |
| NPS | Non-Prized Subscriber — hasn't won yet |
| Adding | Extra amount in Fixed+Adding schemes |
| Withdrawn | Member who has received their chit amount |
| Not-Withdrawn | Member still waiting |
| Fixed Chit | No bidding — prize from schedule |
| Open Auction | Members bid — lowest bidder wins |
| Chit Number / Slot | Position in the group (1 to N) |
| Draw | Monthly event to select winner |
| Net Amount | Winner receives after commission + GST |
| Base Subscription | Chit Value ÷ Number of Members |
| Foreman | The chit fund company |
| FDR | Fixed Deposit Receipt (company's financial security) |
| CAR | Chit Agreement Registration number |
| PSO | Prior Sanction Order (government approval) |
| RBAC | Role-Based Access Control |
| OTP | One-Time Password |
| KYC | Know Your Customer |
| Collection Agent (CA) | Field agent who collects payments |
| Business Agent (BA) | Agent who recruits members |
| Company Chit / Company Month | Month(s) where the company takes the prize |

---

*End of Document*
