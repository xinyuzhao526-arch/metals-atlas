from io import BytesIO

from app.auth import COOKIE_NAME, CSRF_COOKIE
from app.demo import build_demo_workbook
from app.models import ImportJob, Project, ReviewItem


def login(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "test-password-123"},
    )
    assert response.status_code == 200
    return response.json()["csrf_token"]


def test_logged_in_admin_can_logout_and_session_is_revoked(client):
    csrf = login(client)
    session_token = client.cookies.get(COOKIE_NAME)
    assert session_token

    response = client.post(
        "/api/v1/auth/logout",
        headers={"X-CSRF-Token": csrf},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert client.cookies.get(COOKIE_NAME) is None
    assert client.cookies.get(CSRF_COOKIE) is None
    cookies = response.headers.get_list("set-cookie")
    session_clear = next(item for item in cookies if item.startswith(f"{COOKIE_NAME}="))
    csrf_clear = next(item for item in cookies if item.startswith(f"{CSRF_COOKIE}="))
    for header in (session_clear, csrf_clear):
        lower = header.lower()
        assert "max-age=0" in lower
        assert "path=/" in lower
        assert "samesite=lax" in lower
    assert "httponly" in session_clear.lower()
    assert "httponly" not in csrf_clear.lower()

    client.cookies.set(COOKIE_NAME, session_token)
    assert client.get("/api/v1/auth/me").status_code == 401
    client.cookies.clear()
    assert client.get("/api/v1/admin/reviews").status_code == 401


def test_invalid_csrf_upload_does_not_write_import_or_business_data(client, session):
    login(client)
    before = {
        "jobs": session.query(ImportJob).count(),
        "projects": session.query(Project).count(),
        "reviews": session.query(ReviewItem).count(),
    }

    response = client.post(
        "/api/v1/admin/imports",
        files={
            "file": (
                "phase1a-demo.xlsx",
                BytesIO(build_demo_workbook()),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        headers={"X-CSRF-Token": "expired-token"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF validation failed"
    session.expire_all()
    assert session.query(ImportJob).count() == before["jobs"]
    assert session.query(Project).count() == before["projects"]
    assert session.query(ReviewItem).count() == before["reviews"]
