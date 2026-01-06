from sqlmodel import Session, select, or_
from app.models.models import Vocab
from typing import List, Dict, Any


def get_vocab_details(
    session: Session, words: List[str]
) -> Dict[str, List[Dict[str, Any]]]:
    """Retrieves vocabulary details for a list of words from the database.

    Args:
        session (Session): The database session.
        words (List[str]): A list of words (kanji or kana) to look up.

    Returns:
        Dict[str, List[Dict[str, Any]]]: A dictionary mapping the requested word to a list of
            matching vocabulary entries found in the database.
    """
    if not words:
        return {}

    # This ensures common words are processed before rare words
    # (rarity based on JPDB frequencies)
    statement = (
        select(Vocab)
        .where(or_(Vocab.word.in_(words), Vocab.reading.in_(words)))
        .order_by(Vocab.frequency_rank.asc().nullslast())
    )

    results = session.exec(statement).all()

    # Initialize map with empty lists for all requested words
    # This ensures even words with no results have an entry
    vocab_map = {w: [] for w in words}

    for item in results:
        data = {
            "word": item.word,
            "level": item.level,
            "reading": item.reading,
            "meanings": item.meanings,
            "frequency": item.frequency_rank,
            "kana_freq": item.kana_frequency_rank,
        }

        # For words in kanji form
        if item.word in vocab_map:
            vocab_map[item.word].append(data)

        # For words in kana form
        # Check "item.reading != item.word" to avoid adding it twice
        # for words that are purely kana (like "ある")
        if item.reading in vocab_map and item.reading != item.word:
            vocab_map[item.reading].append(data)

    return vocab_map


def enrich_tokens(
    session: Session, raw_tokens: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Enriches a list of raw tokens with vocabulary details from the database.

    This function performs a two-pass lookup:
    1. Primary lookup on the token's base form.
    2. If the primary lookup fails, it attempts a secondary lookup on the
       token's normalized form.

    Args:
        session (Session): The database session.
        raw_tokens (List[Dict[str, Any]]): List of raw tokens from the analyzer.

    Returns:
        List[Dict[str, Any]]: List of enriched tokens including dictionary details,
            alternative forms, and frequency info.
    """
    if not raw_tokens:
        return []

    # Pass 1: Primary lookup on base forms
    unique_bases = list(set(t["base"] for t in raw_tokens))
    primary_map = get_vocab_details(session, unique_bases)

    # Identify misses and collect candidates for a secondary lookup
    base_to_norm = {
        t["base"]: t["normalized"]
        for t in raw_tokens
        if not primary_map.get(t["base"]) and t["normalized"] != t["base"]
    }

    # Pass 2: Secondary lookup on normalized forms
    secondary_map = {}
    if base_to_norm:
        normalized_candidates = list(set(base_to_norm.values()))
        secondary_map = get_vocab_details(session, normalized_candidates)

    enriched_tokens = []
    for t in raw_tokens:
        base = t["base"]
        norm = t["normalized"]
        matches = primary_map.get(base, [])

        # Fallback to secondary lookup if primary failed
        if not matches and norm != base:
            norm_matches = secondary_map.get(norm, [])
            if norm_matches:
                # The normalized form had a match, so adopt it as the new base
                t["base"] = norm
                base = norm
                matches = norm_matches

        # Default values
        level, reading, meanings, frequency, kana_freq = None, None, [], None, None
        alternatives = []

        if matches:
            primary = matches[0]
            # Canonicalize the base to the dictionary word
            # This ensures stats_service counts unique words correctly
            base = primary["word"]
            level = primary["level"]
            reading = primary["reading"]
            meanings = primary["meanings"]
            frequency = primary["frequency"]
            kana_freq = primary["kana_freq"]
            # Package other matches as alternatives
            for alt in matches[1:4]:
                alternatives.append(
                    {
                        "word": alt["word"],
                        "reading": alt["reading"],
                        "meanings": alt["meanings"],
                        "level": alt["level"],
                    }
                )

        enriched_tokens.append(
            {
                # Raw token data
                "surface": t["surface"],
                "pos": t["pos"],
                # Enriched data
                "base": base,  # May have been updated to normalized form
                "level": level,
                "reading": reading,
                "meanings": meanings,
                "frequency": frequency,
                "kana_freq": kana_freq,
                "alternatives": alternatives,
            }
        )

    return enriched_tokens
