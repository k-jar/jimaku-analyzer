from collections import Counter
from typing import List, Dict, Any, Optional, Tuple
from app.schemas.stats_models import EpisodeStats
import re

try:
    from jreadability import compute_readability

    JREADABILITY_AVAILABLE = True
except ImportError:
    print("Warning: jreadability not found. Difficulty scores will be 0.")
    JREADABILITY_AVAILABLE = False

# Compile regex once at module level for performance
KANJI_REGEX = re.compile(r"[\u4e00-\u9faf]")
# Regex to identify tokens that shouldn't count as words (Numbers, Latin chars, etc)
NON_WORD_REGEX = re.compile(r"^[\d\sa-zA-Z]+$")

# Constants for difficulty score calculation
JREADABILITY_EASIEST = 6.5
JREADABILITY_HARDEST = 0.5
STANDARD_SCALE_FACTOR = 1.5

# Heuristic range for anime difficulty on a 1-10 standard scale
ANIME_DIFFICULTY_MIN = 2.0
ANIME_DIFFICULTY_MAX = 5.0

JR_SCALE_MIN = 1.0
JR_SCALE_MAX = 10.0


def calculate_stats(
    tokens: List[Dict[str, Any]], full_text: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Generates statistical analysis of the text.

    Args:
        tokens (List[Dict[str, Any]]): List of token dictionaries from the analyzer.
        full_text (Optional[str]): The original full text string.

    Returns:
        Optional[Dict[str, Any]]: A dictionary containing calculated statistics,
            or None if input tokens are empty.
    """
    if not tokens:
        return None

    # Filter tokens
    valid_tokens = [t for t in tokens if is_valid_token(t)]

    # Lexical Analysis (Unique words, Kanji counts)
    lexical_stats = _get_lexical_metrics(valid_tokens, tokens)

    # Grammar Analysis (POS Distribution)
    # Should use raw tokens
    pos_counts = _get_pos_distribution(tokens)

    # JLPT Analysis (Distribution + Estimated JLPT Level)
    jlpt_distribution = _get_jlpt_metrics(valid_tokens)

    # General Frequency Analysis based off all JP vocabulary
    general_vocab_freq_stats = _get_general_frequency_metrics(valid_tokens)

    # Local Frequency Analysis based off all JP vocabulary specific to this work
    local_vocab_freq_stats = _get_local_frequency_metrics(valid_tokens)

    # Detailed Stats (Sentence length, lexical density, etc)
    detailed_stats = _get_detailed_metrics(tokens, full_text)

    scaled_readability, raw_readability = _calculate_jr_difficulty(full_text)

    # Merge and Return
    result = {
        "total_words": len(valid_tokens),
        "jlpt_distribution": jlpt_distribution,
        "jr_difficulty": scaled_readability,
        "raw_jr_difficulty": raw_readability,
        "general_vocab_stats": general_vocab_freq_stats["curve"],
        "general_vocab_thresholds": general_vocab_freq_stats["thresholds"],
        "local_vocab_stats": local_vocab_freq_stats["curve"],
        "local_vocab_thresholds": local_vocab_freq_stats["thresholds"],
        "pos_distribution": pos_counts,
        "frequency_map": lexical_stats["frequency_map"],
        "unique_words": lexical_stats["unique_words"],
        "unique_words_once": lexical_stats["unique_words_once"],
        "unique_kanji": lexical_stats["unique_kanji"],
        "unique_kanji_once": lexical_stats["unique_kanji_once"],
        "total_characters": lexical_stats["total_characters"],
        "kanji_freq_map": lexical_stats["kanji_freq_map"],
        "detailed_stats": detailed_stats,
    }

    validated = EpisodeStats(**result)
    return validated.model_dump(mode="json")


def _calculate_jr_difficulty(text: Optional[str]) -> Tuple[float, float]:
    """Calculates a 1-10 difficulty score from raw text using jReadability.

    normalizing and scaling the score for the anime domain.

    Args:
        text (Optional[str]): The text to analyze.

    Returns:
        Tuple[float, float]: A tuple containing (final_scaled_score, raw_jreadability_score).
    """
    if not JREADABILITY_AVAILABLE or not text or not text.strip():
        return 0.0

    try:
        # jReadability returns a score from ~0.5 (Hard) to ~6.5 (Easy)
        raw_score = compute_readability(text)

        # Convert to a standard 1-10 scale where 1 is easy and 10 is hard.
        # The formula is: 1 + (Distance_from_easiest * scale_factor)
        standard_score = JR_SCALE_MIN + (
            (JREADABILITY_EASIEST - raw_score) * STANDARD_SCALE_FACTOR
        )

        # Anime dialogue is generally easier than the academic/formal text
        # jreadability was trained on. Heuristically, most anime fall
        # within a narrow band (e.g., 2.0 to 5.0) on the standard scale.
        # Stretches this specific "anime range" to fill the full 1-10 UI
        # scale to provide more meaningful differentiation between shows.

        # Clamp the score to the expected anime range.
        clamped_score = max(
            ANIME_DIFFICULTY_MIN, min(ANIME_DIFFICULTY_MAX, standard_score)
        )

        # Normalize the clamped score to a 0.0-1.0 range.
        normalized_score = (clamped_score - ANIME_DIFFICULTY_MIN) / (
            ANIME_DIFFICULTY_MAX - ANIME_DIFFICULTY_MIN
        )

        # Map the normalized score back to the full 1.0-10.0 UI scale.
        final_scaled_score = JR_SCALE_MIN + (
            normalized_score * (JR_SCALE_MAX - JR_SCALE_MIN)
        )

        return round(final_scaled_score, 1), raw_score

    except Exception as e:
        print(f"jReadability Error: {e}")
        return 0.0, 0.0


def is_valid_token(token: Dict[str, Any]) -> bool:
    """Determines if a token should be included in vocabulary statistics.

    Excludes punctuation, symbols, spaces, particles, auxiliary verbs, numbers,
    interjections, non-Japanese strings, and words without frequency data.

    Args:
        token (Dict[str, Any]): The token dictionary to check.

    Returns:
        bool: True if the token is valid for stats, False otherwise.
    """
    pos_tuple = token.get("pos", ("*",))
    top_pos = pos_tuple[0]
    sub_pos = pos_tuple[1] if len(pos_tuple) > 1 else "*"
    base_word = token.get("base", "*")

    # POS Filtering
    if top_pos in {"補助記号", "空白", "記号"}:  # Punctuation, Space, Symbols
        return False

    # Exclude Grammar Particles & Aux Verbs for a cleaner "Vocab" list.
    # Note: This lowers "Comprehension %" on the graph compared to raw text coverage,
    # but accurately reflects "Vocab Knowledge Coverage".
    # 助詞 = particle,  助動詞 = aux verb, 感動詞 = interjection
    if top_pos in {"助詞", "助動詞", "感動詞"}:
        return False

    # Exclude Numbers
    if sub_pos == "数詞":
        return False

    # Content Filtering
    if base_word == "*" or base_word is None:
        return False

    # Exclude purely alphanumeric strings (English, timestamps, etc)
    if NON_WORD_REGEX.match(base_word):
        return False

    # Exclude words that are not in the JPDB frequency list.
    # As the frequency list is clean, this removes obscure words
    # or errors not caught by the previous filters.
    freq = token.get("frequency")
    kana_freq = token.get("kana_freq")

    if freq is None and kana_freq is None:
        return False

    return True


def _get_lexical_metrics(
    tokens: List[Dict[str, Any]], all_tokens: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Calculates lexical metrics such as word and kanji counts.

    Args:
        tokens (List[Dict[str, Any]]): List of valid tokens.
        all_tokens (List[Dict[str, Any]]): List of all tokens (including punctuation).

    Returns:
        Dict[str, Any]: Dictionary containing frequency maps and unique counts.
    """
    # Word counts come from the clean list
    word_counter = Counter([t["base"] for t in tokens])

    kanji_counter = Counter()
    total_chars = 0

    for t in all_tokens:
        surface = t["surface"]
        total_chars += len(surface)

        found_kanji = KANJI_REGEX.findall(surface)
        for k in found_kanji:
            kanji_counter[k] += 1

    return {
        "frequency_map": dict(word_counter),
        "unique_words": len(word_counter),
        "unique_words_once": sum(1 for c in word_counter.values() if c == 1),
        "unique_kanji": len(kanji_counter),
        "unique_kanji_once": sum(1 for c in kanji_counter.values() if c == 1),
        "total_characters": total_chars,
        "kanji_freq_map": dict(kanji_counter),
    }


def _get_pos_distribution(tokens: List[Dict[str, Any]]) -> Dict[str, int]:
    """Classifies tokens into grammatical categories.

    Args:
        tokens (List[Dict[str, Any]]): List of tokens to classify.

    Returns:
        Dict[str, int]: A dictionary mapping POS categories to counts.
    """
    pos_counts = {
        "Nouns": 0,
        "Verbs": 0,
        "Adjectives": 0,
        "Particles": 0,
        "Auxiliary": 0,
        "Conjunctions": 0,
        "Proper Nouns": 0,
        "Others": 0,
    }

    for t in tokens:
        pos_tuple = t.get("pos", ("*",))
        top_pos = pos_tuple[0]
        sub_pos = pos_tuple[1] if len(pos_tuple) > 1 else "*"

        if top_pos == "名詞":
            if sub_pos == "固有名詞":
                pos_counts["Proper Nouns"] += 1
            else:
                pos_counts["Nouns"] += 1
        elif top_pos == "動詞":
            pos_counts["Verbs"] += 1
        elif top_pos == "形容詞" or top_pos == "形状詞":
            pos_counts["Adjectives"] += 1
        elif top_pos == "助詞":
            pos_counts["Particles"] += 1
        elif top_pos == "助動詞":
            pos_counts["Auxiliary"] += 1
        elif top_pos == "接続詞":
            pos_counts["Conjunctions"] += 1
        else:
            # Catch-all for symbols, prefixes, etc.
            pos_counts["Others"] += 1

    return pos_counts


def _get_jlpt_metrics(tokens: List[Dict[str, Any]]) -> Dict[str, int]:
    """Calculates the distribution of JLPT levels in the tokens.

    Args:
        tokens (List[Dict[str, Any]]): List of tokens with 'level' attribute.

    Returns:
        Dict[str, int]: Dictionary mapping JLPT levels (N1-N5) to counts.
    """
    jlpt_distribution = {"N1": 0, "N2": 0, "N3": 0, "N4": 0, "N5": 0, "Unknown": 0}
    total_valid = 0

    for t in tokens:
        if t["level"]:
            jlpt_distribution[f"N{t['level']}"] += 1
            total_valid += 1
        else:
            jlpt_distribution["Unknown"] += 1
            # Unknowns DO NOT count towards the total for percentage calc
            # From personal exp, there are a lot of common words that are
            # not in any of the JLPT vocab lists.

    # Remove "Unknown" from distribution before returning
    del jlpt_distribution["Unknown"]

    return jlpt_distribution


def _get_general_frequency_metrics(tokens: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculates cumulative coverage curve based on general Japanese frequency.

    word frequency ranks.

    Args:
        tokens (List[Dict[str, Any]]): List of tokens with frequency data.

    Returns:
        Dict[str, Any]: Dictionary containing the coverage curve and thresholds.
    """
    rank_counts = Counter()

    # Build a frequency map of ranks from the token list.
    for t in tokens:
        freq = t.get("frequency")
        kana_freq = t.get("kana_freq")
        count = t.get("count", 1)  # Support for pre-aggregated tokens

        rank = None
        if freq is not None and kana_freq is not None:
            rank = min(freq, kana_freq)
        elif freq is not None:
            rank = freq
        elif kana_freq is not None:
            rank = kana_freq

        # Exclude ranks above 30k to remove outliers/very technical words.
        if rank and rank <= 30000:
            rank_counts[rank] += count

    if not rank_counts:
        return {"curve": [], "thresholds": {}, "average_rank": 0}

    # Create a sorted list of unique ranks and calculate total tokens.
    sorted_ranks = sorted(rank_counts.keys())
    total_tokens = sum(rank_counts.values())
    rank_sum = sum(rank * count for rank, count in rank_counts.items())

    # Generate the cumulative coverage curve.
    curve_points = []
    covered_tokens = 0
    rank_idx = 0
    for r_limit in range(1000, 31000, 1000):
        # Sum counts of all ranks up to the current limit
        while rank_idx < len(sorted_ranks) and sorted_ranks[rank_idx] <= r_limit:
            covered_tokens += rank_counts[sorted_ranks[rank_idx]]
            rank_idx += 1

        coverage_pct = (covered_tokens / total_tokens) * 100
        curve_points.append({"rank": r_limit, "coverage": round(coverage_pct, 2)})

    # Calculate vocabulary size needed for comprehension thresholds (e.g., 95%).
    targets = [50, 70, 80, 90, 95, 97, 99]
    thresholds = {}

    # Create a cumulative count list to find thresholds efficiently
    cumulative_counts = []
    running_total = 0
    for rank in sorted_ranks:
        running_total += rank_counts[rank]
        cumulative_counts.append((running_total, rank))

    for target in targets:
        required_tokens = total_tokens * (target / 100)
        found_rank = 0
        # Find the first rank where the cumulative count exceeds the target
        for count, rank in cumulative_counts:
            if count >= required_tokens:
                found_rank = rank
                break

        # Round to nearest 100, with a minimum of 500
        val = max(int(round(found_rank, -2)), 500)
        thresholds[str(target)] = val

    return {
        "curve": curve_points,
        "thresholds": thresholds,
        "average_rank": rank_sum / total_tokens,
    }


def _get_local_frequency_metrics(tokens: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculates cumulative coverage based on local word frequency in the text.

    Args:
        tokens (List[Dict[str, Any]]): List of tokens.

    Returns:
        Dict[str, Any]: Dictionary containing the local coverage curve and thresholds.
    """
    # Handle pre-aggregated tokens (from import_subtitle.py) or raw tokens
    counts = Counter()
    for t in tokens:
        base = t.get("base", "*")
        if base == "*":
            continue
        c = t.get("count", 1)
        counts[base] += c

    total_tokens = sum(counts.values())
    if total_tokens == 0:
        return {"curve": [], "thresholds": {}}

    sorted_words = counts.most_common()

    curve = []
    targets = [80, 85, 90, 95, 97, 98, 99]
    target_map = {str(t): None for t in targets}

    running_count = 0
    unique_count = 0

    # Store max 100 points
    step = max(1, len(sorted_words) // 100)

    for i, (word, count) in enumerate(sorted_words):
        unique_count += 1
        running_count += count
        coverage = (running_count / total_tokens) * 100

        # Check targets
        for t in targets:
            if target_map[str(t)] is None and coverage >= t:
                target_map[str(t)] = unique_count

        # Add to curve
        if i % step == 0 or i == len(sorted_words) - 1:
            curve.append({"unique": unique_count, "coverage": round(coverage, 2)})

    return {"curve": curve, "thresholds": target_map}


def _get_detailed_metrics(
    tokens: List[Dict[str, Any]], full_text: Optional[str]
) -> Dict[str, Any]:
    """Calculates detailed metrics like sentence length.

    Args:
        tokens (List[Dict[str, Any]]): List of tokens (unused here but kept for interface).
        full_text (Optional[str]): The full text string.

    Returns:
        Dict[str, Any]: Dictionary containing detailed statistics.
    """
    if not full_text:
        return {}

    sentences = re.findall(r"[。！？\?!]", full_text)
    sentence_count = len(sentences) or 1
    avg_len = len(full_text) / sentence_count

    return {
        "average_sentence_length": round(avg_len, 1),
        "sentence_count": sentence_count,
    }
