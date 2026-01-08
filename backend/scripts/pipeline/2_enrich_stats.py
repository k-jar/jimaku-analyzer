import os
import sys
import argparse
import json
import pickle
import numpy as np
import pandas as pd
from tqdm import tqdm
from sentence_transformers import SentenceTransformer
from spacy.lang.ja.stop_words import STOP_WORDS as JA_STOP_WORDS
from huggingface_hub import hf_hub_download

# Project paths
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, PROJECT_ROOT)

DATA_DIR = os.path.join(PROJECT_ROOT, "data")
STATS_DIR = os.path.join(DATA_DIR, "analyzed_stats")
LOCAL_MODEL_CACHE = os.path.join(os.path.dirname(__file__), ".model_cache")

# Configuration
HF_REPO_ID = "kjar/anime-difficulty"
HF_FILENAME = "anime_difficulty_model.pkl"
SCALING_FLOOR = 22.0
SCALING_CEILING = 33.0


def download_model(repo_id: str, filename: str, cache_dir: str = LOCAL_MODEL_CACHE) -> str:
    """Downloads model artifacts from Hugging Face.

    Args:
        repo_id: Hugging Face repository ID (e.g., "username/model-name")
        filename: Model filename in the repository
        cache_dir: Local directory to cache the model

    Returns:
        str: The local file path to the downloaded model.
    """
    print(f"Downloading {filename} from {repo_id}...")
    return hf_hub_download(
        repo_id=repo_id,
        filename=filename,
        cache_dir=cache_dir,
        resume_download=True,
    )


def get_lexical_signature(freq_map: dict, top_n: int = 200) -> str:
    """Extracts top N non-stopword content words from a frequency map.

    Args:
        freq_map (dict): A dictionary mapping words to their frequency counts.
        top_n (int, optional): The number of top words to extract. Defaults to 200.

    Returns:
        str: A space-separated string of the most frequent words.
    """
    if not freq_map:
        return ""

    clean_map = {}
    for word, count in freq_map.items():
        if word in JA_STOP_WORDS: continue
        if len(word) == 1 and 0x3040 <= ord(word) <= 0x309F: continue
        if word in {"、", "。", "！", "？", "「", "」"}: continue
        clean_map[word] = count

    sorted_words = sorted(clean_map.items(), key=lambda x: x[1], reverse=True)
    return " ".join([w[0] for w in sorted_words[:top_n]])


def json_to_features(ep_stats: dict, metadata: dict) -> dict:
    """Maps raw JSON statistics to the flat dictionary schema required by the model.

    Args:
        ep_stats (dict): The statistics dictionary for a specific episode.
        metadata (dict): The metadata dictionary for the anime series.

    Returns:
        dict: A flat dictionary containing features ready for preprocessing.
    """
    row = {
        "title": metadata.get("title_jp", ""),
        "description": metadata.get("description", ""),
        "lexical_signature": get_lexical_signature(ep_stats.get("frequency_map", {})),
        "cpm": ep_stats.get("cpm", 0),
        "jr_difficulty": ep_stats.get("jr_difficulty", 0),
        "unique_words": ep_stats.get("unique_words", 0),
        "unique_kanji": ep_stats.get("unique_kanji", 0),
        "total_words": ep_stats.get("total_words", 0),
    }

    # Derived density metrics
    total = row["total_words"]
    unique = row["unique_words"]
    row["type_token_ratio"] = unique / total if total > 0 else 0
    row["kanji_density"] = row["unique_kanji"] / unique if unique > 0 else 0

    # General Vocab Coverage (Linear Interpolation)
    target_ranks = [1000, 2000, 5000, 10000]
    vocab_curve = ep_stats.get("general_vocab_stats", [])
    if vocab_curve:
        curve = sorted(vocab_curve, key=lambda x: x["rank"])
        ranks = [p["rank"] for p in curve]
        covs = [p["coverage"] for p in curve]
        for tr in target_ranks:
            row[f"general_coverage_{tr}"] = np.interp(tr, ranks, covs, left=0, right=100)
    else:
        for tr in target_ranks: row[f"general_coverage_{tr}"] = 0

    # Local Vocab Coverage (Inverse Interpolation)
    target_covs = [80, 85, 90, 95, 98]
    local_curve = ep_stats.get("local_vocab_stats", [])
    if local_curve:
        curve = sorted(local_curve, key=lambda x: x["unique"])
        uniques = [p["unique"] for p in curve]
        covs = [p["coverage"] for p in curve]
        for tc in target_covs:
            if max(covs) >= tc:
                row[f"local_words_for_{tc}"] = np.interp(tc, covs, uniques)
            else:
                row[f"local_words_for_{tc}"] = uniques[-1]
    else:
        for tc in target_covs: row[f"local_words_for_{tc}"] = 0

    # Thresholds
    for pct in ['90', '95', '98']:
        row[f"general_vocab_for_{pct}"] = ep_stats.get("general_vocab_thresholds", {}).get(pct, 0)
        row[f"local_vocab_for_{pct}"] = ep_stats.get("local_vocab_thresholds", {}).get(pct, 0)

    # Distributions
    total_jlpt = sum(ep_stats.get("jlpt_distribution", {}).values()) or 1
    for k, v in ep_stats.get("jlpt_distribution", {}).items():
        row[f"jlpt_{k}_pct"] = v / total_jlpt

    total_pos = sum(ep_stats.get("pos_distribution", {}).values()) or 1
    for k, v in ep_stats.get("pos_distribution", {}).items():
        row[f"pos_{k}_pct"] = v / total_pos

    return row


