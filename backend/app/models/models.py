from typing import Optional, List, Dict
from sqlmodel import JSON, Column, SQLModel, Field, Relationship
from datetime import datetime, timezone


class UserVocabLink(SQLModel, table=True):
    """Association table linking Users to Vocab items with context."""

    user_id: Optional[int] = Field(
        default=None, foreign_key="user.id", primary_key=True
    )
    vocab_id: Optional[int] = Field(
        default=None, foreign_key="vocab.id", primary_key=True
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    context_sentence: Optional[str] = Field(default=None)
    source_history_id: Optional[int] = Field(
        default=None, foreign_key="analysishistory.id"
    )


class UserAnimeStatus(SQLModel, table=True):
    """Tracks a user's status for a specific anime series."""

    __tablename__ = "user_anime_status"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    series_id: int = Field(foreign_key="animeseries.id", index=True)
    status: str  # 'watching', 'plan_to_watch', 'completed'


class AnalysisHistory(SQLModel, table=True):
    """Stores the history of text analysis requests made by a user."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    full_text: str

    # Store the calculated stats as JSON
    stats_snapshot: dict = Field(default={}, sa_column=Column(JSON))

    user: Optional["User"] = Relationship(back_populates="history")


class Vocab(SQLModel, table=True):
    """Represents a vocabulary word in the dictionary."""

    id: Optional[int] = Field(default=None, primary_key=True)
    word: str = Field(index=True)  # Can be Kanji or Kana
    reading: str = Field(default="")
    meanings: List[str] = Field(
        default=[], sa_column=Column(JSON)
    )  # Store meanings as a JSON list ["cat", "feline"]
    level: Optional[int] = Field(default=None, index=True)  # e.g. "N5"
    frequency_rank: Optional[int] = Field(default=None, index=True)
    kana_frequency_rank: Optional[int] = Field(
        default=None
    )  # Freq of kana-only version of the vocab
    users: List["User"] = Relationship(
        back_populates="saved_words", link_model=UserVocabLink
    )


class User(SQLModel, table=True):
    """Represents a registered user."""

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    hashed_password: str
    saved_words: List[Vocab] = Relationship(
        back_populates="users", link_model=UserVocabLink
    )
    history: List[AnalysisHistory] = Relationship(back_populates="user")


class AnimeSeriesBase(SQLModel):
    """Base model for Anime Series containing metadata and aggregated stats."""

    title_jp: str = Field(index=True)
    title_en: Optional[str] = Field(default=None)
    title_romaji: Optional[str] = Field(default=None)
    anilist_id: Optional[int] = Field(default=None)
    jimaku_id: Optional[int] = Field(default=None)

    # --- METADATA ---
    thumbnail_url: Optional[str] = Field(default=None)
    description: Optional[str] = Field(default=None)
    anilist_rating: Optional[int] = Field(default=None)
    popularity: Optional[int] = Field(default=None)
    genres: List[str] = Field(default=[], sa_column=Column(JSON))

    # --- DIFFICULTY & METRICS ---
    jr_difficulty: float = Field(default=0.0)
    min_jr_difficulty: float = Field(default=0.0)
    max_jr_difficulty: float = Field(default=0.0)
    ml_difficulty: float = Field(default=0.0)
    min_ml_difficulty: float = Field(default=0.0)
    max_ml_difficulty: float = Field(default=0.0)
    cpm: float = Field(default=0.0)

    # --- LEXICAL STATS (Aggregated) ---
    total_words: int = Field(default=0)
    total_characters: int = Field(default=0)
    unique_words: int = Field(default=0)
    unique_words_once: int = Field(default=0)
    unique_kanji: int = Field(default=0)
    unique_kanji_once: int = Field(default=0)

    # --- DETAILED DATA (JSON) ---
    frequency_map: Dict = Field(default={}, sa_column=Column(JSON))
    kanji_freq_map: Dict = Field(default={}, sa_column=Column(JSON))
    pos_distribution: Dict = Field(default={}, sa_column=Column(JSON))
    jlpt_distribution: Dict = Field(default={}, sa_column=Column(JSON))
    general_vocab_stats: List[Dict] = Field(default=[], sa_column=Column(JSON))
    general_vocab_thresholds: Dict = Field(default={}, sa_column=Column(JSON))
    local_vocab_stats: List[Dict] = Field(default=[], sa_column=Column(JSON))
    local_vocab_thresholds: Dict = Field(default={}, sa_column=Column(JSON))
    detailed_stats: Dict = Field(default={}, sa_column=Column(JSON))


class AnimeSeries(AnimeSeriesBase, table=True):
    """Database model for Anime Series."""

    # --- IDENTITY ---
    id: Optional[int] = Field(default=None, primary_key=True)

    # --- RELATIONSHIPS ---
    episodes: List["AnimeEpisode"] = Relationship(
        back_populates="series",
        sa_relationship_kwargs={"order_by": "AnimeEpisode.episode_number"},
    )


class AnimeEpisode(SQLModel, table=True):
    """Database model for a specific episode of an anime."""

    # --- IDENTITY ---
    id: Optional[int] = Field(default=None, primary_key=True)
    series_id: int = Field(foreign_key="animeseries.id")
    episode_number: int
    title: Optional[str] = Field(default=None)

    # --- METRICS ---
    duration_seconds: int = Field(default=0)
    cpm: float = Field(default=0.0)
    jr_difficulty: float = Field(default=0.0)
    ml_difficulty: float = Field(default=0.0)

    # --- LEXICAL STATS ---
    total_words: int = Field(default=0)
    total_characters: int = Field(default=0)
    unique_words: int = Field(default=0)
    unique_words_once: int = Field(default=0)
    unique_kanji: int = Field(default=0)
    unique_kanji_once: int = Field(default=0)

    # --- DETAILED DATA (JSON) ---
    frequency_map: Dict = Field(default={}, sa_column=Column(JSON))
    kanji_freq_map: Dict = Field(default={}, sa_column=Column(JSON))
    pos_distribution: Dict = Field(default={}, sa_column=Column(JSON))
    jlpt_distribution: Dict = Field(default={}, sa_column=Column(JSON))
    general_vocab_stats: List[Dict] = Field(default=[], sa_column=Column(JSON))
    general_vocab_thresholds: Dict = Field(default={}, sa_column=Column(JSON))
    local_vocab_stats: List[Dict] = Field(default=[], sa_column=Column(JSON))
    local_vocab_thresholds: Dict = Field(default={}, sa_column=Column(JSON))
    detailed_stats: Dict = Field(default={}, sa_column=Column(JSON))

    # --- RELATIONSHIPS ---
    series: Optional[AnimeSeries] = Relationship(back_populates="episodes")
