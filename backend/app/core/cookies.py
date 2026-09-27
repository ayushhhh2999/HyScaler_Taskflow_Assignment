from __future__ import annotations

from fastapi import Response

from app.core.config import get_settings


def set_refresh_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key="refresh_token",
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )
