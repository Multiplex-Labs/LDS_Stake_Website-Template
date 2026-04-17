# lds stake website slackbot implementation plan

## Introduction

This document outlines the plan for implementing the slackbot component for
the lds stake website. This component will run along side the backend and
frontend as it's own service. This service provides the opportunity for 
users to interact with the application via slack. In general, the slackbot
will message the users when they have an action item, and depending on
the context, they potentially will be able to act on those items within
a slack conversation.

## Architecture

- Separate service running alongside frontend and backend
- Communicates with backend via REST (bi-directional)
    - Slackbot can update certain things as a special user in the backend
    - Backend can reach out to slackbot to ask it to do things

### User-Mapping

- The purpose of the slack bot is to communicate to users in specific roles
- Custom Roles are not available to us
    - Roles are defined within the backend application
- Application users will need to be mapped to slack users
    - This can be done by mapping the email
    - Users will have to use the same email in the backend as they do for slack
- When the slackbot attempts to message someone of a certain role the following happens:
    - The slackbot reaches out to the backend to find out who holds a particular calling
    - The slackbot then matches the backend user in that role to the slack user

### Generic actions

- All slackbot functionality will essentially fall into two actions:
    - DMs
        - Individual or group
        - Used for notifying specific people about something
        - May have the ability recieve user responses and act upon them
    - Channels
        - The bot can be used to send specific kinds of updates in specific channels
        - This will require certain channels to be created when the slack bot is added to a worksapce
    - App Home
        - Dashboard showing all pending approvals/action items
        - Can also recognize users' roles

### 

## Feature List

Here is the beginning of the slackbot integration features

### Calling Kanban Approval Notice
- Activates when a kanban item moves to a new stage
- If at a approver stage, the bot will individually dm those with permissions
    - Those individuals can approve or deny the request within the conversation
    - With a button
- All Calling kanban updates result in status updates in a general channel
- When a user has a non-approval action item, they will be notified

### Bug Reporting

- Users can file bug reports with the website
    - This results in a message to a private channel

### User Management

- Automatically add/remove users from appropriate channels when callings are updated
- Recieves notification from the backend when a user is assigned a calling
- Will invite users to the necessary channels
- When a user is released they will be removed from the channels.

### Future

- More features will be added in the future