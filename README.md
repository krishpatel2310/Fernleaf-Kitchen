# Fernleaf Kitchen — Engineering Assignment

Fernleaf Kitchen is a production-grade B2B catering and commercial kitchen management platform engineered with NestJS, Prisma ORM, and PostgreSQL. It delivers end-to-end operational capabilities across 11 core architectural domains:
1. Multi-tenant Enterprise Architecture & Authentication (RBAC)
2. Company Management & Corporate Calendars
3. Hierarchical Master Catalogue (Dishes, Option Groups, Portions, Allergens, Dietary Tags)
4. Dynamic Pricing Engine & Derivation Rules
5. Employee Self-Service Carts & Customizations
6. Operational Cutoff Engine & Automated Confirmations
7. Kitchen Operations Board & Unit Production
8. Dispatch Logistics, Drop Grouping & Driver Workflows
9. Billing, Invoicing & Historical Audit Snapshots
10. Dynamic Operational Settings & Working Day Calendars
11. Role-Specific Operational Dashboards (Admin, Kitchen, Dispatch, Driver)

---

## Operational Dashboards (Phase 11)

Role-specific operational dashboards provide real-time, decision-grade visibility for each operational group. All calculations and derived values are computed authoritatively on the backend, ensuring that frontend views remain purely presentational without recreating complex business rules.

### Server-Side Access Control (RBAC)
All dashboard APIs are secured using server-side permission decorators and guards:
- `GET /api/dashboards/admin`: Requires `dashboard.admin` permission.
- `GET /api/dashboards/kitchen?date=YYYY-MM-DD`: Requires `dashboard.kitchen` permission.
- `GET /api/dashboards/dispatch?date=YYYY-MM-DD`: Requires `dashboard.dispatch` permission.
- `GET /api/dashboards/driver`: Requires `dashboard.driver` permission. Strictly scoped to the authenticated driver's JWT identity.

---

### Dashboard 1: Admin Operational Overview

Provides executive and administrative visibility across orders, kitchen risk, dispatch throughput, billing status, and system configuration health.

#### Metrics Included:
- **Orders Overview**:
  - `totalOrdersToday`: Total orders recorded with `deliveryDate` matching today in `Asia/Kolkata`.
  - `operationalOrdersToday`: Current confirmed operational demand (`CONFIRMED`). Strictly excludes completed `DELIVERED`, `DRAFT`, unconfirmed `PLACED`, `CANCELLED`, and `REJECTED`.
  - `confirmedOrdersToday`: Confirmed active orders for today.
  - `placedOrdersToday`: Placed orders awaiting cutoff confirmation.
  - `draftOrdersToday`: Unplaced drafts/carts for today.
  - `deliveredOrdersToday`: Completed deliveries for today.
  - `cancelledOrdersToday`: Cancelled orders for today (isolated; never counted in active workload).
  - `rejectedOrdersToday`: Rejected orders for today.

> [!NOTE]
> **Operational Orders vs Delivered Orders Semantic Distinction:**
> - `operationalOrdersToday`: Represents current confirmed operational demand for today's delivery date (`status = CONFIRMED`). Measures active workload requiring kitchen preparation and dispatch delivery. Strictly excludes completed `DELIVERED`, `DRAFT`, unconfirmed `PLACED`, `CANCELLED`, and `REJECTED` orders.
> - `deliveredOrdersToday`: Represents completed delivery fulfillment activity (`status = DELIVERED`). Completed deliveries are no longer active operational work and belong exclusively in completed delivery reporting.

- **Kitchen Risk**:
  - `totalKitchenUnits`: Total distinct production units for confirmed orders today.
  - `kitchenUnitsCompleted`: Units in `DONE` status.
  - `kitchenUnitsRemaining`: Remaining units in `NOT_STARTED` or `IN_PROGRESS`.
  - `lateUnitsCount`: Incomplete units past planned ready time (`getTimingStatus === 'LATE'`).
  - `atRiskUnitsCount`: Incomplete units within 15 minutes of ready time (`getTimingStatus === 'AT_RISK'`).
  - `onTrackUnitsCount`: Incomplete units with $> 15$ min lead time (`getTimingStatus === 'ON_TRACK'`).
  - `confirmedOrdersWithKitchenPending`: Confirmed orders where kitchen work is not fully complete (`kitchenReadyAt IS NULL`).
  - `overallKitchenStatus`: Overall kitchen health (`LATE`, `AT_RISK`, `COMPLETED`, `ON_TRACK`).
