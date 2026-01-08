import sys
import os
import json
import argparse
from typing import Any

# Add project root to path (go up from scripts/pipeline/ to root)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

DATA_DIR = os.path.join(PROJECT_ROOT, "data")
RAW_DIR = os.path.join(DATA_DIR, "raw_subtitles")
OUTPUT_DIR = os.path.join(DATA_DIR, "analyzed_stats")


def ensure_json_serializable(data: Any) -> Any:
    """Recursively converts sets to lists and ensures basic types for JSON serialization.

    Args:
        data (Any): The input data structure.

    Returns:
        Any: The JSON-serializable data structure.
    """
    if isinstance(data, dict):
        return {k: ensure_json_serializable(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [ensure_json_serializable(v) for v in data]
    elif isinstance(data, set):
        return list(data)
    return data


def process_series(folder_name: str, force: bool = False):
    """Analyzes all subtitle files in a series folder and saves stats to JSON.

    Args:
        folder_name (str): The name of the folder in RAW_DIR.
        force (bool): If True, overwrites existing analysis files.
    """
    # Lazy import to prevent memory overhead in the main process
    try:
        from app.services.subtitle_service import analyze_subtitle_file
    except ImportError as e:
        print(f"Import Error in worker process: {e}")
        return

    raw_series_path = os.path.join(RAW_DIR, folder_name)
    output_series_path = os.path.join(OUTPUT_DIR, folder_name)

    # Load Metadata
    meta_path = os.path.join(raw_series_path, "metadata.json")
    if not os.path.exists(meta_path):
        print(f"Skipping {folder_name}: No metadata.json")
        return

    with open(meta_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    # Create Output Directory
    os.makedirs(output_series_path, exist_ok=True)

    # Copy metadata to output for the ingester to use later
    with open(
        os.path.join(output_series_path, "metadata.json"), "w", encoding="utf-8"
    ) as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print(f"\nProcessing Series: {metadata.get('title_jp', folder_name)}")

    # Find and Analyze Episodes
    files = sorted(
        [
            f
            for f in os.listdir(raw_series_path)
            if f.endswith((".ass", ".srt", ".ssa", ".vtt"))
        ]
    )

    for file in files:
        basename = os.path.splitext(file)[0]
        if not basename.isdigit():
            continue  # Skip non-standard files

        ep_num = int(basename)
        input_file_path = os.path.join(raw_series_path, file)
        output_json_path = os.path.join(output_series_path, f"{basename}.json")

        # Skip if already exists and force is False
        if os.path.exists(output_json_path) and not force:
            print(f"  [Ep {ep_num}] Stats already exist. Skipping.")
            continue

        print(f"  [Ep {ep_num}] Analyzing...", end="", flush=True)

        stats = analyze_subtitle_file(input_file_path)

        if stats:
            # Add context for the ingestor or ML model
            stats["_meta"] = {
                "episode_number": ep_num,
                "series_title": metadata.get("title_jp", folder_name),
                "filename": file,
            }

            clean_stats = ensure_json_serializable(stats)

            with open(output_json_path, "w", encoding="utf-8") as f:
                json.dump(clean_stats, f, ensure_ascii=False)  # Minified to save space
            print(" Done.")
        else:
            print(" Failed (No content).")


def main():
    """Main entry point for generating stats."""
    parser = argparse.ArgumentParser(
        description="Generate JSON stats from raw subtitles"
    )
    parser.add_argument("--all", action="store_true", help="Process all folders")
    parser.add_argument("--force", action="store_true", help="Overwrite existing stats")
    args = parser.parse_args()

    if not os.path.exists(RAW_DIR):
        print(f"No raw subtitles found at: {RAW_DIR}")
        print("Please create the directory and add subtitle files.")
        return

    if not os.path.exists(os.path.join(DATA_DIR, "vocab.json")):
        print(f"No vocab.json found at: {DATA_DIR}")
        print("Please run the vocabulary fetcher script first.")
        return

    folders = sorted(os.listdir(RAW_DIR))

    if args.all:
        for folder in folders:
            if os.path.isdir(os.path.join(RAW_DIR, folder)):
                process_series(folder, force=args.force)
    else:
        # Interactive mode
        valid_folders = [f for f in folders if os.path.isdir(os.path.join(RAW_DIR, f))]
        target_folders = []

        while True:
            print(f"\nTotal available series: {len(valid_folders)}")
            search = (
                input("Enter search term (or press Enter to list all): ")
                .strip()
                .lower()
            )

            if not search:
                matches = valid_folders
            else:
                matches = [f for f in valid_folders if search in f.lower()]

            if not matches:
                print("No matches found.")
                continue

            limit = 50
            display_matches = matches[:limit]

            print(f"\nFound {len(matches)} series matching '{search}':")
            for i, f in enumerate(display_matches):
                print(f"{i+1}. {f}")

            if len(matches) > limit:
                print(f"... and {len(matches) - limit} more. Please refine search.")

            sel = (
                input(
                    "\nSelect series (comma-separated numbers, 'all' for these matches, or 'r' to refine search): "
                )
                .strip()
                .lower()
            )

            if sel == "r":
                continue

            if sel == "all":
                target_folders = matches
                break

            try:
                idxs = [
                    int(x.strip()) - 1 for x in sel.split(",") if x.strip().isdigit()
                ]
                selection = [
                    display_matches[i] for i in idxs if 0 <= i < len(display_matches)
                ]
                if selection:
                    target_folders = selection
                    break
                print("Invalid selection.")
            except (ValueError, IndexError):
                print("Invalid selection")

        for folder in target_folders:
            process_series(folder, force=args.force)


if __name__ == "__main__":
    main()
