"""
Pydantic schemas for API request validation and response serialization.
"""

from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict
from app.models.models import AnimeSeries
from .common import UserStats, FrequencyPoint, LocalFrequencyPoint, DetailedStats


class StatsResponse(BaseModel):
    """Stats structure returned in analysis endpoints."""

    model_config = ConfigDict(from_attributes=True)

    total_words: int
    jr_difficulty: float
    ml_difficulty: float = 0.0
    cpm: float = 0.0
    jlpt_distribution: Dict[str, int]
    general_vocab_stats: List[FrequencyPoint]
    general_vocab_thresholds: Dict[str, int]
    local_vocab_stats: List[LocalFrequencyPoint]
    local_vocab_thresholds: Dict[str, int]
    pos_distribution: Dict[str, int]
    unique_words: int
    unique_words_once: int
    unique_kanji: int
    unique_kanji_once: int
    detailed_stats: DetailedStats


class VocabItem(BaseModel):
    """Individual vocabulary item details."""

    word: str
    reading: Optional[str]
    meanings: List[str]
    level: Optional[int]
    frequency_rank: Optional[int]
    kana_frequency_rank: Optional[int]
    count_in_episode: int


class EpisodeAnalysisResponse(BaseModel):
    """Complete episode analysis response schema."""

    episode_id: int
    series_id: int
    series_title: str
    episode_number: int
    total_unique_words: int
    stats: StatsResponse
    user_stats: Optional[UserStats]
    vocab_list: List[VocabItem]


class SeriesAnalysisResponse(BaseModel):
    """Complete series analysis response schema."""

    series_id: int
    series_title: str
    total_unique_words: int
    stats: StatsResponse
    user_stats: Optional[UserStats]
    vocab_list: List[VocabItem]


class EpisodeListItem(BaseModel):
    """Episode summary for series detail list."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    episode_number: int
    title: Optional[str]
    jr_difficulty: float
    ml_difficulty: float
    unique_words: int
    unique_kanji: int
    cpm: float


class SeriesDetailResponse(BaseModel):
    """Series detail response including episodes and stats."""

    model_config = ConfigDict(from_attributes=True)

    series: AnimeSeries
    stats: StatsResponse
    episodes: List[EpisodeListItem]
    user_stats: Optional[UserStats]


class StatusUpdate(BaseModel):
    """Schema for updating user status on an anime."""

    status: str
