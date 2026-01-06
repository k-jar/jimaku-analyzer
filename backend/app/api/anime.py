from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, or_, select, desc, asc, Field as SQLField
from sqlalchemy import case
from typing import List, Optional, Dict
from app.core.database import get_session
from app.models.models import (
    AnimeSeries,
    AnimeSeriesBase,
    AnimeEpisode,
    Vocab,
    User,
    UserAnimeStatus,
    UserVocabLink,
)
from app.core.security import get_current_user, get_current_user_optional
from app.crud.crud import get_vocab_details
from app.schemas.anime import (
    StatusUpdate,
    StatsResponse,
    VocabItem,
    EpisodeAnalysisResponse,
    SeriesAnalysisResponse,
    SeriesDetailResponse,
)
from app.schemas.common import UserStats
import jaconv

router = APIRouter(prefix="/anime", tags=["anime"])

# SQLModel Schemas


class AnimeSeriesWithStatus(AnimeSeriesBase):
    """Schema for Anime Series response including the user's watch status."""

    id: int
    user_status: Optional[str] = SQLField(default=None)


# Helper Functions


def normalize_to_hiragana(text: str) -> str:
    """Normalizes text to Hiragana using jaconv.

    Args:
        text (str): The input text (likely Katakana).

    Returns:
        str: The text converted to Hiragana.
    """
    return jaconv.kata2hira(text)


def _build_anime_query(
    search: Optional[str],
    min_score: Optional[float],
    max_score: Optional[float],
    sort: str,
    order: str,
):
    """Builds the SQL statement for querying anime series based on filters.

    Args:
        search (Optional[str]): Search term for title (JP or EN).
        min_score (Optional[float]): Minimum difficulty score.
        max_score (Optional[float]): Maximum difficulty score.
        sort (str): Field to sort by (difficulty, words, title, etc.).
        order (str): Sort direction ('asc' or 'desc').

    Returns:
        Select: The SQLModel select statement.
    """
    statement = select(AnimeSeries)

    if search:
        statement = statement.where(
            or_(
                AnimeSeries.title_jp.ilike(f"%{search}%"),
                AnimeSeries.title_en.ilike(f"%{search}%"),
            )
        )

    if min_score is not None:
        statement = statement.where(AnimeSeries.ml_difficulty >= min_score)

    if max_score is not None:
        statement = statement.where(AnimeSeries.ml_difficulty <= max_score)

    # Sort Options
    if sort == "difficulty":
        col = AnimeSeries.ml_difficulty
    elif sort == "words":
        col = AnimeSeries.unique_words
    elif sort == "title":
        col = AnimeSeries.title_jp
    elif sort == "popularity":
        col = AnimeSeries.popularity
    elif sort == "anilist_rating":
        col = AnimeSeries.anilist_rating
    else:
        col = AnimeSeries.id

    if order == "desc":
        statement = statement.order_by(desc(col))
    else:
        statement = statement.order_by(asc(col))

    return statement


def _calculate_user_stats(
    session: Session, user: Optional[User], frequency_map: Dict[str, int]
) -> Optional[UserStats]:
    """Calculates user-specific comprehension statistics.

    Args:
        session (Session): Database session.
        user (Optional[User]): The current user.
        frequency_map (Dict[str, int]): Map of word to frequency in the target content.
        total_words (int): Total word count in the target content.

    Returns:
        Optional[UserStats]: User statistics if user is provided, else None.
    """
    if not user or not frequency_map:
        return None

    known_words = set(
        session.exec(
            select(Vocab.word)
            .join(UserVocabLink)
            .where(UserVocabLink.user_id == user.id)
        ).all()
    )

    series_unique = set(frequency_map.keys())
    known_in_series = series_unique.intersection(known_words)

    known_unique_count = len(known_in_series)
    known_unique_pct = (
        (known_unique_count / len(series_unique)) * 100 if series_unique else 0
    )

    # Calculate total tokens from the frequency map
    total_tokens = sum(frequency_map.values())
    known_tokens = sum(frequency_map[w] for w in known_in_series if w in frequency_map)
    comprehension_pct = (known_tokens / total_tokens) * 100 if total_tokens else 0

    return UserStats(
        known_unique_count=known_unique_count,
        known_unique_pct=round(known_unique_pct, 1),
        comprehension_pct=round(comprehension_pct, 1),
    )


