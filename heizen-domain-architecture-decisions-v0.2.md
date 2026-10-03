# Heizen Engineering Assignment --- Domain & Architecture Decision Log

**Project:** Fernleaf Kitchen Operations Admin Panel\
**Decision-log version:** 0.2 --- Domain model frozen for
implementation\
**Source of truth:** `hiring-assignment-admin-panel.pdf`

## 1. Architecture

``` text
Browser
   |
   | HTTPS / REST
   v
Next.js
   |
   | HTTP
   v
NestJS
   |
   v
Prisma
   |
   v
PostgreSQL
```

The frontend does not bypass the NestJS API with Next.js server actions.

Backend business rules are the source of truth.

## 2. Main domain modules

-   Auth / Users / Roles / Permissions
-   Companies
-   Employees
-   Catalogue
-   Menu
-   Pricing
-   Orders
-   Kitchen
-   Dispatch
-   Billing
-   Settings
-   Dashboards

## 3. Identity and RBAC

Roles are database entities rather than scattered role-name checks.

Seeded roles:

-   ADMIN
-   KITCHEN
-   DISPATCH
-   DRIVER

Permissions are capabilities such as:

-   orders.read
-   orders.create
-   orders.edit
-   orders.cancel
-   orders.override
-   kitchen.read
-   kitchen.start
-   kitchen.complete
-   dispatch.read
-   dispatch.assign
-   dispatch.out_for_delivery
-   driver.read_own_deliveries
-   driver.complete_delivery
-   billing.read
-   billing.create_invoice
-   billing.mark_paid

The server enforces permissions. Frontend visibility is only a usability
layer.

## 4. Company/calendar decisions

Company contains:

-   name
-   unique email domains
-   delivery addresses
-   billing contact
-   employee owner
-   optional price tier
-   default delivery time
-   minutes before delivery that a drop should leave the kitchen
-   default packaging
-   default driver
-   company working days
-   company holidays
-   company-specific hidden menu categories/dishes

Kitchen calendar is separate from company calendar.

**Interpretation:** company calendar decides whether that company can
receive a delivery; kitchen calendar controls cutoff calculation and
kitchen operation.

Kitchen timezone assumption:

**Asia/Kolkata**

## 5. Employee decisions

Each employee belongs to exactly one company.

Employee permissions:

-   choose delivery address
-   change delivery time
-   change packaging

Allergies and dietary preferences are normalized reference
relationships.

**Address interpretation:** the assignment defines multiple company
delivery addresses but does not define employee-owned address books. The
initial implementation therefore lets employees use the company's active
delivery addresses; the selected address is snapshotted onto the order.

## 6. Catalogue decisions

Core entities:

-   Dish
-   Option
-   OptionGroup
-   KitchenStation
-   Allergen
-   DietaryTag
-   PackagingType
-   PortionSize

Dishes are deactivated rather than hard-deleted.

Options are reusable.

Option groups define required/optional choices and display ordering.

Portions are supported in the data model but are lower priority because
the assignment marks them `[Should]`.

## 7. Menu decisions

Catalogue and menu are separate.

Menu has:

-   categories
-   ordered dishes
-   active/inactive categories
-   active/inactive items
-   secret categories

Company-specific hiding is represented with junction tables.

A secret category is not listed normally but can still be reached.

Menu preview uses the same visibility and pricing resolution as an
actual employee context.

## 8. Pricing decisions

A company may have no explicit price tier; in that case the default tier
is used.

Price tiers can derive from:

-   explicit prices
-   cost multiplier
-   another tier plus/minus a percentage

`ruleValueBps` uses basis points:

-   1500 = 15%
-   24000 = 2.4x

The pricing service validates the interpretation of the rule based on
its type.

A price row on a derived tier acts as an explicit override. If no row
exists, the tier's derivation is resolved.

Derived prices round **up** to the next 5-cent increment.

Money is stored as integer minor units (`*Cents`), never floating point.

A partial unique database index for `PriceTier.isDefault = true` may be
added in the PostgreSQL migration because Prisma's schema-level unique
constraint cannot express a conditional unique constraint directly.

## 9. Historical order principle

Catalogue data is mutable; historical orders are not recalculated from
the current catalogue.

Order snapshots include:

-   dish name
-   dish SKU
-   dish price
-   option group name
-   option name
-   option price
-   portion information
-   delivery address
-   delivery time
-   packaging

