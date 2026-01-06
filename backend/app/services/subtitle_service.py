import pysubs2
import re
from typing import Optional, Dict, Any
from app.services.analyzer_service import Analyzer
from app.services.vocab_service import VocabService
from app.services.stats_service import calculate_stats

# Regex to remove speaker tags/sound effects: matches content inside （）, (), or []
NAMETAG_REGEX = re.compile(r"[（\(\[].*?[）\)\]]")
# Filter out common garbage (drawing commands, empty braces)
GARBAGE_REGEX = re.compile(r"^\{|^\\[a-zA-Z]")


analyzer = Analyzer()
vocab_service = VocabService()


def reconstruct_text_from_subs(
    subs: pysubs2.SSAFile, gap_threshold_ms: int = 500
) -> str:
    """Reconstructs text from subtitle events, joining lines close in time.

    Args:
        subs (pysubs2.SSAFile): The parsed subtitle object.
        gap_threshold_ms (int): Max gap in milliseconds to consider lines part of the same sentence.

    Returns:
        str: The reconstructed full text.
    """
    if not subs:
        return ""

    subs.sort()
    reconstructed_text = ""
    last_end_ms = -1
    current_sentence = []

    # Track duplicates to prevent effect-spam (e.g., fade-ins repeating lines)
    last_text_processed = ""

    for line in subs:
        # Basic Cleaning
        text = NAMETAG_REGEX.sub("", line.plaintext.strip()).strip()

        # Strict Garbage Filters
        if not text:
            continue
        if GARBAGE_REGEX.match(text):
            continue
        # Skip purely numeric lines
        if text.isdigit():
            continue

        # Deduplication
        if text == last_text_processed:
            continue

        last_text_processed = text

        gap = line.start - last_end_ms
        if last_end_ms != -1 and gap > gap_threshold_ms:
            # If there is a significant gap, close previous sentence
            sentence_str = "".join(current_sentence)
            if sentence_str and sentence_str[-1] not in "。！?!":
                sentence_str += "。"
            reconstructed_text += sentence_str + "\n"
            current_sentence = []

        current_sentence.append(text)
        last_end_ms = line.end

    if current_sentence:
        sentence_str = "".join(current_sentence)
        if sentence_str and sentence_str[-1] not in "。！?!":
            sentence_str += "。"
        reconstructed_text += sentence_str + "\n"

    return reconstructed_text


def calculate_active_seconds(subs: pysubs2.SSAFile) -> float:
    """Calculates the total time subtitles are on screen (handling overlaps).

    Args:
        subs (pysubs2.SSAFile): The parsed subtitle object.

    Returns:
        float: Total active seconds.
    """
    intervals = []
    for line in subs:
        if line.end > line.start:
            intervals.append((line.start, line.end))

    if not intervals:
        return 0.0

    intervals.sort(key=lambda x: x[0])
    merged = []
    for start, end in intervals:
        if not merged or start > merged[-1][1]:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)

    total_ms = sum(end - start for start, end in merged)
    return total_ms / 1000.0


def analyze_subtitle_file(file_path: str) -> Optional[Dict[str, Any]]:
    """Orchestrates parsing, tokenization, DB lookup, and stats calculation.

    Args:
        file_path (str): Path to the subtitle file (.ass, .srt, etc).

    Returns:
        Optional[Dict[str, Any]]: The stats dictionary or None if processing failed.
    """
    try:
        subs = pysubs2.load(file_path)
    except Exception as e:
        print(f"Error parsing subtitle file: {e}")
        return None

    full_text = reconstruct_text_from_subs(subs)
    active_seconds = calculate_active_seconds(subs)

    if not full_text.strip():
        return None

    # NLP Analysis
    raw_tokens = analyzer.get_tokens(full_text)

    # Enrichment
    enriched_tokens = vocab_service.enrich_tokens_from_memory(raw_tokens)

    # Stats Calculation
    stats = calculate_stats(enriched_tokens, full_text=full_text)

    if not stats:
        return None

    # Inject calculated timing metrics into stats before returning
    cpm = 0.0
    if active_seconds > 0:
        cpm = round((stats["total_characters"] / active_seconds) * 60, 1)

    stats["cpm"] = cpm
    stats["duration_seconds"] = (
        int((subs[-1].end - subs[0].start) / 1000) if subs else 0
    )

    return stats