- **Dispatch Overview**:
  - `totalDropsToday`: Total scheduled delivery drops for today.
  - `kitchenReadyDrops`: Drops in `KITCHEN_READY` awaiting dispatch staging.
  - `dispatchReadyDrops`: Drops in `DISPATCH_READY` staged for loading.
  - `outForDeliveryDrops`: Drops in `OUT_FOR_DELIVERY` en route.
  - `deliveredDrops`: Drops completed today.
  - `unassignedDropsCount`: Active drops (`status != DELIVERED`) lacking an assigned driver (`driverId = null`).
  - `assignedDropsCount`: Drops assigned to a delivery driver.
- **Billing Overview**:
  - `uninvoicedConfirmedOrderCount`: Confirmed orders not yet placed on an invoice.
  - `uninvoicedConfirmedTotalCents`: Integer cents sum of uninvoiced confirmed orders.
  - `issuedInvoiceCount`: Count of invoices in `ISSUED` (unpaid) status.
  - `issuedInvoiceTotalCents`: Total integer cents of unpaid issued invoices.
  - `paidInvoiceCount`: Count of paid invoices.
  - `paidInvoiceTotalCents`: Total integer cents collected from paid invoices.
  - `invoicesWithAdjustmentsCount`: Issued invoices containing post-issuance order price changes or order cancellations.
- **Configuration & Operational Health**:
  - `cutoffTime`: Kitchen order cutoff time (e.g. `16:00`).
  - `cutoffWorkingDaysCount`: Number of prior working days for order cutoff (e.g. `1`).
  - `kitchenTimezone`: Standardized timezone (`Asia/Kolkata`).
  - `activeWorkingDays`: Days of the week marked as working for the kitchen.
  - `upcomingHolidaysCount`: Scheduled kitchen holidays on or after today.
  - `activeCompaniesCount`: Count of active corporate client accounts.

---

### Dashboard 2: Kitchen Production Board

Answers: *"What needs to be prepared, where is it, and what is at risk?"*

#### Metrics Included:
- **Workload Summary**:
  - `totalConfirmedOrders`: Count of confirmed orders contributing to production.
  - `totalUnits`: Total kitchen units (distinct order combinations) for the target date.
  - `unitsNotStarted`: Units in `NOT_STARTED`.
  - `unitsInProgress`: Units currently being prepped (`IN_PROGRESS`).
  - `unitsDone`: Units completed (`DONE`).
  - `completedUnits`: Equal to `unitsDone`.
  - `lateUnits`: Active units past planned ready time.
  - `atRiskUnits`: Active units within 15 minutes of planned ready time.
  - `onTrackUnits`: Active units with comfortable lead time.
  - `overallKitchenStatus`: Authoritative status (`LATE` / `AT_RISK` / `COMPLETED` / `ON_TRACK`).
- **Station Workload Breakdown** (`stationWorkload`):
  - Per active kitchen station (e.g. Hot Station, Cold Station, Dessert Station):
    - `stationId`, `stationName`, `totalUnits`, `notStarted`, `inProgress`, `done`, `late`, `atRisk`, `onTrack`.
- **Unassigned Station Workload** (`unassignedStationWorkload`):
  - Explicitly categorizes units for dishes that do not have an assigned station (`stationId: "unassigned"`).
- **Urgent Units List** (`urgentUnits`):
  - Prioritized list of the top 20 late and at-risk units showing order number, company, dish name, quantity, station, delivery time, and delay minutes.

---

### Dashboard 3: Dispatch & Logistics Board

Answers: *"What is ready to leave, who is driving it, and what deliveries are currently in progress?"*

#### Metrics Included:
- **Drop Lifecycle Summary**:
  - `totalDrops`: Total delivery drops scheduled for the date.
  - `totalOrdersInDrops`: Total customer orders aggregated into drops.
  - `kitchenReadyDrops`: Drops waiting for kitchen completion or staging (`KITCHEN_READY`).
  - `dispatchReadyDrops`: Drops packed and ready for departure (`DISPATCH_READY`).
  - `outForDeliveryDrops`: Drops currently on the road (`OUT_FOR_DELIVERY`).
  - `deliveredDrops`: Completed drops (`DELIVERED`).
  - `unassignedDropsCount`: Drops lacking an assigned driver.
  - `assignedDropsCount`: Drops with a designated driver.
