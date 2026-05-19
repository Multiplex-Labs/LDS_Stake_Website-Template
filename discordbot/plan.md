 # Discord Bot — Implementation Plan

 ## Purpose

 Provide a concise plan for building a Discord bot that integrates with the stake website backend to:

 - Notify users about Calling Kanban updates and other events.
 - Allow users to receive approval requests and act (Approve / Deny) from Discord.
 - Maintain a mapping between Discord users and stake-website users so the bot can act on behalf of people.

 ## Goals (MVP)

 - Deliver channel-level Kanban update posts.
 - DM approval requests to mapped approvers with actionable buttons (Approve / Deny).
 - Persist Discord ↔ stake-user mapping and allow users to register/update their email.
 - Secure bot-backend communication with a secret token and bot credentials.

 ## Out of scope (initial)

 - Handling interview stages or complex workflows that require forms on the website.
 - Deep profile sync or automated account creation on the website.

 ## High-level architecture

 - Components:
	 - Discord Bot service (Python) — listens to Discord events and exposes a small webhook for backend notifications.
	 - Stake website backend (FastAPI) — sends notifications to the bot when events occur and accepts approval actions from the bot.
	 - Database table(s) for user mappings and minimal bot state.

 - Flows:
	 1. User joins Discord guild → bot DMs welcome + asks for stake email.
	 2. User provides email via DM command or slash command → bot validates and saves mapping.
	 3. Backend event (e.g., calling proposal needs approval) → backend POSTs to bot webhook (signed/secret) with payload listing approvers / channel IDs.
	 4. Bot posts channel update and DMs mapped approvers with message + Approve/Deny buttons.
	 5. User clicks button → bot calls backend API to apply the action (using bot credentials). Backend validates that the email mapped to the Discord user has permission and records the approval.

 ## User mapping strategy

 - Mapping table (MVP): `discord_user_mappings`
	 - `id` (pk), `guild_id`, `discord_user_id`, `email`, `verified_at`, `created_at`, `updated_at`.

 - Onboarding:
	 - On guild join (or via slash command `/link`), bot DMs user requesting their stake-site email.
	 - User replies with `/link email@example.org` or a DM message; bot stores mapping and optionally sends a verification challenge (email token if desired later).

 - Maintenance:
	 - `/set-email` to change mapping.
	 - When the user leaves the guild, the bot removes the mapping for that guild.

 ## Discord interactions & commands

 - Public channel: `#calling-kanban` (configurable)
	 - Posts: stage changes, proposal created, proposal moved, summary messages.

 - DM messages to approvers:
	 - Short summary + buttons: `Approve`, `Deny` (Discord message components / interactions).
	 - Buttons open an interaction handled by the bot; the bot responds immediately (ack) and then forwards the action to the backend.

 - Commands (slash or prefix):
	 - `/set-email <email>` — link Discord account to stake email.
	 - `/whoami` — show current mapping and next action items.

 ## Backend ↔ Bot API contract (MVP)

 - Authentication: shared secret token in environment (e.g., `DISCORDBOT_SECRET`) used by backend when calling the bot's webhook. Validate on bot side.

 - Endpoints the Bot exposes (HTTP):
	- `POST /discord/approval` — used by backend to notify bot of approval events. Payload example:

		 ```json
		 {
			 "type": "Calling Proposal",
             "response_url": "http://<backendhostname>:<backendport>/url/for/approval",
             "response_method": "POST",
             "approve_body": {},
             "deny_body": {},
			 "title": "Calling: Primary Teacher",
			 "approvers": ["email1@example.org", "email2@example.org"],
			 "message": "markdown text"
		 }
		 ```
        - `type` is used for message formatting `f"The following {type} requires your approval"`
        - `response_url` is where the discord bot should send the user's response
        - `response_method` is the method the discord bot should use when responding
        - `approve_body` is the body that should be used if the user approves 
        - `deny_body` is the body that should be used if the user denies
        - `title` is a H1 level title that can be used when notifying the user
        - `message` is a markdown renderable message to the user

    - `POST /discord/kanbanupdate` - used by backend to notify the bot of kanban updates. Payload example:

    ```json
    {
        "updater": "updater name",
        "from_stage": "from stage",
        "to_stage": "To stage",
        "updated_at": 12312412, // Updated time in utc
        "proposal": {
            "fname":"first name",
            "lname":"last name",
            "spouse_name":"spouse name",
            "ward": "Ward name",
            "submitter": "Original submitter name",
            "submitted_at": 123123124, // Original submitted time in UTC
            "is_release": true
        }
    }
    ```
    - All fields are as they appear
    - is_release identifies if the approval is for a calling or a release
    - When the bot recieves a request here, it updates the `#Calling_Kanban` channel with a formatted message

 - Calls Bot makes to Backend (HTTP):
	 - `POST /api/calling-kanban/{proposal_id}/approve` — performed by the bot using bot credentials and including the acting user's email or id in the request body. Backend verifies mapping and permissions.

 Notes:
 - The exact path & payloads can be formalized into OpenAPI later; keep the integration minimal and versioned (`/discord/events?v=1`).

 ## Data model (suggested)

 - `discord_user_mappings` as described above.

 ## Security & privacy

 - Use a shared secret or HMAC to protect `POST /discord/events` so only the stake backend can call the bot.
 - Store the bot's stake-website user password in an environment variable on the bot host only; use it to obtain access tokens for backend API calls.
 - The bot should never log secret tokens or email PII in plain text logs; redact where practical.
 - Rate-limit and validate incoming payloads; verify the origin IP range if possible.

 ## UX message examples

 - Channel post (kanban):
	 - "[Kanban] Proposal — Calling: fname lname as Primary Teacher moved to SP_APPROVAL — awaiting Presidency approvals."

 - DM to approver:
	 - "You have a pending approval for 'Calling: fname lname as Primary Teacher'. Click Approve or Deny to respond."

 ## Edge cases & rules

 - If a Discord user has not linked their email, bot DMs them instructions to link before acting.
 - If mapping exists but backend shows no permission, bot informs user and logs the attempted action.
 - If user leaves guild, auto-delete mapping.

 ## Rollout plan (steps)

 1. Create minimal database table and migration for `discord_user_mappings`.
 2. Implement bot service skeleton: connect to Discord, handle guild join DMs, implement `/link` and `/whoami` commands.
 3. Implement `POST /discord/kanbanupdate` on bot with secret validation that DMs approvers.
 4. Implement `POST /discord/approval` on bot with secret validation that posts in specified channel
 5. Implement interaction handlers for Approve/Deny buttons that call backend approval endpoint.
 6. Add logging, error handling, and basic tests (unit + integration against a dev backend).
 7. Soft launch to a test guild, exercise flows, iterate.

 ## Future enhancements

 - Email verification (send code via stake website) so mapping is verified.
 - Per-proposal discussion threads using Discord threads.
 - More actions: create proposals, review comments, subscription preferences.
 - Admin dashboard for mapping management and audit logs.