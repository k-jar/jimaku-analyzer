import os
import sys
import json
import pickle
import numpy as np
import pandas as pd
from tqdm import tqdm
import xgboost as xgb
from sentence_transformers import SentenceTransformer
from spacy.lang.ja.stop_words import STOP_WORDS as JA_STOP_WORDS
from huggingface_hub import hf_hub_download

# Add project root to path (go up from scripts/pipeline/ to root)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

DATA_DIR = os.path.join(PROJECT_ROOT, "data")
STATS_DIR = os.path.join(DATA_DIR, "analyzed_stats")

# Hugging Face Configuration
HF_REPO_ID = "kjar/anime-difficulty"
HF_FILENAME = "anime_difficulty_model.pkl"
LOCAL_MODEL_CACHE = os.path.join(os.path.dirname(__file__), ".model_cache")

# --- Scaling Constants ---
SCALING_FLOOR = 23.0
SCALING_CEILING = 32.0


# Required for unpickling
class XGBoostProgressCallback(xgb.callback.TrainingCallback):
    """
    This class is required for unpickling the model if it was saved
    with this callback attached.
    """

    def __init__(self, rounds_total: int):
        """Initialize the callback with total rounds."""
        self.rounds_total = rounds_total
        self.pbar = None

    def before_training(self, model):
        """Called before training starts."""
        return model

    def after_iteration(self, model, epoch, evals_log):
        """Called after each iteration. Returns False to continue training."""
        return False

    def after_training(self, model):
        """Called after training finishes."""
        return model


class AnimeDifficultyRegressor:
    """
    Must match the training class structure exactly so pickle can load the data.
    """

    def __init__(self, embedding_model_name="paraphrase-multilingual-MiniLM-L12-v2"):
        """
        Initialize the regressor.

        Args:
            embedding_model_name (str): Name of the sentence-transformer model to use.
        """
        self.embedding_model_name = embedding_model_name
        self.model = None
        self.best_params = None
        self.feature_names = []

    def __setstate__(self, state):
        """
        Restore state from pickle.

        This method handles re-loading the embedding model if it wasn't pickled
        (which is standard practice to save space).
        """
        self.__dict__.update(state)
        # Re-load embedding model if it wasn't saved (standard practice to save space)
        if not hasattr(self, "embedding_model"):
            self.embedding_model = SentenceTransformer(self.embedding_model_name)

    def preprocess_features(self, df):
        """
        Transforms a DataFrame row into the exact matrix format the model expects.

        Args:
            df (pd.DataFrame): DataFrame containing the features.

        Returns:
            np.ndarray: Combined feature matrix (numeric + embeddings).
        """
        # Numeric Features
        numeric_feature_names = [
            c for c in self.feature_names if not c.startswith("emb_")
        ]

        # Ensure the DataFrame has all required columns, filling missing with 0
        for col in numeric_feature_names:
            if col not in df.columns:
                df[col] = 0.0

        # Extract purely the numeric values in the correct order
        X_numeric = df[numeric_feature_names].values.astype(float)

        # Description Embeddings
        descriptions = df["description"].fillna("").astype(str).tolist()
        X_desc = self.embedding_model.encode(descriptions, show_progress_bar=False)

        # Subtitle Embeddings
        subtitles = df["lexical_signature"].fillna("").astype(str).tolist()
        X_subs = self.embedding_model.encode(subtitles, show_progress_bar=False)

        # Concatenate
        X_combined = np.hstack((X_numeric, X_desc, X_subs))
        return X_combined


def download_model_from_hf(
    repo_id: str, filename: str, cache_dir: str = LOCAL_MODEL_CACHE
) -> str:
    """
    Download model from Hugging Face Hub with caching.

    Args:
        repo_id: Hugging Face repository ID (e.g., "username/model-name")
        filename: Model filename in the repository
        cache_dir: Local directory to cache the model

    Returns:
        Path to the downloaded model file
    """
    print(f"📥 Downloading model from Hugging Face...")
    print(f"   Repository: {repo_id}")
    print(f"   File: {filename}")

    try:
        # Download model (automatically caches)
        model_path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            cache_dir=cache_dir,
            resume_download=True,  # Resume if interrupted
        )
        print(f"✓ Model downloaded to: {model_path}")
        return model_path

    except Exception as e:
        print(f"✗ Error downloading model: {e}")
        print(f"\nTroubleshooting:")
        print(f"1. Check repository exists: https://huggingface.co/{repo_id}")
        print(f"2. Check filename is correct: {filename}")
        print(f"3. If private repo, ensure HF_TOKEN is set: export HF_TOKEN=your_token")
        raise


