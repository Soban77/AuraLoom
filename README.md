# Aura & Loom — Inventory Studio

An internal omnichannel stock dashboard for the Aura & Loom apparel team. The workspace includes a React/Vite dashboard, an Express REST API, PostgreSQL schema and sample data, protected staff sign-in, signed stock adjustments, and transactional e-commerce order fulfillment.

## Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, Lucide, Framer Motion, Sonner
- API: Node.js, Express, TypeScript, Zod, JWT
- Database: PostgreSQL 16, `pg`

## Responsive interface

The dashboard adapts to desktop, tablet, and phone screens. On smaller screens, the sidebar becomes a dismissible navigation drawer, summary cards and forms reflow into narrower layouts, and dense inventory and audit tables remain accessible through horizontal scrolling or compact mobile rows. Product-creation and stock-movement dialogs constrain their height to the viewport and keep their actions available while the form scrolls. Search, category filters, role-based actions, notifications, and CSV export remain available in the responsive interface.

For a quick responsive check, start the development servers and use the browser's device toolbar at phone-sized widths (for example, 375 px) and tablet widths. No special mobile configuration is required.

## Prerequisites

- Node.js 20 or newer and npm
- Docker Desktop (recommended) or a local PostgreSQL server

## Start locally

1. Install dependencies from the workspace root:
   `npm install`
2. Start PostgreSQL using Docker Compose:
   `docker compose up -d postgres`
   The schema is applied automatically on the database's first initialization.
3. Create `backend/.env` from `backend/.env.example`. Set a unique `JWT_SECRET` and `WEBHOOK_SECRET`; `DATABASE_URL` should point to `postgresql://postgres:postgres@localhost:5432/aura_loom` for the included compose service.
4. Apply the database schema and seed sample data:
   `npm run db:setup --workspace backend`
5. Optional: create `frontend/.env` from `frontend/.env.example` if the API URL is not `http://localhost:4000/api`.
6. Start both services:
   `npm run dev`
7. Open `http://localhost:5173`.

All four demo staff accounts use password `AuraLoom2026!`:

| Email | Role |
| --- | --- |
| `amelia@auraloom.com` | Administrator |
| `noah@auraloom.com` | Store manager |
| `mia@auraloom.com` | Warehouse officer |
| `ethan@auraloom.com` | Store clerk |

For a production deployment, replace demo passwords, set strong secrets, use TLS, and configure database backups and allowed CORS origins. Do not expose the demo credentials or webhook secret in production.

## API overview

The API listens on port `4000` and is mounted under `/api`.

- `POST /auth/login` — sign in with staff email/password and receive a 12-hour bearer token.
- `GET /dashboard`, `GET /products`, `GET /transactions`, `GET /notifications`, `GET /suppliers` — dashboard and inventory reads.
- `POST /transactions` — authenticated inventory movement; includes required notes and `unitPrice` (per-unit transaction price). `STOCK_OUT` is submitted as a positive quantity and applied as a negative delta. `ADJUSTMENT` accepts a signed non-zero quantity; managers/admins only.
- `POST /webhooks/order-placed` — e-commerce order webhook. Set `x-webhook-secret` to `WEBHOOK_SECRET`; the endpoint rejects requests if the secret has not been configured. Body shape: `{ "orderId": "ORDER-123", "customer": { "name": "Customer", "email": "customer@example.com" }, "items": [{ "sku": "AL-001-IVO-XS", "quantity": 1 }] }`. Use a SKU returned by `GET /products`; the seed generator produces the color prefix for each variant.
- `PATCH /notifications/:id/read`, `PATCH /notifications/read-all` — mark alerts read.
- `GET /health` — API health check.

All staff dashboard, inventory, notification, and transaction endpoints require the bearer token returned by sign-in. Health is public; the order webhook uses its configured shared secret instead of staff authentication. Manual movements and order webhooks run inside PostgreSQL transactions. Stock mutations use conditional atomic updates; insufficient quantities fail without recording partial movements, and database constraints prevent negative stock. Each movement records a unit price and extended amount; the dashboard summarizes sold, returned, and purchased values, and the audit CSV includes price columns. Enter the actual supplier purchase price on stock-in; older records are backfilled from catalog prices because historical purchase costs were not previously recorded. Webhook order IDs are idempotency keys, so retry deliveries return the stored result rather than deducting stock twice. Webhook notifications include order/customer and variant metadata as JSONB. The dashboard refreshes notification data every 15 seconds.

## Database and sample data

The canonical schema is `backend/sql/schema.sql`. It creates staff, categories, suppliers, products, variants, priced audit transactions, JSONB notifications, and webhook idempotency records with useful indexes and stock checks. The migration adds `unit_price` to existing transaction tables and backfills historical rows from each product's catalog price; edit that column in past transactions if you know their actual historical prices. The seed script adds five categories, three suppliers, ten apparel styles with two colors and five sizes per style, and four demo users. The seed operation is safe to rerun for the included sample records.

The backend loads `backend/.env` relative to its own files, so the API works regardless of which directory starts it. `npm run db:setup --workspace backend` applies the idempotent schema and sample data to an existing database as well. PostgreSQL's Docker initialization scripts run only when the data volume is first created. If you need a completely fresh local database, back up anything you need and run `docker compose down -v` followed by `docker compose up -d postgres`, then run the setup command again.

## Build and type-check

- `npm run typecheck`
- `npm run build`

### 👥 User Roles, Duties & Authority Matrix

The Aura & Loom Inventory System implements strict Role-Based Access Control (RBAC) across 4 staff tiers to maintain operational security and audit accountability:

1. 🟢 Store Clerk / Cashier
   - Primary Focus: Frontline retail sales and counter operations.
   - Duties: Process in-store retail sales (Stock-Out), handle customer returns/exchanges, and search live variant stock across sizes and colors.
   - Authority: Low / Restricted. Cannot edit master pricing, create products, delete entries, or view financial valuation reports.

2. 🟡 Warehouse / Inventory Officer
   - Primary Focus: Supply chain management, receiving, and physical stock checks.
   - Duties: Log incoming supplier deliveries (Stock-In), record stock adjustments (damaged goods, shrinkage, leaks) with required notes, and manage low-stock/out-of-stock restock queues.
   - Authority: Moderate Operational. Can update physical quantities and suppliers, but cannot modify core pricing or alter staff accounts.

3. 🔵 Store Manager / Buyer
   - Primary Focus: Catalog curation, merchandise planning, and financial auditing.
   - Duties: Create and edit parent apparel styles, categories, and variant matrices (SKUs/sizes/colors), add new items to the catalog, monitor online webhook activity, review financial summaries, and export Transaction Audit Logs to CSV.
   - Authority: High Managerial. Full control over catalog and inventory movement audit records.

4. 🟣 System Administrator
   - Primary Focus: Technical oversight, access security, and platform integration.
   - Duties: Manage staff accounts, assign/update roles (CLERK, WAREHOUSE_OFFICER, MANAGER, ADMIN), add or adjust catalog items, manage e-commerce API webhook keys, and oversee database integrity.
   - Authority: Full Unrestricted System Access.

#### RBAC Permissions Matrix Table:

| Role | Browse Matrix | Record In-Store Sale/Return | Bulk Restock & Adjustments | Add New Item / Catalog Creation | Edit Catalog & Prices | Export CSV Audits | User Management |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Clerk** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Warehouse Officer** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Store Manager** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **System Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Notes

The API supports JWT staff authentication and restricts adjustment operations by role. The activity chart is a dashboard visual placeholder and should be backed by a date-bucketed movement analytics endpoint before production reporting.