def _enrich_vocab_list(
    session: Session, frequency_map: Dict[str, int]
) -> List[VocabItem]:
    """Enriches a frequency map with dictionary data from the database.

    Args:
        session (Session): Database session.
        frequency_map (Dict[str, int]): Map of word to frequency.

    Returns:
        List[VocabItem]: List of enriched vocabulary items sorted by occurrence count.
    """
    if not frequency_map:
        return []

    # Identify all words to look up
    all_words = list(frequency_map.keys())

    # Add Hiragana fallbacks for Katakana words
    # This ensures dictionary entries are found even if the text uses Katakana (common in anime)
    lookup_words = set(all_words)
    for w in all_words:
        hira = jaconv.kata2hira(w)
        if hira != w:
            lookup_words.add(hira)

    # Bulk fetch details using shared logic from crud.py
    vocab_map = get_vocab_details(session, list(lookup_words))

    aggregated_results = {}

    for word, count in frequency_map.items():
        # Try exact match first
        matches = vocab_map.get(word)

        # Try fallback if no exact match
        if not matches:
            hira = jaconv.kata2hira(word)
            if hira != word:
                matches = vocab_map.get(hira)

        # Use the best match (first item)
        vocab_item = matches[0] if matches else None

        if vocab_item:
            # Aggregate by the canonical dictionary word
            key = vocab_item["word"]
            if key in aggregated_results:
                aggregated_results[key]["count_in_episode"] += count
            else:
                aggregated_results[key] = {
                    "word": vocab_item["word"],
                    "reading": vocab_item["reading"],
                    "meanings": vocab_item["meanings"],
                    "level": vocab_item["level"],
                    "frequency_rank": vocab_item["frequency"],
                    "kana_frequency_rank": vocab_item["kana_freq"],
                    "count_in_episode": count,
                }
        else:
            # No dictionary match, aggregate by raw word
            key = word
            if key in aggregated_results:
                aggregated_results[key]["count_in_episode"] += count
            else:
                aggregated_results[key] = {
                    "word": word,
                    "reading": None,
                    "meanings": [],
                    "level": None,
                    "frequency_rank": None,
                    "kana_frequency_rank": None,
                    "count_in_episode": count,
                }

    # Convert to Pydantic models
    result = [VocabItem(**item) for item in aggregated_results.values()]
    result.sort(key=lambda x: x.count_in_episode, reverse=True)
    return result


# API Routes