def get_lexical_signature(freq_map, top_n=200):
    """
    Reconstruct lexical signature from the frequency map stored in JSON.

    Args:
        freq_map (dict): Dictionary of word frequencies.
        top_n (int): Number of top words to include in the signature.

    Returns:
        str: Space-separated string of top words.
    """
    if not freq_map:
        return ""

    clean_map = {}
    for word, count in freq_map.items():
        if word in JA_STOP_WORDS:
            continue
        if len(word) == 1 and 0x3040 <= ord(word) <= 0x309F:
            continue
        if word in {"、", "。", "！", "？", "「", "」"}:
            continue
        clean_map[word] = count

    sorted_words = sorted(clean_map.items(), key=lambda x: x[1], reverse=True)
    return " ".join([w[0] for w in sorted_words[:top_n]])


def json_to_dataframe_row(ep_stats, metadata):
    """
    Transforms a single episode JSON + Metadata into a flat dictionary
    matching the feature columns used in training.

    Args:
        ep_stats (dict): Episode statistics dictionary.
        metadata (dict): Series metadata dictionary.

    Returns:
        dict: Flat dictionary representing a single row for the dataframe.
    """
    # Lexical Signature
    lex_sig = get_lexical_signature(ep_stats.get("frequency_map", {}))

    # Basic Stats
    row = {
        "title": metadata.get("title_jp", ""),
        "description": metadata.get("description", ""),
        "lexical_signature": lex_sig,
        "cpm": ep_stats.get("cpm", 0),
        "ui_difficulty_score": ep_stats.get("jr_difficulty", 0),
        "unique_words_avg": ep_stats.get("unique_words", 0),
        "unique_kanji_avg": ep_stats.get("unique_kanji", 0),
        "unique_words_once_avg": ep_stats.get("unique_words_once", 0),
        "unique_kanji_once_avg": ep_stats.get("unique_kanji_once", 0),
        "total_words_avg": ep_stats.get("total_words", 0),
    }

    # General Vocab Coverage (Interpolation)
    target_ranks = [1000, 2000, 5000, 10000]
    vocab_curve = ep_stats.get("general_vocab_stats", [])

    for r in target_ranks:
        row[f"general_coverage_{r}"] = 0

    if vocab_curve:
        curve_sorted = sorted(vocab_curve, key=lambda x: x["rank"])
        ranks = [p["rank"] for p in curve_sorted]
        coverages = [p["coverage"] for p in curve_sorted]

        for tr in target_ranks:
            if tr in ranks:
                idx = ranks.index(tr)
                row[f"general_coverage_{tr}"] = coverages[idx]
            else:
                row[f"general_coverage_{tr}"] = np.interp(
                    tr, ranks, coverages, left=0, right=100
                )

    # Local Vocab Coverage
    local_curve = ep_stats.get("local_vocab_stats", [])
    target_covs = [80, 85, 90, 95, 98]
    for tc in target_covs:
        row[f"local_words_for_{tc}"] = 0

    if local_curve:
        curve_sorted = sorted(local_curve, key=lambda x: x["unique"])
        uniques = [p["unique"] for p in curve_sorted]
        covs = [p["coverage"] for p in curve_sorted]

        for target_c in target_covs:
            for i, c in enumerate(covs):
                if c >= target_c:
                    row[f"local_words_for_{target_c}"] = uniques[i]
                    break
            else:
                if uniques:
                    row[f"local_words_for_{target_c}"] = uniques[-1]

    # Thresholds
    gen_thresh = ep_stats.get("general_vocab_thresholds", {})
    row["general_vocab_for_90"] = gen_thresh.get("90", 0)
    row["general_vocab_for_95"] = gen_thresh.get("95", 0)
    row["general_vocab_for_98"] = gen_thresh.get("98", 0)

    loc_thresh = ep_stats.get("local_vocab_thresholds", {})
    row["local_vocab_for_90"] = loc_thresh.get("90", 0)
    row["local_vocab_for_95"] = loc_thresh.get("95", 0)
    row["local_vocab_for_98"] = loc_thresh.get("98", 0)

    # JLPT & POS Distributions
    total_jlpt = sum(ep_stats.get("jlpt_distribution", {}).values()) or 1
    for k, v in ep_stats.get("jlpt_distribution", {}).items():
        row[f"jlpt_{k}_pct"] = v / total_jlpt

    total_pos = sum(ep_stats.get("pos_distribution", {}).values()) or 1
    for k, v in ep_stats.get("pos_distribution", {}).items():
        row[f"pos_{k}_pct"] = v / total_pos

    # Detailed & Derived
    det = ep_stats.get("detailed_stats", {})
    if det:
        for k, v in det.items():
            row[f"detailed_{k}"] = v

    # Ratios
    total_w = row["total_words_avg"]
    unique_w = row["unique_words_avg"]
    row["type_token_ratio"] = unique_w / total_w if total_w > 0 else 0
    row["hapax_ratio"] = row["unique_words_once_avg"] / unique_w if unique_w > 0 else 0
    row["kanji_density"] = row["unique_kanji_avg"] / unique_w if unique_w > 0 else 0

    return row


