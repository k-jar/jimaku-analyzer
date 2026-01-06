from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, cast, String, func, or_, delete
from sqlalchemy import desc, asc
from typing import Optional, List, Dict, Any
import requests
import re

from app.core.database import get_session
from app.models.models import User, Vocab, UserVocabLink
from app.core.security import get_current_user, get_current_user_optional
from pydantic import BaseModel

router = APIRouter(prefix="/words", tags=["Words"])


class WordRequest(BaseModel):
    """Schema for single word operations."""

    word: str
    sentence: Optional[str] = None
    history_id: Optional[int] = None


class BulkSaveRequest(BaseModel):
    """Schema for bulk word operations."""

    words: List[str]
    history_id: Optional[int] = None


@router.post("/save")
def save_word(
    request: WordRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Dict[str, str]:
    """Saves a single word to the user's vocabulary list.

    If the word does not exist in the global vocabulary table, it is created.
    Links the word to the user and optionally records the context sentence.

    Args:
        request (WordRequest): The word data to save.
        user (User): The authenticated user.
        session (Session): Database session.

    Returns:
        Dict[str, str]: Confirmation message.
    """
    vocab_item = session.exec(
        select(Vocab)
        .where(Vocab.word == request.word)
        .order_by(Vocab.frequency_rank.asc().nullslast())
    ).first()

    if not vocab_item:
        # Create vocab item if it doesn't exist (for words not in dictionary)
        vocab_item = Vocab(word=request.word)
        session.add(vocab_item)
        session.commit()
        session.refresh(vocab_item)

    if vocab_item in user.saved_words:
        return {"message": "Word already in your list"}

    link = UserVocabLink(
        user_id=user.id,
        vocab_id=vocab_item.id,
        context_sentence=request.sentence,
        source_history_id=request.history_id,
    )
    session.add(link)
    session.commit()

    return {"message": f"Saved {request.word}"}


@router.post("/save/bulk")
def bulk_save_words(
    request: BulkSaveRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    """Bulk saves a list of words to the user's vocabulary list.

    Handles deduplication and creates missing Vocab entries if necessary.

    Args:
        request (BulkSaveRequest): List of words to save.
        user (User): The authenticated user.
        session (Session): Database session.

    Returns:
        Dict[str, Any]: Summary of the operation (count of saved words).
    """
    if not request.words:
        return {"message": "No words to save", "saved_count": 0}

    # Deduplicate input words
    unique_words = list(set(request.words))

    # Get existing Vocab items
    existing_vocabs = session.exec(
        select(Vocab).where(Vocab.word.in_(unique_words))
    ).all()

    vocab_map = {v.word: v for v in existing_vocabs}

    # Create missing Vocab items
    new_vocabs = []
    for word in unique_words:
        if word not in vocab_map:
            # Check if already staged it to avoid duplicates in this transaction
            if word not in [nv.word for nv in new_vocabs]:
                new_vocab = Vocab(word=word)
                new_vocabs.append(new_vocab)

    if new_vocabs:
        session.add_all(new_vocabs)
        session.commit()
        for nv in new_vocabs:
            session.refresh(nv)
            vocab_map[nv.word] = nv

    # Identify IDs to link
    target_vocab_ids = list({vocab_map[w].id for w in unique_words if w in vocab_map})

    # Find existing links to avoid duplicates
    existing_links = session.exec(
        select(UserVocabLink)
        .where(UserVocabLink.user_id == user.id)
        .where(UserVocabLink.vocab_id.in_(target_vocab_ids))
    ).all()
    linked_vocab_ids = {link.vocab_id for link in existing_links}

    # Create new links
    new_links = [
        UserVocabLink(
            user_id=user.id, vocab_id=vid, source_history_id=request.history_id
        )
        for vid in target_vocab_ids
        if vid not in linked_vocab_ids
    ]

    if new_links:
        session.add_all(new_links)
        session.commit()

    return {
        "message": f"Saved {len(new_links)} new words",
        "saved_count": len(new_links),
    }


@router.delete("/remove")
def remove_word(
    request: WordRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Dict[str, str]:
    """Removes a single word from the user's vocabulary list.

    Args:
        request (WordRequest): The word to remove.
        user (User): The authenticated user.
        session (Session): Database session.

    Returns:
        Dict[str, str]: Confirmation message.

    Raises:
        HTTPException: If the word is not found or not in the user's list.
    """
    vocab_item = session.exec(select(Vocab).where(Vocab.word == request.word)).first()

    if not vocab_item:
        raise HTTPException(status_code=404, detail="Word not found")

    if vocab_item in user.saved_words:
        user.saved_words.remove(vocab_item)
        session.add(user)
        session.commit()
        return {"message": "Word removed"}
    else:
        raise HTTPException(status_code=400, detail="Word not in your list")


@router.post("/remove/bulk")
def remove_words_bulk(
    request: BulkSaveRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Dict[str, str]:
    """Bulk removes words from the user's vocabulary list.

    Args:
        request (BulkSaveRequest): List of words to remove.
        user (User): The authenticated user.
        session (Session): Database session.

    Returns:
        Dict[str, str]: Confirmation message with count.
    """
    if not request.words:
        return {"message": "No words provided"}

    # Get vocab IDs
    vocabs = session.exec(select(Vocab.id).where(Vocab.word.in_(request.words))).all()

    if not vocabs:
        return {"message": "No matching words found"}

    # Delete links
    statement = (
        delete(UserVocabLink)
        .where(UserVocabLink.user_id == user.id)
        .where(UserVocabLink.vocab_id.in_(vocabs))
    )
    result = session.exec(statement)
    session.commit()

    return {"message": f"Removed {result.rowcount} words"}


@router.get("/dictionary")
def get_dictionary(
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    level: Optional[int] = None,
    min_freq: Optional[int] = None,
    max_freq: Optional[int] = None,
    exclude_saved: bool = False,
    sort: str = "freq",
    order: str = "asc",
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    """Returns words from the global dictionary.

    Supports pagination, filtering by level/frequency, and excluding user's saved words.

    Args:
        skip (int): Pagination offset.
        limit (int): Pagination limit.
        search (Optional[str]): Search term for word, reading, or meaning.
        level (Optional[int]): Filter by JLPT level.
        min_freq (Optional[int]): Minimum frequency rank.
        max_freq (Optional[int]): Maximum frequency rank.
        exclude_saved (bool): If True, excludes words already saved by the user.
        sort (str): Sort criterion (freq, level, word).
        order (str): Sort direction (asc, desc).
        user (Optional[User]): The current user (optional).
        session (Session): Database session.

    Returns:
        Dict[str, Any]: Dictionary containing 'items' (list) and 'total' (count).
    """
    query = select(Vocab)

    if search:
        query = query.where(
            or_(
                Vocab.word.ilike(f"%{search}%"),
                Vocab.reading.ilike(f"%{search}%"),
                cast(Vocab.meanings, String).ilike(f"%{search}%"),
            )
        )

    if level:
        query = query.where(Vocab.level == level)

    if min_freq:
        query = query.where(Vocab.frequency_rank >= min_freq)

    if max_freq:
        query = query.where(Vocab.frequency_rank <= max_freq)

    if exclude_saved and user:
        # Exclude words that are in the user's saved list
        # Filter by word string to handle duplicate dictionary entries with same surface form
        saved_words_subquery = (
            select(Vocab.word)
            .join(UserVocabLink, UserVocabLink.vocab_id == Vocab.id)
            .where(UserVocabLink.user_id == user.id)
        )
        query = query.where(Vocab.word.notin_(saved_words_subquery))

    # Count total before pagination
    count_statement = select(func.count()).select_from(query.subquery())
    total = session.exec(count_statement).one()

    # Sorting
    sort_column = Vocab.frequency_rank
    if sort == "level":
        sort_column = Vocab.level
    elif sort == "word":
        sort_column = Vocab.word

    if order == "desc":
        query = query.order_by(sort_column.desc().nullslast())
    else:
        query = query.order_by(sort_column.asc().nullslast())

    query = query.offset(skip).limit(limit)
    results = session.exec(query).all()

    return {"items": results, "total": total}


@router.get("/list", response_model=List[str])
def get_saved_words_list(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
):
    """Returns a simple list of words (strings) that the user has saved.

    Used for quick lookup/highlighting in the UI.

    Args:
        user (User): The authenticated user.
        session (Session): Database session.

    Returns:
        List[str]: List of saved word strings.
    """
    statement = (
        select(Vocab.word).join(UserVocabLink).where(UserVocabLink.user_id == user.id)
    )
    results = session.exec(statement).all()
    return results


@router.get("/me")
def get_my_words(
    level: Optional[int] = None,
    sort_by: Optional[str] = None,
    order: str = "desc",
    search: Optional[str] = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Dict[str, List[Dict[str, Any]]]:
    """Retrieves the user's saved vocabulary with details and filtering.

    Args:
        level (Optional[int]): Filter by JLPT level.
        sort_by (Optional[str]): Sort criterion (frequency, level, word).
        order (str): Sort direction (asc, desc).
        search (Optional[str]): Search term.
        user (User): The authenticated user.
        session (Session): Database session.

    Returns:
        Dict[str, List[Dict[str, Any]]]: Dictionary containing list of saved words with details.
    """
    query = (
        select(Vocab, UserVocabLink)
        .join(UserVocabLink)
        .where(UserVocabLink.user_id == user.id)
    )

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Vocab.word.ilike(search_term),
                Vocab.reading.ilike(search_term),
                cast(Vocab.meanings, String).ilike(search_term),
            )
        )

    if level:
        query = query.where(Vocab.level == level)

    sort_column = UserVocabLink.created_at
    if sort_by == "frequency":
        sort_column = func.least(Vocab.frequency_rank, Vocab.kana_frequency_rank)
    elif sort_by == "level":
        sort_column = Vocab.level
    elif sort_by == "word":
        sort_column = Vocab.word

    if order == "asc":
        query = query.order_by(asc(sort_column))
    else:
        query = query.order_by(desc(sort_column))

    query = query.order_by(Vocab.word)
    results = session.exec(query).all()

    response = [
        {
            "word": vocab.word,
            "reading": vocab.reading,
            "meanings": vocab.meanings,
            "level": vocab.level,
            "frequency_rank": vocab.frequency_rank,
            "kana_frequency_rank": vocab.kana_frequency_rank,
            "created_at": link.created_at,
            "context": link.context_sentence,
            "source_history_id": link.source_history_id,
        }
        for vocab, link in results
    ]

    return {"saved_words": response}


@router.get("/examples")
def get_example_sentences(word: str) -> Dict[str, List[Dict[str, str]]]:
    """Fetches example sentences for a word from Tatoeba.org.

    Returns:
        Dict[str, List[Dict[str, str]]]: Dictionary containing a list of sentence pairs (Japanese and English).

    Args:
        word (str): The word to search for.
    """
    try:
        url = f"https://tatoeba.org/en/api_v0/search?from=jpn&to=eng&query={word}"
        headers = {"User-Agent": "YomuAnalyzer/1.0"}
        response = requests.get(url, headers=headers)

        if response.status_code != 200:
            return {"sentences": []}

        data = response.json()
        results = data.get("results", [])

        cleaned_sentences = []
        for item in results[:5]:
            jp_sent = item.get("text", "")

            en_sent = ""
            if item.get("translations"):
                en_sent0 = item["translations"][0]
                if isinstance(en_sent0, list) and len(en_sent0) > 0:
                    en_sent = en_sent0[0].get("text", "")
                elif isinstance(en_sent0, dict):
                    en_sent = en_sent0.get("text", "")

            clean_jp = re.sub("<[^<]+?>", "", jp_sent)
            cleaned_sentences.append({"jp": clean_jp, "en": en_sent})

        return {"sentences": cleaned_sentences}

    except Exception as e:
        print(f"Tatoeba Error: {e}")
        return {"sentences": []}
