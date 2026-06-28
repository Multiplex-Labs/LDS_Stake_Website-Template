# Discord Bot

A standalone service for the LDS Stake Management Portal that bridges the main backend with a Discord server. It runs two concurrent services in a single process: a Discord.py gateway client and a FastAPI HTTP server (port 8001). The main backend calls the bot's HTTP API to trigger Discord notifications; the bot does not poll the backend.

## Overview

The bot provides three core capabilities:

- **Calling Kanban notifications** — posts stage-change updates to a private Discord channel and DMs individual approvers with interactive Approve/Reject buttons when a calling proposal needs their sign-off.
- **Database backup delivery** — receives markdown payloads from the backend, converts them to PDF, and posts the files to a private Discord channel. A weekly cleanup job purges backup files older than 90 days.
- **Building reservation approvals** — DMs approvers with reservation details and interactive Approve/Deny buttons when a new building reservation is submitted. If the organizer lacks building access (fob/code), a second set of DMs goes to designated access managers.

The bot also manages server structure on startup: it creates and maintains the required Discord roles and channels, and provides slash commands for members to link their Discord accounts to their stake portal profiles.

---

## Prerequisites

- Python 3.13 or later
- [uv](https://docs.astral.sh/uv/) package manager
- A Discord developer account with a bot application (see setup below)
- The main backend (`backend/`) running and reachable

---

## Discord App Setup

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications) and click **New Application**. Give it a name (e.g., "Stake Bot") and save.

2. In the left sidebar, click **Bot**.
   - Click **Add Bot** if not already added.
   - Under **Privileged Gateway Intents**, enable:
     - **Message Content Intent**
     - **Server Members Intent**
   - Click **Save Changes**.
   - Click **Reset Token**, then copy the token. This is your `DISCORD_TOKEN`.

3. In the left sidebar, click **OAuth2**, then **URL Generator**.
   - Under **Scopes**, select `bot` and `applications.commands`.
   - Under **Bot Permissions**, select at minimum:
     - Send Messages
     - Read Message History
     - Manage Roles
     - Manage Channels
     - Attach Files (required for PDF backup delivery)
   - Copy the generated URL and open it in a browser to invite the bot to your Discord server.

---

## Environment Variables

Create a `.env` file in the `discordbot/` directory:

```env
# Required
DISCORD_TOKEN=        # Bot token from the Discord developer portal
BACKEND_URL=          # Base URL of the main FastAPI backend (e.g. http://localhost:8000)
BACKEND_TOKEN=        # Shared secret used to authenticate backend-to-bot HTTP calls

# Optional
DATABASE_PATH=./database.db   # Path to the bot's SQLite database (stores UserMapping records)
DEV=false                     # Set to true to enable debug-level logging
PORT=8001                     # HTTP server port (default: 8001)
```

The `BACKEND_TOKEN` value must match whatever token the main backend sends in its requests to the bot's HTTP API. Choose any random string and set it in both services.

---

## Installation and Startup

The main backend must be running before starting the bot (the bot verifies connectivity at startup when processing email-to-user lookups).

```bash
cd discordbot
uv sync
uv run python main.py
```

The process starts the FastAPI server on port 8001 and connects the Discord gateway client. Both run on the same asyncio event loop.

---

## Features

### KanbanHook — Calling Proposal Notifications

The `KanbanHook` handles two types of outbound Discord messages triggered by the main backend calling the bot's `/kanban` HTTP endpoints.

**Stage change notifications (`POST /kanban/`)**

When a calling proposal moves between Kanban stages, the backend POSTs the update to the bot. The bot posts a formatted message to a Discord channel named `kanban-updates`, showing the proposal ID, person's name, calling, ward, who made the update, the previous stage, and the new stage. This channel is visible only to Stake President, First Councilor, Second Councilor, and High Councilor roles.

**Approval request DMs (`POST /kanban/request-approval/`)**

When a proposal enters the SP or HC approval stage and requires an individual approver's decision, the backend POSTs an approval request to the bot. The bot looks up the approver's Discord account via the `UserMapping` table (keyed by email address), then sends them a DM containing proposal details and two buttons: **Approve** (green) and **Reject** (red). Clicking either button calls back to the main backend to record the decision — the approver never needs to open the web portal to vote.

### BackupsHook — Database Backup Delivery

The `BackupsHook` receives markdown content from the backend via `POST /backups/`, converts it to a PDF using ReportLab, and posts the file to a Discord channel named `backups`. The conversion and send are scheduled on the bot's event loop so the HTTP response returns immediately.

