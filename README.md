# SFG Transfer Tracker

> A production-grade prototype for tracking inter-plant Semi-Finished Goods (SFGs) transfers across manufacturing facilities with verifiable audit trails, transactional state transitions, and upstream Parent Job Order integration.

---

## 1. Overview & Context

A manufacturer produces complex equipment across three specialized plants:
- **P1 (Plant 1 - Headers)**: Manufactures precision header assemblies.
- **P2 (Plant 2 - Sheet Metal)**: Fabricates chassis, brackets, and sheet metal sub-assemblies.
- **P3 (Plant 3 - Final Assembly)**: Consumes child SFGs to assemble final finished products.

### The Problem
Previously, movements of child parts (SFGs) between plants were untracked or logged on paper. Inter-plant shipments went missing, quantities diverged, and assembly lines at P3 stalled due to unverified transit statuses.

### The Solution
The **SFG Transfer Tracker** creates a closed-loop, verifiable digital chain of custody:
1. **Dispatch (SEND)**: Producing plant creates a transfer linked to an upstream Parent Job Order with target quantity and timestamp.
2. **In-Transit**: Live tracking across plant dispatch boards with real-time transit status.
3. **Receipt (RECEIVE)**: Receiving plant inspects the shipment, inputs verified quantities, notes discrepancies, and confirms receipt.
4. **Append-Only Audit Trail**: Every lifecycle mutation (`SENT`, `RECEIVED`, `DISCREPANCY`, `CANCELLED`) writes an immutable event enforced by PostgreSQL triggers.

---

## 2. System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend (Netlify / React 18 + Vite)"]
        UI["React SPA + Tailwind CSS"]
        QC["TanStack Query Cache"]
        ID["Simulated Plant Switcher (P1 / P2 / P3)"]
    end

    subgraph Server["Backend API (Render / Node.js 20 Fastify)"]
        AuthHook["PreHandler: Identity Hook (x-plant-code, x-actor-name)"]
        IdemHook["PreHandler: Idempotency Replay Cache"]
        Router["Fastify Zod TypeProvider Routes"]
        Service["TransferService (Transactional State Machine)"]
        JOProvider["JobOrderProvider (File / SAP RFC Skeleton)"]
    end

    subgraph Database["Database Cluster (Supabase PostgreSQL)"]
        Pooler["Port 6543: PgBouncer (Transaction Pooler)"]
        Direct["Port 5442: Session Pooler (Migrations/DDL)"]
        TrfTable[("transfers")]
        EvtTable[("transfer_events (Immutable Trigger)")]
        CounterTable[("daily_counters (TRF-YYYYMMDD-NNNN)")]
        IdemTable[("idempotency_keys")]
    end

    subgraph Upstream["Upstream Integration"]
        JSONStore["data/job_orders.json (8 Parent Job Orders)"]
        SAPConnector["SAP S/4HANA (BAPI_GOODSMVT_CREATE 351/101 Skeleton)"]
    end

    UI -->|HTTP / JSON with Identity Headers| AuthHook
    AuthHook --> IdemHook
    IdemHook --> Router
    Router --> Service
    Service -->|Validate SFG & Parent Build| JOProvider
    JOProvider -->|Local| JSONStore
    JOProvider -.->|Enterprise Target| SAPConnector
    Service -->|Prisma $transaction| Pooler
    Pooler --> TrfTable
    Pooler --> EvtTable
    Pooler --> CounterTable
    Pooler --> IdemTable
    Direct -.->|prisma migrate deploy| Database
```

---

## 3. Technology Stack

- **Monorepo Structure**:
  - `/backend`: Node.js 20+, Fastify, Prisma ORM, Zod, `@fastify/swagger` + Swagger UI (`/docs`), `@fastify/cors`, Vitest.
  - `/frontend`: React 18, Vite, TypeScript, Tailwind CSS, TanStack Query v5, Lucide Icons, Playwright E2E.
  - `/docs`: OpenAPI/REST Contract ([API_CONTRACT.md](docs/API_CONTRACT.md)) and Enterprise Integration Guide ([INTEGRATION.md](docs/INTEGRATION.md)).
- **Database**: Supabase PostgreSQL with custom PL/pgSQL triggers enforcing append-only immutability.
- **Deployment**:
  - Backend: Render Web Service (Native Node.js runtime, zero Docker).
  - Frontend: Netlify Web Application (Static SPA with redirect routing).

---

## 4. Local Development

### Prerequisites
- Node.js `20.x` or `22.x`
- npm `10.x+`
- Access to Supabase PostgreSQL instance (or local PostgreSQL)

### 1. Clone & Setup Backend
```bash
cd backend
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Run database migrations and seeds
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed    # Seeds plants P1, P2, P3
npm run seed:demo       # Seeds 6 realistic demo transfers across statuses

# Start backend server
npm run dev
```
Backend runs on `http://localhost:3000`. Swagger API docs at `http://localhost:3000/docs`.

