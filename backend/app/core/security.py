import os
from typing import Optional
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select
from app.core.database import get_session
from app.models.models import User
from dotenv import load_dotenv

load_dotenv()

# Configuration
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

if not JWT_SECRET_KEY:
    raise ValueError("JWT_SECRET_KEY environment variable is not set. ")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def get_password_hash(password: str) -> str:
    """Hashes a password using Argon2.

    Args:
        password (str): The plain text password.

    Returns:
        str: The hashed password.
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against a hashed password.

    Args:
        plain_password (str): The plain text password.
        hashed_password (str): The hashed password.

    Returns:
        bool: True if the password matches, False otherwise.
    """
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    """Creates a JWT access token.

    Args:
        data (dict): The payload data to encode in the token.

    Returns:
        str: The encoded JWT string.
    """
    to_encode = data.copy()

    # Set expiration time
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})

    # Sign the token
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_user(
    token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)
) -> User:
    """Dependency to get the current authenticated user.

    Args:
        token (str): The JWT token extracted from the request.
        session (Session): The database session.

    Returns:
        User: The authenticated user model.

    Raises:
        HTTPException: If the token is invalid or the user does not exist.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Decode token
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Get user from DB
    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise credentials_exception

    return user


def get_current_user_optional(
    token: Optional[str] = Depends(
        OAuth2PasswordBearer(tokenUrl="token", auto_error=False)
    ),
    session: Session = Depends(get_session),
) -> Optional[User]:
    """
    Dependency to get the current user if authenticated, otherwise None.

    Args:
        token (Optional[str]): The JWT token, if present.
        session (Session): The database session.

    Returns:
        Optional[User]: The user model if authenticated, else None.
    """
    if not token:
        return None

    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
        user = session.exec(select(User).where(User.username == username)).first()
        return user
    except JWTError:
        return None
