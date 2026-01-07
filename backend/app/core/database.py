import os
from typing import Generator
from sqlmodel import SQLModel, create_engine, Session
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set.")

# pool_pre_ping: checks if the connection is alive before using it
engine = create_engine(
    DATABASE_URL, 
    pool_pre_ping=True,
    echo=False
)


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
