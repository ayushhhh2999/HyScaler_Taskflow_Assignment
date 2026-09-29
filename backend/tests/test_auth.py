from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient


def unique_email(prefix: str = "user") -> str:
    return f"{prefix}.{uuid.uuid4().hex[:8]}@example.com"


@pytest.mark.asyncio
async def test_register_and_login(client: AsyncClient) -> None:
    email = unique_email("alice")
    payload = {"name": "Alice", "email": email, "password": "StrongPass1"}
    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code in {200, 201}
    token_response = response.json()
    assert "access_token" in token_response

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": payload["email"], "password": payload["password"]},
    )
    assert login.status_code == 200
    assert "access_token" in login.json()


@pytest.mark.asyncio
async def test_duplicate_email(client: AsyncClient) -> None:
    email = unique_email("alice.dup")
    payload = {"name": "Alice", "email": email, "password": "StrongPass1"}
    first = await client.post("/api/v1/auth/register", json=payload)
    assert first.status_code in {200, 201}

    response = await client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_invalid_password(client: AsyncClient) -> None:
    email = unique_email("bob")
    response = await client.post(
        "/api/v1/auth/register",
        json={"name": "Bob", "email": email, "password": "weak"},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_unauthenticated_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/v1/projects")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_project_with_member_ids_sends_pending_invitations(client: AsyncClient) -> None:
    owner_email = unique_email("owner")
    member_email = unique_email("member")

    owner = await client.post(
        "/api/v1/auth/register",
        json={"name": "Owner", "email": owner_email, "password": "StrongPass1"},
    )
    assert owner.status_code in {200, 201}
    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}

    member = await client.post(
        "/api/v1/auth/register",
        json={"name": "Member", "email": member_email, "password": "StrongPass1"},
    )
    assert member.status_code in {200, 201}
    member_headers = {"Authorization": f"Bearer {member.json()['access_token']}"}
    member_profile = await client.get("/api/v1/auth/me", headers=member_headers)
    assert member_profile.status_code == 200
    member_id = member_profile.json()["id"]

    project = await client.post(
        "/api/v1/projects",
        json={"name": "Team board", "description": "Test", "member_ids": [member_id]},
        headers=owner_headers,
    )
    assert project.status_code == 201, project.text

    project_id = project.json()["id"]
    pending = await client.get("/api/v1/invitations/me", headers=member_headers)
    assert pending.status_code == 200
    assert len(pending.json()) == 1
    assert pending.json()[0]["project_id"] == project_id
    denied = await client.get(f"/api/v1/projects/{project_id}", headers=member_headers)
    assert denied.status_code == 403

    invitation_id = pending.json()[0]["id"]
    accept = await client.post(f"/api/v1/invitations/{invitation_id}/respond", json={"accept": True}, headers=member_headers)
    assert accept.status_code == 200, accept.text

    members = await client.get(f"/api/v1/projects/{project_id}/members", headers=owner_headers)
    assert members.status_code == 200
    emails = {item["email"] for item in members.json()}
    assert owner_email in emails
    assert member_email in emails


@pytest.mark.asyncio
async def test_project_assignee_options_include_only_project_members(client: AsyncClient) -> None:
    owner_email = unique_email("owner")
    invited_email = unique_email("member")
    outsider_email = unique_email("outsider")

    owner = await client.post("/api/v1/auth/register", json={"name": "Owner", "email": owner_email, "password": "StrongPass1"})
    owner_token = owner.json()["access_token"]
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    invited = await client.post("/api/v1/auth/register", json={"name": "Member", "email": invited_email, "password": "StrongPass1"})
    assert invited.status_code in {200, 201}
    invited_token = invited.json()["access_token"]
    invited_headers = {"Authorization": f"Bearer {invited_token}"}

    outsider = await client.post("/api/v1/auth/register", json={"name": "Outsider", "email": outsider_email, "password": "StrongPass1"})
    assert outsider.status_code in {200, 201}

    project = await client.post("/api/v1/projects", json={"name": "Team board", "description": "Test"}, headers=owner_headers)
    assert project.status_code == 201
    project_id = project.json()["id"]

    invite = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": invited_email},
        headers=owner_headers,
    )
    assert invite.status_code == 202, invite.text

    not_yet_member = await client.get(f"/api/v1/projects/{project_id}/assignee-options", headers=invited_headers)
    assert not_yet_member.status_code == 403
    accept = await client.post(
        f"/api/v1/invitations/{invite.json()['id']}/respond",
        json={"accept": True},
        headers=invited_headers,
    )
    assert accept.status_code == 200, accept.text

    response = await client.get(f"/api/v1/projects/{project_id}/assignee-options", headers=invited_headers)
    assert response.status_code == 200
    users = response.json()
    emails = {user["email"] for user in users}

    assert owner_email in emails
    assert invited_email in emails
    assert outsider_email not in emails