### 2. Setup Frontend
```bash
cd ../frontend
npm install

# Start Vite dev server
npm run dev
```
Frontend runs on `http://localhost:5173`.

### 3. Run Automated Tests
```bash
# Run backend unit & integration tests
cd backend
npm test

# Run Playwright E2E smoke test
cd ../frontend
npx playwright test
```

---

## 5. Environment Variables

### Backend (`/backend/.env`)

| Variable | Required | Source / Description | Example Value |
|---|---|---|---|
| `DATABASE_URL` | Yes | Supabase Dashboard &rarr; Project Settings &rarr; Database &rarr; Connection Pooling (Transaction mode, port 6543) with `?pgbouncer=true`. | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | Yes | Supabase Dashboard &rarr; Project Settings &rarr; Database &rarr; Direct connection / Session mode (port 5432). Used for migrations. | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:5432/postgres` |
| `PORT` | Optional | Port on which Fastify listens. Render dynamically injects this. Default: `3000`. | `3000` |
| `HOST` | Optional | Host interface binding. Must be `0.0.0.0` for cloud container/VM hosting. Default: `0.0.0.0`. | `0.0.0.0` |
| `CORS_ORIGIN` | Yes | Allowed frontend origin(s) separated by commas. Set to Netlify site URL in production. | `http://localhost:5173` or `https://your-site.netlify.app` |
| `JOB_ORDER_PROVIDER` | Optional | Provider type for parent build connector (`file` or `sap`). Default: `file`. | `file` |
| `NODE_ENV` | Optional | Runtime environment (`development`, `production`, `test`). | `production` |
| `NODE_VERSION` | Yes (Render) | Node runtime version enforced on Render native buildpack. | `20` |

### Frontend (`/frontend/.env`)

| Variable | Required | Source / Description | Example Value |
|---|---|---|---|
| `VITE_API_BASE_URL` | Yes | Public HTTPS URL of the deployed Render backend API. **Must be configured before building** because Vite inlines it during bundle compile. | `https://sfg-tracker-backend.onrender.com` |

---

## 6. End-to-End Demo Script

Follow this walkthrough in your browser to experience the complete inter-plant lifecycle:

1. **Open the Application**: Navigate to `http://localhost:5173` (or your Netlify URL).
2. **Set Active Identity to P1 (Producing Plant)**:
   - In the top navigation bar, ensure the **Active Plant** selector is set to **"P1 - Headers Plant"** (Operator: Alex).
3. **Dispatch a New SFG**:
   - Click the green **"+ Dispatch New SFG"** button.
   - **Select Parent Job Order**: Choose `JO-24-0001 (Air Handler AHU-500)`.
   - **Select SFG Item**: Choose `SFG-HDR-01: Evaporator Copper Header 2"`.
   - **Destination Plant**: Select `P2 - Sheet Metal Plant` (or `P3`).
   - **Quantity Sent**: Enter `12` Units.
   - **Remarks**: Type `"Batch #441 dispatch for secondary casing"`.
   - Click **"Dispatch SFG Transfer"**.
4. **Inspect Transit State**:
   - You are immediately redirected to the Transfer Detail view (`/transfers/TRF-YYYYMMDD-000X`).
   - Note the status badge: **`IN TRANSIT`**.
   - Notice the notice banner: *"Active plant (P1) is the dispatching plant. Awaiting physical transit and receipt by P2."*
   - Inspect the **Audit Trail & Custody Timeline**: Event `SENT` is logged with actor `Operator Alex` and exact timestamp.
5. **Simulate Transfer Arrival at Receiving Plant (P2)**:
   - Click the top navigation bar **Active Plant** selector and switch to **"P2 - Sheet Metal Plant"** (Operator: Sarah).
   - The page re-evaluates permissions. The banner turns green: *"Active plant (P2) is the designated receiving plant. Please inspect the items and record receipt."*
6. **Acknowledge Physical Receipt**:
   - In the Receipt Confirmation card, verify or adjust **Accepted Quantity** (e.g. `12` for full receipt, or `10` to record a discrepancy).
   - **Inspection Notes**: Enter `"All 12 header assemblies intact and pressure tested"`.
   - Click **"Acknowledge Receipt"**.
7. **Verify Completed Audit Trail**:
   - The transfer status badge instantly transitions to **`FULLY RECEIVED`** (or `DISCREPANCY`).
   - The timeline now displays both `SENT` and `RECEIVED` events with exact user attribution and timestamps.

---

## 7. Production Deployment Guide (Render + Netlify)

### The Circular Dependency & Resolution Order

