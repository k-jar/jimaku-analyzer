# Jimaku Analyzer

Jimaku Analyzer is a full-stack application designed to analyze the linguistic difficulty of Japanese anime. It processes raw subtitle files (`.ass`/`.srt`) to generate granular difficulty metrics, vocabulary coverage statistics, and JLPT level distributions. Difficulty scores are derived from a Machine Learning model trained on objective linguistic features and community perception.

The system is intended to help learners find content that matches their current language proficiency and assist in vocabulary mining by providing detailed, exportable vocabulary lists for specific episodes and entire series.

**Live Demo:** https://jimaku-analyzer.vercel.app/anime

*The live demo is hosted using Vercel (Frontend), Render (Backend), and Supabase (Database). It currently contains analyzed data for approximately 2,000 of the most popular series according to AniList. Please note that due to Render's free tier, the backend may take a minute to spin up upon the first request.*

<img width="1110" height="1088" alt="image" src="https://github.com/user-attachments/assets/420c7f94-aff6-4b5d-941c-41a04d2524d6" />

<img width="1479" height="631" alt="image" src="https://github.com/user-attachments/assets/41e408d0-251d-458d-8bc5-3aeb0d6f9b3b" />

<img width="1155" height="357" alt="image" src="https://github.com/user-attachments/assets/1d151f93-6de1-41cb-aa62-cfd8160df65a" />

## Core Features

### ML-Driven Difficulty Grading

The core metric of the platform is the **Difficulty Score (0-10)**. It is synthesized from a wide array of linguistic data points including sentence complexity, lexical density, and vocabulary rarity. This aids learners in comparing relative difficulties, not just between anime, but also individual episodes.

<img width="220" height="47" alt="image" src="https://github.com/user-attachments/assets/41d569ad-11b2-4fee-b95b-b23c6d32ed37" /><img width="215" height="47" alt="image" src="https://github.com/user-attachments/assets/098b3f93-d92a-4009-b40b-398b915b3f9c" /><img width="196" height="47" alt="image" src="https://github.com/user-attachments/assets/27a5f1d2-1eeb-4852-a4ae-ce394fe99f30" />

### Deep Statistical Analysis

Beyond the top-level difficulty score, the system offers detailed statistical breakdowns for every series and episode:

- **Coverage Thresholds:** Calculates exactly how many unique words are required to reach 80%, 90%, or 95% text coverage for a specific show.
    
- **Lexical Metrics:** Displays **Lexical Diversity** (Type-Token Ratio) and **Hapax Legomena** (ratio of words used only once) to determine how repetitive or complex the dialogue is.
    
- **Speed (CPM):** Tracks Characters Per Minute to gauge reading speed requirements.
    
- **Grammar Breakdown:** Visualizes the distribution of Parts of Speech (Nouns, Verbs, Particles, etc.).

<img width="1215" height="212" alt="image" src="https://github.com/user-attachments/assets/67ac1c99-153a-441e-a230-5ad9d664803a" />
<img width="1203" height="748" alt="image" src="https://github.com/user-attachments/assets/03d3c9c0-6012-4747-84a0-3e1bf0cc99ae" />

### Priority-Based Vocabulary Lists

Vocabulary tables are generated for both full series and individual episodes. These tables support various sorts and filters:

- **Efficient Learning:** Users can sort by "Count" to identify words that frequently appear in a work, prioritizing them over words that appear only once.
    
- **Standard Sorts:** Lists can also be sorted by standard metrics like JLPT level or general dictionary frequency.

<img width="1209" height="956" alt="image" src="https://github.com/user-attachments/assets/c373ce04-9e23-4946-a8fb-fdc212a40b7b" />    

### Personalized Comprehension Metrics

The system tracks words saved by the user. When viewing analysis for a series or episode, the application calculates an **"Expected Comprehension"** percentage based on the user's known vocabulary relative to the content's frequency map. Vocabulary tables include a filter to exclude previously saved words, isolating strictly unknown terms for review.

<img width="1209" height="1188" alt="image" src="https://github.com/user-attachments/assets/b3a43950-8cde-4b2c-9615-96dba9526071" />

### Anki Mining Workflow
The vocabulary table supports a "Plaintext Export" feature designed to integrate with the **Yomitan** browser extension.
1. Export a list of unknown words from an episode to a text file.
2. Input these words into Yomitan's bulk **"Generate notes (experimental)"** feature (found under the Anki section in Yomitan settings).
3. This automatically creates Anki cards using your existing card templates and dictionaries, significantly speeding up the mining process.

### Text & Image Analysis
In addition to the pre-analyzed library, the application includes a tool for ad-hoc analysis. Users can paste raw Japanese text or upload screenshots (processed via Google Cloud Vision OCR) to receive immediate difficulty grading and vocabulary breakdowns.