def calculate_scaled_difficulty(raw_val: float) -> float:
    """
    Scales the raw ML difficulty to a 0-10 scale using Winsorized scaling.

    Args:
        raw_val (float): The raw output from the XGBoost model.

    Returns:
        float: Scaled difficulty score between 0.0 and 10.0.
    """
    if raw_val is None:
        return 0.0

    if SCALING_CEILING == SCALING_FLOOR:
        return 5.0

    scaled = (raw_val - SCALING_FLOOR) / (SCALING_CEILING - SCALING_FLOOR) * 10
    return max(0.0, min(10.0, scaled))


def main():
    """
    Main execution function.

    1. Downloads/Loads the difficulty model.
    2. Iterates through analyzed stats folders.
    3. Calculates difficulty for episodes missing the 'ml_difficulty' field.
    4. Updates the JSON files in place.
    """
    print("=" * 70)
    print(" Anime Difficulty Enrichment ".center(70))
    print("=" * 70)

    # Download model from Hugging Face
    try:
        model_path = download_model_from_hf(HF_REPO_ID, HF_FILENAME)
    except Exception as e:
        print(f"\n✗ Failed to download model. Exiting.")
        return

    # Load model
    print("\n⚙ Loading model...")
    try:
        with open(model_path, "rb") as f:
            regressor = pickle.load(f)
        print("✓ Model loaded successfully")
    except Exception as e:
        print(f"✗ Error loading model: {e}")
        return

    # Pre-load embedding model once
    if not hasattr(regressor, "embedding_model") or regressor.embedding_model is None:
        print("⚙ Loading embedding model...")
        regressor.embedding_model = SentenceTransformer(regressor.embedding_model_name)
        print("✓ Embedding model loaded")

    if not os.path.exists(STATS_DIR):
        print(f"✗ Stats directory not found: {STATS_DIR}")
        return

    folders = sorted(os.listdir(STATS_DIR))
    print(f"\n⚙ Processing {len(folders)} anime series...")

    processed_count = 0
    skipped_count = 0
    error_count = 0

    for folder in tqdm(folders, desc="Processing"):
        folder_path = os.path.join(STATS_DIR, folder)
        if not os.path.isdir(folder_path):
            continue

        # Load Metadata
        meta_path = os.path.join(folder_path, "metadata.json")
        if not os.path.exists(meta_path):
            skipped_count += 1
            continue

        with open(meta_path, "r", encoding="utf-8") as f:
            metadata = json.load(f)

        # Process Episodes
        ep_files = sorted(
            [
                f
                for f in os.listdir(folder_path)
                if f.endswith(".json") and f != "metadata.json"
            ]
        )

        for ep_file in ep_files:
            ep_path = os.path.join(folder_path, ep_file)

            try:
                with open(ep_path, "r", encoding="utf-8") as f:
                    ep_data = json.load(f)
            except Exception as e:
                tqdm.write(f"[Warning] Corrupt file: {folder}/{ep_file}")
                error_count += 1
                continue

            # Skip if already calculated
            has_raw = "raw_ml_difficulty" in ep_data
            has_scaled = "ml_difficulty" in ep_data

            if has_raw and has_scaled:
                continue

            try:
                if not has_raw:
                    # Transform JSON to Model Input Format
                    row_dict = json_to_dataframe_row(ep_data, metadata)
                    df_single = pd.DataFrame([row_dict])

                    # Preprocess (Vectorize)
                    X_input = regressor.preprocess_features(df_single)

                    # Predict
                    prediction = regressor.model.predict(X_input)[0]

                    # Update JSON
                    ep_data["raw_ml_difficulty"] = round(float(prediction), 2)
                    processed_count += 1

                # Calculate Scaled Difficulty
                raw_val = ep_data["raw_ml_difficulty"]
                ep_data["ml_difficulty"] = round(
                    calculate_scaled_difficulty(raw_val), 1
                )

                # Save back
                with open(ep_path, "w", encoding="utf-8") as f:
                    json.dump(ep_data, f, ensure_ascii=False, indent=2)

            except Exception as e:
                tqdm.write(f"[Error] {folder}/{ep_file}: {e}")
                error_count += 1

    print("\n" + "=" * 70)
    print(" PROCESSING COMPLETE ".center(70))
    print("=" * 70)
    print(f"✓ Episodes processed: {processed_count}")
    print(f"⊘ Folders skipped: {skipped_count}")
    print(f"✗ Errors encountered: {error_count}")
    print("=" * 70)


if __name__ == "__main__":
    main()
