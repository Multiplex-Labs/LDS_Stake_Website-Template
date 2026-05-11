# LDS Stake Website Template

A modern, full-stack web application for managing LDS stake operations — callings, assignments, building reservations, ward info, and more — with a React frontend, FastAPI backend, and an integrated Slack bot.

## Tech Stack

### Frontend
- **Framework**: [React 19](https://react.dev/) with [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/), [DaisyUI](https://daisyui.com/)
- **Components**: [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/)
- **State & Data**: [TanStack Query](https://tanstack.com/query/latest), [Zustand](https://zustand-demo.pmnd.rs/), [React Hook Form](https://react-hook-form.com/), [Zod](https://zod.dev/)
- **Routing**: [Wouter](https://github.com/molecula-js/wouter)
- **Runtime**: Node.js with [Express](https://expressjs.com/) as a thin proxy + static server

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11+)
- **ORM/Database**: [SQLModel](https://sqlmodel.tiangolo.com/) (SQLAlchemy + Pydantic) with SQLite (PostgreSQL-ready)
- **Migrations**: [Alembic](https://alembic.sqlalchemy.org/)
- **Package Management**: [uv](https://github.com/astral-sh/uv)
- **Auth**: JWT-based authentication (access + HttpOnly refresh tokens) with Argon2 password hashing

### Slackbot
- **Framework**: [Slack Bolt for Python](https://slack.dev/bolt-python/)
- **Package Management**: [uv](https://github.com/astral-sh/uv)

---

## Architecture

```
Browser → React SPA
            → /api/* → Express (port 3100) → FastAPI (port 8000)
                      (reverse proxy)

Slack → SlackBot (Socket Mode) → FastAPI (port 8000)
```

- **Frontend**: React SPA served by Express. Express acts as a reverse proxy — all `/api/*` requests are forwarded to FastAPI with the `/api` prefix stripped.
- **Backend API**: FastAPI handles all business logic, data persistence, and JWT auth.
- **Slackbot**: Dedicated service for bidirectional Slack communication (calling proposal approvals, notifications).

---

## Features

### Public Pages
| Page | Status |
|---|---|
| Home | Live |
| Stake Leadership | Live |
| Ward Meeting Times | Live (API-backed) |
| Meet Our Bishops | Live (API-backed) |
| Reserve Building | Live (form submits to backend) |
| Ward Boundary Map | Coming Soon |
| Stake Calendar | Coming Soon |
| Stake Sports | Coming Soon |
| Resources & News | Coming Soon |

### Leader Portal (requires login)
| Page | Status |
|---|---|
| High Council Assignments | Live |
| Speaking Schedule | Live |
| Presidency Assignments | Live |
| Stake Calling System (Kanban) | Live |
| Submit a Calling | Live |
| Review Callings | Live |
| Manage Callings | Live |
| Calling Archive | Live |
| Releases & Sustainings | Coming Soon |
| User Administration | Live |

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- [uv](https://github.com/astral-sh/uv) (`pip install uv` or `brew install uv`)

### 1. Backend

```bash
cd backend

# Install dependencies
uv sync

# Initialize the database (first run only)
uv run alembic -c alembic.ini upgrade head

# Start the server (first launch — creates admin user)
INITIAL_ADMIN_PASSWORD=your_password JWT_SECRET_KEY=your_secret uv run python main.py
```

The API will be available at `http://localhost:8000`.
Interactive docs: `http://localhost:8000/docs`

> On first launch, an admin account is created with email `admin@admin.com` and the password set via `INITIAL_ADMIN_PASSWORD`. You will be required to change the password on first login.

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server (Express + Vite)
npm run dev
```

The app will be available at `http://localhost:3100`.

### 3. Slackbot (optional)

```bash
cd slackbot
uv sync
uv run python main.py
```

---

## Environment Variables

### Backend (`backend/.env`)

```env
DEV=true
PORT=8000
DB_ENGINE=sqlite
DATABASE_PATH=./database.db
INITIAL_ADMIN_PASSWORD=        # Required on first run only
JWT_SECRET_KEY=                # Required — set a long random string
SSL_ENABLED=false
SP_APPROVAL_THRESHOLD=2
HC_APPROVAL_THRESHOLD=3
```

### Frontend (`frontend/` — optional overrides)

```env
PORT=3100
NODE_ENV=development
BACKEND_URL=http://localhost:8000
```

### Slackbot (`slackbot/.env`)

```env
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=
```

---

## Development Commands

### Frontend (`frontend/`)

```bash
npm run dev          # Express + Vite full-stack dev server
npm run dev:client   # Vite only (no proxy — UI dev)
npm run build        # Production build
npm run check        # TypeScript type checking
```

### Backend (`backend/`)

All Python commands use `uv run`. Do not use `python`, `pip`, or `conda` directly.

```bash
uv run python main.py                                             # Start server
uv run python -m uvicorn src.app:app --reload --port 8000        # Dev with hot reload

# Migrations
uv run alembic -c alembic.ini upgrade head                       # Apply all migrations
uv run alembic -c alembic.ini revision --autogenerate -m "desc"  # Create migration
uv run alembic -c alembic.ini downgrade -1                       # Roll back one

# Tests
uv run pytest                                                     # All tests
uv run pytest src/tests/test_auth.py                             # Single file
```

---

## Project Structure

```
├── frontend/
│   ├── client/src/
│   │   ├── App.tsx              # Routes + AuthSync
│   │   ├── pages/               # One file per route
│   │   ├── components/
│   │   │   ├── layout/          # Navbar, Footer, ProtectedRoute
│   │   │   └── ui/              # shadcn components (do not edit manually)
│   │   ├── lib/
│   │   │   ├── queryClient.ts   # React Query setup + apiRequest()
│   │   │   └── hooks.ts         # Shared hooks
│   │   ├── stores/              # Zustand (auth, theme)
│   │   └── types/               # Shared TypeScript interfaces
│   └── server/
│       ├── index.ts             # Express entry point
│       └── routes.ts            # Reverse proxy to FastAPI
│
├── backend/src/
│   ├── app.py                   # FastAPI app, middleware, router registration
│   ├── main.py                  # Entry point
│   ├── models/                  # SQLModel ORM models
│   ├── routers/                 # Route handlers (one file per domain)
│   ├── db/                      # ORM singleton, session dependency
│   └── utils/                   # Auth helpers, background tasks, seeders
│
└── slackbot/
    └── main.py
```

---

## Authentication

The app uses a two-token JWT strategy:

- **Access token** (15-min expiry) — returned in the login response body and stored in memory (never localStorage). Sent as `Authorization: Bearer <token>` on API requests.
- **Refresh token** — stored in an HttpOnly cookie. Used by `GET /api/auth/refresh` to issue a new access token silently.
- On app load, `AuthSync` in `App.tsx` calls `/auth/refresh` to restore the session from the cookie, then `/auth/me` to populate the auth store.
- Password changes require a **fresh** token (obtained at login, not from a refresh). Restoring a session via cookie will not satisfy this requirement — the user must log in again to change their password.
