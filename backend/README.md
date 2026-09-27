# TaskFlow Backend

This is the backend for the TaskFlow collaborative task-board application.

## Features

- FastAPI API layer
- PostgreSQL + SQLAlchemy async
- JWT auth with refresh-token rotation
- Project membership and RBAC
- Task lifecycle, comments, activities and dashboard data
- WebSocket project room support

## Local setup

1. Copy `.env.example` to `.env` and update values.
2. Install dependencies:
   `pip install -r requirements.txt`
3. Start the PostgreSQL instance with Docker and keep the host port mapped to 5433 to avoid conflicts with other local Postgres installs:
   `docker compose up -d db`
4. Run migrations:
   `alembic upgrade head`
5. Start the app:
   `uvicorn app.main:app --reload`

## Seed users

The default seed data includes:

- test1@example.com / TestPass123
- test2@example.com / TestPass123

## Docker

```bash
docker compose up --build
```