@pytest.mark.asyncio
async def test_invite_member_by_email_waits_for_acceptance(client: AsyncClient) -> None:
    owner_email = unique_email("owner")
    member_email = unique_email("member")

    owner = await client.post("/api/v1/auth/register", json={"name": "Owner", "email": owner_email, "password": "StrongPass1"})
    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}

    member = await client.post("/api/v1/auth/register", json={"name": "Member", "email": member_email, "password": "StrongPass1"})
    member_headers = {"Authorization": f"Bearer {member.json()['access_token']}"}

    project = await client.post("/api/v1/projects", json={"name": "Project by email", "description": "Test"}, headers=owner_headers)
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    response = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": member_email},
        headers=owner_headers,
    )
    assert response.status_code == 202, response.text
    assert response.json()["invitee_email"] == member_email

    members = await client.get(f"/api/v1/projects/{project_id}/members", headers=owner_headers)
    assert members.status_code == 200
    assert all(item["email"] != member_email for item in members.json())

    pending = await client.get("/api/v1/invitations/me", headers=member_headers)
    assert len(pending.json()) == 1
    accept = await client.post(
        f"/api/v1/invitations/{response.json()['id']}/respond",
        json={"accept": True},
        headers=member_headers,
    )
    assert accept.status_code == 200, accept.text
    members = await client.get(f"/api/v1/projects/{project_id}/members", headers=owner_headers)
    assert any(item["email"] == member_email for item in members.json())


@pytest.mark.asyncio
async def test_rejecting_or_cancelling_invitation_never_grants_access(client: AsyncClient) -> None:
    owner = await client.post("/api/v1/auth/register", json={"name": "Owner", "email": unique_email("owner"), "password": "StrongPass1"})
    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}
    invitee_email = unique_email("invitee")
    invitee = await client.post("/api/v1/auth/register", json={"name": "Invitee", "email": invitee_email, "password": "StrongPass1"})
    invitee_headers = {"Authorization": f"Bearer {invitee.json()['access_token']}"}

    project = await client.post("/api/v1/projects", json={"name": "Invitation response", "description": "Test"}, headers=owner_headers)
    project_id = project.json()["id"]
    rejected_invite = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": invitee_email},
        headers=owner_headers,
    )
    assert rejected_invite.status_code == 202, rejected_invite.text
    reject = await client.post(
        f"/api/v1/invitations/{rejected_invite.json()['id']}/respond",
        json={"accept": False},
        headers=invitee_headers,
    )
    assert reject.status_code == 200
    assert (await client.get("/api/v1/invitations/me", headers=invitee_headers)).json() == []
    assert (await client.get(f"/api/v1/projects/{project_id}", headers=invitee_headers)).status_code == 403

    cancelled_invite = await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": (await client.get("/api/v1/auth/me", headers=invitee_headers)).json()["email"]},
        headers=owner_headers,
    )
    assert cancelled_invite.status_code == 202
    cancel = await client.delete(
        f"/api/v1/projects/{project_id}/invitations/{cancelled_invite.json()['id']}",
        headers=owner_headers,
    )
    assert cancel.status_code == 204
    assert (await client.get("/api/v1/invitations/me", headers=invitee_headers)).json() == []


