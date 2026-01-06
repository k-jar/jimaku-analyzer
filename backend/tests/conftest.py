import pytest
from typing import Generator
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool
import sys
import os

# Append sys.path to ensure the below imports work from tests folder
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set environment variables for testing before importing the app
os.environ["JWT_SECRET_KEY"] = "test_secret_key_for_pytest"

from app.main import app
from app.core.database import get_session
from app.models.models import Vocab, AnimeSeries, AnimeEpisode

# Create in-memory SQLite database for testing
TEST_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
)


# Define a fixture to override database dependency
@pytest.fixture(name="session")
def session_fixture() -> Generator[Session, None, None]:
    """Creates a fresh in-memory database session for each test.

    Yields:
        Session: The SQLModel session connected to the test database.
    """
    # Create the tables in the test DB
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        yield session

    # Tear down (drop tables) after test is done
    SQLModel.metadata.drop_all(engine)


# Define test client fixture
@pytest.fixture(name="client")
def client_fixture(session: Session) -> Generator[TestClient, None, None]:
    """Creates a TestClient with the database dependency overridden.

    Args:
        session (Session): The test database session.

    Yields:
        TestClient: The FastAPI test client.
    """

    # Override the get_session dependency so the app uses SQLite test database
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override

    client = TestClient(app)
    yield client

    # Clean up overrides
    app.dependency_overrides.clear()


@pytest.fixture(name="seeded_session")
def seeded_session_fixture(session: Session) -> Session:
    """Pre-populates the database with mock data for anime and vocabulary tests.

    Args:
        session (Session): The empty test database session.

    Returns:
        Session: The session with committed mock data.
    """
    # Vocab
    vocab_item = Vocab(
        word="猫",
        level=5,
        reading="ねこ",
        meanings=["cat"],
        frequency_rank=1000,
        kana_frequency_rank=1000,
    )
    session.add(vocab_item)

    # Anime Series
    # All dictionary/list fields must be present for model_validate
    series = AnimeSeries(
        title_jp="テストアニメ",
        title_en="Test Anime",
        jr_difficulty=3.5,
        ml_difficulty=3.5,
        cpm=250.0,  # Standardized name
        total_words=100,
        unique_words=10,
        unique_words_once=5,
        unique_kanji=5,
        unique_kanji_once=2,
        frequency_map={"猫": 5},
        kanji_frequency_map={"猫": 5},
        jlpt_distribution={"N5": 1},
        pos_distribution={"Nouns": 1},
        general_vocab_stats=[{"rank": 1000, "coverage": 50.0}],
        general_vocab_thresholds={"95": 5000},
        local_vocab_stats=[{"unique": 1, "coverage": 10.0}],
        local_vocab_thresholds={"95": 10},
        detailed_stats={"average_sentence_length": 5.0, "sentence_count": 20},
        genres=["Comedy", "Slice of Life"],
    )
    session.add(series)
    session.commit()
    session.refresh(series)

    # Anime Episode
    # All dictionary/list fields must be present for model_validate
    episode = AnimeEpisode(
        series_id=series.id,
        episode_number=1,
        title="Start",
        jr_difficulty=3.0,
        cpm=250.0,
        total_words=50,
        unique_words=5,
        unique_words_once=2,
        unique_kanji=3,
        unique_kanji_once=1,
        total_characters=200,
        frequency_map={"猫": 5},
        kanji_frequency_map={"猫": 5},
        jlpt_distribution={"N5": 1},
        pos_distribution={"Nouns": 1},
        general_vocab_stats=[{"rank": 1000, "coverage": 50.0}],
        general_vocab_thresholds={"95": 5000},
        local_vocab_stats=[{"unique": 1, "coverage": 10.0}],
        local_vocab_thresholds={"95": 10},
        detailed_stats={"average_sentence_length": 5.0, "sentence_count": 10},
    )
    session.add(episode)

    session.commit()
    return session
