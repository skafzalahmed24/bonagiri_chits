# Self Chits as Company Chits

Oct 4, 2026 · Krishna · updated the same day after reviewing the backend team's plan of action

**Status:** approved for implementation on 4 Oct 2026 (client and compliance sign-off reported by Krishna). Build with the decisions in "Decisions for the build" below unless the team says otherwise.

## The request and the short answer

**The request.** The team wants every self chit in a group to follow the same rules as the company chit: the seat is not auctioned, the company takes the full chit amount in that month with no discount, members get no dividend that month, and the seat can never be recorded as an auction winner.

**The short answer.** It can be built, but it is not a screen change: it changes how much every other member of the group pays, and it goes beyond the single discount-free month the Chit Funds Act gives the foreman. The original recommendation was not to build it until the client confirmed in writing after checking with their compliance adviser or auditor. **That approval was given on 4 Oct 2026**, so the full rule is to be built as described below (see Decisions for the build).

## How it works today

|  | Company chit | Self chit |
| --- | --- | --- |
| Where it is set | Chit group form, **Company Chit Number** (one seat) | Masters → Self Chits (any number of seats) |
| What the backend creates | An enrollment for the company with instalments, plus a self-chit record for the seat | Only a self-chit record that reserves the seat |
| Auction in that month | None: auction numbers skip the month | Not applicable today (the seat is not in the bidder list at all) |
| Dividend | The month is skipped when a dividend is applied | None, because the seat has no instalments |
| Can win an auction | No (blocked) | Not offered |
| Counts towards "group full" | Yes | Yes |

Two things follow from this:

- In the data, **every company chit is also a self chit**, but extra self chits are only seat reservations. The company's payments on those seats are not tracked anywhere.
- **Fixed-scheme groups already allow several company months.** The "fixed adding" scheme template has a Company Chit count (e.g. the first 2 months go to the company), and the payout table is built around it. This request is therefore about **open-auction groups**, where the rule today is one company month per group.

## What changes for members: a worked example

An open-auction group of **₹1,00,000**, **10 seats**, **10 months**, instalment ₹10,000, foreman commission 5%, GST 18% on the commission. The company chit is seat #1; the company also holds self chits #5 and #7. For illustration, every auctioned month closes at a bid of **₹80,000**:

- discount ₹20,000 − commission ₹5,000 − GST ₹900 = **₹14,100 dividend pool**, shared by all 10 seats = ₹1,410 per seat.
- The last month (10) is paid at the full amount, so it has no discount either way.

|  | Today (one company month) | Self chits as company chits |
| --- | --- | --- |
| Months with no auction | Month 1 | Months 1, 5 and 7 |
| Auctions that produce a dividend | 8 (months 2–9) | 6 (months 2, 3, 4, 6, 8, 9) |
| Total dividend pool | ₹1,12,800 | ₹84,600 |
| Dividend each seat receives over the group | **₹11,280** | **₹8,460** |
| Extra each ordinary member pays | — | **₹2,820** (₹19,740 across the 7 members) |
| Company's prize on seats #5 and #7 | Whatever those seats win at auction (about ₹80,000 each here) | ₹1,00,000 each, with no bidding |

In short, each additional company month moves roughly one month's dividend from the members to the company. Members will see it in their passbooks as instalments that never drop in those months, and in the auction schedule as months with no auction.

## Compliance and sign-off

- **The Act gives the foreman one discount-free prize.** Chit Funds Act 1982, s.21(1)(a), lets the foreman take the chit amount at its own instalment without a discount. The app's auction rules follow this today (the comment in `schemeHelpers.js` cites it). Other tickets the company holds are subscriber tickets: they pay instalments and compete in the auction like everyone else.
- **The agreement members signed names one foreman's month.** With several company months, the auction schedule, dividend register and passbooks would no longer match the registered chit agreement, which is what a member or the Registrar would compare them against.
- **This note is not legal advice.** The client checked the change with their compliance adviser or auditor and approved it on 4 Oct 2026; the written confirmation should be kept with the client's records.

Signed off: the client (business owner) and their compliance adviser or auditor, 4 Oct 2026. The backend team lead owns the build (the rules live in the backend).

## If approved: what has to be built

The company-month rule lives in the backend, so most of the work is there. "Company seats" below means the group's Company Chit Number plus every active self chit in that group.

### Scope