@pytest.mark.asyncio
async def test_only_owner_can_delete_project(client: AsyncClient) -> None:
    owner_email = unique_email("owner")
    member_email = unique_email("member")

    owner = await client.post("/api/v1/auth/register", json={"name": "Owner", "email": owner_email, "password": "StrongPass1"})
    assert owner.status_code in {200, 201}
    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}

    member = await client.post("/api/v1/auth/register", json={"name": "Member", "email": member_email, "password": "StrongPass1"})
    assert member.status_code in {200, 201}
    member_headers = {"Authorization": f"Bearer {member.json()['access_token']}"}

    project = await client.post("/api/v1/projects", json={"name": "Delete guard", "description": "Test"}, headers=owner_headers)
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    invite = await client.post(f"/api/v1/projects/{project_id}/members", json={"email": member_email}, headers=owner_headers)
    assert invite.status_code == 202, invite.text
    accept = await client.post(f"/api/v1/invitations/{invite.json()['id']}/respond", json={"accept": True}, headers=member_headers)
    assert accept.status_code == 200, accept.text

    non_owner_delete = await client.delete(f"/api/v1/projects/{project_id}", headers=member_headers)
    assert non_owner_delete.status_code == 403

    owner_delete = await client.delete(f"/api/v1/projects/{project_id}", headers=owner_headers)
    assert owner_delete.status_code == 204


@pytest.mark.asyncio
async def test_member_removal_keeps_created_tasks_and_blocks_owner_removal(client: AsyncClient) -> None:
    owner_email = unique_email("owner")
    member_email = unique_email("member")

    owner = await client.post("/api/v1/auth/register", json={"name": "Owner", "email": owner_email, "password": "StrongPass1"})
    assert owner.status_code in {200, 201}
    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}
    owner_profile = await client.get("/api/v1/auth/me", headers=owner_headers)
    assert owner_profile.status_code == 200
    owner_id = owner_profile.json()["id"]

    member = await client.post("/api/v1/auth/register", json={"name": "Member", "email": member_email, "password": "StrongPass1"})
    assert member.status_code in {200, 201}
    member_headers = {"Authorization": f"Bearer {member.json()['access_token']}"}
    member_profile = await client.get("/api/v1/auth/me", headers=member_headers)
    assert member_profile.status_code == 200
    member_id = member_profile.json()["id"]

    project = await client.post("/api/v1/projects", json={"name": "Member removal", "description": "Test"}, headers=owner_headers)
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    invite = await client.post(f"/api/v1/projects/{project_id}/members", json={"email": member_email}, headers=owner_headers)
    assert invite.status_code == 202, invite.text
    accept = await client.post(f"/api/v1/invitations/{invite.json()['id']}/respond", json={"accept": True}, headers=member_headers)
    assert accept.status_code == 200, accept.text

    task = await client.post(
        f"/api/v1/projects/{project_id}/tasks",
        json={"title": "Member-created task", "description": "Keep it", "assignee_id": member_id, "priority": "medium"},
        headers=member_headers,
    )
    assert task.status_code == 201, task.text
    task_id = task.json()["id"]

    remove = await client.delete(f"/api/v1/projects/{project_id}/members/{member_id}", headers=owner_headers)
    assert remove.status_code == 204, remove.text

    task_after = await client.get(f"/api/v1/tasks/{task_id}", headers=owner_headers)
    assert task_after.status_code == 200, task_after.text
    assert task_after.json()["id"] == task_id
    assert task_after.json()["title"] == "Member-created task"
    assert task_after.json()["assignee_id"] is None

    owner_remove = await client.delete(f"/api/v1/projects/{project_id}/members/{owner_id}", headers=owner_headers)
    assert owner_remove.status_code == 400


