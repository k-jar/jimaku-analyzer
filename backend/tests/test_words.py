from fastapi.testclient import TestClient
from sqlmodel import Session
from unittest.mock import patch


def get_auth_headers(client: TestClient, username="test_user"):
    """Helper to register, login, and get headers."""
    client.post("/auth/register", json={"username": username, "password": "password"})
    response = client.post(
        "/auth/token", data={"username": username, "password": "password"}
    )
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_bulk_save_and_remove(client: TestClient, seeded_session: Session):
    """Test bulk saving and removing words, including deduplication."""
    headers = get_auth_headers(client)

    # Bulk Save
    # "猫" exists in seeded_session, "犬" and "鳥" are new
    payload = {"words": ["猫", "犬", "鳥"]}
    response = client.post("/words/save/bulk", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["saved_count"] == 3

    # Verify list
    res = client.get("/words/list", headers=headers)
    saved_words = res.json()
    assert set(saved_words) == {"猫", "犬", "鳥"}

    # Bulk Remove
    remove_payload = {"words": ["犬", "鳥"]}
    response = client.post("/words/remove/bulk", json=remove_payload, headers=headers)
    assert response.status_code == 200
    assert "Removed 2 words" in response.json()["message"]

    # Verify list again
    res = client.get("/words/list", headers=headers)
    saved_words = res.json()
    assert "犬" not in saved_words
    assert "猫" in saved_words

    # Empty bulk save
    res = client.post("/words/save/bulk", json={"words": []}, headers=headers)
    assert res.json()["saved_count"] == 0


def test_save_word_logic(client: TestClient, seeded_session: Session):
    """Test saving a single word, including creation of new Vocab entries."""
    headers = get_auth_headers(client, username="logic_user")

    # Save new word (creates Vocab)
    res = client.post("/words/save", json={"word": "NewWord"}, headers=headers)
    assert res.status_code == 200

    # Save duplicate (should handle gracefully)
    res = client.post("/words/save", json={"word": "NewWord"}, headers=headers)
    assert res.status_code == 200
    assert "already in your list" in res.json()["message"]


def test_remove_single_word_errors(client: TestClient, seeded_session: Session):
    """Test error handling for removing words."""
    headers = get_auth_headers(client, username="error_user")

    # Try to remove word not in list
    # First ensure it exists in dictionary but not user list
    client.post("/words/save", json={"word": "SavedWord"}, headers=headers)
    client.request(
        "DELETE", "/words/remove", json={"word": "SavedWord"}, headers=headers
    )

    # Now try removing again (it's gone from user list)
    res = client.request(
        "DELETE", "/words/remove", json={"word": "SavedWord"}, headers=headers
    )
    assert res.status_code == 400

    # Try removing word that doesn't exist in DB at all
    res = client.request(
        "DELETE", "/words/remove", json={"word": "NonExistent"}, headers=headers
    )
    assert res.status_code == 404


def test_dictionary_search_and_filter(client: TestClient, seeded_session: Session):
    """Test the dictionary endpoint with search and filters."""
    # "猫" is level 5, freq 1000 in seeded_session

    # Search
    res = client.get("/words/dictionary?search=猫")
    assert res.status_code == 200
    assert len(res.json()["items"]) == 1

    # Filter Level
    res = client.get("/words/dictionary?level=5")
    assert len(res.json()["items"]) >= 1

    # Filter Level (Empty result)
    res = client.get("/words/dictionary?level=1")
    assert len(res.json()["items"]) == 0

    # Filter Freq
    res = client.get("/words/dictionary?min_freq=900&max_freq=1100")
    assert len(res.json()["items"]) >= 1


def test_example_sentences(client: TestClient):
    """Test fetching example sentences with mocked external API."""
    with patch("requests.get") as mock_get:
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            "results": [
                {"text": "吾輩は猫である", "translations": [[{"text": "I am a cat"}]]}
            ]
        }

        res = client.get("/words/examples?word=猫")
        assert res.status_code == 200
        data = res.json()
        assert len(data["sentences"]) == 1
        assert data["sentences"][0]["jp"] == "吾輩は猫である"
        assert data["sentences"][0]["en"] == "I am a cat"
