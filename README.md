# LDS Stake Website Template

A modern, full-stack web template for managing LDS stake-related workflows with a React frontend, FastAPI backend, and an integrated Slack bot.

## Tech Stack

### Frontend
- **Framework**: [React 19](https://react.dev/) with [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/), [Radix UI](https://www.radix-ui.com/), [Framer Motion](https://www.framer.com/motion/)
- **Components**: [shadcn/ui](https://ui.shadcn.com/)
- **State & Data**: [TanStack Query](https://tanstack.com/query/latest), [Zustand](https://zustand-demo.pmnd.rs/), [React Hook Form](https://react-hook-form.com/), [Zod](https://zod.dev/)
- **Routing**: [Wouter](https://github.com/molecula-js/wouter)
- **Runtime**: Node.js with [Express](https://expressjs.com/) for development and serving

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) (Python 3.11+)
- **ORM/Database**: [SQLModel](https://sqlmodel.tiangolo.com/) (SQLAlchemy + Pydantic) with SQLite
- **Migrations**: [Alembic](https://alembic.sqlalchemy.org/)
- **Package Management**: [uv](https://github.com/astral-sh/uv)
- **Auth**: JWT-based authentication with Argon2 hashing

### Slackbot
- **Framework**: Python-based integration
- **Package Management**: [uv](https://github.com/astral-sh/uv)

## Architecture

- **Frontend**: A React SPA served by an Express server. It handles UI, client-side routing, and state management.
- **Backend API**: A standalone FastAPI service providing RESTful endpoints for data persistence and business logic.
- **SlackBot**: A dedicated service for bidirectional communication with Slack, enabling automated notifications and command-based interactions.
- **Data Layer**: Backend uses SQLModel for structured data in SQLite; Frontend uses Drizzle-ready patterns for easy scaling to PostgreSQL.