@pytest.mark.asyncio
async def test_project_member_can_update_task_status(client: AsyncClient) -> None:
    owner_email = unique_email("owner")
    member_email = unique_email("member")

    owner = await client.post("/api/v1/auth/register", json={"name": "Owner", "email": owner_email, "password": "StrongPass1"})
    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}

    member = await client.post("/api/v1/auth/register", json={"name": "Member", "email": member_email, "password": "StrongPass1"})
    member_headers = {"Authorization": f"Bearer {member.json()['access_token']}"}
    member_profile = await client.get("/api/v1/auth/me", headers=member_headers)
    member_id = member_profile.json()["id"]

    project = await client.post("/api/v1/projects", json={"name": "Task status board", "description": "Test"}, headers=owner_headers)
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    invite = await client.post(f"/api/v1/projects/{project_id}/members", json={"email": member_email}, headers=owner_headers)
    assert invite.status_code == 202, invite.text
    accept = await client.post(f"/api/v1/invitations/{invite.json()['id']}/respond", json={"accept": True}, headers=member_headers)
    assert accept.status_code == 200, accept.text

    task = await client.post(
        f"/api/v1/projects/{project_id}/tasks",
        json={"title": "Ship report", "description": "Draft it", "assignee_id": member_id, "priority": "medium"},
        headers=owner_headers,
    )
    assert task.status_code == 201, task.text
    task_id = task.json()["id"]

    response = await client.patch(f"/api/v1/tasks/{task_id}/status", json={"status": "in_progress"}, headers=member_headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_project_member_can_create_and_list_comments(client: AsyncClient) -> None:
    owner_email = unique_email("owner")
    member_email = unique_email("member")

    owner = await client.post("/api/v1/auth/register", json={"name": "Owner", "email": owner_email, "password": "StrongPass1"})
    assert owner.status_code in {200, 201}
    owner_headers = {"Authorization": f"Bearer {owner.json()['access_token']}"}

    member = await client.post("/api/v1/auth/register", json={"name": "Member", "email": member_email, "password": "StrongPass1"})
    assert member.status_code in {200, 201}
    member_headers = {"Authorization": f"Bearer {member.json()['access_token']}"}
    member_profile = await client.get("/api/v1/auth/me", headers=member_headers)
    assert member_profile.status_code == 200
    member_id = member_profile.json()["id"]

    project = await client.post("/api/v1/projects", json={"name": "Comment board", "description": "Test"}, headers=owner_headers)
    assert project.status_code == 201, project.text
    project_id = project.json()["id"]

    invite = await client.post(f"/api/v1/projects/{project_id}/members", json={"email": member_email}, headers=owner_headers)
    assert invite.status_code == 202, invite.text
    accept = await client.post(f"/api/v1/invitations/{invite.json()['id']}/respond", json={"accept": True}, headers=member_headers)
    assert accept.status_code == 200, accept.text

    task = await client.post(
        f"/api/v1/projects/{project_id}/tasks",
        json={"title": "Write summary", "description": "Draft it", "assignee_id": member_id, "priority": "medium"},
        headers=owner_headers,
    )
    assert task.status_code == 201, task.text
    task_id = task.json()["id"]

    create = await client.post(f"/api/v1/tasks/{task_id}/comments", json={"content": "Looks good."}, headers=member_headers)
    assert create.status_code == 201, create.text
    payload = create.json()
    assert payload["content"] == "Looks good."

    list_response = await client.get(f"/api/v1/tasks/{task_id}/comments", headers=owner_headers)
    assert list_response.status_code == 200, list_response.text
    comments = list_response.json()
    assert any(item["content"] == "Looks good." for item in comments)


@pytest.mark.asyncio
async def test_dashboard_returns_activity_messages(client: AsyncClient) -> None:
    email = unique_email("dashboard")
    register = await client.post(
        "/api/v1/auth/register",
        json={"name": "Dashboard Test", "email": email, "password": "StrongPass1"},
    )
    assert register.status_code in {200, 201}
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}

    project = await client.post("/api/v1/projects", json={"name": "Dashboard board", "description": "Test"}, headers=headers)
    assert project.status_code == 201, project.text

    response = await client.get("/api/v1/dashboard", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "recent_personal_activity" in payload
    assert isinstance(payload["recent_personal_activity"], list)
    assert len(payload["recent_personal_activity"]) >= 1
    activity = payload["recent_personal_activity"][0]
    assert "id" in activity
    assert "message" in activity
    assert isinstance(activity["message"], str)
    assert activity["message"]