- **Unassigned Drops Action List** (`unassignedActionList`):
  - Actionable list of drops requiring immediate driver assignment:
    - `dropId`, `companyName`, `deliveryAddress`, `deliveryTimeMinutes`, `formattedDeliveryTime`, `orderCount`, `status`.
- **Active En-Route Deliveries** (`activeDeliveries`):
  - Live tracking of in-transit drops:
    - `dropId`, `companyName`, `driverName`, `driverEmail`, `formattedDeliveryTime`, `outForDeliveryAt`, `orderCount`.

---

### Dashboard 4: Driver Daily Route & Deliveries

An intentionally narrow, high-security dashboard scoped strictly to the authenticated driver.

#### Security & Scoping:
- Identity is derived strictly from the driver's JWT token (`req.user.id`).
- Query parameters (e.g. `?driverId=...`) are completely ignored to prevent spoofing.
- Scoped strictly to today's date in `Asia/Kolkata`.

#### Metrics Included:
- **Daily Route Summary**:
  - `todayAssignedDrops`: Total drops assigned to this driver for today.
  - `pendingDeliveries`: Assigned drops not yet completed.
  - `outForDeliveryCount`: Assigned drops currently en route.
  - `deliveredCount`: Drops delivered today.
  - `onTimeCount`: Delivered drops where `deliveredAt <= scheduledDeliveryTime` (`isOnTime = true`).
  - `lateCount`: Delivered drops completed after scheduled time (`isOnTime = false`).
- **Next Delivery** (`nextDelivery`):
  - The driver's immediate next drop (first non-delivered drop ordered chronologically):
    - `dropId`, `companyName`, `deliveryAddress`, `formattedDeliveryTime`, `driverInstructions`, `ordersCount`, `status`.
- **Delivery Itinerary** (`deliveries`):
  - Ordered chronological list of all drops assigned to the driver today with addresses, standing instructions, order counts, status, and on-time result.

---

## Detailed Metric Definitions

