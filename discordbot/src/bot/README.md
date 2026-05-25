# Bot

This submodule contains all the functionality and structures that pertain specifically to the "Bot" portion of the application.
The main bot is defined in the `bot.py` file and all of the functionality is defined in the cogs under the `cogs/` directory

## Cogs

### mapping.py

The Mapping Cog handles the user mapping functionality

### channels_and_roles.py

This cog contains all the utilities to create the channels and roles that the bot needs to function.
Since this bot is designed to be opinionated, it sets up your discord server for you.

#### Roles

The roles map essentially 1-1 with the system callings. The point of roles is to grant users permissions according to what calling they hold.
This includes permissions relating to the management of the server, but also the channels that are available to be viewed/participate in (more on that later)

Here are the roles as of now:

- Stake President
    - All permissions
    - All channels
- First Councilor
    - All permissions
    - All channels
- Second Councilor
    - All permissions
    - All channels
- High Councilor
    - Permissions
        - Can moderate messages
        - Can invite users
        - Can kick users
    - Channels
        - All channels except `Stake Presidency Chat`
- Stake Technology Specialist
    - All permissions
    - All channels

#### Channels

There will be three kinds of channels:

1. Regular chat channels
    - These channels are for regular chat and discussion
2. Read only channels
    - These channels can only recieve messages from the bot
3. Hybrid channels
    - These channels may recieve messages from certain users
    - Other users can only read messages in the channel

Here are the channels that we will need to create for now:

**Read only channels**

- Welcome
    - Visible by all (including users without a role)
    - Explains what the server is and asks the user to provide their email via a wizard (with a button to press)
    - This is the only channel visible to members without a role
- Kanban Updates
    - Visible by stake presidency and high council
    - When a kanban update happens on the backend application, this channel will be updated with a post

**Hybrid Channels**

- Announcements
    - Visible by all roles
    - Editable only by stake presidency
    - Place for stake presidency to post messages for all to see

**Regular Channels**

- Stake Presidency Chat
    - Visible only by stake presidency
- High Council Chat
    - Visible by stake presidency and high councilors
- Stake Council Chat
    - Visible by all roles
