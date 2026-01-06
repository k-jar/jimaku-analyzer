import os
import json
import base64
from unittest.mock import patch, MagicMock
from app.services.analyzer_service import Analyzer
from app.core.gcp import get_vision_credentials

# --- Analyzer Tests ---


def test_analyzer_initialization():
    """Test that the analyzer initializes the tokenizer."""
    analyzer = Analyzer()
    assert analyzer.tokenizer_obj is not None


def test_analyzer_ass_drawing_detection():
    """Test detection of ASS subtitle drawing commands."""
    analyzer = Analyzer()
    # Valid drawing commands
    assert analyzer._is_ass_drawing("m 0 0 l 100 100") is True
    assert analyzer._is_ass_drawing("b 10 10 20 20 30 30") is True
    # Text containing drawing-like chars but is Japanese
    assert analyzer._is_ass_drawing("これは m 0 0 ではない") is False
    # Plain text
    assert analyzer._is_ass_drawing("Hello World") is False


def test_analyzer_chunking_and_filtering():
    """Test text chunking for large inputs and ASS filtering."""
    analyzer = Analyzer()

    # Test ASS filtering in get_tokens
    text_with_ass = "こんにちは\nm 0 0 l 10 10\n世界"
    tokens = analyzer.get_tokens(text_with_ass)
    surfaces = [t["surface"] for t in tokens]
    assert "こんにちは" in surfaces
    assert "世界" in surfaces
    assert "m" not in surfaces  # Should be filtered out

    # Test Large Text Chunking
    # Create text larger than MAX_BYTES (40000)
    # "あ" is 3 bytes. 15000 chars * 3 = 45000 bytes.
    long_text = "あ" * 15000
    tokens = analyzer.get_tokens(long_text)
    assert len(tokens) > 0
    assert tokens[0]["surface"].startswith("あ")

    # Test Empty/Whitespace
    assert analyzer.get_tokens("") == []
    assert analyzer.get_tokens("   ") == []


def test_analyzer_error_handling():
    """Test that analyzer returns empty list on internal error."""
    analyzer = Analyzer()
    # Mock tokenizer to raise exception
    analyzer.tokenizer_obj = MagicMock()
    analyzer.tokenizer_obj.tokenize.side_effect = Exception("Sudachi Error")

    # Should return empty list on error
    assert analyzer.get_tokens("test") == []


# --- GCP Tests ---


def test_get_vision_credentials():
    """Test credential retrieval from environment variables."""
    # Missing Env Var
    with patch.dict(os.environ, {}, clear=True):
        assert get_vision_credentials() is None

    # Valid Env Var
    fake_creds = {"type": "service_account", "project_id": "test"}
    b64_creds = base64.b64encode(json.dumps(fake_creds).encode()).decode()

    with patch.dict(os.environ, {"GOOGLE_CREDENTIALS_BASE64": b64_creds}):
        with patch(
            "google.oauth2.service_account.Credentials.from_service_account_info"
        ) as mock_from:
            mock_from.return_value = "mock_creds_obj"
            assert get_vision_credentials() == "mock_creds_obj"
            mock_from.assert_called_once_with(fake_creds)
