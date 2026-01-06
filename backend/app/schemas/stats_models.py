"""
Pydantic schemas for validating subtitle statistics data structures.
"""

from pydantic import BaseModel, Field, field_validator, ConfigDict
from typing import Dict, List
from .common import FrequencyPoint, LocalFrequencyPoint, DetailedStats


class EpisodeStats(BaseModel):
    """Complete statistics for a single episode.

    This schema defines the contract for statistics returned by the analysis service.
    """

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    # Core Metrics
    total_words: int
    total_characters: int
    unique_words: int
    unique_words_once: int
    unique_kanji: int
    unique_kanji_once: int

    # Difficulty
    jr_difficulty: float = 0.0
    raw_jr_difficulty: float = 0.0
    ml_difficulty: float = 0.0

    # Timing (if available)
    duration_seconds: float = 0.0
    cpm: float = 0.0

    # JLPT
    jlpt_distribution: Dict[str, int] = Field(default_factory=dict)

    # General Japanese Vocabulary Analysis (based on JPDB frequency dictionary)
    general_vocab_stats: List[FrequencyPoint] = Field(default_factory=list)
    general_vocab_thresholds: Dict[str, int] = Field(default_factory=dict)

    # Episode-Specific Vocabulary Analysis (based on this episode)
    local_vocab_stats: List[LocalFrequencyPoint] = Field(default_factory=list)
    local_vocab_thresholds: Dict[str, int] = Field(default_factory=dict)

    # Frequency maps
    frequency_map: Dict[str, int] = Field(default_factory=dict)
    kanji_freq_map: Dict[str, int] = Field(default_factory=dict)

    # Grammar
    pos_distribution: Dict[str, int] = Field(default_factory=dict)

    # Detailed Stats
    detailed_stats: DetailedStats = Field(default_factory=DetailedStats)


class SeriesStats(BaseModel):
    """Aggregated statistics for an entire series."""

    model_config = ConfigDict(extra="allow")

    # Core Metrics
    total_words: int

    # Difficulty
    jr_difficulty: float
    min_jr_difficulty: float = 0.0
    max_jr_difficulty: float = 0.0
    ml_difficulty: float = 0.0
    min_ml_difficulty: float = 0.0
    max_ml_difficulty: float = 0.0

    # JLPT
    jlpt_distribution: Dict[str, int] = Field(default_factory=dict)

    # General Japanese Vocabulary Analysis
    general_vocab_stats: List[FrequencyPoint] = Field(default_factory=list)
    general_vocab_thresholds: Dict[str, int] = Field(default_factory=dict)

    # Series-Specific Vocabulary Analysis
    local_vocab_stats: List[LocalFrequencyPoint] = Field(default_factory=list)
    local_vocab_thresholds: Dict[str, int] = Field(default_factory=dict)

    # Lexical
    frequency_map: Dict[str, int] = Field(default_factory=dict)
    unique_words: int
    unique_words_once: int
    unique_kanji: int
    unique_kanji_once: int
    kanji_freq_map: Dict[str, int] = Field(default_factory=dict)

    # Grammar
    pos_distribution: Dict[str, int] = Field(default_factory=dict)

    # Timing
    cpm: float = 0.0

    # Detailed Stats
    detailed_stats: DetailedStats = Field(default_factory=DetailedStats)


# Validators for custom validation logic
class EpisodeStatsWithValidation(EpisodeStats):
    """Extended version of EpisodeStats with additional validation rules."""

    @field_validator("jr_difficulty")
    @classmethod
    def validate_difficulty(cls, v: float) -> float:
        if not 0 <= v <= 10:
            raise ValueError("Difficulty score must be between 0 and 10")
        return v

    @field_validator("local_vocab_stats")
    @classmethod
    def validate_local_freq_not_empty(cls, v: List) -> List:
        if not v:
            raise ValueError("local_vocab_stats should not be empty")
        return v
