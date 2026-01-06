from fastapi.testclient import TestClient
from sqlmodel import Session
from app.models.models import Vocab
from unittest.mock import patch, MagicMock


def test_read_root(client: TestClient):
    """Test that the API is alive."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "API is ready", "docs": "/docs"}


def test_analyze_text(client: TestClient, seeded_session: Session):
    """Test the NLP Engine's basic functionality.

    Uses 'seeded_session' to ensure '猫' exists in the DB and is correctly enriched.
    """
    payload = {"text": "猫は食べている"}
    response = client.post("/analyze", json=payload)

    assert response.status_code == 200
    data = response.json()

    assert "results" in data
    tokens = data["results"]
    assert len(tokens) > 0

    # Check that it found the word
    # Look for the token corresponding to "猫"
    neko_token = next((t for t in tokens if t["base"] == "猫"), None)
    assert neko_token is not None
    assert neko_token["level"] == 5
    assert neko_token["reading"] == "ねこ"


def test_full_user_flow(client: TestClient, seeded_session: Session):
    """Tests the complete user lifecycle for vocabulary management.

    Flow: Register -> Login -> Save Word -> View Word -> Delete Word.
    """
    # Register
    reg_payload = {"username": "test_user", "password": "password123"}
    response = client.post("/auth/register", json=reg_payload)
    assert response.status_code == 201

    # Login
    login_payload = {"username": "test_user", "password": "password123"}
    response = client.post("/auth/token", data=login_payload)
    assert response.status_code == 200
    token = response.json()["access_token"]

    # Header for protected routes
    headers = {"Authorization": f"Bearer {token}"}

    # Save word
    save_payload = {"word": "猫"}
    response = client.post("/words/save", json=save_payload, headers=headers)
    assert response.status_code == 200
    assert "Saved" in response.json()["message"]

    # Verify it is in the list
    response = client.get("/words/me", headers=headers)
    assert response.status_code == 200
    saved_list = response.json()["saved_words"]
    assert len(saved_list) == 1
    assert saved_list[0]["word"] == "猫"

    # Delete word
    del_payload = {"word": "猫"}
    response = client.request(
        "DELETE", "/words/remove", json=del_payload, headers=headers
    )
    assert response.status_code == 200
    assert "removed" in response.json()["message"]

    # Verify list is empty
    response = client.get("/words/me", headers=headers)
    saved_list = response.json()["saved_words"]
    assert len(saved_list) == 0


def test_analyze_text_structure(client: TestClient, seeded_session: Session):
    """Test that the analyze endpoint returns the correct JSON schema structure."""
    payload = {"text": "猫は食べている"}
    response = client.post("/analyze", json=payload)

    assert response.status_code == 200
    data = response.json()

    # Check Results
    assert "results" in data
    assert "stats" in data

    tokens = data["results"]
    neko = next((t for t in tokens if t["base"] == "猫"), None)

    # Check new fields
    assert neko["level"] == 5
    assert neko["frequency"] == 1000
    assert "alternatives" in neko

    # Check Stats
    stats = data["stats"]
    assert "total_words" in stats
    assert "pos_distribution" in stats
    # Check that Nouns > 0 (since "猫" is a noun)
    assert stats["pos_distribution"]["Nouns"] > 0

    assert "general_vocab_stats" in stats
    assert isinstance(stats["general_vocab_stats"], list)
    assert "general_vocab_thresholds" in stats

    assert "local_vocab_stats" in stats
    assert isinstance(stats["local_vocab_stats"], list)
    assert "local_vocab_thresholds" in stats

    assert "jr_difficulty" in stats
    assert isinstance(stats["jr_difficulty"], (int, float))


def test_search_and_filter(client: TestClient, seeded_session: Session):
    """Test the Saved Words API search and filter parameters."""
    # Setup User
    client.post(
        "/auth/register", json={"username": "searcher", "password": "password123"}
    )
    token = client.post(
        "/auth/token", data={"username": "searcher", "password": "password123"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Save "猫"
    client.post("/words/save", json={"word": "猫", "sentence": "ctx"}, headers=headers)

    # Test Search (Should find "猫")
    res = client.get("/words/me?search=cat", headers=headers)  # Search by meaning "cat"
    assert len(res.json()["saved_words"]) == 1
    assert res.json()["saved_words"][0]["word"] == "猫"

    # Test Filter (N5)
    res = client.get("/words/me?level=5", headers=headers)
    assert len(res.json()["saved_words"]) == 1

    # Test Filter (N1 should be empty)
    res = client.get("/words/me?level=1", headers=headers)
    assert len(res.json()["saved_words"]) == 0


def test_context_saving(client: TestClient, seeded_session: Session):
    """Test that context sentences are correctly saved and retrieved with vocabulary."""
    # Setup
    client.post(
        "/auth/register", json={"username": "ctx_user", "password": "password123"}
    )
    token = client.post(
        "/auth/token", data={"username": "ctx_user", "password": "password123"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Save with context
    context = "This is a test sentence."
    client.post(
        "/words/save", json={"word": "猫", "sentence": context}, headers=headers
    )

    # Verify
    res = client.get("/words/me", headers=headers)
    item = res.json()["saved_words"][0]
    assert item["context"] == context
    assert "created_at" in item


def test_history_flow(client: TestClient, seeded_session: Session):
    """Test the full History lifecycle and its relationship with vocabulary.

    Flow: Analyze (Save History) -> Save Word (Link History) -> Delete History (Unlink Word).
    """
    # Setup User
    client.post("/auth/register", json={"username": "hist_user", "password": "pw"})
    token = client.post(
        "/auth/token", data={"username": "hist_user", "password": "pw"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Analyze Text (Should Create History)
    text = "猫が好きです。"
    res = client.post("/analyze", json={"text": text}, headers=headers)
    assert res.status_code == 200
    data = res.json()
    history_id = data.get("history_id")
    assert history_id is not None

    # Save Word linked to History
    # "猫" exists in DB because of seeded_session
    save_payload = {
        "word": "猫",
        "sentence": "Context sentence",
        "history_id": history_id,
    }
    client.post("/words/save", json=save_payload, headers=headers)

    # Verify Link Exists
    res = client.get("/words/me", headers=headers)
    saved_item = res.json()["saved_words"][0]
    assert saved_item["source_history_id"] == history_id

    # Verify History Listing
    res = client.get("/history/me", headers=headers)
    assert len(res.json()) == 1
    assert res.json()[0]["full_text"] == text

    # Delete History
    res = client.delete(f"/history/{history_id}", headers=headers)
    assert res.status_code == 200

    # Verify word still exists but is unlinked
    res = client.get("/words/me", headers=headers)
    saved_item = res.json()["saved_words"][0]
    assert saved_item["word"] == "猫"
    assert saved_item["source_history_id"] is None


def test_effective_frequency_logic(client: TestClient, seeded_session: Session):
    """Test that a word with Rare Kanji but Common Kana is treated as Common.

    Ensures the analyzer picks the better frequency rank for statistics."""
    # Seed a word with rare kanji but common kana form.
    # "さて" (sate): Approx Kanji freq 135000 (Rare), Kana freq 600 (Common)

    vocab_item = Vocab(
        word="儲",
        level=1,
        reading="さて",
        meanings=["well", "now"],
        frequency_rank=135000,
        kana_frequency_rank=500,
    )
    seeded_session.add(vocab_item)
    seeded_session.commit()

    # Analyze text containing this word
    payload = {"text": "さて"}
    res = client.post("/analyze", json=payload)
    data = res.json()

    # Verify API returns both frequencies
    token = data["results"][0]
    assert token["base"] == "儲"
    assert token["frequency"] == 135000
    assert token["kana_freq"] == 500

    # Verify Stats use the BETTER frequency (500)
    stats = data["stats"]

    # Check general vocab stats
    curve = stats["general_vocab_stats"]
    point_1k = next((p for p in curve if p["rank"] == 1000), None)

    assert point_1k is not None
    # Since there is only 1 word, coverage should be 100% if logic worked
    # If logic failed (used 135000), coverage would be 0% at rank 1000.
    assert point_1k["coverage"] == 100.0


def test_analyze_freq_only_word(client: TestClient, seeded_session: Session):
    """Test analysis of words that exist in frequency lists but lack dictionary definitions.

    Ensures the system doesn't crash and returns available frequency data.
    """
    # Seed a mock vocabulary item that has frequency but no meanings

    freq_only_item = Vocab(
        word="ボキャブラリー",
        reading="ぼきゃぶらりー",
        meanings=[],  # This is the key part: no meanings from JMDict
        level=None,
        frequency_rank=40000,
        kana_frequency_rank=40000,
    )
    seeded_session.add(freq_only_item)
    seeded_session.commit()

    # Analyze text containing this word
    payload = {"text": "新しいボキャブラリー"}
    response = client.post("/analyze", json=payload)
    assert response.status_code == 200
    data = response.json()

    # Verify the token has frequency data but its vocab entry has no meanings.
    token = next((t for t in data["results"] if t["base"] == "ボキャブラリー"), None)
    assert token is not None
    assert token["frequency"] == 40000
    assert token["meanings"] == []


def test_ocr_endpoint_missing_creds(client: TestClient):
    """Test OCR endpoint when server credentials are not configured."""
    with patch("app.main.get_vision_credentials", return_value=None):
        # File upload
        files = {"file": ("test.jpg", b"fake content", "image/jpeg")}
        response = client.post("/ocr", files=files)
        assert response.status_code == 500
        assert response.json()["detail"] == "Server OCR configuration missing"


def test_ocr_endpoint_success(client: TestClient):
    """Test successful OCR processing."""
    mock_creds = MagicMock()
    with patch("app.main.get_vision_credentials", return_value=mock_creds):
        with patch("google.cloud.vision.ImageAnnotatorClient") as MockClient:
            mock_instance = MockClient.return_value

            # Mock response
            mock_response = MagicMock()
            mock_annotation = MagicMock()
            mock_annotation.description = "Detected Text"
            mock_response.text_annotations = [mock_annotation]

            mock_instance.text_detection.return_value = mock_response

            files = {"file": ("test.jpg", b"fake content", "image/jpeg")}
            response = client.post("/ocr", files=files)

            assert response.status_code == 200
            assert response.json() == {"text": "Detected Text"}


def test_ocr_endpoint_empty_result(client: TestClient):
    """Test OCR endpoint when no text is detected."""
    mock_creds = MagicMock()
    with patch("app.main.get_vision_credentials", return_value=mock_creds):
        with patch("google.cloud.vision.ImageAnnotatorClient") as MockClient:
            mock_instance = MockClient.return_value

            # Mock empty response
            mock_response = MagicMock()
            mock_response.text_annotations = []
            mock_instance.text_detection.return_value = mock_response

            files = {"file": ("test.jpg", b"fake content", "image/jpeg")}
            response = client.post("/ocr", files=files)

            assert response.status_code == 200
            assert response.json() == {"text": ""}


def test_ocr_endpoint_error(client: TestClient):
    """Test OCR endpoint when Google API raises an exception."""
    with patch("app.main.get_vision_credentials", return_value=MagicMock()):
        with patch("google.cloud.vision.ImageAnnotatorClient") as MockClient:
            MockClient.return_value.text_detection.side_effect = Exception(
                "Google API Error"
            )

            files = {"file": ("test.jpg", b"fake content", "image/jpeg")}
            response = client.post("/ocr", files=files)

            assert response.status_code == 500
            assert response.json()["detail"] == "Failed to process image"