| Dashboard | Metric Name | Meaning | Why It Exists | Exact Calculation | Date/Time Basis | Included Statuses | Excluded Statuses | Treatment of Cancelled Orders | Treatment of Missing Data | State Type |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Admin** | `totalOrdersToday` | All orders recorded for today | Volume indicator | `count(Order where deliveryDate = date)` | `deliveryDate` (`Asia/Kolkata`) | All statuses | Other dates | Counted in total | `0` if empty | Live DB State |
| **Admin** | `operationalOrdersToday` | Confirmed operational demand | Active production planning | `count(Order where deliveryDate = date and status = CONFIRMED)` | `deliveryDate` (`Asia/Kolkata`) | `CONFIRMED` | `DRAFT`, `PLACED`, `CANCELLED`, `REJECTED`, `DELIVERED` | Strictly excluded | `0` if empty | Live DB State |
| **Admin** | `confirmedOrdersToday` | Confirmed orders today | Active production | `count(Order where deliveryDate = date and status = CONFIRMED)` | `deliveryDate` (`Asia/Kolkata`) | `CONFIRMED` | All others | Excluded | `0` | Live DB State |
| **Admin** | `placedOrdersToday` | Unconfirmed pipeline | Pipeline monitoring | `count(Order where deliveryDate = date and status = PLACED)` | `deliveryDate` (`Asia/Kolkata`) | `PLACED` | All others | Excluded | `0` | Live DB State |
| **Admin** | `draftOrdersToday` | Incomplete carts | Cart abandonment | `count(Order where deliveryDate = date and status = DRAFT)` | `deliveryDate` (`Asia/Kolkata`) | `DRAFT` | All others | Excluded | `0` | Live DB State |
| **Admin** | `deliveredOrdersToday` | Completed orders today | Completion tracking | `count(Order where deliveryDate = date and status = DELIVERED)` | `deliveryDate` (`Asia/Kolkata`) | `DELIVERED` | All others | Excluded | `0` | Live DB State |
| **Admin** | `cancelledOrdersToday` | Cancelled orders today | Churn tracking | `count(Order where deliveryDate = date and status = CANCELLED)` | `deliveryDate` (`Asia/Kolkata`) | `CANCELLED` | All others | Counted here only | `0` | Live DB State |
| **Admin** | `rejectedOrdersToday` | Rejected orders today | Exception tracking | `count(Order where deliveryDate = date and status = REJECTED)` | `deliveryDate` (`Asia/Kolkata`) | `REJECTED` | All others | Excluded | `0` | Live DB State |
| **Admin** | `totalKitchenUnits` | Units for confirmed orders | Kitchen workload | `count(KitchenUnit where order.status = CONFIRMED and order.deliveryDate = date)` | `deliveryDate` (`Asia/Kolkata`) | `CONFIRMED` | Unconfirmed, cancelled | Excluded | `0` | Live DB State |
| **Admin** | `kitchenUnitsRemaining` | Remaining kitchen units | Production backlog | `totalKitchenUnits - kitchenUnitsCompleted` | `deliveryDate` (`Asia/Kolkata`) | `NOT_STARTED`, `IN_PROGRESS` | `DONE` | Excluded | `0` | Derived State |
| **Admin** | `lateUnitsCount` | Units past ready time | Escalation alerting | Incomplete units with `timingStatus = LATE` | Planned ready time vs `now` | Incomplete past ready | `DONE`, on-track | Excluded | `0` | Derived State |
| **Admin** | `atRiskUnitsCount` | Units near ready time | Pre-emptive risk alert | Incomplete units with `timingStatus = AT_RISK` | Planned ready time vs `now` | Incomplete $\le 15$ min | `DONE` | Excluded | `0` | Derived State |
| **Admin** | `overallKitchenStatus` | Dominant kitchen health | High-level status | `LATE` > `AT_RISK` > `COMPLETED` > `ON_TRACK` | Planned ready time vs `now` | Confirmed units | Non-confirmed | Excluded | `ON_TRACK` | Derived State |
| **Admin** | `totalDropsToday` | Drops scheduled today | Fleet volume | `count(Drop where deliveryDate = date)` | `deliveryDate` (`Asia/Kolkata`) | All drop statuses | Other dates | Excluded from active | `0` | Live DB State |
| **Admin** | `unassignedDropsCount` | Active drops without driver | Driver assignment gap | `count(Drop where driverId IS NULL and status != DELIVERED)` | `deliveryDate` (`Asia/Kolkata`) | `KITCHEN_READY`, `DISPATCH_READY`, `OUT_FOR_DELIVERY` | `DELIVERED`, assigned | Excluded | `0` | Live DB State |
| **Admin** | `uninvoicedConfirmedOrderCount` | Unbilled confirmed orders | Unbilled pipeline | `count(Order where status = CONFIRMED and invoiceEntry IS NULL)` | Current database state | `CONFIRMED` without invoice | Invoiced orders | Excluded | `0` | Live DB State |
| **Admin** | `uninvoicedConfirmedTotalCents` | Unbilled confirmed amount | Unbilled value (cents) | `sum(Order.totalCents where status = CONFIRMED and invoiceEntry IS NULL)` | Current database state | `CONFIRMED` without invoice | Invoiced orders | Excluded | `0` | Live DB State |
| **Admin** | `issuedInvoiceCount` | Unpaid invoices | Receivables volume | `count(Invoice where status = ISSUED)` | Current database state | `ISSUED` | `PAID`, `CANCELLED` | Excluded | `0` | Live DB State |
| **Admin** | `issuedInvoiceTotalCents` | Unpaid invoices amount | Receivables value (cents) | `sum(Invoice.totalCents where status = ISSUED)` | Current database state | `ISSUED` | `PAID`, `CANCELLED` | Preserved in snapshot | `0` | Snapshot Total |
| **Admin** | `paidInvoiceTotalCents` | Collected invoices amount | Cash collected (cents) | `sum(Invoice.totalCents where status = PAID)` | Current database state | `PAID` | `ISSUED`, `CANCELLED` | Preserved in snapshot | `0` | Snapshot Total |
| **Admin** | `invoicesWithAdjustmentsCount` | Discrepant invoices | Audit backlog | Invoices with post-issue order mutations or cancellations | Current vs snapshot | `ISSUED` with mismatches | Clean invoices | Invoiced cancelled trigger flag | `0` | Derived Audit Flag |
| **Kitchen** | `stationWorkload` | Workload by station | Staffing & pacing | Grouped unit statuses per kitchen station | `deliveryDate` (`Asia/Kolkata`) | Confirmed units | Unconfirmed | Excluded | Unassigned station grouped | Live DB & Derived |
| **Kitchen** | `urgentUnits` | Top 20 late/at-risk units | Kitchen triage list | Incomplete units sorted by delivery time where late/at-risk | Planned ready time vs `now` | Active late/at-risk | `DONE`, on-track | Excluded | Empty array `[]` | Priority List |
| **Dispatch** | `unassignedActionList` | Actionable unassigned drops | Dispatch action | Drops where `driverId IS NULL` and `status != DELIVERED` | `deliveryDate` (`Asia/Kolkata`) | Active unassigned drops | Assigned, delivered | Excluded | Empty array `[]` | Actionable List |
| **Dispatch** | `activeDeliveries` | En-route deliveries | Fleet monitoring | Drops where `status = OUT_FOR_DELIVERY` | `deliveryDate` (`Asia/Kolkata`) | `OUT_FOR_DELIVERY` | All others | Excluded | Empty array `[]` | Transit List |
| **Driver** | `todayAssignedDrops` | Assigned drops for driver | Driver daily workload | `count(Drop where driverId = jwt.userId and deliveryDate = today)` | `deliveryDate` (`Asia/Kolkata`) | Authenticated driver's drops | Other drivers' drops | Excluded | `0` | JWT-Scoped State |
| **Driver** | `pendingDeliveries` | Assigned drops pending | Driver remaining stops | Drops assigned to driver with `status != DELIVERED` | `deliveryDate` (`Asia/Kolkata`) | Incomplete assigned drops | `DELIVERED` | Excluded | `0` | JWT-Scoped State |
| **Driver** | `onTimeCount` | On-time deliveries | On-time delivery metric | Drops assigned to driver with `status = DELIVERED and isOnTime = true` | `deliveredAt <= scheduledDeliveryTime` | `DELIVERED` on time | Late deliveries, pending | Excluded | `0` | Authoritative History |
| **Driver** | `lateCount` | Late deliveries | Delivery delay metric | Drops assigned to driver with `status = DELIVERED and isOnTime = false` | `deliveredAt > scheduledDeliveryTime` | `DELIVERED` late | On-time, pending | Excluded | `0` | Authoritative History |
| **Driver** | `nextDelivery` | Immediate next drop | Turn-by-turn clarity | First drop with `status != DELIVERED` ordered by delivery time | `deliveryDate` (`Asia/Kolkata`) | First pending/out-for-delivery | `DELIVERED` | Excluded | `null` if all complete | Scoped Next |