- **Open-auction groups only.** Fixed-scheme groups keep the company months set in their scheme template; self chits there stay ordinary seat reservations.
- **Behind a switch, off by default.** Add a setting (per group, or in Utilities → Company Setup) that turns "self chits take a company month" on. Groups without it keep today's behaviour, and the feature can be turned off without a migration if the compliance answer changes.
- **New groups only** (decision 3; see Existing groups below).

### How numbering works (for tests)

The auction number **is** the month number. With company seats #1, #5 and #7 in a 10-month group, auctions are recorded as **#2, #3, #4, #6, #8, #9 and #10**. Months 1, 5 and 7 have no auction record. Month 10 is the last instalment and is recorded at the full chit amount, so it has no discount and no dividend. The dividend of auction #4 goes to month 6, because month 5 is a company month.

### Backend

1. **One list of company seats per group.** Add a helper that returns the company chit number plus the slot of every active self chit, sorted, and return it as `company_seats` on `POST /api/chits-group/get-by-id` and `POST /api/chits-group/get-all` (all endpoints are POST; there is no `/admin` segment in the path).
2. **Self chits become real tickets.** Creating a self chit must also create the company's enrollment and instalments for that seat, in the same transaction, exactly as creating a group does for the company chit today (the company member is found or created the same way).
3. **Auction numbering and dividends skip every company month.** `nextOpenAuctionNumber` and `dividendTargetMonth` in `schemeHelpers.js` skip one month today; they must skip every month in `company_seats`.
4. **No company seat can win.** The "company cannot be recorded as an auction winner" check exists only in record-winner today. It must cover every company seat, in record-winner **and** in auction save (`storeOrUpdateAuctionService`).
5. **Bidder list: hide company seats only for auctions.** `group/members` is also used by the chit group detail page, the group instalments grid and the collection agent's document screens, which need every member. Return `is_company: true` on every company seat, and drop those seats only when `filter_unwon` is set (the auction form and the auction lottery).
6. **Company seats are not member dues.** The daily penalty job, member dues, the agent's pending lists, outstanding and defaulter reports currently have no rule for the company's enrollment. Each company seat with instalments would accrue penalties and appear as unpaid. Exclude company seats from these, or settle their instalments automatically. Check today's single company chit first; it is likely already affected.
7. **Guards on self chits.**
   - Refuse a seat already enrolled to a member (a tester already found this gap).
   - Refuse a month already behind the group: the last recorded auction number is at or past the seat, or the seat month's due date has passed. (Checking for "an auction on that month" never fires, because company months have no auction.)
   - Refuse adding a self chit once the group has had its first auction. Each auction's dividend is divided by the number of enrollments (`memberCount = totalEnrollments`), so a seat added later would have been missing from earlier divisions.
   - Refuse changing a self chit's seat (`slot_id`) on edit; delete it and add it again instead, so the company enrollment never has to move.
   - Refuse a self chit on the last month, which is always recorded at the full amount.
8. **Removing a self chit.** Refuse once the seat has payments or its month has passed; otherwise soft-delete the self chit and the company enrollment together.
9. **Existing groups.** Today extra self chits have no enrollment, so they are not counted when a dividend is divided. Applying the rule to a running group would change the divisor and the dividend months mid-group. Decision: new groups only, so no recalculation is needed.
10. **Member app data.** In `user/chit-details`, mark each company month with `is_company_month: true` (no bid, no dividend). Leave the wording to the frontend.
11. **Reports and print.** The auction register and the chit agreement print show a single company chit number; they would list all company seats.
12. **Fix while there.** `storeOrUpdateAuctionService` loads the group with `findByPk` without the company scope (a regression from the 4 Oct backend update). Item 4 touches this function, so restore the company-scoped lookup in the same change.

### API changes the frontend needs

| Endpoint | Change |
| --- | --- |
| `chits-group/get-by-id`, `chits-group/get-all` | New `company_seats: number[]`, e.g. `[1, 5, 7]`; new switch field (e.g. `self_chits_as_company_months: boolean`) |
| `chits-group/store-or-update` (or Company Setup) | Accepts the switch field |
| `group/members` | `is_company: true` on every company seat; those seats dropped when `filter_unwon` is true |
| `user/chit-details` | `is_company_month: true` on company-month entries in `monthly_activity` |
| `self-chit/store-or-update`, `self-chit/delete` | New refusals, each with a clear message: seat taken by a member, month already passed, group has already had an auction, seat change not allowed, last month, seat has payments |
| `auction/record-winner`, `auction/store-or-update` | Refusal "Company seats cannot be auction winners" for any company seat |

