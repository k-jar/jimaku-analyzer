import json
import os
import sys

# Add parent directory to path to allow importing from backend modules
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from sqlmodel import Session, select
from app.core.database import engine, create_db_and_tables
from app.models.models import Vocab

DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "vocab.json")


def seed_data():
    """Seeds the database with vocabulary data from a JSON file.

    Reads 'vocab.json', checks if the database is empty, and inserts
    vocabulary items in batches if the table is empty.
    """
    print("Creating tables...")
    create_db_and_tables()

    print("Reading JSON data...")
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            json_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Data file not found at {DATA_FILE}")
        return

    print("Inserting data into PostgreSQL...")
    with Session(engine) as session:
        # Check if DB is already empty to avoid duplicates
        existing = session.exec(select(Vocab)).first()
        if existing:
            print("Database already has data. Skipping seed.")
            return

        count = 0
        batch_size = 5000
        batch = []

        for i, entry in enumerate(json_data):
            vocab = Vocab(
                word=entry["word"],
                reading=entry["reading"],
                meanings=entry["meanings"],  # List of strings
                level=entry["level"],  # Might be None
                frequency_rank=entry["frequency_rank"],  # Might be None
                kana_frequency_rank=entry["kana_frequency_rank"],  # Might be None
            )
            batch.append(vocab)
            count += 1

            if len(batch) >= batch_size:
                session.add_all(batch)
                session.commit()
                batch = []
                print(f"Processed {i}...")

        # Commit remaining
        if batch:
            session.add_all(batch)
            session.commit()

        print(f"Successfully inserted {count} entries into the database.")


if __name__ == "__main__":
    seed_data()
