# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LDS stake management portal with three independent services:
- **`frontend/`** — React 19 SPA + Express server (Node.js)
- **`backend/`** — FastAPI REST API (Python)
- **`slackbot/`** — Slack bot using Slack Bolt (Python)

Each service has its own package manager and runs independently.

---

## Commands

### Frontend (run from `frontend/`)

```bash
npm install                  # Install dependencies
npm run dev:client           # Vite dev server on port 3100 (UI only)
npm run dev                  # Express + Vite (full stack dev)
npm run build                # Production build
npm run check                # TypeScript type checking
npm run db:push              # Apply Drizzle schema changes
```

### Backend (run from `backend/`)

All Python commands must use `uv run`. Do not use `python`, `pip`, `venv`, or `conda`.

```bash
uv sync                      # Install dependencies
uv sync --group dev          # Install with test dependencies
INITIAL_ADMIN_PASSWORD=admin123 uv run python main.py   # First launch (creates admin user)
uv run python main.py        # Start server on port 8000
uv run python -m uvicorn src.app:app --reload --host localhost --port 8000  # Dev with reload

# Alembic migrations (run from backend/)
uv run alembic -c alembic.ini upgrade head
uv run alembic -c alembic.ini revision --autogenerate -m "description"
uv run alembic -c alembic.ini downgrade -1
uv run alembic -c alembic.ini history --verbose

# Tests
uv run pytest                                              # All tests
uv run pytest src/tests/test_auth.py                       # Single file
uv run pytest src/tests/test_auth.py::test_login_sets_cookie_and_returns_token  # Single test
```

### Slackbot (run from `slackbot/`)

```bash
uv sync
uv run python main.py
```

---

## Architecture

### Request Flow

```
Browser → React SPA
            → /api/* → Express (port 3100) → FastAPI (port 8000)
                      (dev proxy)

Slack → SlackBot (Socket Mode) → FastAPI (port 8000)
```

The Express server acts as a thin proxy and session layer. All business logic lives in FastAPI. The frontend never calls FastAPI directly in production.

### Authentication

Two auth layers coexist:
1. **Express/Passport** — Session cookies (`express-session`) for the SPA. Handles `/api/login`, `/api/logout`, `/api/me`.
2. **FastAPI/JWT** — JWT tokens issued by FastAPI, refreshed via `/api/auth/refresh`. Used for leader-area features requiring backend permissions.

### Frontend Structure

```
frontend/
├── client/src/
│   ├── App.tsx              # All routes (Wouter Switch) + AuthSync
│   ├── pages/               # One file per route
│   ├── components/
│   │   ├── layout/          # Navbar, Footer, ProtectedRoute
│   │   └── ui/              # shadcn generated — do not edit manually
│   ├── lib/
│   │   ├── queryClient.ts   # React Query setup + apiRequest() helper
│   │   └── utils.ts         # cn() utility
│   ├── hooks/               # Custom hooks
│   ├── stores/              # Zustand (auth store)
│   └── data/                # Static JSON (GeoJSON, etc.)
├── server/
│   ├── routes.ts            # All Express API handlers (prefix: /api)
│   ├── storage.ts           # DB interface (currently in-memory)
│   └── index.ts             # Express entry point
└── shared/
    └── schema.ts            # Drizzle schema + Zod types (shared client/server)
```

### Backend Structure

```
backend/src/
├── app.py                   # FastAPI instance, CORS, lifespan hooks
├── main.py                  # Entry point (uvicorn, env setup)
├── models/                  # SQLModel ORM models
├── routers/                 # FastAPI route handlers (one file per domain)
├── db/
│   ├── orm.py               # Singleton ORM + get_session() dependency
│   └── engines/sqlite_engine.py
└── utils/                   # Password hashing, JWT helpers, background tasks
```

Database: SQLite for local dev (`./database.db`), schema is PostgreSQL-ready. `INITIAL_ADMIN_PASSWORD` must be set on first run — the admin account only creates when the database is empty; first login forces a password change.

