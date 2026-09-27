from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token, create_refresh_token, hash_password, hash_refresh_token, validate_password, verify_password
from app.models.refresh_token import RefreshToken
from app.models.user import User


async def register_user(db: AsyncSession, name: str, email: str, password: str) -> User:
    normalized_email = email.strip().lower()
    existing = await db.execute(select(User).where(User.email == normalized_email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    try:
        validate_password(password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    user = User(name=name, email=normalized_email, password_hash=hash_password(password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User:
    user = await db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return user


async def create_refresh_token_record(db: AsyncSession, user_id: UUID, raw_token: str) -> RefreshToken:
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    token_record = RefreshToken(user_id=user_id, token_hash=hash_refresh_token(raw_token), expires_at=expires_at)
    db.add(token_record)
    await db.commit()
    await db.refresh(token_record)
    return token_record


async def revoke_all_refresh_tokens(db: AsyncSession, user_id: UUID) -> None:
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    await db.commit()


async def revoke_refresh_token(db: AsyncSession, user_id: UUID, raw_token: str) -> None:
    token_hash = hash_refresh_token(raw_token)
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None))
    )
    record = result.scalar_one_or_none()
    if record is not None:
        record.revoked_at = datetime.now(timezone.utc)
        await db.commit()


async def issue_tokens_for_user(db: AsyncSession, user: User, refresh_token_value: str | None = None, *, revoke_existing: bool = True) -> tuple[str, str]:
    access_token = create_access_token(str(user.id))
    if refresh_token_value is None:
        refresh_token_value = create_refresh_token(str(user.id))
    if revoke_existing:
        await revoke_all_refresh_tokens(db, user.id)
    await create_refresh_token_record(db, user.id, refresh_token_value)
    return access_token, refresh_token_value


async def get_user_by_id(db: AsyncSession, user_id: UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()
