import os
from typing import Generator
from sqlmodel import SQLModel, create_engine, Session

# Default to localhost if env var is missing
DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://user:password@localhost:5432/jlpt_db"
)

engine = create_engine(DATABASE_URL)


def create_db_and_tables():
    """Creates the tables if they don't exist."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """Dependency for FastAPI to get a database session.

    Yields:
        Session: A SQLModel database session.
    """
    with Session(engine) as session:
        yield session