An order also retains its historical `companyId` even though its
employee belongs to a company.

This prevents employee/company changes from rewriting history.

## 10. Order model

Order statuses:

-   DRAFT
-   PLACED
-   CONFIRMED
-   CANCELLED
-   REJECTED
-   DELIVERED

Kitchen and dispatch stages are not folded into this enum.

Order delivery date is a calendar date. Delivery time is represented as
minutes after midnight in the kitchen timezone.

The order stores planned kitchen-ready and dispatch-ready timestamps.

## 11. Combination model

Each order line contains combinations.

Invariant:

``` text
SUM(combination.quantity) == orderLine.quantity
```

Every required option group must be selected for every combination.

Identical combinations submitted more than once are normalized into one
combination with the summed quantity.

Each combination stores its resolved unit price and total price.

Each combination creates exactly one KitchenUnit.

## 12. Kitchen model

KitchenUnit statuses:

-   NOT_STARTED
-   IN_PROGRESS
-   DONE

Rules:

-   only confirmed orders can be worked on;
-   a unit cannot be started twice;
-   a unit cannot be finished twice;
-   finishing a never-started unit records a start and completion;
-   order kitchenStartedAt is the first unit start;
-   order kitchenReadyAt is set only after all units are done.

Planned timing:

``` text
dispatch-ready = delivery time - company delivery minutes
kitchen-ready  = dispatch-ready - 30 minutes
```

Changing delivery time recalculates the plan.

## 13. Cutoff model

Cutoff calculation is a dedicated backend service.

It uses:

-   kitchen timezone
-   kitchen working days
-   kitchen holidays
-   configured working-day count
-   configured cutoff time

It does not use the company calendar for counting backwards.

Cutoff processing is idempotent:

``` text
DRAFT  -> CANCELLED
PLACED -> CONFIRMED
```

Already-processed states are not processed again.

A manual endpoint/action will exist so reviewers can trigger a past
cutoff.

## 14. Dispatch/drop model

A Drop groups orders with:

-   same company
-   same exact delivery address
-   same exact delivery time
-   same delivery date

A normalized `addressKey` is stored to make grouping deterministic.

Driver assignment happens at the drop level.

Drop stages:

``` text
KITCHEN_READY
    ->
DISPATCH_READY
    ->
OUT_FOR_DELIVERY
    ->
DELIVERED
```

The backend enforces valid transitions.

## 15. Driver model

Driver endpoints derive the authenticated driver from the session/token.

A driver can only access their own drops for the current kitchen day.

The driver can mark a drop delivered with:

-   optional note
-   optional photo

On-time status is calculated by the backend.

## 16. Billing model

Confirmed orders are billable according to the assignment.

Invoice contains financial snapshots through
`InvoiceOrder.invoicedAmountCents`.

Invariant:

``` text
invoice.totalCents
=
SUM(invoiceOrder.invoicedAmountCents)
```

An order can belong to at most one invoice.

### Post-invoice interpretation

Operational/admin changes that the assignment permits do not silently
rewrite an issued invoice.

If the current order amount differs from the invoiced snapshot, the
application surfaces a billing adjustment requirement.

This is an explicit interpretation of an ambiguous requirement and will
be documented in the final README.

## 17. Confirmed cancellation interpretation

The assignment states that every confirmed order is owed in full while
also allowing post-confirmation changes/cancellation.

Our initial interpretation is:

**Confirmation creates the company's billing obligation. A later
cancellation does not silently remove that obligation.**

If the business later needs credits/adjustments, that should be
represented as an explicit billing adjustment rather than mutating the
historical invoice amount.

This interpretation should be revisited if the actual evaluator
clarifies the intended cancellation semantics.

## 18. Order timeline

`OrderEvent` is a focused operational timeline, not a generic audit log.

It records milestones such as:

-   created
-   placed
-   confirmed
-   cancelled
-   rejected
-   kitchen started
-   kitchen ready
-   dispatch ready
-   out for delivery
-   delivered

Generic audit logging remains out of scope.

## 19. Concurrency

Important operations use atomic/transactional backend operations.

Examples:

-   completing a kitchen unit twice;
-   advancing the same drop twice;
-   assigning/invoicing the same order concurrently.

Unique constraints are used where they can enforce invariants at the
database level, especially `InvoiceOrder.orderId`.

## 20. Stress-test results

The model was tested conceptually against:

1.  employee moves company;
2.  dish price changes after ordering;
3.  option is deactivated after ordering;
4.  company hides a dish;
5.  cutoff crosses kitchen holiday;
6.  cutoff runs twice;
7.  two kitchen users finish one unit;
8.  two users invoice one order;
9.  driver requests another driver's drop;
10. invoiced order changes;
11. company non-working delivery day;
12. company price-tier changes;
13. missing required option;
14. minimum order quantity;
15. duplicate combinations.

The proposed model supports these cases with backend invariants and
transactional operations.

## 21. MOQ interpretation

If a dish has `minimumOrderQuantity`, it applies to the **total quantity
of that dish on the order line**, not separately to each combination.

Example:

``` text
MOQ = 5
3 Brown Rice + 3 Jeera Rice = 6 total
```

The line is valid.

## 22. Dashboard philosophy

Dashboards are designed around the decisions each role makes:

### Admin

Operational overview, at-risk orders, billing work, configuration
shortcuts.

### Kitchen

Today's prep units, station workload, incomplete/late work.

### Dispatch

Today's drops, readiness, unassigned drivers, delivery status.

### Driver

Only their own current-day drops, ordered by delivery time, with a
simple delivery action.

The README will define every metric mathematically, including date
grouping and treatment of cancelled/missing data.

## 23. Prioritization

### Must-first

-   authentication
-   server RBAC
-   companies/employees
-   catalogue
-   menu
-   pricing
-   orders
-   cutoff
-   kitchen
-   dispatch
-   driver
-   billing
-   settings
-   dashboards

### Secondary

-   derived pricing depth
-   company calendar edge cases
-   portions
-   CSV import
-   additional UI polish

The assignment's `[Should]` features will not be allowed to damage
correctness of `[Must]` workflows.

## 24. Out of scope

-   employee payments
-   multiple order types
-   customers without companies
-   free options
-   seasonal/date-based menus
-   pausing employee ordering
-   exports
-   accounting integrations
-   recipe/costing integrations
-   promotions/coupons
-   sales tax
-   delivery fees/zones
-   generic audit logs
-   customer-facing app
-   email/notification infrastructure
-   marketing features

## 25. Final ER direction

``` mermaid
erDiagram
    User }o--|| Role : has
    Role ||--o{ RolePermission : grants
    Permission ||--o{ RolePermission : contains

    Company ||--o{ Employee : employs
    Company ||--o{ CompanyDomain : owns
    Company ||--o{ CompanyAddress : has
    Company ||--o{ CompanyHoliday : has
    Company ||--o{ CompanyWorkingDay : defines
    Company }o--o| PriceTier : uses
    Company }o--o| User : default_driver

    Employee ||--o{ Order : places
    Company ||--o{ Order : owns

    Dish ||--o{ DishPrice : priced_at
    Option ||--o{ OptionPrice : priced_at
    PriceTier ||--o{ DishPrice : contains
    PriceTier ||--o{ OptionPrice : contains

    Dish ||--o{ DishOptionGroup : has
    OptionGroup ||--o{ DishOptionGroup : used_by
    OptionGroup ||--o{ OptionGroupOption : offers
    Option ||--o{ OptionGroupOption : belongs_to

    MenuCategory ||--o{ MenuCategoryDish : contains
    Dish ||--o{ MenuCategoryDish : appears_in

    Order ||--o{ OrderLine : contains
    OrderLine ||--o{ OrderCombination : splits_into
    OrderCombination ||--o{ CombinationOption : selects
    OrderCombination ||--|| KitchenUnit : produces

    Company ||--o{ Drop : groups
    Drop ||--o{ DropOrder : contains
    Order ||--o| DropOrder : assigned_to
    User ||--o{ Drop : drives
    Drop ||--o| DeliveryRecord : completes

    Company ||--o{ Invoice : receives
    Invoice ||--o{ InvoiceOrder : contains
    Order ||--o| InvoiceOrder : billed_once

    Order ||--o{ OrderEvent : records
```

## 26. Freeze point

This document and `schema.prisma` represent the **implementation
baseline**.

If a later discovery requires changing a core model, update this
decision log before changing the schema so that the README and
implementation remain consistent.

## 27. Phase 6 Decisions — Orders & Cutoff Processing