---

## Intentionally Omitted Metrics

The following metrics were intentionally excluded from operational dashboards:
1. **Employee Payroll / Wage Calculations**: Out of scope. Fernleaf Kitchen is a B2B catering service billing corporate clients, not a payroll processor.
2. **Gross Profit Margin & Raw Ingredient Costing**: Out of scope. Raw food procurement, supplier invoices, inventory wastage, and kitchen overhead are not modeled in the assignment domain.
3. **Tax & GST Breakdown on Dashboard**: Out of scope. Billing mandates integer-cents subtotal invoices; external tax engines are omitted per assignment specifications.
4. **Customer Acquisition Cost (CAC) & Marketing Funnels**: Out of scope. Marketing and lead-generation metrics do not serve daily commercial kitchen operations.
5. **General Ledger & Banking Reconciliation**: Out of scope. Operational dashboards reflect internal order and invoice states; multi-entry ledger accounting belongs in external enterprise accounting systems.
6. **Individual Employee Kitchen Productivity Scoring**: Omitted to prevent ungrounded or arbitrary micro-performance tracking not specified by the hiring assignment.
7. **Predictive Machine Learning Forecasting**: Omitted because operational dashboards must provide 100% deterministic ground truth based on verified database state rather than probabilistic predictions.

---

## Running the Application & Verification

```bash
# Install dependencies
npm install

# Run database migrations and seed
npx prisma migrate deploy
npx prisma db seed

# Run linting and build
npm run lint
npm run build

# Run comprehensive unit tests (230 tests across 15 suites)
npm test

# Run e2e tests
npm run test:e2e

# Run live HTTP verification suites
npx ts-node scripts/verify-phase11.ts
npx ts-node scripts/verify-phase10.ts
npx ts-node scripts/verify-phase9.ts
npx ts-node scripts/verify-phase8.ts
```
