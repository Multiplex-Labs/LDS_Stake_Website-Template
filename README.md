# LDS Stake Website Template

A minimal Docker-composed web template for managing stake-related workflows with a Svelte frontend, FastAPI backend, and an integrated Slack bot. SQLite is used as the default datastore; with Slack and potential SMTP integration.

## Tech stack
- Frontend: Svelte (Node.js)
- Backend: FastAPI (Python)
- SlackBot: FastAPI-based Slack bot
- Database: SQLite
- Orchestration: Docker Compose
- Optional: SMTP for email, Slack API for chat integration

## Architecture (summary)
- Users interact with the Frontend → Frontend performs CRUD against Backend.
- Backend persists data to SQLite and coordinates with the SlackBot.
- SlackBot communicates bidirectionally with the Slack API (events & messages) and can update the Backend/DB.
- Optional SMTP service enables outgoing email from the Backend.