### 27.1 Cutoff Algorithm
- Cutoff datetime is evaluated relative to the commercial kitchen operational timezone (`Asia/Kolkata`, UTC+05:30).
- For a delivery date $D$, the system counts backwards `cutoffWorkingDaysCount` (default: 2) across `KitchenWorkingDay` entries where `isWorking = true`.
- Days designated as `KitchenHoliday` are skipped during lead-day counting.
- The cutoff locks exactly at `cutoffTimeMinutes` (default: 960 = 16:00 Asia/Kolkata) on the calculated kitchen working day.
- A delivery date occurring on a non-working day or holiday is projected backwards over valid kitchen production days.

### 27.2 Two-Calendar Distinction
- **Company Delivery Calendar (`CompanyWorkingDay`, `CompanyHoliday`)**:
  - Dictates whether the client company can accept catering deliveries on date $D$.
  - Attempting to place or update an order for a company holiday or non-working day is rejected with 400 Bad Request.
  - Company calendar events **never** alter or shift the commercial kitchen cutoff calculation.
- **Kitchen Production Calendar (`KitchenWorkingDay`, `KitchenHoliday`)**:
  - Dictates commercial kitchen operating availability and lead-day counting.
  - Independent of any individual client company's calendar.

### 27.3 Historical Snapshot Strategy
To insulate historical financial, operational, and billing records from future catalogue or corporate changes:
- `Order.companyId` is snapshotted from the ordering employee's company at creation time. If an employee subsequently transfers to another company, past orders remain anchored to their original company.
- `OrderDelivery` records immutable snapshots of the selected address (`addressLabelSnapshot`, `addressLine1Snapshot`, `addressLine2Snapshot`, `citySnapshot`, `stateSnapshot`, `postalCodeSnapshot`), packaging type name (`packagingNameSnapshot`), delivery time, and instructions.
- `OrderLine` records snapshots of dish identity and resolved pricing: `dishNameSnapshot`, `dishSkuSnapshot`, `dishUnitPriceCents`.
- `CombinationOption` records snapshots of option identity and option pricing: `optionGroupNameSnapshot`, `optionNameSnapshot`, `optionPriceCents`, `portionNameSnapshot`, `portionExtraCents`.
- Direct mutations to `Dish`, `DishPrice`, `Option`, `OptionPrice`, `PriceTier`, or `CompanyAddress` do not alter previously placed orders.

### 27.4 Order Line & Combination Invariant
- An order line represents a dish item and quantity $Q$.
- Combinations partition the dish quantity into distinct customizations (which later become individual kitchen units).
- Strict Invariant: $\sum \text{combination.quantity} == \text{line.quantity}$.
- Server-side normalization merges identical option combinations on the same order line to prevent redundant kitchen unit generation.

### 27.5 Minimum Order Quantity (MOQ) Interpretation
- `Dish.minimumOrderQuantity` applies to the total aggregated dish quantity on the line (`line.quantity`), NOT per individual combination.
- Example: If dish MOQ = 5, an order line with quantity = 5 split into Combo A (qty 2) and Combo B (qty 3) is valid.

### 27.6 Cutoff Processing Idempotency & Concurrency
- `OrdersService.processCutoffs` identifies past-cutoff `PLACED` and `DRAFT` candidate orders.
- Transition rules:
  - `PLACED` $\rightarrow$ `CONFIRMED` (records `ORDER_CONFIRMED` event).
  - `DRAFT` $\rightarrow$ `CANCELLED` (records `ORDER_CANCELLED` event with automatic cancellation reason).
- Transitions use conditional atomic database updates (`updateMany({ where: { id, status: 'PLACED' }, data: { status: 'CONFIRMED' } })`).
- Running cutoff processing multiple times or concurrently yields 0 changes on subsequent runs, creates 0 duplicate timeline events, and leaves existing timestamps intact.

### 27.7 Post-Cutoff Admin Overrides
- Prior to cutoff, orders can be edited by authorized users subject to employee permission flags (`canChooseDeliveryAddress`, `canChangeDeliveryTime`, `canChangePackaging`).
- After cutoff, normal users cannot mutate or cancel the order.
- Administrators with `orders.override` permission may override operational delivery parameters (`companyAddressId`, `deliveryTimeMinutes`, `packagingTypeId`).
- Overrides update the operational delivery snapshot, recalculate planned kitchen/dispatch ready times, and record an immutable `ADMIN_OVERRIDE` event on the `OrderEvent` timeline containing previous and updated values and the administrator's required explanatory note.

