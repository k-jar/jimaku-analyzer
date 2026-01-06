"""
Shared Pydantic schemas used across multiple domains.
"""

from pydantic import BaseModel
from typing import Optional


class FrequencyPoint(BaseModel):
    """A single point on the global frequency distribution curve.

    Attributes:
        rank (int): Vocabulary size (e.g., 5000 = top 5000 words).
        coverage (float): Percentage of text covered by this rank.
    """

    rank: int
    coverage: float


class LocalFrequencyPoint(BaseModel):
    """A single point on the local frequency distribution curve.

    Attributes:
        unique (int): Number of unique words from this work.
        coverage (float): Percentage of text covered.
    """

    unique: int
    coverage: float


class DetailedStats(BaseModel):
    """Detailed text statistics.

    Attributes:
        average_sentence_length (Optional[float]): Average characters per sentence.
        sentence_count (Optional[int]): Total number of sentences.
    """

    average_sentence_length: Optional[float] = None
    sentence_count: Optional[int] = None


class UserStats(BaseModel):
    """User-specific comprehension statistics.

    Attributes:
        known_unique_count (int): Number of unique words the user knows.
        known_unique_pct (float): Percentage of unique words known.
        comprehension_pct (float): Overall comprehension percentage (token-based).
    """

    known_unique_count: int
    known_unique_pct: float
    comprehension_pct: float
