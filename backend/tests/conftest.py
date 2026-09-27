from __future__ import annotations

import asyncio
import sys
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal, engine
from app.main import app

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


@pytest.fixture(autouse=True)
async def cleanup_database_connections() -> AsyncGenerator[None, None]:
    """Ensure all database connections in the pool are cleanly closed after each test."""
    try:
        yield
    finally:
        await engine.dispose()


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide an independent database session for a test."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Yield a fresh HTTPX AsyncClient for each test using ASGITransport."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as test_client:
        yield test_client
