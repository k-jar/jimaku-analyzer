import sys
import os
import json
import argparse
from sqlmodel import Session

# Add project root to path (go up from scripts/pipeline/ to root)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

from app.core.database import engine
from app.services.ingestion_service import (
    ingest_episode_stats,
    update_series_aggregates,
)

DATA_DIR = os.path.join(PROJECT_ROOT, "data")
STATS_DIR = os.path.join(DATA_DIR, "analyzed_stats")


def ingest_series(folder_name: str):
    """Ingests a single series folder containing analyzed JSON stats.

    Args:
        folder_name (str): The name of the folder in STATS_DIR.
    """
    series_path = os.path.join(STATS_DIR, folder_name)

    # Load Metadata
    meta_path = os.path.join(series_path, "metadata.json")
    if not os.path.exists(meta_path):
        print(f"Skipping {folder_name}: No metadata.json")
        return

    with open(meta_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    series_title = metadata.get("title_jp")
    if not series_title:
        # Fallback to folder name, stripping ID prefix if present (e.g. "6190_Title" -> "Title")
        parts = folder_name.split("_", 1)
        if len(parts) > 1 and parts[0].isdigit():
            series_title = parts[1]
        else:
            series_title = folder_name

    print(f"\nIngesting Series: {series_title}")

    # Process Episodes
    files = sorted(
        [
            f
            for f in os.listdir(series_path)
            if f.endswith(".json") and f != "metadata.json"
        ]
    )

    series_obj = None

    with Session(engine) as session:
        for file in files:
            # Filename is "01.json"
            try:
                ep_num = int(os.path.splitext(file)[0])
            except ValueError:
                continue

            json_path = os.path.join(series_path, file)
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    stats = json.load(f)
            except json.JSONDecodeError:
                print(f"  [Ep {ep_num}] Skipping corrupt JSON file.")
                continue

            print(f"  [Ep {ep_num}] Saving to DB...", end="")
            series_obj = ingest_episode_stats(
                session, stats, series_title, ep_num, metadata
            )
            print(" Done.")

        # Update Aggregates (Once per series, after all episodes are inserted)
        if series_obj:
            print("  Updating Aggregates...")
            update_series_aggregates(session, series_obj)


def main():
    """Main entry point for ingesting stats."""
    parser = argparse.ArgumentParser(description="Ingest JSON stats into DB")
    parser.add_argument("--all", action="store_true", help="Ingest all folders")
    args = parser.parse_args()

    if not os.path.exists(STATS_DIR):
        print(f"No analyzed stats found at: {STATS_DIR}")
        print("Please run step 1 (analyze_subs.py) first.")
        return

    folders = sorted(os.listdir(STATS_DIR))

    if args.all:
        for folder in folders:
            if os.path.isdir(os.path.join(STATS_DIR, folder)):
                ingest_series(folder)
    else:
        # Interactive
        valid_folders = [
            f for f in folders if os.path.isdir(os.path.join(STATS_DIR, f))
        ]
        target_folders = []

        while True:
            print(f"\nTotal available datasets: {len(valid_folders)}")
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

            print(f"\nFound {len(matches)} datasets matching '{search}':")
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
            ingest_series(folder)


if __name__ == "__main__":
    main()