### 27.8 Invoicing-Related Behavior
- Uninvoiced orders are orders in `CONFIRMED` or `DELIVERED` status without an associated `InvoiceOrder` entry.
- Filter supported on `GET /api/orders?isInvoiced=true|false`. Direct billing and invoice generation are strictly deferred to Phase 10.

## 28. Phase 7 Decisions — Kitchen Operations

### 28.1 OrderCombination → KitchenUnit Invariant
- **Strict 1:1 Invariant**: Exactly one `KitchenUnit` corresponds to one `OrderCombination`, enforced by the unique constraint on `KitchenUnit.orderCombinationId`.
- **Unit Quantity**: Reflects the `OrderCombination.quantity`. Distinct combinations of the same dish on an order line produce separate kitchen units; Phase 6 normalizes identical combinations into one.
- **Confirmed Orders Only**: Kitchen units are created exclusively for orders in `CONFIRMED` status. Orders in `DRAFT`, `PLACED`, `CANCELLED`, or `REJECTED` status never create or expose active kitchen work.
- **Idempotent Provisioning**: When an order transitions to `CONFIRMED` (via cutoff processing) or when the kitchen board is queried, `KitchenService.ensureKitchenUnitsForOrder` ensures all combinations have their corresponding `KitchenUnit` without creating duplicates or mutating existing units.

