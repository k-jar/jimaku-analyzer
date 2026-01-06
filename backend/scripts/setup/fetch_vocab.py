import requests
import json
import os
import tarfile
import shutil
import csv
import io
from typing import Dict, Tuple

# JMDict Source (simplified JSON version)
JMDICT_URL = "https://github.com/scriptin/jmdict-simplified/releases/download/3.6.1%2B20251208123023/jmdict-eng-3.6.1+20251208123023.json.tgz"

# JLPT level source
JLPT_URL_TEMPLATE = "https://raw.githubusercontent.com/stephenmk/yomitan-jlpt-vocab/refs/heads/main/original_data/n{}.csv"

# JPDB frequency source
JPDB_FREQ_URL = "https://raw.githubusercontent.com/Kuuuube/yomitan-dictionaries/main/data/jpdb_v2.2_freq_list_2024-10-13.csv"

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "vocab.json")


def get_jlpt_map() -> Dict[str, int]:
    """Downloads JLPT CSVs and returns a mapping of words to levels.

    Returns:
        Dict[str, int]: A dictionary mapping words (kanji or kana) to JLPT levels (1-5).
        Example: {'猫': 5, '食べる': 5}
    """
    print("Building JLPT map...")
    jlpt_map = {}
    import csv
    import io

    for level in [5, 4, 3, 2, 1]:
        url = JLPT_URL_TEMPLATE.format(level)
        try:
            resp = requests.get(url)
            content = resp.content.decode("utf-8")
            reader = csv.reader(io.StringIO(content))
            for row in reader:
                if len(row) >= 1:
                    kanji = row[2].strip()
                    kana = row[1].strip()
                    if kanji:
                        jlpt_map[kanji] = level
                    elif kana:
                        jlpt_map[kana] = level

        except Exception as e:
            print(f"Error fetching N{level}: {e}")

    print(f"Loaded {len(jlpt_map)} JLPT words for tagging.")
    return jlpt_map


def get_frequency_map() -> Dict[Tuple[str, str], Dict[str, int]]:
    """Downloads Frequency CSV and returns a mapping of (word, reading) to frequency data.

    Returns:
        Dict[Tuple[str, str], Dict[str, int]]: A dictionary where keys are (term, reading)
        and values are dicts containing 'main', 'kana', and 'effective' frequency ranks.
    """
    print("Building Frequency map...")
    freq_map = {}

    try:
        resp = requests.get(JPDB_FREQ_URL)
        if resp.status_code != 200:
            print("Warning: Could not download frequency data.")
            return {}

        content = resp.content.decode("utf-8")

        # Tab-separted file so use delimiter '\t'
        reader = csv.reader(io.StringIO(content), delimiter="\t")

        header = next(reader, None)  # Skip header

        print(f"Frequency Data Head: {content[:100]}...")

        # CSV format: term, reading, frequency, kana_frequency
        for row in reader:
            if len(row) < 3:
                continue

            term = row[0].strip()
            reading = row[1].strip()
            freq_str = row[2].strip()
            main_freq = int(freq_str) if freq_str and freq_str.isdigit() else None
            kana_freq_str = row[3].strip() if len(row) > 3 else ""
            kana_freq = (
                int(kana_freq_str)
                if kana_freq_str and kana_freq_str.isdigit()
                else None
            )

            # For kana-only words, prioritize kana_frequency if available
            if term == reading and kana_freq is not None:
                effective_freq = kana_freq
            else:
                effective_freq = main_freq

            if effective_freq is not None:
                freq_map[(term, reading)] = {
                    "main": main_freq,
                    "kana": kana_freq,
                    "effective": effective_freq,
                }

    except Exception as e:
        print(f"Error processing frequency: {e}")

    print(f"Loaded {len(freq_map)} frequency entries.")
    return freq_map


def fetch_and_process():
    """Orchestrates the download and processing of vocabulary data.

    Downloads JMDict, JLPT lists, and frequency lists, merges them,
    and saves the result to 'vocab.json'.
    """
    # Build the JLPT Lookup Table
    jlpt_levels = get_jlpt_map()

    freq_map = get_frequency_map()

    # Download JMDict
    print("Downloading JMDict")
    local_tgz = "jmdict.json.tgz"

    with requests.get(JMDICT_URL, stream=True) as r:
        with open(local_tgz, "wb") as f:
            shutil.copyfileobj(r.raw, f)

    # Process JMDict
    print("Processing dictionary entries...")
    final_vocab = []
    processed_word_reading_pairs = set()

    with tarfile.open(local_tgz, "r:gz") as tar:
        # Find the JSON file inside the archive
        json_member = None
        for member in tar.getmembers():
            if member.name.endswith(".json"):
                json_member = member
                break

        if not json_member:
            raise Exception("No JSON file found inside the TGZ archive.")

        # Extract the file object
        f = tar.extractfile(json_member)

        # Load the JSON
        jmdict_data = json.load(f)
        # Structure is: {"words": [ ...entries... ]}

        for entry in jmdict_data["words"]:
            # Get the main word (Kanji)
            # Usually the first "kanji" entry, or if none, the first "kana"
            if entry["kanji"]:
                word = entry["kanji"][0]["text"]
            else:
                word = entry["kana"][0]["text"]

            # Get the reading (Kana)
            reading = entry["kana"][0]["text"] if entry["kana"] else ""

            # Get Definitions (Gloss)
            # Flatten the list of senses into a simple list of strings
            meanings = []
            for sense in entry["sense"]:
                for gloss in sense["gloss"]:
                    meanings.append(gloss["text"])

            # Limit to top 5 meanings to save space
            meanings = meanings[:5]

            # Get JLPT Level if it has one
            level = jlpt_levels.get(word, None)

            # Track this combination
            processed_word_reading_pairs.add((word, reading))

            # Get frequency rank if exists
            freq_data = freq_map.get((word, reading), {})
            rank = freq_data.get("effective") or freq_data.get("main")
            kana_rank = freq_data.get("kana")

            final_vocab.append(
                {
                    "word": word,
                    "reading": reading,
                    "meanings": meanings,
                    "level": level,
                    "frequency_rank": rank,
                    "kana_frequency_rank": kana_rank,
                }
            )

    # Add entries that are in the frequency list but not in JMDict
    print("Adding frequency-only entries...")
    freq_only_added = 0
    for (word, reading), freq_data in freq_map.items():
        if (word, reading) not in processed_word_reading_pairs:
            level = jlpt_levels.get(word, None)
            rank = freq_data.get("main")
            kana_rank = freq_data.get("kana")

            final_vocab.append(
                {
                    "word": word,
                    "reading": reading,
                    "meanings": [],  # No meaning from JMDict
                    "level": level,
                    "frequency_rank": rank,
                    "kana_frequency_rank": kana_rank,
                }
            )
            freq_only_added += 1

    print(f"Added {freq_only_added} entries from frequency data not present in JMDict.")

    # Save
    print(f"Saving {len(final_vocab)} entries to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(final_vocab, f, ensure_ascii=False)

    # Cleanup
    os.remove(local_tgz)
    print("Done")


if __name__ == "__main__":
    fetch_and_process()
