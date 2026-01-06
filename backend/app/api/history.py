from typing import List, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.models import User, AnalysisHistory, UserVocabLink
from app.core.security import get_current_user

router = APIRouter(prefix="/history", tags=["History"])


@router.get("/me")
def get_my_history(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> List[AnalysisHistory]:
    """Retrieves the analysis history for the current user.

    Args:
        user (User): The current authenticated user.
        session (Session): The database session.

    Returns:
        List[AnalysisHistory]: A list of analysis history entries ordered by creation date.
    """
    statement = (
        select(AnalysisHistory)
        .where(AnalysisHistory.user_id == user.id)
        .order_by(AnalysisHistory.created_at.desc())
    )
    results = session.exec(statement).all()
    return results


@router.delete("/{id}")
def delete_history(
    id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Dict[str, str]:
    """Deletes a specific history entry and unlinks associated vocabulary.

    Args:
        id (int): The ID of the history entry to delete.
        user (User): The current authenticated user.
        session (Session): The database session.

    Returns:
        Dict[str, str]: A confirmation message.

    Raises:
        HTTPException: If the entry is not found or does not belong to the user.
    """
    entry = session.get(AnalysisHistory, id)
    if not entry or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Entry not found")

    linked_words = session.exec(
        select(UserVocabLink).where(UserVocabLink.source_history_id == id)
    ).all()

    for link in linked_words:
        link.source_history_id = None
        session.add(link)

    session.delete(entry)
    session.commit()
    return {"message": "Deleted"}


@router.get("/{id}")
def get_history_detail(
    id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AnalysisHistory:
    """Retrieves details for a specific history entry.

    Args:
        id (int): The ID of the history entry.
        user (User): The current authenticated user.
        session (Session): The database session.

    Returns:
        AnalysisHistory: The requested history entry.

    Raises:
        HTTPException: If the entry is not found or does not belong to the user.
    """
    entry = session.get(AnalysisHistory, id)
    if not entry or entry.user_id != user.id:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry
