import os
import json
import requests
import time
import argparse
from typing import Optional, Dict, Any

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw_subtitles")


def fetch_fresh_metadata(anilist_id: int) -> Optional[Dict[str, Any]]:
    """Query AniList for the specific fields needed.

    Args:
        anilist_id (int): The AniList ID of the anime.

    Returns:
        Optional[Dict[str, Any]]: Dictionary containing metadata fields or None if failed.
    """
    query = """
    query ($id: Int) {
      Media (id: $id, type: ANIME) {
        title {
          native
          english
          romaji
        }
        averageScore
        popularity
        description(asHtml: false)
        genres
        episodes
        coverImage {
          extraLarge
        }
      }
    }
    """
    url = "https://graphql.anilist.co"
    try:
        response = requests.post(
            url, json={"query": query, "variables": {"id": anilist_id}}
        )
        if response.status_code != 200:
            print(f"Error {response.status_code} from AniList")
            return None
        return response.json()["data"]["Media"]
    except Exception as e:
        print(f"AniList Fetch Error: {e}")
        return None


def process_series_metadata(folder_name: str):
    """Updates metadata for a single series folder."""
    folder_path = os.path.join(RAW_DIR, folder_name)
    meta_path = os.path.join(folder_path, "metadata.json")

    if not os.path.exists(meta_path):
        print(f"Skipping {folder_name}: No metadata.json")
        return

    # Read Old Metadata (for retrieving IDs)
    with open(meta_path, "r", encoding="utf-8") as f:
        old_meta = json.load(f)

    anilist_id = old_meta.get("anilist_id")
    jimaku_id = old_meta.get("jimaku_id")

    if not anilist_id:
        print(f"Skipping {folder_name}: No AniList ID found in metadata.")
        return

    # Fetch Fresh Data
    print(f"Updating {folder_name} (ID: {anilist_id})...")
    api_data = fetch_fresh_metadata(anilist_id)

    if not api_data:
        print(f" -> Failed to fetch data. Skipping.")
        return

    # Construct New Metadata Schema
    new_meta = {
        "anilist_id": anilist_id,
        "jimaku_id": jimaku_id,  # Preserve this from local file
        # New/Renamed Fields
        "title_jp": api_data["title"]["native"],
        "title_en": api_data["title"]["english"],
        "title_romaji": api_data["title"]["romaji"],
        "anilist_rating": api_data["averageScore"],
        "popularity": api_data["popularity"],
        # Standard Fields
        "description": api_data["description"],
        "genres": api_data["genres"],
        "episodes": api_data["episodes"],
        "thumbnail_url": api_data["coverImage"]["extraLarge"],
    }

    # Save
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(new_meta, f, ensure_ascii=False, indent=2)

    # Sleep to respect API rate limits (90/min)
    # TEMP RATE LIMIT 30/min
    time.sleep(2.05)


def main():
    """Main entry point for updating metadata."""
    parser = argparse.ArgumentParser(
        description="Fix/Update metadata for raw subtitles"
    )
    parser.add_argument("--all", action="store_true", help="Process all folders")
    args = parser.parse_args()

    if not os.path.exists(RAW_DIR):
        print(f"Directory not found: {RAW_DIR}")
        return

    folders = sorted(
        [f for f in os.listdir(RAW_DIR) if os.path.isdir(os.path.join(RAW_DIR, f))]
    )

    if args.all:
        target_folders = folders
    else:
        # Interactive
        target_folders = []
        while True:
            print(f"\nTotal available series: {len(folders)}")
            search = (
                input("Enter search term (or press Enter to list all): ")
                .strip()
                .lower()
            )

            if not search:
                matches = folders
            else:
                matches = [f for f in folders if search in f.lower()]

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

    total = len(target_folders)
    print(f"Processing {total} series...")

    for i, folder in enumerate(target_folders):
        print(f"[{i+1}/{total}] ", end="")
        process_series_metadata(folder)

    print("\nMetadata update complete.")


if __name__ == "__main__":
    main()
