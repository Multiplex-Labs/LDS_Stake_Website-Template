from sqlalchemy import MetaData
from sqlmodel import Field, SQLModel

# These placeholders (e.g., %(table_name)s) are standard SQLAlchemy tokens
naming_convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s"
}

# Assign the convention to a new MetaData object
metadata = MetaData(naming_convention=naming_convention)

# Set this metadata as the default for all your SQLModels
class BaseModel(SQLModel):
    metadata = metadata