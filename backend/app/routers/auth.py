from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.cookies import clear_refresh_cookie, set_refresh_cookie
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_refresh_token
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import AuthMeResponse, LoginRequest, RefreshRequest, RegisterRequest, TokenResponse
from app.services.auth_service import (
    authenticate_user,
    create_refresh_token_record,
    register_user,
    revoke_all_refresh_tokens,
    revoke_refresh_token,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await register_user(db, payload.name, payload.email, payload.password)
    refresh_token_value = create_refresh_token(str(user.id))
    access_token = create_access_token(str(user.id))
    await create_refresh_token_record(db, user.id, refresh_token_value)
    set_refresh_cookie(response, refresh_token_value)
    return TokenResponse(access_token=access_token, token_type="bearer")


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    user = await authenticate_user(db, payload.email, payload.password)
    await revoke_all_refresh_tokens(db, user.id)
    access_token = create_access_token(str(user.id))
    refresh_token_value = create_refresh_token(str(user.id))
    await create_refresh_token_record(db, user.id, refresh_token_value)
    set_refresh_cookie(response, refresh_token_value)
    return TokenResponse(access_token=access_token, token_type="bearer")


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, payload: RefreshRequest | None = None, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    token_value = payload.refresh_token if payload else request.cookies.get("refresh_token")
    if not token_value:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        decoded = decode_token(token_value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated") from exc

    if decoded.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token_hash = hash_refresh_token(token_value)
    record = await db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None)))
    if record is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    if record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user = await db.get(User, record.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    settings = get_settings()
    new_access = create_access_token(str(user.id))
    new_refresh = create_refresh_token(str(user.id))
    record.token_hash = hash_refresh_token(new_refresh)
    record.expires_at = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    await db.commit()
    set_refresh_cookie(response, new_refresh)
    return TokenResponse(access_token=new_access, token_type="bearer")


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    payload: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    token_value = payload.refresh_token if payload else request.cookies.get("refresh_token")
    if token_value:
        await revoke_refresh_token(db, current_user.id, token_value)
    clear_refresh_cookie(response)
    return {"status": "ok"}


@router.get("/me", response_model=AuthMeResponse)
async def me(current_user: User = Depends(get_current_user)) -> AuthMeResponse:
    return AuthMeResponse(id=str(current_user.id), name=current_user.name, email=current_user.email)
