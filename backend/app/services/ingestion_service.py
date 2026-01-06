import sys
import os
import argparse
from collections import Counter
from typing import Optional, Dict, Any
from sqlmodel import Session, select
from app.schemas.stats_models import EpisodeStats

# Setup path to import from parent directory
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.services.subtitle_service import analyze_subtitle_file
from app.services.stats_service import (
    _get_general_frequency_metrics,
    _get_local_frequency_metrics,
)
from app.core.database import engine
from app.models.models import AnimeSeries, AnimeEpisode, Vocab
import re

# Regex to remove speaker tags/sound effects:
# Matches content inside （）, (), or []
NAMETAG_REGEX = re.compile(r"[（\(\[].*?[）\)\]]")


def update_series_aggregates(session: Session, series: AnimeSeries):
    """Aggregates all episodes to update Series-level metadata and linguistic stats.

    Calculates totals, averages, and merged frequency maps for the entire series.
    Ensures all JSON fields are plain-dictionary serializable.

    Args:
        session (Session): Database session.
        series (AnimeSeries): The series object to update.
    """
    episodes = session.exec(
        select(AnimeEpisode).where(AnimeEpisode.series_id == series.id)
    ).all()

    if not episodes:
        return

    print(f"Aggregating {len(episodes)} episodes for: {series.title_jp}...")

    # Simple Numeric Aggregates
    series.total_words = sum(e.total_words for e in episodes)
    series.total_characters = sum(e.total_characters for e in episodes)

    diffs = [e.jr_difficulty for e in episodes if e.jr_difficulty > 0]
    if diffs:
        series.min_jr_difficulty = min(diffs)
        series.max_jr_difficulty = max(diffs)
        series.jr_difficulty = round(sum(diffs) / len(diffs), 2)

    ml_diffs = [e.ml_difficulty for e in episodes if e.ml_difficulty > 0]
    if ml_diffs:
        series.min_ml_difficulty = min(ml_diffs)
        series.max_ml_difficulty = max(ml_diffs)
        series.ml_difficulty = round(sum(ml_diffs) / len(ml_diffs), 2)

    valid_cpms = [e.cpm for e in episodes if e.cpm > 0]
    series.cpm = round(sum(valid_cpms) / len(valid_cpms), 1) if valid_cpms else 0.0

    # Merge Frequency Maps and Distributions
    combined_freq_map = Counter()
    combined_pos = Counter()
    combined_jlpt = Counter()
    combined_kanji_map = Counter()

    for ep in episodes:
        combined_freq_map.update(ep.frequency_map or {})
        combined_kanji_map.update(ep.kanji_freq_map or {})

        combined_pos.update(ep.pos_distribution or {})
        combined_jlpt.update(ep.jlpt_distribution or {})

    # Store merged maps
    series.frequency_map = dict(combined_freq_map)
    series.pos_distribution = dict(combined_pos)
    series.jlpt_distribution = dict(combined_jlpt)
    series.kanji_freq_map = dict(combined_kanji_map)

    # Update unique counts
    series.unique_words = len(combined_freq_map)
    series.unique_kanji = len(combined_kanji_map)
    series.unique_words_once = sum(1 for c in combined_freq_map.values() if c == 1)
    series.unique_kanji_once = sum(1 for c in combined_kanji_map.values() if c == 1)

    # Recalculate Frequency Curves (General & Local)
    # Get frequency ranks for the unique words found in the entire series
    unique_words_list = list(combined_freq_map.keys())
    vocab_details = session.exec(
        select(Vocab.word, Vocab.frequency_rank, Vocab.kana_frequency_rank).where(
            Vocab.word.in_(unique_words_list)
        )
    ).all()

    vocab_lookup = {
        v.word: (v.frequency_rank, v.kana_frequency_rank) for v in vocab_details
    }

    # Prepare aggregated tokens for the service helpers
    aggregated_tokens = []
    for word, count in combined_freq_map.items():
        freqs = vocab_lookup.get(word, (None, None))
        aggregated_tokens.append(
            {"base": word, "frequency": freqs[0], "kana_freq": freqs[1], "count": count}
        )

    # Generate Metrics
    gen_metrics = _get_general_frequency_metrics(aggregated_tokens)
    loc_metrics = _get_local_frequency_metrics(aggregated_tokens)

    # Convert list of Pydantic objects (if any) to list of plain dicts
    series.general_vocab_stats = [
        p.model_dump() if hasattr(p, "model_dump") else p
        for p in gen_metrics.get("curve", [])
    ]
    series.local_vocab_stats = [
        p.model_dump() if hasattr(p, "model_dump") else p
        for p in loc_metrics.get("curve", [])
    ]

    series.general_vocab_thresholds = gen_metrics.get("thresholds", {})
    series.local_vocab_thresholds = loc_metrics.get("thresholds", {})

    # Aggregate Detailed Stats
    total_sent_len = 0
    valid_sent_count = 0
    total_sentences = 0
    for e in episodes:
        if e.detailed_stats:
            avg_len = e.detailed_stats.get("average_sentence_length")
            count = e.detailed_stats.get("sentence_count")
            if avg_len:
                total_sent_len += avg_len
                valid_sent_count += 1
            if count:
                total_sentences += count

    if valid_sent_count > 0:
        series.detailed_stats = {
            "average_sentence_length": round(total_sent_len / valid_sent_count, 1),
            "sentence_count": total_sentences,
        }
    else:
        series.detailed_stats = {}

    # Commit Changes
    session.add(series)
    session.commit()
    print(f"Series '{series.title_jp}' updated: {series.unique_words} unique words.")