A separate background task (`BackupsCog`) runs once per week and deletes any messages in `backups` channels that are older than 90 days. Because Discord's bulk-delete API only works for messages under 14 days old, the cleanup iterates and deletes messages individually.

The `backups` channel is visible only to Stake President, First Councilor, Second Councilor, High Councilor, and Stake Technology Specialist roles.

### ReservationHook — Building Reservation Approvals

The `ReservationHook` handles two types of DM notifications for building reservations.

**Approver DMs (`POST /reservations/notify`)**

When a new building reservation is submitted through the portal, the backend resolves all users with the `APPROVE_BLDG_RESERVATIONS` permission and POSTs their emails to the bot. The bot DMs each approver with the event name, date, time window, rooms requested, organizer name, and phone number. If the organizer does not have building access (fob or code), the DM includes a note flagging that access provisioning may be required.

Each DM includes an **Approve** button and a **Deny** button. Clicking Deny opens a modal prompting the approver to enter a reason before the denial is submitted. Both actions call back to the main backend API, so the approval decision is recorded without requiring the approver to visit the portal.

**Access manager DMs (`POST /reservations/access-notify`)**

When a reservation is approved for an organizer who lacks building access, the backend POSTs to this endpoint with the emails of users holding the `MANAGE_ACCESS` permission. The bot DMs each access manager with the event details and a plain-language note to arrange access provisioning before the event. This DM is informational only — no interactive buttons.

### Discord Slash Commands

All slash commands are ephemeral (visible only to the user who ran them).

| Command | Description |
|---|---|
| `/update_email <email>` | Links your Discord account to your stake portal account. The bot verifies the email exists in the backend, updates the `UserMapping` table, and syncs your Discord roles to match your callings on the portal. |
| `/email` | Shows your currently registered portal email address. |
| `/sync_my_role` | Re-fetches your callings from the backend and updates your Discord roles to match. Use this if your calling changed and your roles are out of sync. |

### Server Structure Management

On startup and when the bot joins a new guild, `ChannelsAndRolesCog` automatically creates and configures the required roles and channels.

**Roles created:**

| Role | Permissions |
|---|---|
| Stake President | Administrator |
| First Councilor | Administrator |
| Second Councilor | Administrator |
| High Councilor | Kick/moderate members, create invites, view channels |
| Stake Technology Specialist | Administrator |

**Channels created:**

| Channel | Visible to |
|---|---|
| `welcome` | Everyone (read-only) |
| `kanban-updates` | Stake Presidency, High Councilor |
| `announcements` | Stake Presidency, High Councilor, Technology Specialist (send: Presidency only) |
| `stake-presidency-chat` | Stake Presidency only |
| `high-council-chat` | Stake Presidency, High Councilor |
| `stake-council-chat` | Stake Presidency, High Councilor, Technology Specialist |
| `backups` | Stake Presidency, High Councilor, Technology Specialist (send: bot only) |

### Member Onboarding

When a member joins the server, the bot's `welcome` channel contains a persistent **Start Wizard** button. Clicking it sends the member a DM directing them to run `/update_email`. When a member leaves, their `UserMapping` record is removed from the bot's database.

---

## Architecture

The bot runs as two concurrent services in the same process: a Discord.py gateway client and a FastAPI HTTP server. The main backend calls the bot's HTTP API to trigger Discord notifications. The bot stores a `UserMapping` table linking portal email addresses to Discord user IDs. All HTTP endpoints on the bot require the `BACKEND_TOKEN` bearer token — this token is never exposed to Discord users.

```
Main Backend (port 8000)
    |
    | POST /kanban/, /kanban/request-approval/
    | POST /backups/
    | POST /reservations/notify, /reservations/access-notify
    v
Discord Bot HTTP API (port 8001)
    |
    |-- KanbanHook    --> #kanban-updates channel + approver DMs
    |-- BackupsHook   --> #backups channel (PDF file)
    |-- ReservationHook -> approver DMs + access manager DMs
    v
Discord Gateway (discord.py)
    |
    v
Discord Server
```

### HTTP API Endpoints

All endpoints require `Authorization: Bearer <BACKEND_TOKEN>`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/kanban/` | Post a stage-change update to `#kanban-updates` |
| `POST` | `/kanban/request-approval/` | DM an approver with Approve/Reject buttons |
| `POST` | `/backups/` | Convert markdown to PDF and post to `#backups` |
| `POST` | `/reservations/notify` | DM reservation approvers with Approve/Deny buttons |
| `POST` | `/reservations/access-notify` | DM access managers with a provisioning notice |
