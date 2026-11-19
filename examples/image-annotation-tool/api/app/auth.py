"""Login, JWT bearer tokens and role checks."""
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User

JWT_SECRET = os.environ.get("JWT_SECRET", "change-me")
JWT_TTL_MINUTES = int(os.environ.get("JWT_TTL_MINUTES", "480"))
ROLES = ("admin", "annotator", "reviewer")

pwd_context = CryptContext(schemes=["bcrypt"])
bearer = HTTPBearer()
router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    role: str


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> LoginResponse:
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid credentials")
    expires = datetime.now(timezone.utc) + timedelta(minutes=JWT_TTL_MINUTES)
    token = jwt.encode({"sub": str(user.id), "role": user.role, "exp": expires}, JWT_SECRET, "HS256")
    return LoginResponse(access_token=token, role=user.role)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        claims = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token") from None
    user = db.get(User, int(claims["sub"]))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "unknown user")
    return user


def require_role(*roles: str):
    """Dependency factory: `Depends(require_role("admin"))`."""

    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"requires role: {', '.join(roles)}")
        return user

    return dependency


def seed_demo_users(db: Session) -> None:
    """Create one user per role on first start."""
    if db.scalar(select(User).limit(1)) is not None:
        return
    for role in ROLES:
        db.add(User(email=f"{role}@example.com", password_hash=pwd_context.hash("demo"), role=role))
    db.commit()