### Frontend

1. **Auction screens.** The next auction number (`scheme-schedule.js`) skips one company month today; it would skip every entry in `company_seats`. The bidder list and the auction lottery hide those seats.
2. **Chit group form and Self Chits screen.** Show the switch and the company seats together, with the month each one takes, and explain that a self chit takes its month without an auction. Show the backend's refusals in the form.
3. **Member app.** Month cards with `is_company_month` read "Company month, no auction" instead of showing an empty bid.
4. **Guides and test cases.** Update the User Guide and Application Guide and add test cases for numbering, dividends, the winner block, the guards and the switch.

### Tests the backend should include

- Numbering: company seats #1, #5, #7 in a 10-month group give auctions #2, #3, #4, #6, #8, #9, #10; #10 is at the full amount.
- Dividends: auction #4's dividend lands on month 6; every dividend is divided across all 10 enrollments.
- Winner block in both record-winner and auction save.
- Each guard in item 7, and removal in item 8.
- Company seats get no penalty and do not appear in dues, pending or defaulter lists.
- `group/members` returns company seats without `filter_unwon` and drops them with it.
- With the switch off, behaviour is unchanged from today.

Rough size: backend items 1–6 are the core; 7–12 are needed before go-live. The frontend work starts once the API changes above are available.

## Decisions for the build

Questions 1 and 2 were settled with the approval: the full rule (c) is wanted and has been signed off. For the rest, these are the recommended answers. Build with them unless the team says otherwise.

| # | Question | Decision to build with |
| --- | --- | --- |
| 1 | Which rules are needed: (a) seat kept away from members and bidding, (b) no instalments, (c) full amount in its month, no auction, no dividend? | **All of (c)**, which includes (a). |
| 2 | Compliance approval of (c)? | **Approved** (4 Oct 2026). Keep the written confirmation with the client's records. |
| 3 | New groups only, or running groups too? | **New groups only.** Running groups keep today's behaviour; no recalculation. |
| 4 | Which month does each self chit take? | **Its seat number**, the same way the company chit works today (seat #5 takes month 5). |
| 5 | Fixed-scheme groups? | **Not included.** They keep the company months set in their scheme template. |
| 6 | Where does the switch live? | **Per group**, set when the group is created and fixed once the first auction is recorded. Off by default. |
| 7 | Company seats' instalments? | **Excluded** from penalties, member dues, agent pending lists and outstanding / defaulter reports. They are the company's own seats, not member arrears. |

## Review of the backend team's plan of action (4 Oct 2026)

The backend team's plan ("Plan of Action: Implementing Self Chits as Company Chits") follows this note and correctly makes compliance sign-off Phase 0. The build plan above now includes the corrections and gaps found in review:

| Plan item | Review |
| --- | --- |
| 6.2 simulation: "auctions 1 through 7 map to months [2, 3, 4, 6, 8, 9, 10]" | The auction number is the month: auctions are #2, #3, #4, #6, #8, #9, #10, and #10 is at the full amount. See "How numbering works". |
| 2.2 past-month guard: "an auction has already occurred for slot_id" | Never fires: company months have no auction. Check the last recorded auction number or the seat month's due date (item 7). |
| 3.1 filter company seats out of `getGroupMembersService` | Would break the group detail page, instalments grid and agent document screens. Filter only with `filter_unwon`; otherwise flag `is_company` (item 5). |
| 4.1 endpoint list | Endpoints are POST with no `/admin` segment; `user/home` and `user/all-chits-groups` don't need `company_seats` (API table). |
| 4.2 label fields (`running_status_label: "Active chit"`, `dividend_text`) | Replace with a boolean `is_company_month`; wording stays in the frontend (item 10). |
| Not covered | Penalties and dues on company seats (item 6); dividend divisor and adding seats after the first auction (items 7, 9); editing a seat; a company seat on the last month; fixed-scheme groups (Scope); an on/off switch (Scope); the frontend's API needs (API table); the `findByPk` company-scope fix (item 12). |

Phase 0 is complete: the client and their compliance adviser or auditor approved the change on 4 Oct 2026.