---

## Frontend Conventions

### Component Library Priority

Both DaisyUI and shadcn/ui are active. Follow this decision rule:

| Need | Use |
|---|---|
| Buttons, badges, tables, alerts, loading, toasts | DaisyUI classes (`btn`, `badge`, `table`, etc.) |
| Cards, tabs, drawers, simple modals | DaisyUI |
| Dialog (accessible), Dropdown, Select, Popover, Command, Sheet, Tooltip, Accordion | shadcn (`components/ui/`) |
| Layout, spacing, custom positioning | Raw Tailwind |

Never build a custom version of something either library already provides.

Add new shadcn components via CLI only — do not hand-write into `ui/`:
```bash
npx shadcn@latest add <component-name>
```

### Data Fetching

- Use React Query for all server state — not `useState` + `useEffect`.
- Use `apiRequest()` from `lib/queryClient.ts` for all fetch calls.
- Local `useState` is for UI-only state (dialog open/closed, filter selections).

### Forms

- React Hook Form + Zod for all user input.
- Derive Zod schema from Drizzle insert schema in `shared/schema.ts` where possible.
- Inline field errors (not toasts). Sonner toasts only for async success/failure.

### Routing & Auth

- Routing: Wouter only — do not introduce React Router.
- Routes under `/leader/*` are protected and redirect to `/login` if unauthenticated.
- Auth logic lives in the layout/ProtectedRoute wrapper, not individual pages.

### Styling Rules

- Do not use raw Tailwind color classes (`bg-blue-500`). Use semantic tokens: `primary`, `secondary`, `accent`, `muted`, `background`, `card`, `destructive`.
- Max content width: `max-w-6xl mx-auto`. Page padding: `px-4 sm:px-6 lg:px-8`. Section spacing: `py-12`.
- Typography: Inter for body, Playfair Display (serif) for hero/section headings.
- Icons: Lucide React only. `size-4` inline, `size-5` standalone.
- Dark mode is class-based and works automatically when semantic tokens are used.
- Do not use `any` in TypeScript.

### Replacing Mock Data

Pattern for migrating hardcoded mock data to real API:
1. Identify the hardcoded constant in the component.
2. Create the Express API route in `server/routes.ts` (prefix: `/api`).
3. Update `shared/schema.ts` if a new DB table is needed.
4. Wire up the React Query call in the page component.
5. Remove the mock constant.

Pages still using mock data: `stake-calendar.tsx`, `stake-sports.tsx`, `stake-leadership.tsx`, `ward-info/meeting-times.tsx`, `ward-info/bishops.tsx`, `leader/callings/manage.tsx`.

---

## Backend Conventions

### Testing

Tests use an in-memory SQLite database (never the real database). Fixtures are in `backend/src/tests/conftest.py`:
- `client` — FastAPI `TestClient` with overridden `get_session` dependency
- `userpass` — pre-created test user + plaintext password
- `admin` — admin user with all permission flags set
- `high_councilor_calling` / `high_councilor_assignment` — pre-created HC objects

The FastAPI Swagger docs are at `http://localhost:8000/docs` during local development.

---

## Environment Variables

**Backend** (`.env` in `backend/`):
```
DEV=true
PORT=8000
DB_ENGINE=sqlite
DATABASE_PATH=./database.db
INITIAL_ADMIN_PASSWORD=<required on first run>
JWT_SECRET_KEY=<required>
SSL_ENABLED=false
SP_APPROVAL_THRESHOLD=2
HC_APPROVAL_THRESHOLD=3
```

**Frontend** (`frontend/` environment):
```
DATABASE_URL=<PostgreSQL connection string>
PORT=5000
NODE_ENV=development
SESSION_SECRET=<required in production>
```

**Slackbot** (`slackbot/`):
```
SLACK_BOT_TOKEN=<token>
SLACK_APP_TOKEN=<app-level token>
```