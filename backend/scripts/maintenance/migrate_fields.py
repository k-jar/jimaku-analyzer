import os
import json
import sys

# Add parent directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

STATS_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "analyzed_stats")


def migrate_file(file_path: str) -> bool:
    """
    Migrates fields in a single JSON stats file.
    Returns True if changes were saved.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"Error reading {file_path}: {e}")
        return False

    changed = False

    # Mapping of old_key -> new_key
    renames = {
        "difficulty_score": "jr_difficulty",
        "raw_difficulty": "raw_jr_difficulty",
        "ml_difficulty": "raw_ml_difficulty",
    }

    for old_key, new_key in renames.items():
        if old_key in data:
            data[new_key] = data[old_key]
            del data[old_key]
            changed = True

    if changed:
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                # Use default separators to match generate_stats.py style
                json.dump(data, f, ensure_ascii=False)
            return True
        except OSError as e:
            print(f"Error writing {file_path}: {e}")
            return False

    return False


def process_series(folder_name: str):
    folder_path = os.path.join(STATS_DIR, folder_name)
    if not os.path.isdir(folder_path):
        return

    # Filter for episode JSONs (digits.json usually, or just not metadata.json)
    files = [
        f
        for f in os.listdir(folder_path)
        if f.endswith(".json") and f != "metadata.json"
    ]

    updated_count = 0
    for file in files:
        file_path = os.path.join(folder_path, file)
        if migrate_file(file_path):
            updated_count += 1

    if updated_count > 0:
        print(f"[{folder_name}] Updated {updated_count} files.")


def main():
    if not os.path.exists(STATS_DIR):
        print(f"Stats directory not found: {STATS_DIR}")
        return

    print(f"Starting migration in {STATS_DIR}...")

    folders = sorted(os.listdir(STATS_DIR))
    for folder in folders:
        process_series(folder)

    print("Migration complete.")


if __name__ == "__main__":
    main()
