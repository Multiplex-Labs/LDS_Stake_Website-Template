# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LDS stake management portal with three independent services:
- **`frontend/`** — React 19 SPA + Express proxy server (Node.js, port 3100)
- **`backend/`** — FastAPI REST API (Python, port 8000)
- **`slackbot/`** — Slack bot using Slack Bolt in Socket Mode (Python)

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
```

### Backend (run from `backend/`)

All Python commands must use `uv run`. Do not use `python`, `pip`, `venv`, or `conda`.

```bash
uv sync                      # Install dependencies
uv sync --group dev          # Install with test dependencies
INITIAL_ADMIN_PASSWORD=admin123 uv run python main.py   # First launch (creates admin user)
uv run python main.py        # Start server on port 8000
uv run python -m uvicorn src.app:app --reload --host localhost --port 8000  # Dev with reload

# Alembic migrations (always run from backend/)
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

### Development startup order

1. Start backend first: `cd backend && uv run python main.py`
2. Start frontend: `cd frontend && npm run dev`
3. Optionally start slackbot: `cd slackbot && uv run python main.py`

---

## Architecture

### Request Flow

```
Browser → React SPA
            → /api/* → Express (port 3100) → FastAPI (port 8000)
                      (thin proxy, strips /api prefix)

Slack → SlackBot (Socket Mode)   [future: → FastAPI]
```

The Express server is a **pure proxy** — it does no session management, no auth, no business logic. Every `/api/*` request is forwarded to FastAPI with the `/api` prefix stripped. The frontend never calls FastAPI directly.

### Authentication

JWT-only, single-layer auth through FastAPI:

1. `POST /api/auth/login` (form-encoded) — FastAPI returns a short-lived JWT access token (15 min) in the response body and sets an HttpOnly `refresh_token` cookie (7 days).
2. Access token is stored **in memory only** via `setAccessToken()` in `lib/queryClient.ts` — never localStorage.
3. `GET /api/auth/refresh` — exchanges the `refresh_token` cookie for a new access token (rotates the cookie). Called by `AuthSync` on page load and by `apiRequest()` automatically on any 401.
4. `GET /api/auth/me` — returns the authenticated user's profile.
5. `POST /api/auth/logout` — deletes the session server-side, clears the cookie.

> **Note:** `express-session`, `passport`, and `connect-pg-simple` are in `package.json` but are **not used** — they are legacy from an earlier design. Do not add Passport-based auth.

### Frontend Structure

```
frontend/
├── client/src/
│   ├── App.tsx              # All Wouter routes + AuthSync component
│   ├── pages/               # One file per route
│   ├── components/
│   │   ├── layout/          # Navbar, Footer, ProtectedRoute
│   │   └── ui/              # shadcn/ui generated — do not edit manually
│   ├── lib/
│   │   ├── queryClient.ts   # React Query setup, apiRequest(), token store
│   │   └── utils.ts         # cn() utility
│   ├── hooks/               # Custom hooks
│   ├── stores/              # Zustand (auth.ts — user + isLoading)
│   └── data/                # Static JSON (GeoJSON ward boundaries, etc.)
├── server/
│   ├── routes.ts            # Single http-proxy-middleware catch-all → FastAPI
│   └── index.ts             # Express entry point
└── shared/
    └── schema.ts            # Drizzle stub schema (not operationally used)
```

### Backend Structure

```
backend/src/
├── app.py                   # FastAPI instance, CORS, lifespan hooks, router registration
├── main.py                  # Entry point (uvicorn, env setup, .env loading)
├── models/                  # SQLModel ORM models (one file per domain)
├── routers/                 # FastAPI route handlers (one file per domain)
├── db/
│   ├── orm.py               # Singleton ORM + get_session() dependency
│   └── engines/sqlite_engine.py
└── utils/                   # security.py, permissions.py, password hashing, background tasks
```

Database: SQLite for local dev (`./database.db`). Schema is PostgreSQL-compatible. `INITIAL_ADMIN_PASSWORD` must be set on first run — admin is created only when the DB is empty; first login forces a password change.

---

## Routes Reference

### All Wouter routes (from `App.tsx`)