def _update_series_metadata(series: AnimeSeries, metadata: Optional[Dict[str, Any]]):
    """Updates series fields from a metadata dictionary.

    Args:
        series (AnimeSeries): The series object to update.
        metadata (Optional[Dict[str, Any]]): Dictionary containing metadata fields.
    """
    if not metadata:
        return

    update_fields = [
        "title_en",
        "title_jp",
        "title_romaji",
        "jimaku_id",
        "anilist_id",
        "thumbnail_url",
        "description",
        "anilist_rating",
        "popularity",
        "genres",
    ]
    for field in update_fields:
        if metadata.get(field) is not None:
            setattr(series, field, metadata.get(field))


def ingest_episode_stats(
    session: Session,
    stats: Dict[str, Any],
    series_title: str,
    episode_num: int,
    metadata: Optional[Dict[str, Any]] = None,
) -> AnimeSeries:
    """Takes a pure stats dictionary (loaded from JSON) and writes it to the DB.

    Creates the Series and Episode if they don't exist.

    Args:
        session (Session): Database session.
        stats (Dict[str, Any]): The statistics dictionary.
        series_title (str): The Japanese title of the series.
        episode_num (int): The episode number.
        metadata (Optional[Dict[str, Any]]): Series metadata.

    Returns:
        AnimeSeries: The updated series object.
    """
    # Validate and clean the stats into a JSON-serializable dict
    # This turns FrequencyPoint objects into plain dictionaries
    validated_data = EpisodeStats(**stats).model_dump(mode="json")

    # Find or Create Series
    series = session.exec(
        select(AnimeSeries).where(AnimeSeries.title_jp == series_title)
    ).first()

    # Find or Create Series
    series = session.exec(
        select(AnimeSeries).where(AnimeSeries.title_jp == series_title)
    ).first()
    if not series:
        series = AnimeSeries(title_jp=series_title)
        _update_series_metadata(series, metadata)
        session.add(series)
        session.commit()
        session.refresh(series)
    else:
        _update_series_metadata(series, metadata)

    # Find or Create Episode
    episode = session.exec(
        select(AnimeEpisode)
        .where(AnimeEpisode.series_id == series.id)
        .where(AnimeEpisode.episode_number == episode_num)
    ).first()

    if not episode:
        episode = AnimeEpisode(series_id=series.id, episode_number=episode_num)

    # Bulk update all matching fields
    episode.sqlmodel_update(validated_data)

    session.add(episode)
    session.commit()
    session.refresh(episode)
    return series


# Use for running on raw files manually
if __name__ == "__main__":
    from app.services.subtitle_service import analyze_subtitle_file

    parser = argparse.ArgumentParser(description="Import Subtitle File into DB")
    parser.add_argument("file", help="Path to .srt or .ass file")
    parser.add_argument("--title", required=True, help="Japanese Title of the Series")
    parser.add_argument("--ep", required=True, type=int, help="Episode Number")
    args = parser.parse_args()

    if os.path.exists(args.file):
        print(f"Analyzing {args.file}...")
        stats = analyze_subtitle_file(args.file)
        if stats:
            with Session(engine) as session:
                series = ingest_episode_stats(session, stats, args.title, args.ep)
                update_series_aggregates(session, series)
                print("Done.")
