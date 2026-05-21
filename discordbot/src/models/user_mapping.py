from sqlmodel import SQLModel, Field

class UserMapping(SQLModel, table=True):
    id: int = Field(default=None, primary_key=True)
    discord_user_id: int = Field(index=True)
    user_email: str = Field(index=True)