@router.get("/", response_model=List[AnimeSeriesWithStatus])
def get_anime_list(
    skip: int = 0,
    limit: int = 100,
    min_score: Optional[float] = None,
    max_score: Optional[float] = None,
    sort: str = "difficulty",
    order: str = "asc",
    search: Optional[str] = None,
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    """Retrieves a list of Anime Series with optional filtering and sorting.

    Args:
        skip (int): Number of records to skip.
        limit (int): Max number of records to return.
        min_score (Optional[float]): Minimum difficulty score.
        max_score (Optional[float]): Maximum difficulty score.
        sort (str): Sort criterion (difficulty, words, title, etc.).
        order (str): Sort order (asc, desc).
        search (Optional[str]): Search query for title.
        user (Optional[User]): The current user (optional) to fetch status.
        session (Session): Database session.

    Returns:
        List[AnimeSeriesWithStatus]: List of anime series including user status.
    """
    statement = _build_anime_query(search, min_score, max_score, sort, order)
    statement = statement.offset(skip).limit(limit)
    results = session.exec(statement).all()

    status_map = {}
    if user and results:
        series_ids = [a.id for a in results]
        statuses = session.exec(
            select(UserAnimeStatus)
            .where(UserAnimeStatus.user_id == user.id)
            .where(UserAnimeStatus.series_id.in_(series_ids))
        ).all()
        status_map = {s.series_id: s.status for s in statuses}

    return [
        AnimeSeriesWithStatus.model_validate(
            a, update={"user_status": status_map.get(a.id)}
        )
        for a in results
    ]


@router.get("/library", response_model=List[AnimeSeriesWithStatus])
def get_anime_library(
    skip: int = 0,
    limit: int = 100,
    min_score: Optional[float] = None,
    max_score: Optional[float] = None,
    sort: str = "difficulty",
    order: str = "asc",
    search: Optional[str] = None,
    filter_mode: str = "all",
    status: Optional[str] = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Retrieves the authenticated user's anime library with filtering.

    Allows filtering by user status (watching, completed, etc.) or excluding saved items.

    Args:
        skip (int): Pagination offset.
        limit (int): Pagination limit.
        min_score (Optional[float]): Filter by minimum difficulty.
        max_score (Optional[float]): Filter by maximum difficulty.
        sort (str): Sort criterion.
        order (str): Sort direction.
        search (Optional[str]): Search query.
        filter_mode (str): 'all', 'saved_only', or 'exclude_saved'.
        status (Optional[str]): Filter by specific status (e.g., 'watching').
        user (User): The authenticated user.
        session (Session): Database session.

    Returns:
        List[AnimeSeriesWithStatus]: List of anime series matching the criteria.
    """
    statement = _build_anime_query(search, min_score, max_score, sort, order)

    status_query = select(UserAnimeStatus).where(UserAnimeStatus.user_id == user.id)
    if status:
        status_query = status_query.where(UserAnimeStatus.status == status)

    user_statuses = session.exec(status_query).all()
    saved_ids = [s.series_id for s in user_statuses]

    if filter_mode == "saved_only":
        if not saved_ids:
            return []
        statement = statement.where(AnimeSeries.id.in_(saved_ids))

        if sort == "status":
            # Join with UserAnimeStatus to sort by the custom status enum/string
            statement = (
                select(AnimeSeries)
                .join(UserAnimeStatus)
                .where(UserAnimeStatus.user_id == user.id)
            )
            if status:
                statement = statement.where(UserAnimeStatus.status == status)

            # Re-apply filters
            if search:
                statement = statement.where(
                    or_(
                        AnimeSeries.title_jp.ilike(f"%{search}%"),
                        AnimeSeries.title_en.ilike(f"%{search}%"),
                    )
                )
            if min_score is not None:
                statement = statement.where(AnimeSeries.ml_difficulty >= min_score)
            if max_score is not None:
                statement = statement.where(AnimeSeries.ml_difficulty <= max_score)

            # Sort logic
            status_order = case(
                (UserAnimeStatus.status == "watching", 4),
                (UserAnimeStatus.status == "plan_to_watch", 3),
                (UserAnimeStatus.status == "completed", 2),
                (UserAnimeStatus.status == "dropped", 1),
                else_=0,
            )

            if order == "desc":
                statement = statement.order_by(desc(status_order))
            else:
                statement = statement.order_by(asc(status_order))

    elif filter_mode == "exclude_saved":
        if saved_ids:
            statement = statement.where(AnimeSeries.id.notin_(saved_ids))

    statement = statement.offset(skip).limit(limit)
    results = session.exec(statement).all()

    # Fetch statuses for items
    status_map = {}
    if results:
        series_ids = [a.id for a in results]
        statuses = session.exec(
            select(UserAnimeStatus)
            .where(UserAnimeStatus.user_id == user.id)
            .where(UserAnimeStatus.series_id.in_(series_ids))
        ).all()
        status_map = {s.series_id: s.status for s in statuses}

    return [
        AnimeSeriesWithStatus.model_validate(
            a, update={"user_status": status_map.get(a.id)}
        )
        for a in results
    ]


@router.get("/{series_id}/status")
def get_anime_status(
    series_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Retrieves the user's status for a specific anime series.

    Args:
        series_id (int): The ID of the series.
        user (User): The authenticated user.
        session (Session): Database session.

    Returns:
        dict: Dictionary containing the status string or None.
    """
    status_entry = session.exec(
        select(UserAnimeStatus)
        .where(UserAnimeStatus.user_id == user.id)
        .where(UserAnimeStatus.series_id == series_id)
    ).first()
    return {"status": status_entry.status if status_entry else None}


@router.post("/{series_id}/status")
def update_anime_status(
    series_id: int,
    status_data: StatusUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Updates or removes the user's status for a specific anime series.

    Args:
        series_id (int): The ID of the series.
        status_data (StatusUpdate): The new status data.
        user (User): The authenticated user.
        session (Session): Database session.

    Returns:
        dict: Confirmation message and the updated status.
    """
    status_entry = session.exec(
        select(UserAnimeStatus)
        .where(UserAnimeStatus.user_id == user.id)
        .where(UserAnimeStatus.series_id == series_id)
    ).first()

    if not status_data.status:
        if status_entry:
            session.delete(status_entry)
            session.commit()
        return {"message": "Status removed", "status": None}

    if not status_entry:
        status_entry = UserAnimeStatus(
            user_id=user.id, series_id=series_id, status=status_data.status
        )
    else:
        status_entry.status = status_data.status

    session.add(status_entry)
    session.commit()
    session.refresh(status_entry)

    return {"message": "Status updated", "status": status_entry.status}


@router.get("/{series_id}", response_model=SeriesDetailResponse)
def get_series_details(
    series_id: int,
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    """Returns metadata for the series, a list of episodes, and stats.

    Includes aggregated linguistic stats and user-specific comprehension metrics.
    If user is authenticated, calculates known word percentages.

    Args:
        series_id (int): The ID of the series.
        user (Optional[User]): The current user (optional).
        session (Session): Database session.

    Returns:
        SeriesDetailResponse: Detailed series information.
    """
    # Fetch the Series
    series = session.get(AnimeSeries, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Anime series not found")

    # Calculate User-Specific Stats (if logged in)
    user_stats = None
    if user:
        user_stats = _calculate_user_stats(session, user, series.frequency_map)

    # The stats key is populated by validating the series object against the StatsResponse schema.
    return SeriesDetailResponse(
        series=series,
        stats=StatsResponse.model_validate(series),
        episodes=series.episodes,
        user_stats=user_stats,
    )


@router.get("/episode/{episode_id}/analysis", response_model=EpisodeAnalysisResponse)
def get_episode_analysis(
    episode_id: int,
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    """Returns full linguistic analysis (stats + vocab list) for a specific episode.

    Args:
        episode_id (int): The ID of the episode.
        user (Optional[User]): The current user (optional).
        session (Session): Database session.

    Returns:
        EpisodeAnalysisResponse: Analysis data including vocabulary list.
    """
    episode = session.get(AnimeEpisode, episode_id)
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    vocab_list = _enrich_vocab_list(session, episode.frequency_map)
    user_stats = _calculate_user_stats(session, user, episode.frequency_map)

    return EpisodeAnalysisResponse(
        episode_id=episode.id,
        series_id=episode.series_id,
        series_title=episode.series.title_jp if episode.series else "Unknown",
        episode_number=episode.episode_number,
        total_unique_words=len(vocab_list),
        stats=StatsResponse.model_validate(episode),
        user_stats=user_stats,
        vocab_list=vocab_list,
    )


@router.get("/{series_id}/analysis", response_model=SeriesAnalysisResponse)
def get_series_analysis(
    series_id: int,
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    """Returns full linguistic analysis (stats + vocab list) for the entire series.

    Args:
        series_id (int): The ID of the series.
        user (Optional[User]): The current user (optional).
        session (Session): Database session.

    Returns:
        SeriesAnalysisResponse: Analysis data including vocabulary list.
    """
    series = session.get(AnimeSeries, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Anime not found")

    vocab_list = _enrich_vocab_list(session, series.frequency_map)
    user_stats = _calculate_user_stats(session, user, series.frequency_map)

    return SeriesAnalysisResponse(
        series_id=series.id,
        series_title=series.title_jp,
        total_unique_words=len(vocab_list),
        stats=StatsResponse.model_validate(series),
        user_stats=user_stats,
        vocab_list=vocab_list,
    )
