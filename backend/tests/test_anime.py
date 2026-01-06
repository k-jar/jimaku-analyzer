from fastapi.testclient import TestClient
from sqlmodel import Session


def test_get_anime_list(client: TestClient, seeded_session: Session):
    """Test listing anime in the gallery with default sorting."""
    response = client.get("/anime/")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["title_jp"] == "テストアニメ"
    assert data[0]["jr_difficulty"] == 3.5


def test_search_anime(client: TestClient, seeded_session: Session):
    """Test searching for anime by title."""
    # Match
    res = client.get("/anime/?search=Test")
    assert len(res.json()) == 1

    # No Match
    res = client.get("/anime/?search=Naruto")
    assert len(res.json()) == 0


def test_get_anime_detail(client: TestClient, seeded_session: Session):
    """Test fetching series detail including episode list."""
    # Assuming ID 1 exists from seeded_session
    response = client.get("/anime/1")
    assert response.status_code == 200
    data = response.json()

    assert "series" in data
    assert "episodes" in data
    assert len(data["episodes"]) == 1
    assert data["episodes"][0]["cpm"] == 250.0


def test_episode_analysis(client: TestClient, seeded_session: Session):
    """Test fetching full linguistic analysis for a specific episode."""
    # Assuming Episode ID 1 exists
    response = client.get("/anime/episode/1/analysis")
    assert response.status_code == 200
    data = response.json()

    assert "stats" in data
    assert "vocab_list" in data

    # Check if vocab list contains "猫" (seeded in freq_map)
    vocab_list = data["vocab_list"]
    assert len(vocab_list) == 1
    assert vocab_list[0]["word"] == "猫"
    assert vocab_list[0]["count_in_episode"] == 5

    # Check if stats contain new metrics
    assert data["stats"]["cpm"] == 250.0


def test_series_analysis(client: TestClient, seeded_session: Session):
    """Test fetching aggregated linguistic analysis for an entire series."""
    # Note that frequency map is not populated, but this wont error
    response = client.get("/anime/1/analysis")
    assert response.status_code == 200
    data = response.json()
    assert "vocab_list" in data


def test_anime_library_and_status_flow(client: TestClient, seeded_session: Session):
    """Test the user library flow: set status, filter library, remove status."""
    # Register & Login
    client.post("/auth/register", json={"username": "lib_user", "password": "pw"})
    token = client.post(
        "/auth/token", data={"username": "lib_user", "password": "pw"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Set Status
    # Series 1 exists from seeded_session
    res = client.post("/anime/1/status", json={"status": "watching"}, headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "watching"

    # 2. Get Status
    res = client.get("/anime/1/status", headers=headers)
    assert res.json()["status"] == "watching"

    # 3. Get Library (All)
    res = client.get("/anime/library", headers=headers)
    assert len(res.json()) == 1
    assert res.json()[0]["user_status"] == "watching"

    # 4. Filter Library (Saved Only)
    res = client.get("/anime/library?filter_mode=saved_only", headers=headers)
    assert len(res.json()) == 1

    # 5. Filter Library (Exclude Saved)
    res = client.get("/anime/library?filter_mode=exclude_saved", headers=headers)
    assert len(res.json()) == 0

    # 6. Remove Status
    res = client.post("/anime/1/status", json={"status": ""}, headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] is None

    # 7. Verify Library Empty
    res = client.get("/anime/library?filter_mode=saved_only", headers=headers)
    assert len(res.json()) == 0


def test_anime_list_advanced_filters(client: TestClient, seeded_session: Session):
    """Test search, sorting, and score filtering."""
    # Search
    res = client.get("/anime/?search=Test")
    assert len(res.json()) == 1

    res = client.get("/anime/?search=Invalid")
    assert len(res.json()) == 0

    # Score Filter (Seeded has difficulty 3.5)
    res = client.get("/anime/?min_score=3.0&max_score=4.0")
    assert len(res.json()) == 1

    res = client.get("/anime/?min_score=4.0")
    assert len(res.json()) == 0

    # Sorting (Just ensure it doesn't crash, hard to test order with 1 item)
    res = client.get("/anime/?sort=difficulty&order=desc")
    assert res.status_code == 200


def test_anime_endpoints_404(client: TestClient, seeded_session: Session):
    """Test 404 responses for non-existent resources."""
    assert client.get("/anime/999").status_code == 404
    assert client.get("/anime/999/analysis").status_code == 404
    assert client.get("/anime/episode/999/analysis").status_code == 404


def test_user_stats_in_analysis(client: TestClient, seeded_session: Session):
    """Test that user stats are calculated when a user is logged in."""
    # Register & Login
    client.post("/auth/register", json={"username": "stat_user", "password": "pw"})
    token = client.post(
        "/auth/token", data={"username": "stat_user", "password": "pw"}
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Save "猫" (which is in the anime freq map in seeded_session)
    client.post("/words/save", json={"word": "猫"}, headers=headers)

    # Get Series Analysis
    res = client.get("/anime/1/analysis", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["user_stats"] is not None
    # "猫" is the only word in the freq map in seeded_session
    assert data["user_stats"]["known_unique_count"] == 1
    assert data["user_stats"]["known_unique_pct"] == 100.0
