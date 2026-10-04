# Fernleaf Kitchen — Commercial Kitchen Operations Admin Panel

Fernleaf Kitchen is a production-grade B2B corporate catering and commercial kitchen operations platform built to fulfill the Heizen Engineering Assignment specifications. 

The system enables corporate clients to run employee meal programs where staff order individual boxed meals for scheduled delivery dates, and the commercial kitchen cooks, packs, batches, and delivers them to corporate offices. All workflows run through an internal operations panel supporting dedicated roles for **Admin**, **Kitchen Staff**, **Dispatchers**, and **Drivers**.

---

## 1. Technology Stack & Architectural Principles

| Layer | Mandated Technology | Details & Justification |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 16** (App Router, Turbopack) | Modern, responsive React 19 UI with Tailwind CSS v4, Lucide icons, role-based client routing, and unified session management. |
| **Backend** | **NestJS 10** | Modular architecture with declarative DTO validation (`class-validator`), dependency injection, custom RBAC guards, and structured logging. |
| **ORM** | **Prisma 6** | Type-safe database queries, declarative migrations, connection pooling, and relational integrity. |
| **Database** | **PostgreSQL** | ACID-compliant relational storage ensuring strict transaction safety and relational constraints. |
| **Interface Boundary** | **HTTP REST API** | Strictly enforced separation. The Next.js frontend interacts with the NestJS API purely via authenticated HTTP requests (`/api/*`). **Zero direct Prisma or database access from the frontend, and zero Next.js Server Actions bypassing the API.** |
| **Security & RBAC** | **JWT & Capability Permissions** | Stateless Bearer token authentication with server-side permission-driven guards (`@RequirePermissions`). |
| **Financial Accuracy** | **Integer Minor Units (Cents)** | All prices, line items, and totals are computed and stored as integer cents to eliminate floating-point arithmetic errors. Derived prices round **UP** to the nearest $0.05 (5 cents). |
| **Timezone Basis** | **`Asia/Kolkata` (IST, UTC+05:30)** | Single authoritative kitchen timezone governing order cutoff calculations, delivery dates, and real-time dashboard date filtering regardless of server or browser location. |

---

## 2. Seeded Test Accounts

The database comes pre-seeded with realistic operational data and the four required accounts with identical credentials (`Test@1234`):

| Role | Email | Password | Permissions & System Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@test.com` | `Test@1234` | Full platform capabilities: catalogue, pricing tiers, companies, employees, orders, overrides, billing/invoicing, kitchen settings, admin overview dashboard. |
| **Kitchen** | `kitchen@test.com` | `Test@1234` | Production board, station filtering, kitchen units start/finish, force-completion, kitchen triage dashboard. Read-only on all other entities. |
| **Dispatch** | `dispatch@test.com` | `Test@1234` | Logistics board, automatic drop grouping, manual driver assignment, status transitions (`DISPATCH_READY` $\to$ `OUT_FOR_DELIVERY`), dispatch dashboard. |
| **Driver** | `driver@test.com` | `Test@1234` | Mobile-optimized delivery route for **today only**, scoped strictly to own assigned drops. Mark delivered with proof note/photo, driver performance dashboard. |

---

## 3. High-Level Architecture & Data Flow

```mermaid
flowchart TD
    subgraph ClientLayer["Frontend Layer (Next.js 16 on :3000)"]
        UI["Web Browser / Mobile View"]
        ClientAuth["Auth Context & Role Routing"]
        ApiClient["REST HTTP Client (src/lib/api.ts)"]
        UI --> ClientAuth --> ApiClient
    end

    subgraph ApiLayer["Backend Layer (NestJS 10 on :4000)"]
        HTTP["HTTP REST API (/api/*)"]
        Guards["JwtAuthGuard & PermissionsGuard"]
        Modules["Domain Services"]
        
        subgraph Domains["Core Domain Modules"]
            AuthMod["Auth / RBAC"]
            CatMod["Catalogue & Menu"]
            PriceMod["Pricing Engine"]
            OrderMod["Orders & Cutoff Engine"]
            KitchMod["Kitchen Operations"]
            DispMod["Dispatch & Driver Logistics"]
            BillMod["Billing & Invoicing"]
            SetMod["Kitchen Settings"]
            DashMod["Operational Dashboards"]
        end
        
        HTTP --> Guards --> Modules
        Modules --> Domains
    end

    subgraph DataLayer["Persistence Layer (PostgreSQL)"]
        Prisma["Prisma ORM Client"]
        Postgres[("PostgreSQL Database")]
        Domains --> Prisma --> Postgres
    end

    ApiClient -- "HTTP / JSON Bearer Token (CORS)" --> HTTP