def scale_difficulty(raw_val: float) -> float:
    """Applies MinMax scaling to the raw model output to fit a 0-10 scale.

    Args:
        raw_val (float): The raw output from the XGBoost model.

    Returns:
        float: The scaled difficulty score (0.0 to 10.0).
    """
    if raw_val is None: return 0.0
    scaled = (raw_val - SCALING_FLOOR) / (SCALING_CEILING - SCALING_FLOOR) * 10
    return max(0.0, min(10.0, scaled))


class InferencePipeline:
    """Wrapper for model inference.

    Handles loading artifacts, text encoding, scaling, and PCA transformation.
    """

    def __init__(self, artifacts: dict):
        """Initializes the pipeline with loaded artifacts.

        Args:
            artifacts (dict): Dictionary containing 'model', 'scaler', 'pca', 
                and 'feature_cols'.
        """
        self.model = artifacts['model']
        self.scaler = artifacts['scaler']
        self.pca = artifacts['pca']
        self.feature_cols = artifacts['feature_cols']
        
        print("Initializing SentenceTransformer...")
        self.encoder = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

    def predict(self, row_data: dict) -> float:
        """Predicts the difficulty score for a single row of data.

        Args:
            row_data (dict): Feature dictionary generated by `json_to_features`.

        Returns:
            float: The raw difficulty prediction from the model.
        """
        # 1. Align features
        df = pd.DataFrame([row_data])
        for col in self.feature_cols:
            if col not in df.columns: df[col] = 0.0
        
        # 2. Scale numeric features
        X_num = self.scaler.transform(df[self.feature_cols].values)
        
        # 3. Encode and reduce text features
        desc = str(row_data.get('description', ''))
        subs = str(row_data.get('lexical_signature', ''))
        
        emb_desc = self.encoder.encode([desc], show_progress_bar=False)
        emb_subs = self.encoder.encode([subs], show_progress_bar=False)
        
        X_text_pca = self.pca.transform(np.hstack((emb_desc, emb_subs)))
        
        # 4. Concatenate and predict
        X_final = np.hstack((X_num, X_text_pca))
        return self.model.predict(X_final)[0]


def main():
    """Main execution function to process all statistics files."""
    parser = argparse.ArgumentParser(description="Enrich stats with ML difficulty scores")
    parser.add_argument("--force", action="store_true", help="Overwrite existing ML scores")
    args = parser.parse_args()

    print("Starting Anime Difficulty Enrichment...")

    # Load artifacts
    try:
        model_path = download_model(HF_REPO_ID, HF_FILENAME)
        with open(model_path, "rb") as f:
            artifacts = pickle.load(f)
        pipeline = InferencePipeline(artifacts)
    except Exception as e:
        print(f"Error loading model: {e}")
        return

    if not os.path.exists(STATS_DIR):
        print(f"Directory not found: {STATS_DIR}")
        return

    # Process files
    folders = sorted(os.listdir(STATS_DIR))
    processed_cnt = 0
    error_cnt = 0

    for folder in tqdm(folders, desc="Processing Series"):
        folder_path = os.path.join(STATS_DIR, folder)
        if not os.path.isdir(folder_path): continue

        meta_path = os.path.join(folder_path, "metadata.json")
        if not os.path.exists(meta_path): continue

        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)
        except: continue

        ep_files = sorted([f for f in os.listdir(folder_path) if f.endswith(".json") and f != "metadata.json"])

        for ep_file in ep_files:
            ep_path = os.path.join(folder_path, ep_file)

            try:
                with open(ep_path, "r", encoding="utf-8") as f:
                    ep_data = json.load(f)

                # Skip if already processed
                if not args.force and "raw_ml_difficulty" in ep_data and "ml_difficulty" in ep_data:
                    continue

                # Predict
                feats = json_to_features(ep_data, metadata)
                raw_pred = pipeline.predict(feats)
                
                # Update JSON
                ep_data["raw_ml_difficulty"] = round(float(raw_pred), 2)
                ep_data["ml_difficulty"] = round(scale_difficulty(ep_data["raw_ml_difficulty"]), 1)

                with open(ep_path, "w", encoding="utf-8") as f:
                    json.dump(ep_data, f, ensure_ascii=False, indent=2)
                
                processed_cnt += 1

            except Exception:
                error_cnt += 1

    print(f"Done. Processed: {processed_cnt}, Errors: {error_cnt}")

if __name__ == "__main__":
    main()