### 28.2 KitchenUnit Lifecycle & Concurrency Strategy
- **Lifecycle**: `NOT_STARTED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `DONE`.
- **State Invariants**:
  - A unit cannot start twice, finish twice, or transition backward.
  - Once `DONE`, a unit cannot be modified or re-finished.
- **Database Concurrency Control**:
  - State transitions utilize atomic conditional updates (`prisma.kitchenUnit.updateMany({ where: { id, status: expectedCurrentStatus }, data: ... })`).
  - If concurrent requests attempt to start or finish the same unit simultaneously, exactly one request succeeds (`count === 1`), while racing requests receive `count === 0` and fail cleanly with `409 Conflict`.
  - Does not rely solely on application-level checks.

### 28.3 Finish-Without-Start Behavior
- Per assignment requirements, finishing a `NOT_STARTED` unit without prior start is explicitly supported.
- When finishing a `NOT_STARTED` unit:
  - `startedAt` is atomically set to the current timestamp (`now`).
  - `completedAt` is atomically set to the current timestamp (`now`).
  - Status transitions directly to `DONE`.
  - If `order.kitchenStartedAt` is currently null, it is also set to `now`.

### 28.4 Order `kitchenStartedAt` Semantics
- `order.kitchenStartedAt` records the timestamp when the first kitchen unit of a confirmed order transitions out of `NOT_STARTED`.
- **Concurrency Safe**: Set using `prisma.order.updateMany({ where: { id: orderId, kitchenStartedAt: null }, data: { kitchenStartedAt: now } })`.
- Subsequent unit starts for the same order do not overwrite or alter the existing `kitchenStartedAt`.
- Emits a single `KITCHEN_STARTED` timeline event on the order.

### 28.5 Order `kitchenReadyAt` Semantics
- `order.kitchenReadyAt` is set **only when all kitchen units** for the confirmed order reach `DONE` status.
- **Rules**:
  - 0 units done $\rightarrow$ `kitchenReadyAt` is `null`.
  - Some units done $\rightarrow$ `kitchenReadyAt` is `null`.
  - All units done $\rightarrow$ `kitchenReadyAt` is set to the completion timestamp (`now`).
- Evaluated transactionally with unit completion via `prisma.kitchenUnit.count({ where: { orderId, status: { not: 'DONE' } } }) === 0`.
- Concurrency-safe conditional update ensures `kitchenReadyAt` is set once and never overwritten or triggered prematurely.
- Emits a single `KITCHEN_READY` timeline event on the order.

### 28.6 Planned Timing Formulas
- Evaluated strictly in the kitchen operational timezone (`Asia/Kolkata`, UTC+05:30).
- Operational parameters:
  - `deliveryUtc`: UTC timestamp computed from order `deliveryDate` ($YYYY-MM-DD$) and `deliveryTimeMinutes`.
  - `companyLeadMinutes`: Resolved from `Company.deliveryMinutesBefore` (default: 60 minutes).
- **Formulas**:
  - $\text{plannedDispatchReadyAt} = \text{deliveryUtc} - (\text{companyLeadMinutes} \times 60 \times 1000)$
  - $\text{plannedKitchenReadyAt} = \text{plannedDispatchReadyAt} - (30 \times 60 \times 1000)$
- **Plan Recalculation**: If delivery time or address is updated via post-cutoff admin override, `plannedDispatchReadyAt` and `plannedKitchenReadyAt` recalculate dynamically on the kitchen board. Historical actual timestamps (`startedAt`, `completedAt`, `kitchenStartedAt`, `kitchenReadyAt`) are preserved.

### 28.7 Deterministic Late / At-Risk Indicators
Calculated server-side relative to current time ($T_{now}$) and `plannedKitchenReadyAt`:
- **`COMPLETED`**: Unit status is `DONE`.
- **`LATE`**: Unit not done and $T_{now} > \text{plannedKitchenReadyAt}$.
- **`AT_RISK`**: Unit not done and $T_{now} \ge \text{plannedKitchenReadyAt} - 15 \text{ min}$.
- **`ON_TRACK`**: Unit not done and $T_{now} < \text{plannedKitchenReadyAt} - 15 \text{ min}$.
- **Future Orders**: Work scheduled for future dates or later hours is correctly classified as `ON_TRACK` and never marked late prematurely.

### 28.8 Admin Force-Complete Behavior & Idempotency
- Protected by `kitchen.force_complete` permission.
- Allowed only on confirmed kitchen orders.
- Executes within an atomic database transaction:
  - Incomplete units in `IN_PROGRESS` have `completedAt` set to `now` and status changed to `DONE`.
  - Incomplete units in `NOT_STARTED` have both `startedAt` and `completedAt` set to `now` and status changed to `DONE`.
  - Already `DONE` units remain completely untouched.
  - Sets `order.kitchenStartedAt` (if previously null) and sets `order.kitchenReadyAt = now`.
  - Emits an operational `ADMIN_OVERRIDE` or `KITCHEN_FORCE_COMPLETED` order event.
- **Strict Idempotency**: Calling force-complete on an already kitchen-ready order returns immediately as a safe no-op with 0 database mutations, 0 duplicate timeline events, and no timestamp corruption.

### 28.9 Station Assignment & Unassigned Units
- Units resolve their kitchen station from the dish's configured `Dish.kitchenStationId` and `KitchenStation.name`.
- If a dish has no configured station, the unit is assigned `kitchenStationId = null` and labeled `"Unassigned"`.
- The Kitchen Board endpoint supports server-side station filtering via query parameter: `stationId=<id>` or `stationId=unassigned`.

### 28.10 Authorization & Data Scoping
- Enforces DB-backed permissions via `@RequirePermissions`:
  - `kitchen.read`: View kitchen board, stations, and unit details.
  - `kitchen.start`: Start a kitchen unit.
  - `kitchen.finish`: Finish a kitchen unit.
  - `kitchen.force_complete`: Admin force-completion of an order's kitchen units.
- Eliminates hardcoded role name checks (`user.role === 'KITCHEN'`).
- Scoped response payloads expose operational culinary data (dishes, portions, options, quantities, timings, station, status) while strictly omitting sensitive employee personal data, billing/invoicing details, or driver logistics.

## 29. Dispatch & Driver Operations Decisions (Phase 8)

### 29.1 Drop Grouping Key & Invariants
- A **Drop** groups deliveries with the exact triplet:
  - `companyId`
  - `addressKey` (`companyAddressId`)
  - `deliveryTimeMinutes` (exact minutes since midnight)
  - on the target `deliveryDate` (`@db.Date` in `Asia/Kolkata`).
- Guaranteed at the database level by the composite unique index:
  `@@unique([companyId, deliveryDate, deliveryTimeMinutes, addressKey])` on `Drop`.
- Each order belongs to at most one drop via `DropOrder` with a unique index `@unique([orderId])`.
- Any difference in company, delivery address, or exact delivery time results in distinct drops. There is no grouping by approximate time, postal code, or company alone.

### 29.2 Drop Lifecycle State Machine
- State machine states:
  `KITCHEN_READY` $\rightarrow$ `DISPATCH_READY` $\rightarrow$ `OUT_FOR_DELIVERY` $\rightarrow$ `DELIVERED`.
- Invariants:
  - Transition to `DISPATCH_READY` requires all orders in the drop to have `kitchenReadyAt !== null`.
  - Transition to `OUT_FOR_DELIVERY` requires status to be `DISPATCH_READY` AND `driverId !== null` (assigned valid active driver).
  - Transition to `DELIVERED` requires status to be `OUT_FOR_DELIVERY` and caller to be the assigned driver (or authorized dispatch operator).
  - No skipping of states, no backwards transitions, and repeated attempts return a clear 4xx error (409 Conflict).

### 29.3 Driver Assignment & Capability Resolution
- Assignment requires permission `dispatch.assign_driver`.
- Drivers are validated against database state:
  - User exists.
  - `user.status === UserStatus.ACTIVE`.
  - Driver eligibility: `user.role.name === 'DRIVER'` OR role has permission `driver.read_own_deliveries`.
- Non-drivers (kitchen staff, unprivileged users) are strictly rejected with 400 Bad Request.

### 29.4 Default Driver Behavior
- When drops are created, `Company.defaultDriverId` is evaluated:
  - If configured and the user is an active, eligible driver, the drop is automatically assigned to that driver.
  - If `defaultDriverId` is null or invalid/inactive, the drop remains unassigned (`driverId: null`).
  - No speculative fallback assignment algorithms are executed.

### 29.5 Driver Data Scoping & Security
- Driver endpoint `/api/dispatch/my-deliveries` strictly binds to the authenticated user ID (`user.id`) from the verified JWT.
- Query parameters such as `?driverId=...` are strictly ignored for authorization.
- Date scope is strictly pinned to today's date in `Asia/Kolkata` (`UTC+05:30`). Drivers cannot retrieve yesterday's or tomorrow's drops from the active driver view.
- Driver drop detail (`GET /api/dispatch/drops/:id`) and completion (`POST /api/dispatch/drops/:id/delivered`) enforce ownership: Drivers attempting to inspect or deliver drops assigned to another driver receive 403 Forbidden.
- Drivers' deliveries are deterministically ordered by `deliveryTimeMinutes` ascending.

### 29.6 On-Time Delivery Formula
- Evaluated strictly in the kitchen operational timezone (`Asia/Kolkata`, UTC+05:30).
- Scheduled delivery timestamp $T_{scheduled}$:
  $$T_{scheduled} = \text{Date.UTC}(y, m - 1, d, 0, 0, 0) - (5.5 \times 3600 \times 1000) + (\text{deliveryTimeMinutes} \times 60 \times 1000)$$
- Actual delivery timestamp $T_{delivered} = \text{now}$.
- On-time boolean formula:
  $$\text{isOnTime} = T_{delivered} \le T_{scheduled}$$
- Evaluated without arbitrary grace periods, recorded permanently on `Drop.isOnTime` and `DeliveryRecord`.

### 29.7 Handling Delivery-Detail Changes After Drop Creation
- When an order's delivery parameters (delivery time or delivery address) are updated post-cutoff via admin override, `DispatchService.reconcileOrderDrop(orderId)` executes automatically:
  - If the order was attached to an existing drop whose grouping key no longer matches, the stale `DropOrder` link is deleted.
  - If the previous drop becomes empty and was not already delivered, the obsolete drop record is pruned.
  - The order is then linked to the matching drop for the new delivery parameters (creating a new drop if none exists yet).
  - This prevents stale drop groupings and avoids duplicate drops.

### 29.8 Delivery Proof (Note & Photo Storage Approach)
- Stores delivery proof in `DeliveryRecord`:
  - `note`: Validated optional text note (max 1000 characters).
  - `photoUrl`: Validated non-empty URL reference (e.g. S3 / CDN URL) to the delivery photograph.
  - No complex binary file-storage system is introduced on the server; clients or storage services supply standard URL references.

### 29.9 Concurrency & Idempotency Strategy
- Drops generation uses database-level composite uniqueness and UPSERT semantics to ensure concurrent generation requests are idempotent and never produce duplicate drops.
- State transitions (`markOutForDelivery`, `markDelivered`) execute inside atomic database transactions with conditional state checks (`status === 'DISPATCH_READY'` / `status === 'OUT_FOR_DELIVERY'`).
- Marking delivered propagates to all contained orders in a single atomic transaction:
  - Sets `Order.status = DELIVERED` and `Order.deliveredAt`.
  - Creates corresponding `DELIVERED` `OrderEvent` records for each contained order.
  - Creates or updates `DeliveryRecord`.
  - Repeated delivered requests are rejected with 409 Conflict.

## 30. Phase 9: Billing & Invoicing Decisions

### 30.1 Billing Model & Invariants
- **Confirmed Orders Are Owed**: In accordance with the assignment specification, every `CONFIRMED` order is owed in full by its company. Order eligibility for billing is strictly based on confirmed order lifecycle status and absence of an existing invoice relationship, independent of kitchen or dispatch completion.
- **Internal Invoicing**: Confirmed uninvoiced orders can be grouped into an internal corporate invoice for their company.
- **One-to-One Order Invoicing**: An order can belong to at most one invoice. This invariant is enforced by a `@unique` constraint on `InvoiceOrder.orderId` in the database.
- **Immutable Financial Snapshot**: When an invoice is created, it captures an immutable financial snapshot of each order's billable total at that exact moment (`InvoiceOrder.invoicedAmountCents = order.totalCents`).
- **Invoice Total Invariant**:
  $$\text{invoice.totalCents} = \sum_{i} \text{invoiceOrder}_i\text{.invoicedAmountCents}$$
  The invoice total is calculated exclusively by summing the historical snapshot amounts in integer minor units (cents).

### 30.2 Post-Invoice Order Changes & Mismatch Surfacing
- In corporate meal delivery, confirmed orders may occasionally undergo administrative adjustments, line item modifications, or price overrides after an invoice has already been issued.
- **Invariant**: An already-issued invoice is **never** silently rewritten or automatically mutated when the underlying order changes later.
- When reading invoice details or invoice listings, the billing service dynamically evaluates whether:
  $$\text{currentOrderTotalCents} \neq \text{invoicedAmountCents}$$
- If a discrepancy exists, the billing domain surfaces:
  - `invoicedAmountCents`: The historical captured snapshot amount.
  - `currentOrderTotalCents`: The current mutated order total.
  - `hasAmountMismatch: true`: Explicit boolean indicator of financial divergence.
  - `amountDifferenceCents`: The exact signed difference ($\text{current} - \text{invoiced}$).
  - `adjustmentRequired: true`: Flags the order entry for administrative attention.
  - `invoice.hasAdjustments: true`: Surfaces invoice-level awareness of required billing reconciliation.
  - `invoice.currentOrdersTotalCents` and `invoice.totalAdjustmentDifferenceCents`: Aggregate financial divergence metrics.
- Full credit notes, debit notes, or double-entry adjustment ledgers are intentionally outside the assignment scope.

### 30.3 Post-Invoice Order Cancellation
- **Preservation of Obligation**: If a confirmed order is cancelled after having been invoiced, it is **not** silently removed from the invoice, nor is the `InvoiceOrder` relation pruned.
- The invoice retains its captured snapshot amount and total.
- The billing view exposes the cancellation transparently:
  - `isOrderCancelled: true`
  - `adjustmentRequired: true`
- No automatic credit is manufactured; internal invoices record what was billed.

### 30.4 Concurrency & Double-Invoicing Protection
- Application-level checking (`if (!order.invoiceEntry)`) is vulnerable to race conditions if multiple administrators attempt to invoice the same confirmed orders simultaneously.
- Final protection is established at the database layer via PostgreSQL's `@unique` constraint on `InvoiceOrder.orderId`.
- Both invoice creation and invoice order insertion execute within an atomic Prisma database transaction.
- If a concurrent request loses the race, PostgreSQL raises a unique constraint violation (`P2002`), which `BillingService` catches and translates to a clean HTTP 409 Conflict exception.

### 30.5 Money Representation
- All monetary amounts across the billing domain (`totalCents`, `invoicedAmountCents`, `currentOrderTotalCents`, `amountDifferenceCents`) are strictly represented in integer cents (minor currency units).
- Floating-point representations, `parseFloat`, or non-integer arithmetic are strictly prohibited.

### 30.6 Authorization & Permissions
- Billing access is governed strictly by server-side capability permissions:
  - `billing.read`: Required for `GET /api/billing/invoices`, `GET /api/billing/invoices/:id`, `GET /api/billing/uninvoiced-orders`.
  - `billing.manage`: Required for `POST /api/billing/invoices` and `POST /api/billing/invoices/:id/mark-paid`.
- Role capabilities are configured in the database:
  - `ADMIN` possesses both `billing.read` and `billing.manage`.
  - `KITCHEN`, `DISPATCH`, and `DRIVER` roles have no billing permissions and are rejected with 403 Forbidden.
  - Unauthenticated requests are rejected with 401 Unauthorized.