```

---

## 4. Entity Relationship Diagram (Domain Model)

```mermaid
erDiagram
    Company ||--o{ Employee : employs
    Company ||--o{ CompanyDeliveryAddress : has
    Company ||--o{ CompanyEmailDomain : owns
    Company ||--o{ CompanyWorkingDay : defines
    Company ||--o{ CompanyHoliday : schedules
    Company ||--o| PriceTier : assigned_to
    Company ||--o{ Order : places
    Company ||--o{ Drop : receives
    Company ||--o{ Invoice : billed_to

    Employee ||--o{ Order : creates_for
    Employee }o--o{ EmployeeAllergen : has
    Employee }o--o{ EmployeeDietaryTag : prefers

    Dish }o--|| KitchenStation : routed_to
    Dish ||--o{ DishOptionGroup : configures
    OptionGroup ||--o{ DishOptionGroup : belongs_to
    OptionGroup ||--o{ Option : offers
    OptionGroup }o--o| PortionSize : uses

    PriceTier ||--o{ DishPrice : sets
    PriceTier ||--o{ OptionPrice : sets

    Order ||--o{ OrderLine : contains
    OrderLine ||--o{ OrderCombination : splits_into
    OrderCombination ||--o{ KitchenUnit : produces
    Order ||--o{ OrderEvent : logs
    
    Drop ||--o{ DropOrder : aggregates
    Order ||--o{ DropOrder : grouped_in
    Drop ||--o| DeliveryRecord : completed_with
    User ||--o{ Drop : assigned_driver

    Invoice ||--o{ InvoiceOrder : covers
    Order ||--o| InvoiceOrder : billed_in

    User ||--|| Role : has
    Role ||--o{ RolePermission : grants
    Permission ||--o{ RolePermission : assigned
```

---

## 5. Local Setup & Quick Start

### Prerequisites
- **Node.js**: v20.x, v22.x, or v24.x
- **npm**: v10+
- **PostgreSQL**: v14+ running locally or remotely (e.g. `localhost:5432`)

### 1. Repository Setup & Dependencies
```bash
# Clone the repository
git clone <repo-url>
cd Fernleaf-Kitchen

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
cd ..
```

### 2. Environment Configuration

**Backend (`backend/.env`):**
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fernleaf?schema=public"
PORT=4000
NODE_ENV="development"
KITCHEN_TIMEZONE="Asia/Kolkata"
JWT_SECRET="fernleaf-dev-secret-key-change-in-production-min32chars"
JWT_EXPIRES_IN="7d"
FRONTEND_URL="http://localhost:3000"
```

**Frontend (`frontend/.env.local` or `frontend/.env`):**
```env
NEXT_PUBLIC_API_URL="http://localhost:4000/api"
```

### 3. Database Migration & Realistic Seeding
```bash
cd backend

# Apply Prisma database migrations
npx prisma migrate deploy

# Run the idempotent database seed
npx prisma db seed
```

### 4. Running the Application

**Run Backend (Terminal 1):**
```bash
cd backend
npm run start:dev
# Backend listening at http://localhost:4000/api
# Health probe available at http://localhost:4000/api/health
```

**Run Frontend (Terminal 2):**
```bash
cd frontend
npm run dev
# Frontend accessible at http://localhost:3000
```

---

## 6. Key Domain Decisions & Implementation Rules

### 6.1 Catalogue & Reusable Options
- **Soft Deactivation**: Dishes are deactivated via `isActive: false` rather than deleted, guaranteeing that historical orders always retain relational references.
- **Reusable Options**: Options (e.g. *Jeera Rice*, *Paneer*, *Raita*) exist as independent catalogue entities with their own cost price, allergens, and dietary tags, reusable across dishes.
- **Portion Multipliers**: Option groups specify whether portions apply; if enabled, options carry portion adjustment pricing.

### 6.2 Menu Visibility & Previews
- **Company Filtering**: Dishes and menu categories can be selectively hidden from individual corporate clients.
- **Secret Categories**: Categories marked `isSecret: true` are excluded from standard category listings but remain accessible via direct URL navigation.
- **Employee Preview**: Admin staff can preview the exact menu visible to any specific employee, resolving company-specific hiding and custom pricing tiers.

### 6.3 Dynamic Pricing Engine
- **Hierarchical Tier Fallback**: If a company does not specify a custom price tier, the engine falls back to the system `default` tier. If a dish lacks an explicit price on that tier, it is omitted from the employee's menu (never displayed as $0.00).
- **Price Derivation Rules**:
  - `COST_MULTIPLIER`: Multiplies dish cost price by basis points (`ruleValueBps: 24000` $\implies 2.4\times$).
  - `PERCENTAGE_MARKUP`: Adds or subtracts percentage from another tier (`ruleValueBps: 1500` $\implies +15\%$).
- **$0.05 Ceiling Rounding**: All derived prices round **up** to the next 5-cent increment ($2.11 becomes $2.15). Implemented using exact integer modulo arithmetic: `cents + (5 - (cents % 5))`.
- **Price Changes Immutability**: Modifying catalogue prices affects new orders only; past orders are never recalculated.

### 6.4 Company & Employee Multi-Tenancy
- **Email Domain Isolation**: Companies register one or more corporate domains. Public email providers (`gmail.com`, `yahoo.com`, `outlook.com`, etc.) are rejected. Two companies cannot claim the same domain.
- **Separate Calendars**:
  - **Company Calendar**: Governs whether a company accepts deliveries on a given date.
  - **Kitchen Calendar**: Governs order cutoff calculations and kitchen production schedules. A company holiday does **not** move the kitchen cutoff.
- **Employee Transfers**: Moving an employee to a new company immediately re-binds their available delivery addresses, default times, applicable pricing tier, and company menu exclusions.

### 6.5 Orders & Combination Invariant
- **The Combination Invariant**: An order line quantity of $N$ can be split across multiple option configurations (e.g. 10 Paneer Bowls: 6 with Brown Rice, 4 with Jeera Rice). The server enforces:
  $$\sum \text{combination.quantity} = \text{line.quantity}$$
- **Option Validation**: Every combination must satisfy all required option groups, and every selected option must belong to the permitted group.
- **Minimum Order Quantity (MOQ)**: Enforced per dish line item.
- **Historical Snapshots**: Every order line and combination stores immutable snapshots of dish name, SKU, unit price, selected option names, option prices, packaging, address snapshot, and company context.

### 6.6 Operational Cutoff Engine
- **Lead Time Calculation**: Calculated backwards from scheduled delivery date using configured kitchen working days and skipping kitchen holidays.
- **Example**: A Wednesday delivery with a 2-working-day lead time and a 16:00 cutoff locks at **Monday 16:00**.
- **Automated Processing**:
  - `DRAFT` $\to$ `CANCELLED`
  - `PLACED` $\to$ `CONFIRMED` (becomes billable)
- **Reviewer Manual Trigger**: Endpoint `POST /api/orders/process-cutoffs` allows reviewers to trigger processing on demand without waiting.

### 6.7 Kitchen Board & Workload Management
- **Unit Production**: Each distinct combination represents exactly one production `KitchenUnit`.
- **Station Routing**: Units route to their dish's assigned station, or to `Unassigned` if none is configured.
- **Timing Formulas**:
  $$\text{dispatch-ready} = \text{delivery time} - \text{company delivery minutes before}$$
  $$\text{planned kitchen-ready} = \text{dispatch-ready} - 30\text{ minutes}$$
- **State Progression**: `NOT_STARTED` $\to$ `IN_PROGRESS` $\to$ `DONE`. Finishing an unstarted unit automatically records a start timestamp. The order's `kitchenStartedAt` is set when the first unit begins; `kitchenReadyAt` is stamped when all units are `DONE`.

### 6.8 Dispatch Drops & Driver Workflow
- **Idempotent Drop Grouping**: Orders are grouped into delivery drops by:
  $$\text{Same Company} + \text{Same Delivery Address} + \text{Exact Delivery Time}$$
- **Driver Scoping**: Drivers see **only** their own assigned drops for **today's date**, ordered chronologically.
- **Delivery Proof**: Drivers record delivery with optional notes and photo URL references. On-time performance is recorded deterministically (`deliveredAt <= scheduledDeliveryTime`).

### 6.9 Billing & Invoicing
- **One Invoice Per Order**: Confirmed uninvoiced orders can be grouped into an invoice. An order can belong to at most one invoice.
- **Immutable Financial Snapshot**: Invoices snapshot order totals in integer cents.
- **Post-Invoice Mismatch Auditing**: If an invoiced order is cancelled or overridden, the invoice snapshot is preserved, and the invoice is flagged with `hasAdjustments: true` and `totalAdjustmentDifferenceCents` for administrative review.

---

## 7. Operational Dashboards & Metric Definitions

All dashboards compute metrics authoritatively on the backend. Frontend pages display these figures without client-side business logic.

| Dashboard | Metric | Exact Calculation / Logic | Statuses Included | Statuses Excluded |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `operationalOrdersToday` | Count of orders with `deliveryDate = today` and `status = CONFIRMED`. Measures active operational production demand. | `CONFIRMED` | `DELIVERED`, `DRAFT`, `PLACED`, `CANCELLED`, `REJECTED` |
| **Admin** | `deliveredOrdersToday` | Count of orders with `deliveryDate = today` and `status = DELIVERED`. Represents completed fulfillment. | `DELIVERED` | All other statuses |
| **Admin** | `lateUnitsCount` | Incomplete kitchen units where current time exceeds planned ready time. | Incomplete past ready | `DONE`, on-track |
| **Admin** | `atRiskUnitsCount` | Incomplete kitchen units within 15 minutes of planned ready time. | Incomplete $\le 15$ min | `DONE`, on-track |
| **Admin** | `unassignedDropsCount` | Scheduled drops today where `driverId IS NULL` and `status != DELIVERED`. | Active unassigned | `DELIVERED`, assigned |
| **Admin** | `uninvoicedConfirmedTotalCents` | Sum of `totalCents` for confirmed orders not yet assigned to an invoice. | Confirmed uninvoiced | Invoiced orders |
| **Kitchen** | `stationWorkload` | Aggregated unit counts (`totalUnits`, `notStarted`, `inProgress`, `done`, `late`, `atRisk`) grouped by station. | Confirmed units | Unconfirmed orders |
| **Kitchen** | `urgentUnits` | Top 20 late or at-risk units sorted by scheduled delivery time. | Active late/at-risk | `DONE`, on-track |
| **Dispatch** | `unassignedActionList` | Action list of unassigned drops requiring driver assignment. | Active unassigned | Assigned drops |
| **Driver** | `todayAssignedDrops` | Drops assigned to the authenticated driver for today (`driverId = jwt.userId`). | Assigned to driver | Other drivers' drops |
| **Driver** | `onTimeCount` | Delivered drops where `deliveredAt <= scheduledDeliveryTime`. | `DELIVERED` on time | Late deliveries |

---

## 8. Prioritization & Ambiguity Interpretations

### 8.1 What Was Built
- Full implementation of all **[Must]** functional requirements across Catalogue, Menu, Pricing, Companies, Employees, Orders, Cutoff, Kitchen, Dispatch, Billing, Settings, and Dashboards.
- Full Next.js 16 frontend covering operational screens for Admin, Kitchen, Dispatch, and Driver roles.
- Portion sizes and portion pricing adjustment from **[Should]** requirements.
- Full server-side RBAC and capability permissions with zero role checks in business logic.

### 8.2 What Was Skipped & Why
1. **Employee CSV Bulk Import [Should]**: Prioritized end-to-end operational correctness (order combinations, cutoff calculation, dispatch grouping, billing) over batch user onboarding.
2. **Customer-Facing Mobile App**: Explicitly out of scope per assignment Section 1. Staff create orders on behalf of employees in the admin panel.
3. **External Accounting / Tax / Payroll Integration**: Explicitly out of scope per assignment Section 5. Invoices are internal records; totals are pre-tax integer cents.
4. **Kitchen Recipe / Inventory Costing**: Explicitly out of scope. Cost prices are entered manually in the catalogue.

### 8.3 Ambiguity Resolutions
- **Employee Delivery Addresses**: The assignment defines company delivery addresses but does not specify individual employee address books. Employees choose from their company's approved delivery addresses, and the selected address is snapshotted onto the order.
- **Post-Invoice Modifications**: Invoiced orders that are subsequently cancelled or modified retain their invoice snapshot; the system flags the invoice with `hasAdjustments: true` and computes discrepancy totals rather than silently rewriting issued invoices.
- **Kitchen vs Company Holidays**: Confirmed that company holidays prevent delivery to that company on that date, but do **not** shift the kitchen's cutoff schedule. Only kitchen working days and holidays shift the order cutoff.

---

## 9. Comprehensive Verification Suite

Run the full validation suite to verify complete compliance:

```bash
cd backend

# 1. Prisma schema formatting & validation
npm run prisma:format
npx prisma validate

# 2. Backend unit tests (230 tests across 15 suites)
npm test

# 3. Backend e2e tests
npm run test:e2e

# 4. Backend linting (0 errors, 0 warnings)
npm run lint

# 5. Backend production build
npm run build

# 6. Frontend linting & build
cd ../frontend
npm run lint
npm run build
cd ../backend

# 7. Seed idempotency test
npx prisma db seed
npx prisma db seed

# 8. Phase regression verification suites
npx ts-node scripts/verify-phase8.ts   # Dispatch & Driver Logistics (26/26 passed)
npx ts-node scripts/verify-phase9.ts   # Company Billing & Invoicing (26/26 passed)
npx ts-node scripts/verify-phase10.ts  # Settings & Cutoff Engine (23/23 passed)
npx ts-node scripts/verify-phase11.ts  # Operational Dashboards (20+/20+ passed)

# 9. Phase 12 Full Integration Smoke Suite
npx ts-node scripts/verify-integration.ts
```
