from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import select

from src.models import Permission, Permissions, SpeakingAssignment, UserCalling


def make_schedule(rows: int = 15, cols: int = 12):
    """Create a simple schedule: rows x cols with ward ids 1..10 and some blanks."""
    schedule = []
    for r in range(rows):
        row = []
        for c in range(cols):
            # introduce blanks for some cells to simulate "not speaking"
            if (r + c) % 7 == 0:
                row.append("")
            else:
                # wards 1..10
                row.append(str((r + c) % 10 + 1))
        schedule.append(row)
    return schedule

def login_client(client: TestClient, email: str, password: str) -> str:
    r = client.post(
        "/auth/login",
        data={"username": email, "password": password},
    )
    assert r.status_code == 200
    return r.json()["access_token"]

def test_get_calendar_returns_slots(client, userpass, high_councilor_calling):
    user, password = userpass

    client.app.state.speaking_schedule = make_schedule(high_councilor_calling.max_slots, 12)
    token = login_client(client, user.email, password)
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.get("/speaking/calendar", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("year") == datetime.now().year
    assert isinstance(data.get("speakers"), list)
    assert len(data["speakers"]) == high_councilor_calling.max_slots


def test_get_calendar_by_year(client, userpass, high_councilor_calling):
    user, password = userpass
    token = login_client(client, user.email, password)
    client.app.state.speaking_schedule = make_schedule(high_councilor_calling.max_slots, 12)

    year = datetime.now().year
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.get(f"/speaking/calendar/{year}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("year") == year


def test_override_requires_permission_and_updates(client, db_session, userpass, high_councilor_assignment):
    user, password = userpass
    assignment = high_councilor_assignment
    token = login_client(client, user.email, password)
    client.app.state.speaking_schedule = make_schedule(15, 12)
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "high_councilor_id": assignment.high_councilor_id,
        "month": 2,
        "year": datetime.now().year,
        "ward_id": 999,
        "speaker2": None,
    }

    # Without permission should be 403
    resp = client.put("/speaking/calendar/override", headers=headers, json=payload)
    assert resp.status_code == 403

    # Grant the user the MANAGE_SPEAKING_SCHEDULE permission
    perm = Permissions(foreign_id=str(user.id), is_calling=False, scopes=int(Permission.MANAGE_SPEAKING_SCHEDULE))
    db_session.add(perm)
    db_session.commit()

    # Try again with permission
    resp = client.put("/speaking/calendar/override", headers=headers, json=payload)
    assert resp.status_code == 200
    data = resp.json()
    print(data)
    # delete the override to clean up
    statement = select(SpeakingAssignment).where(
        SpeakingAssignment.high_councilor_id == assignment.high_councilor_id,
        SpeakingAssignment.month == datetime(payload["year"], payload["month"], 1)
    )
    override = db_session.exec(statement).first()
    if override:
        db_session.delete(override)
        db_session.commit()
    # Find the speaker entry for our usercalling id
    speaker = None
    for s in data.get("speakers", []):
        if s.get("high_councilor_id") == assignment.high_councilor.slot_number:
            speaker = s
            break
    assert speaker is not None
    assert speaker["assignments"][payload["month"] - 1]["ward_id"] == 999

