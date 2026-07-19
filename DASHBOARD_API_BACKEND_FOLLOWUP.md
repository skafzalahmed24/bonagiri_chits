# Admin Dashboard API — Backend Follow-Up

**For the backend team.** Reviewed `ddc165b` ("dashbaord api implemented") and
`frontend_dashboard_api_docs.md` against the actual code. The documented contract (URL,
request shape, response structure) is a reasonable design — no objection to the shape
itself. The problem is `getDashboardSummaryService` (`adminService.js:3854`) doesn't
actually compute any of it.

---

## The core issue

Every field in the response is built from a variable that's never declared:

```js
financials: {
  collection_today: collectionToday || 0,        // collectionToday: never assigned
  collection_month: collectionMonth || 0,         // never assigned
  outstanding_dues: 0,
  commission_earned: commissionEarned || 0,       // never assigned
  dividend_distributed: dividendDistributed || 0  // never assigned
},
// ...same pattern for every other field
```

Confirmed by searching the whole file — `collectionToday`, `collectionMonth`,
`commissionEarned`, `dividendDistributed`, `activeMembersCount`, `activeGroupsCount`,
`newEnrollmentsCount`, `formattedUpcomingAuctions`, `installmentsDue`, `topAgents`,
`monthlyCollections` each appear exactly once — at the point of use, never assigned. No
model is queried anywhere in the function. The `companyId` parameter is received but
never used. This throws `ReferenceError: collectionToday is not defined` on the very
first line of the response object, on every call — it has never successfully returned
real data.

Below is concrete guidance for each field, based on the models this backend already has
(all of this is grounded in tables reviewed extensively during the auction-winner and
staff-RBAC work — reuse the same associations rather than re-deriving them).

---

## `financials`

**`collection_today` / `collection_month`** — sum of verified payments in the date range,
company-scoped through the installment → enrollment chain:

```js
const collectionToday = await CustomerPayment.sum(
  sequelize.literal('received_amount + penalty_paid'),
  {
    where: { payment_status: 1, payment_date: todayStr },
    include: [{ model: ChitsInstallment, as: 'installment', required: true,
      include: [{ model: Enrollment, as: 'enrollment', where: { company_id: companyId }, required: true }] }]
  }
);
```

Same query with a month-start/month-end range for `collection_month`. **Depends on
`payment_date` existing on `CustomerPayment`** — that column doesn't exist yet; it's
specced in `docs/PAYMENT_HISTORY_RECEIPTS_BACKEND_SPEC.md` (§1). If Dashboard ships before
Payment History's migration, fall back to `createdAt` for now and note it's an
approximation, or sequence Dashboard's "today/month" fields after that migration lands —
your call on ordering, just don't silently use `createdAt` without flagging the caveat
somewhere visible, since a late-entered payment would misattribute the day.

**`outstanding_dues`** — this doesn't need to stay a placeholder, it's a real,
computable number: sum of `payable_amount + penalty_amount` for installments with no
`payment_status = 1` payment against them, for started groups, company-scoped. Same
"unpaid installment" subquery pattern already used in `getChitDetailsService`
(`userService.js` — the `PAID_INSTALLMENT_SUBQUERY` pattern) — reuse it here instead of
writing a new one.

**`commission_earned`** — this one has a real gap underneath it, not just a missing
query. `Auction.company_commission` is only ever populated for **Open Auction** groups
(`recordWinnerService`'s open-auction branch sets it explicitly). For **fixed-scheme**
auctions, no commission value is stored on the `Auction` row at all — the winning amount
IS the full derived payout, and the company's profit margin only exists as a computable
formula (`chit_value × company_percentage / 100`, per `schemeHelpers.js`), never
persisted. So summing `Auction.company_commission` alone will silently undercount
commission for any company running fixed-scheme groups. Either compute fixed-scheme
commission on the fly per matching auction row (join to `FixedSchemeChitsConfiguration`,
apply the formula), or — cleaner long-term — store it on the `Auction` row at
record-winner time the same way `company_commission` already gets set for open auction,
so this and any future reporting doesn't have to re-derive it. Flagging the decision
rather than picking for you, since it touches `recordWinnerService` again.

**`dividend_distributed`** — sum of `Auction.dividend`, company-scoped via `ChitsGroup`.
Correctly low/zero for companies running mostly fixed schemes — those don't have a
dividend concept (no bidding), that's expected, not a bug.

## `statistics`

**`total_active_members`** — `Member.count({ where: { company_id, is_deleted_status: 0 } })`.
Clarify with whoever's driving this feature whether "active" should also mean
`is_verified: true` (per the OTP verification work) — an unverified member arguably
isn't "active" yet in any real sense.

**`active_chit_groups`** — `ChitsGroup.count({ where: { company_id, chits_group_status: 1 } })`.

**`new_enrollments_this_month`** — `Enrollment.count` where `company_id` matches and
`enrollment_date` (or `createdAt`, confirm which is the intended signal) falls in the
current month.

**`available_group_capacity`** — sum across not-full groups of
`no_of_installments − enrollment_count`. Same caveat already on file from the earlier
chit-group review: `slot_filled_count` is only computed by `getAllChitsGroupDetailsService`
(the list endpoint), not by a bare group fetch — if this reuses that computation, make
sure it's the list-endpoint's logic, not the plain `findByPk` path that doesn't carry it.

## `alerts`

**`upcoming_auctions`** — `ChitsGroup.findAll` where `company_id` matches and
`auction_date` falls within the next 7 days, select `group_name`/`auction_date`. Matches
the doc's example shape directly.

**`installments_due_this_week`** — count of `ChitsInstallment` rows with `due_date` in
the next 7 days and no matching `payment_status = 1` payment, company-scoped through
`Enrollment`.

**`defaulters_count`** — needs a definition before it can stop being a placeholder: count
of **members** with at least one overdue unpaid installment, or count of **overdue
installments** themselves? Those give different numbers. Confirm which the dashboard
consumer (presumably the company admin) actually wants before implementing — an easy
field to get subtly wrong.

## `leaderboards`

**`top_collection_agents`** — group `CustomerPayment` by the linked
`CollectionAgentAmount.collection_agent_id`, sum `received_amount` for the current month,
order desc, limit 5. Matches the doc's example shape.

**`top_business_agents`** — same idea against whatever table tracks business-agent
commission (`ConfigureBusinessAgentCommission`/`HistoryBusinessAgent` — check which one
actually has the per-agent earned amount, not just the configured rate).

## `charts`

**`monthly_collections`** — trailing 6 months, `CustomerPayment` summed and grouped by
month/year, company-scoped. Matches the doc's example shape directly.

**`group_status`** — `ChitsGroup.count` grouped by `chits_group_status` (0/1/2),
company-scoped. Straightforward, matches the doc's example shape.

---

## Verification checklist

| # | Scenario | Expected |
|---|---|---|
| Baseline | Call `dashboard/summary` right now | Currently: 500, `ReferenceError`. After fix: 200 with real numbers |
| Scoping | Two different companies call it | Each sees only their own numbers — verify with two real test companies, not just one |
| `commission_earned` | A company running only fixed-scheme groups | Non-zero (currently would be zero/undercounted if only summing `Auction.company_commission`) |
| `outstanding_dues` | A group with 3 unpaid installments this cycle | Reflects the real sum, not `0` |
| `defaulters_count` | Confirm the definition (members vs installments) before shipping | Documented decision, not a guess |
