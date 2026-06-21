# WFM-App – Workforce Management Tool

A workforce management tool for telephony / contact-center teams. It turns a call
**forecast** into a per-interval staffing requirement using the **Erlang C model**,
collects employees' **shift and break preferences**, and helps supervisors with
**scheduling**, including automatic **break optimization** and **coverage analysis**.

> **Stack:** Next.js 16 · React 19 · TypeScript · tRPC 11 · Prisma 7 (PostgreSQL) · NextAuth · Vitest

---

## Features

- **Forecast import** – import, validate and version call forecasts (expected calls + AHT
  per interval) from CSV/XLSX (`VALIDATED → ACTIVE → REPLACED`).
- **Staffing via Erlang C** – computes the required number of agents per interval from call
  volume, AHT, service-level target, threshold time, shrinkage and max occupancy.
- **Shift & break preferences** – employees submit preferred shifts (with priority) and
  break preferences per planning period.
- **Scheduling** – supervisors create planning periods, adopt preferences or plan manually
  (`FROM_WISH` / `MANUAL`), with `DRAFT → PUBLISHED` status.
- **Break optimization** – places paid breaks greedily so that coverage suffers as little as
  possible (preferences are respected).
- **Coverage analysis** – compares required vs. present agents per interval and reports any
  shortfall (`deficit`).
- **Roles & auth** – `EMPLOYEE` and `SUPERVISOR` via NextAuth, with separate UIs.

---

## Architecture

The project separates **business logic** (framework-agnostic, fully unit-tested) from the
database, API and UI layers:

```
domain/           Pure business logic (no framework dependencies, unit-tested)
  staffing/         Erlang B/C, service level, requirement computation
  scheduling/       Interval helpers & coverage computation
  breaks/           Break optimization
  types.ts          Shared domain types

server/           tRPC API (routers: forecast, admin, planning, coverage)
infrastructure/   Database (Prisma), auth, import parsing/validation
app/              Next.js App Router (Employee & Supervisor UI, API routes)
prisma/           Schema, migrations, seed
tests/            Integration tests (server & import)
docs/             Specification & implementation plan
```

### Erlang C pipeline (core of the staffing math)

```
Forecast (calls, AHT)  ──►  Traffic intensity A [Erlang] = calls · AHT / interval length
                            │
                            ▼
                      Erlang B (numerically stable recurrence)
                            │
                            ▼
                      Erlang C  →  service level for a given agent count
                            │
                            ▼
        smallest agent count satisfying service-level target & max occupancy
                            │
                            ▼
                  staffing requirement per interval (incl. shrinkage uplift)
```

---

## Data model (excerpt)

| Model | Purpose |
|---|---|
| `User` / `Employee` | Login + employee master data (contract hours, active) |
| `ForecastImport` / `ForecastInterval` | Imported, versioned call forecast per interval |
| `StaffingParameter` | Service-level target, threshold, shrinkage, max occupancy, opening hours |
| `StaffingRequirement` | Computed staffing requirement per date/interval |
| `ShiftTemplate` | Shift templates (e.g. "Früh"/"Spät") incl. paid break |
| `PlanningPeriod` | Planning period (`DRAFT`/`PUBLISHED`) |
| `ShiftWish` | Shift/break preference per employee and day (with priority) |
| `ShiftAssignment` / `PlannedBreak` | Concrete shift assignment with planned breaks |

Full schema: [`prisma/schema.prisma`](prisma/schema.prisma).

---

## Getting started

### Prerequisites

- **Node.js** ≥ 20
- **PostgreSQL** – locally the project uses an embedded Postgres (`embedded-postgres`),
  so no separate database server is required.

### Installation

```bash
git clone https://github.com/Zwirnchen/wfm-app.git
cd wfm-app
npm install
```

### Configure environment

Copy `.env.example` to `.env` and adjust:

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://wfm:wfm@localhost:5433/wfm?schema=public"
NEXTAUTH_SECRET="change-me"      # replace for production
NEXTAUTH_URL="http://localhost:3000"
```

### Database & seed

```bash
npm run db:start   # start embedded Postgres
npm run db:seed    # seed sample data (shift templates, parameters, demo users)
```

### Run in development

```bash
npm run dev        # http://localhost:3000
```

---

## NPM scripts

| Script | Description |
|---|---|
| `npm run dev` | Next.js development server |
| `npm run build` / `npm start` | Production build / start |
| `npm run lint` | ESLint |
| `npm test` | Run tests once (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run db:start` / `db:stop` | Start/stop embedded Postgres |
| `npm run db:seed` | Seed the database with sample data |

---

## UIs & routes

**Employees (`/employee`)**
- `wishes/[periodId]` – submit shift and break preferences
- `plan/[periodId]` – view your own published plan

**Supervisors (`/supervisor`)**
- `import` – import & validate a forecast
- `parameters` – maintain staffing parameters
- `planning/[periodId]` – build the schedule, adopt preferences, publish

---

## Tests

The domain logic is covered by unit tests (including an Erlang B reference value as a
correctness check), complemented by integration tests for the server and import.

```bash
npm test
```

---

## Project status

Active development (version `0.1.0`). Architecture, data model and domain logic are in
place; the UI and planning workflows are being expanded.

Detailed specification and implementation plan live under
[`docs/superpowers`](docs/superpowers).