| Path | Component file | Protected |
|------|---------------|-----------|
| `/` | `pages/home.tsx` | No |
| `/login` | `pages/login.tsx` | No |
| `/change-password` | `pages/change-password.tsx` | Yes |
| `/license` | `pages/license.tsx` | No |
| `/stake-leadership` | `pages/stake/leadership.tsx` | No |
| `/stake-info/calendar` | `pages/stake/calendar.tsx` | No |
| `/stake-info/sports` | `pages/stake/sports.tsx` | No |
| `/stake-info/reserve` | `pages/stake/reserve.tsx` | No |
| `/ward-info/map` | `pages/ward/map.tsx` | No |
| `/ward-info/meeting-times` | `pages/ward/meeting-times.tsx` | No |
| `/ward-info/bishops` | `pages/ward/bishops.tsx` | No |
| `/resources` | `pages/resources.tsx` | No |
| `/leader/assignments` | `pages/leader/assignments.tsx` | Yes |
| `/leader/speaking` | `pages/leader/speaking.tsx` | Yes |
| `/leader/presidency` | `pages/leader/presidency.tsx` | Yes |
| `/leader/calling-system` | `pages/leader/callings/index.tsx` | Yes |
| `/leader/callings/submit` | `pages/leader/callings/submit.tsx` | Yes |
| `/leader/callings/review` | `pages/leader/callings/review.tsx` | Yes |
| `/leader/callings/manage` | `pages/leader/callings/manage.tsx` | Yes |
| `/leader/callings/archive` | `pages/leader/callings/archive.tsx` | Yes |
| `/leader/sustainings` | `pages/leader/sustainings.tsx` | Yes |
| `/leader/user-admin` | `pages/leader/users.tsx` | Yes |

### FastAPI routers (all prefixed under `/` after Express strips `/api`)

| File | Prefix | Key endpoints |
|------|--------|---------------|
| `auth.py` | `/auth` | `POST /login`, `GET /refresh`, `POST /logout`, `GET /me` |
| `users.py` | `/users` | CRUD users, `PATCH /{id}/password`, `POST /photo` |
| `callings.py` | `/callings` | CRUD callings + slot assignment |
| `assignments.py` | `/assignments` | HC assignment CRUD |
| `speaking.py` | `/speaking` | Speaking calendar, topics |
| `calling_kanban.py` | `/calling-kanban` | Proposals CRUD, comments, approvals, `GET /board` |
| `ward.py` | `/wards` | `GET /` list, `GET /{ward_id}` |
| `health.py` | (health check) | |

---

## Data Model Reference

### Key SQLModel tables

| Table | Key fields |
|-------|-----------|
| `user` | `id`, `email` (unique), `password_hash`, `force_password_reset`, `fname`, `lname`, `active`, `phone`, `bio`, `profile_image` |
| `usercalling` | `id`, `user_id`, `calling_id`, `slot_number` |
| `calling` | `id`, `name` (unique), `max_slots`, `is_public`, `system_defined` |
| `permissions` | `id`, `foreign_id`, `is_calling` (bool), `scopes` (IntFlag bitmask) |
| `ward` | `id`, `name`, `bishop_id` (FK→usercalling), `start_time` (float hours) |
| `callingproposal` | `id`, `fname`, `lname`, `spouse_name`, `proposed_calling`, `ward_id`, `submitter`, `is_release`, `submitted_at` |
| `kanbanupdate` | `id`, `proposal_id`, `updater_id`, `from_stage`, `to_stage`, `updated_at` |
| `callingcomment` | `id`, `proposal_id`, `commenter_id`, `comment_text`, `created_at`, `edited_at` |
| `callingapproval` | `id`, `proposal_id`, `approver_id`, `approved`, `created_at` |
| `usersession` | `id`, `user_id`, `token_hash`, `ip_address`, `expires_at` |

### Kanban stages (`KanbanStages` enum)

Stage is **not stored on `CallingProposal`** — it is derived from the most recent `KanbanUpdate.to_stage`.

| Value | Name | Notes |
|-------|------|-------|
| 0 | `SP_APPROVAL` | Start for new callings |
| 1 | `HC_APPROVAL` | After SP approval threshold met |
| 2 | `INTERVIEW` | Start for releases (skip 0–1) |
| 3 | `SUSTAIN` | After interview |
| 4 | `SET_APART` | After sustaining (callings only; releases skip) |
| 5 | `LCR_UPDATE` | After set apart |
| 6 | `DONE` | Terminal |