- **The Problem**: Render requires the Netlify frontend URL for `CORS_ORIGIN`, while Netlify requires the Render backend URL for `VITE_API_BASE_URL` (which Vite inlines at build time).
- **The Solution (Deployment Order)**:
  1. **Deploy Backend on Render First**: Configure `CORS_ORIGIN` with a temporary wildcard `*` or placeholder (e.g., `https://placeholder.netlify.app`). Once deployed, copy your Render URL (`https://sfg-tracker-backend.onrender.com`).
  2. **Deploy Frontend on Netlify**: Set `VITE_API_BASE_URL` to your Render URL. Trigger the initial build. Once deployed, copy your assigned Netlify URL (`https://sfg-tracker.netlify.app`).
  3. **Update Render Backend CORS**: In the Render dashboard, update `CORS_ORIGIN` to match your exact Netlify domain (`https://sfg-tracker.netlify.app`) and trigger a quick redeploy.

---

### Step A: Deploy Backend on Render (Native Node.js Runtime)

1. Push your repository to GitHub.
2. Log in to [Render Dashboard](https://dashboard.render.com/) and click **New +** &rarr; **Web Service**.
3. Select your repository.
4. Fill in the exact settings:
   - **Name**: `sfg-tracker-backend`
   - **Region**: Closest to your database (e.g. Frankfurt / `eu-central-1` if Supabase is `eu-north-1`).
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**:
     ```bash
     npm ci && npx prisma generate && npx prisma migrate deploy && npm run build
     ```
   - **Start Command**:
     ```bash
     node dist/server.js
     ```
   - **Instance Type**: `Free`
5. Click **Advanced** and set:
   - **Health Check Path**: `/health`
   - **Auto-Deploy**: `Yes`
6. Under **Environment Variables**, add:
   - `NODE_VERSION` = `20`
   - `JOB_ORDER_PROVIDER` = `file`
   - `DATABASE_URL` = `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true`
   - `DIRECT_URL` = `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:5432/postgres`
   - `CORS_ORIGIN` = `*` *(temporary until Netlify is created)*
7. Click **Create Web Service**.
8. After build succeeds, copy the public URL (e.g. `https://sfg-tracker-backend.onrender.com`). Verify `/health` in your browser.

---

### Step B: Deploy Frontend on Netlify

1. Log in to [Netlify Dashboard](https://app.netlify.com/) and click **Add new site** &rarr; **Import an existing project**.
2. Select your GitHub repository.
3. Configure build settings:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. Expand **Environment variables** &rarr; **Add a variable**:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: `https://sfg-tracker-backend.onrender.com` *(your Render backend URL)*
5. Click **Deploy sfg-tracker**.
6. Once deployed, note your Netlify URL (e.g. `https://sfg-tracker-demo.netlify.app`).
7. Verify SPA routing: clicking links and reloading pages (e.g. `/transfers`) works without 404 errors due to `frontend/public/_redirects` and `frontend/netlify.toml`.

---

### Step C: Lock Down CORS on Render

1. Return to [Render Dashboard](https://dashboard.render.com/) &rarr; `sfg-tracker-backend` &rarr; **Environment**.
2. Change `CORS_ORIGIN` from `*` to:
   ```
   https://sfg-tracker-demo.netlify.app
   ```
3. Click **Save Changes**. Render will automatically redeploy the service.

---

## 8. Manual Action Checklist

For quick reference when setting up your cloud dashboards:

### Render Dashboard Checklist:
- [ ] Set **Root Directory** to `backend`.
- [ ] Set **Build Command** to `npm ci && npx prisma generate && npx prisma migrate deploy && npm run build`.
- [ ] Set **Start Command** to `node dist/server.js`.
- [ ] Set **Health Check Path** to `/health`.
- [ ] Add `DATABASE_URL` (Supabase port 6543 pooler with `?pgbouncer=true`).
- [ ] Add `DIRECT_URL` (Supabase port 5432 session connection).
- [ ] Add `NODE_VERSION` = `20`.
- [ ] Add `JOB_ORDER_PROVIDER` = `file`.
- [ ] Set `CORS_ORIGIN` = `*` initially, then update to your Netlify domain.

### Netlify Dashboard Checklist:
- [ ] Set **Base directory** to `frontend`.
- [ ] Set **Build command** to `npm run build`.
- [ ] Set **Publish directory** to `dist`.
- [ ] Add environment variable `VITE_API_BASE_URL` with your Render service URL **before triggering build**.
- [ ] Copy the generated Netlify URL and update `CORS_ORIGIN` in Render.

---

## 9. Known Limitations

1. **Simulated Authentication**:
   - Plant identification and actor attribution rely on HTTP request headers (`x-plant-code` and `x-actor-name`) simulated via the UI plant switcher. In an enterprise production deployment, this would be replaced with OIDC/OAuth2 authentication (e.g. Azure AD, Okta) mapping operator identity and plant assignments to JWT claims.
2. **Free-Tier Cold Starts**:
   - On the Render Free tier, instances spin down automatically after 15 minutes of inactivity. The first incoming request may experience a 30–50 second spin-up latency before responding. Subsequent requests run with normal sub-second response times.
3. **Single-Line Item Transfers**:
   - Each transfer record currently tracks a single SFG child part. Multi-item freight manifests (batching multiple distinct SFG child items under a single physical bill of lading) can be modeled in a future schema iteration by introducing a `TransferLineItem` relationship.
