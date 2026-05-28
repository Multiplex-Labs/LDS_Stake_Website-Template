from typing import List
from discord import Guild, Member, Role

async def ensure_user_roles(
    guild: Guild,
    role_names: List[str],
    user: Member,
    managed_role_names: List[str] | None = None,
) -> List[Role]:
    """
    Ensure that a user's roles in a guild match the specified list of role names.
    This function will assign all specified roles to the user, and remove any
    existing roles from the managed role set that are not in the specified list.
    If a role does not exist an exception is thrown.
    """
    existing_roles = {role.name: role for role in guild.roles}
    target_roles = []
    for role_name in role_names:
        if role_name not in existing_roles:
            raise ValueError(f"Role '{role_name}' does not exist in guild '{guild.name}'")
        target_roles.append(existing_roles[role_name])

    managed_set = set(managed_role_names) if managed_role_names is not None else set(role_names)

    # Remove extra roles only from the managed role set
    for role in user.roles:
        if role.name in managed_set and role.name not in role_names:
            await user.remove_roles(role)

    # Assign missing roles
    for role in target_roles:
        if role not in user.roles:
            await user.add_roles(role)

    return target_roles