`SP_APPROVAL_THRESHOLD` and `HC_APPROVAL_THRESHOLD` env vars control auto-advance counts.

### Permission flags (`Permission` IntFlag)

`NONE`, `MANAGE_USERS`, `MANAGE_CALLINGS`, `MANAGE_ASSIGNMENTS`, `MANAGE_SPEAKING_SCHEDULE`, `SUBMIT_CALLING_PROPOSALS`, `MANAGE_CALLING_PROPOSALS`, `VIEW_CALLING_PROPOSALS`

Permissions can be granted at user level (`is_calling=false`) or calling level (`is_calling=true`, inherited by all holders of that calling). Checked via `user_has_permission()` in `backend/src/utils/permissions.py`.

---

## Frontend Conventions

### Component Library

shadcn/ui and Tailwind CSS are the only UI systems. Do not use DaisyUI.

| Need | Use |
|------|-----|
| Buttons, badges, inputs, checkboxes, selects, textareas | shadcn (`components/ui/`) |
| Loading skeletons | `<Skeleton>` from `components/ui/skeleton.tsx` |
| Spinners / full-page loading | `<Spinner>` from `components/ui/spinner.tsx` |
| Dialog, Dropdown, Popover, Command, Sheet, Tooltip, Accordion | shadcn (`components/ui/`) |
| Cards, tabs, tables | shadcn (`components/ui/`) |
| Layout, spacing, custom positioning | Raw Tailwind |

Never build a custom version of something shadcn already provides.

Add new shadcn components via CLI only — do not hand-write into `ui/`:
```bash
npx shadcn@latest add <component-name>
```

### Data Fetching

