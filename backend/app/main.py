import gc
from typing import Optional, Dict, Any
from fastapi import FastAPI, Depends, HTTPException, File, UploadFile
from sqlmodel import Session
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.services.analyzer_service import Analyzer
from app.core.database import get_session
from app.crud.crud import enrich_tokens
from app.models.models import AnalysisHistory, User
from app.services.stats_service import calculate_stats
from app.core.security import (
    get_current_user_optional,
)
from typing import Optional
from google.cloud import vision
from app.core.gcp import get_vision_credentials
from dotenv import load_dotenv
from app.api import anime, auth, words, history

load_dotenv()


app = FastAPI(
    title="JP Text Analyzer API",
    description="API for analyzing Japanese text, managing vocabulary, and tracking history.",
    version="1.0.0",
)

origins = [
    "http://localhost:3000",
    "https://jimaku-analyzer.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(anime.router)
app.include_router(auth.router)
app.include_router(words.router)
app.include_router(history.router)

analyzer_service = Analyzer()


class AnalysisRequest(BaseModel):
    """Request model for text analysis."""

    text: str


@app.get("/")
def read_root() -> Dict[str, str]:
    """Root endpoint to check API status.

    Returns:
        Dict[str, str]: Status message and link to docs.
    """
    return {"status": "API is ready", "docs": "/docs"}


@app.post("/analyze")
def analyze_endpoint(
    request: AnalysisRequest,
    session: Session = Depends(get_session),
    user: Optional[User] = Depends(get_current_user_optional),
) -> Dict[str, Any]:
    """Analyzes a block of Japanese text.

    Tokenizes the text, enriches tokens with dictionary data, calculates statistics,
    and optionally saves the analysis to the user's history.

    Args:
        request (AnalysisRequest): The request body containing the text to analyze.
        session (Session): The database session.
        user (Optional[User]): The currently authenticated user (optional).

    Returns:
        Dict[str, Any]: A dictionary containing enriched tokens, statistics, and the history ID.
    """
    raw_tokens = analyzer_service.get_tokens(request.text)

    # Enrich tokens with DB data
    enriched_tokens = enrich_tokens(session, raw_tokens)

    # Calculate aggregate statistics
    stats = calculate_stats(enriched_tokens, full_text=request.text)

    # Force garbage collection to prevent MeCab memory leaks
    gc.collect()

    # Save to history if a user is logged in
    history_id = None
    if user:
        history_entry = AnalysisHistory(
            user_id=user.id, full_text=request.text, stats_snapshot=stats
        )
        session.add(history_entry)
        session.commit()
        session.refresh(history_entry)
        history_id = history_entry.id

    return {"results": enriched_tokens, "stats": stats, "history_id": history_id}


@app.post("/ocr")
async def ocr_endpoint(file: UploadFile = File(...)) -> Dict[str, str]:
    """Performs OCR on an uploaded image using Google Cloud Vision.

    Args:
        file (UploadFile): The image file to process.

    Returns:
        Dict[str, str]: A dictionary containing the extracted text.

    Raises:
        HTTPException: If server configuration is missing or OCR fails.
    """
    credentials = get_vision_credentials()

    if not credentials:
        raise HTTPException(status_code=500, detail="Server OCR configuration missing")

    # Read the image bytes
    content = await file.read()

    # Instantiate Client with credentials
    client = vision.ImageAnnotatorClient(credentials=credentials)
    image = vision.Image(content=content)

    # Call Google API
    try:
        response = client.text_detection(image=image)
        texts = response.text_annotations

        if not texts:
            return {"text": ""}

        # The first annotation contains the full text
        full_text = texts[0].description
        return {"text": full_text}

    except Exception as e:
        print(f"OCR Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process image")