<img width="872" height="880" alt="image" src="https://github.com/user-attachments/assets/1a64ef0d-cf4a-472f-8e16-ca621e7be630" />

## Related Tools

To populate the database, this project works in tandem with **Jimaku Subtitle Downloader**.

**[jimaku-downloader](https://github.com/k-jar/jimaku-downloader)**
A CLI tool designed to batch download Japanese subtitles from Jimaku.cc. It handles searching, bulk downloading based on AniList rankings, and extracting archives to prepare them for the analysis pipeline used by this repo.

## Machine Learning Model

The application calculates difficulty scores (0-10) using a custom XGBoost regression model. This model utilizes `SentenceTransformers` to vectorize subtitle lexical signatures and metadata descriptions.

*   **Model Link:** [Hugging Face - kjar/anime-difficulty](https://huggingface.co/kjar/anime-difficulty)
*   **Training Data:** The model was trained on dataset dumps provided by [Natively](https://learnnatively.com/) via their "Data Download" feature, mapping objective linguistic features to community-aggregated difficulty ratings.

## Technical Architecture

### Backend
*   **Framework:** FastAPI
*   **Database:** PostgreSQL (via SQLModel/SQLAlchemy)
*   **NLP:** SudachiPy (Split Mode C) for tokenization and morphological analysis.
*   **Pipeline:** Custom ETL pipeline using `pysubs2` for subtitle parsing.
*   **Authentication:** OAuth2 with JWT (Argon2 password hashing).

### Frontend
*   **Framework:** Next.js 16
*   **Language:** TypeScript
*   **Visualization:** Recharts for coverage curves and distribution graphs.
*   **State:** Server Components for data fetching combined with Client Components for interactive filtering.

## Setup & Installation

### Prerequisites
*   Python 3.10+
*   Node.js 20+
*   PostgreSQL instance

### Backend Setup

1.  **Environment Variables:**
    Create a `.env` file in the `backend` directory:
    ```env
    DATABASE_URL=postgresql://user:password@localhost/jimaku_db
    JWT_SECRET_KEY=your_generated_secret_key
    # Optional: For OCR features
    GOOGLE_CREDENTIALS_BASE64=your_base64_encoded_gcp_json
    ```

2.  **Install Dependencies:**
    ```bash
    cd backend
    pip install -r requirements.txt
    ```

3.  **Seed Data:**
    The application requires JMDict and frequency data to function.
    ```bash
    # Downloads JMDict, JLPT lists, and frequency data to data/vocab.json
    python scripts/fetch_vocab.py

    # Seeds the PostgreSQL database
    python scripts/seed_db.py
    ```

4.  **Run Server:**
    ```bash
    uvicorn app.main:app --reload
    ```

### Frontend Setup

1.  **Environment Variables:**
    Create a `.env.local` file in the `frontend` directory:
    ```env
    NEXT_PUBLIC_API_URL=http://localhost:8000
    ```

2.  **Install & Run:**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

## Analysis Pipeline

To populate the database with anime data, the system uses a 3-stage pipeline script located in `backend/scripts`.

1.  **Analyze (`1_analyze_subs.py`):** Parses raw `.ass`/`.srt` files from `data/raw_subtitles`, extracts linguistic features using SudachiPy, and outputs JSON stats.
2.  **Enrich (`2_enrich_stats.py`):** Loads the trained XGBoost model and injects difficulty predictions into the JSON data.
3.  **Ingest (`3_ingest_to_db.py`):** Aggregates episode data into series-level statistics and inserts records into the database.

**Usage:**
Place subtitle folders in `backend/data/raw_subtitles/{Series Name}/` (ensure a `metadata.json` containing an `anilist_id` is present—this is handled automatically if using `jimaku-downloader`).

```bash
# Run the full pipeline
python scripts/run_pipeline.py --all
```

## Limitations

*   **Difficulty Scoring:** Difficulty scoring is inherently subjective. While the ML model attempts to approximate community consensus by training on Natively data, scores should be treated as relative comparisons (e.g., "Show A is harder than Show B") rather than absolute truths. 
*   **Subtitle Quality:** Analysis depends heavily on the quality of the source subtitles. OCR-generated subtitles or fansubs with non-standard formatting may result in less accurate tokenization.

## Credits
*   **Dictionary Data:** [JMdict-Simplified](https://github.com/scriptin/jmdict-simplified)
*   **Training Data:** [Natively](https://learnnatively.com/)
*   **Frequency Data:** [JPDB](https://jpdb.io/) (via [Yomitan Frequency Dictionaries](https://github.com/Kuuuube/yomitan-dictionaries?tab=readme-ov-file#jpdb-v21-frequency))
*   **Sentences:** [Tatoeba](https://tatoeba.org/)
*   **Subtitles**: [Jimaku](https://jimaku.cc/)