- Use React Query for all server state — not `useState` + `useEffect`.
- `useQuery({ queryKey: ["/api/some/url"] })` automatically fetches that URL (the `queryKey[0]` is the URL by convention in this project's `queryClient.ts`).
- For typed queries that need `.json()`: `queryFn: () => apiRequest("GET", "/api/url").then(r => r.json())`.
- Use `apiRequest()` from `lib/queryClient.ts` for all mutation fetch calls — it handles auth headers and token refresh automatically.
- Local `useState` is for UI-only state (dialog open/closed, filter selections, form drafts).

### Forms

- React Hook Form + Zod for all user input.
- Inline field errors (not toasts). Sonner toasts only for async success/failure.

### Routing & Auth

- Routing: Wouter only — do not introduce React Router.
- Routes under `/leader/*` are protected via `ProtectedRoute` wrapper; redirect to `/login` when unauthenticated.
- Auth state lives in Zustand (`stores/auth.ts`): `user: AuthUser | null`, `isLoading: boolean`.
- `useAuthStore()` to access current user; `currentUser.id` for mutation ownership checks.

### Styling Rules

- Do not use raw Tailwind color classes (`bg-blue-500`). Use semantic tokens only: `primary`, `secondary`, `accent`, `muted`, `background`, `card`, `destructive`.
- Max content width: `max-w-6xl mx-auto`. Page padding: `px-4 sm:px-6 lg:px-8`. Section spacing: `py-12`.
- Typography: Plus Jakarta Sans for body, Fraunces (`font-serif`) for hero/section headings.
- Icons: Lucide React only. `size-4` for inline icons, `size-5` for standalone.
- Dark mode is class-based and works automatically when semantic tokens are used.
- Do not use `any` in TypeScript. Use `unknown` and narrow explicitly.
- Path aliases: `@/` → `client/src/`, `@shared/` → `shared/`, `@assets/` → `assets/`.

### Error handling pattern (apiRequest / useQuery)

`apiRequest()` throws errors formatted as `"${status}: ${body}"`. Check `error.message.startsWith("401")` for session expiry. Always log errors before rendering error UI (`console.error("[page-name] context:", error)`). Differentiate 401 (re-authenticate) from other errors (refresh/retry).

---

## Backend Conventions

### FastAPI dependency: `CallingUser`

`CallingUser` (`backend/src/utils/security.py`) is the FastAPI dependency for authenticated routes. Constructor options:
- `require_fresh=True` — rejects refresh-token-obtained JWTs (used for password change)
- `api_safe=True` — returns `ResponseSafeUser` (no `password_hash`)
- `permissions=[Permission.X]` — checks bitmask against `permissions` table
- `allow_unchanged_password=True` — bypasses `force_password_reset` guard
- `allow_anonymous=True` — returns `None` instead of 401 when unauthenticated

### Backend startup sequence (lifespan)

1. Initialize ORM
2. `create_default_admin_user()` — only if DB is empty; requires `INITIAL_ADMIN_PASSWORD`
3. `create_system_callings_and_assignments()` — creates High Councilor, Stake Presidency, Bishop callings
4. `load_wards()` — reads `backend/wards.csv` (`name,start_hour` format), creates Ward rows
5. Background tasks: session cleanup loop, speaking assignment cleanup loop

### Testing

Tests use an isolated temp SQLite file (never the real database). Fixtures in `backend/src/tests/conftest.py`:

| Fixture | Description |
|---------|-------------|
| `client` | `TestClient` with `get_session` overridden to test DB |
| `userpass` | `(User, plaintext_password)` — regular test user |
| `admin` | User with all `Permission` flags set |
| `high_councilor_calling` | Fetches/creates the HC `Calling` row |
| `high_councilor_assignment` | HC `UserCalling` + `Assignment` at slot 1 |

Test files: `test_auth.py`, `test_users.py`, `test_callings.py`, `test_assignments.py`, `test_calling_kanban.py`, `test_speaking.py`, `test_health.py`, `test_ward.py`

FastAPI Swagger docs: `http://localhost:8000/docs` (dev only).

---

## Environment Variables

**Backend** (`.env` in `backend/`):
```
DEV=true
PORT=8000
DB_ENGINE=sqlite
DATABASE_PATH=./database.db
INITIAL_ADMIN_PASSWORD=<required on first run only>
JWT_SECRET_KEY=<required — any random string>
SSL_ENABLED=false
SP_APPROVAL_THRESHOLD=2
HC_APPROVAL_THRESHOLD=3
```

**Frontend** — no `.env` needed for dev (proxies to localhost:8000 by default).

**Slackbot** (`slackbot/`):
```
SLACK_BOT_TOKEN=<token>
SLACK_APP_TOKEN=<app-level token for Socket Mode>
```

---

## Feature Status

### Complete (live API data)
- Stake leadership page — fetches `/api/users`, derives leaders from callings
- Ward meeting times — fetches `/api/wards` + `/api/users`
- Ward bishops — fetches `/api/wards` + `/api/users`
- High council assignments (`/leader/assignments`)
- Speaking schedule (`/leader/speaking`)
- Presidency assignments (`/leader/presidency`)
- Calling tracker: submit, review, manage, archive (`/leader/callings/*`)
- Releases & Sustainings viewer (`/leader/sustainings`) — ward tabs, verbatim language; name data is placeholder pending management UI
- User admin (`/leader/user-admin`)

### Placeholder / Not Yet Built
- Stake calendar (`stake/calendar.tsx`) — "Coming Soon" UI only
- Stake sports (`stake/sports.tsx`) — "Coming Soon" UI only
- Releases & Sustainings management — the viewer shell exists; name assignment UI and backend endpoints are future work
- Slackbot — socket connection works; only responds to "hello"; no FastAPI integration yet

---

## Key Files Quick Reference

| File | Purpose |
|------|---------|
| `frontend/client/src/App.tsx` | All routes + AuthSync |
| `frontend/client/src/lib/queryClient.ts` | apiRequest(), token management, React Query config |
| `frontend/client/src/stores/auth.ts` | Zustand auth store (user, isLoading) |
| `frontend/client/src/types/index.ts` | Shared TypeScript interfaces |
| `frontend/server/routes.ts` | Express proxy (the only server-side route handler) |
| `backend/src/app.py` | FastAPI app, CORS, lifespan, router registration |
| `backend/src/utils/security.py` | CallingUser dependency, JWT encode/decode, session verify |
| `backend/src/utils/permissions.py` | Bitmask permission check logic |
| `backend/src/models/calling_kanban.py` | KanbanStages enum, CallingProposal, comments, approvals |
| `backend/src/models/permissions.py` | Permission IntFlag enum, Permissions ORM model |
| `backend/src/routers/auth.py` | Login/refresh/logout/me endpoints |
| `backend/src/routers/calling_kanban.py` | Full proposal pipeline API |
| `backend/src/tests/conftest.py` | All test fixtures |
| `backend/wards.csv` | Ward names + meeting start times (float hours) |