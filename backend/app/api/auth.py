from typing import Dict
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from app.core.database import get_session
from app.models.models import User
from app.core.security import get_password_hash, verify_password, create_access_token
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["Authentication"])


class UserRegister(BaseModel):
    """Schema for user registration."""

    username: str
    password: str


@router.post("/register", status_code=201)
def register(
    user: UserRegister, session: Session = Depends(get_session)
) -> Dict[str, str]:
    """Registers a new user.

    Args:
        user (UserRegister): The user registration data.
        session (Session): The database session.

    Returns:
        Dict[str, str]: A success message and the new username.

    Raises:
        HTTPException: If the username is already taken.
    """
    existing_user = session.exec(
        select(User).where(User.username == user.username)
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username already taken")

    hashed_pw = get_password_hash(user.password)
    new_user = User(username=user.username, hashed_password=hashed_pw)
    session.add(new_user)
    session.commit()
    session.refresh(new_user)

    return {"message": "User created successfully", "username": new_user.username}


@router.post("/token")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
) -> Dict[str, str]:
    """Authenticates a user and returns an access token.

    Args:
        form_data (OAuth2PasswordRequestForm): The login credentials (username and password).
        session (Session): The database session.

    Returns:
        Dict[str, str]: The access token and token type.

    Raises:
        HTTPException: If authentication fails.
    """
    user = session.exec(select(User).where(User.username == form_data.username)).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}
