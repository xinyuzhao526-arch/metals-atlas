from io import BytesIO

import app.imports as import_service
from app.demo import build_demo_workbook
from app.models import GuidanceObservation, ImportJob, ImportRow, ProductionObservation, Project, ReviewItem, User


def upload_demo(client, headers):
    return client.post(
        "/api/v1/admin/imports",
        files={"file": ("phase1a-demo.xlsx", BytesIO(build_demo_workbook()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=headers,
    )


def create_project_job(session, *slugs: str) -> str:
    user = session.query(User).one()
    job = ImportJob(
        filename="projects-only.xlsx",
        file_hash="test-projects-only",
        file_path="/tmp/projects-only.xlsx",
        uploaded_by=user.id,
        status="previewed",
        summary={"new": len(slugs)},
    )
    session.add(job)
    session.flush()
    for index, slug in enumerate(slugs, start=2):
        payload = {
            "slug": slug,
            "name": slug.replace("-", " ").title(),
            "country_iso3": "CHL",
            "operator_company": None,
            "latitude": None,
            "longitude": None,
            "status": "operating",
            "raw_material_route": None,
        }
        session.add(ImportRow(
            import_job_id=job.id,
            sheet_name="projects",
            row_number=index,
            raw_payload=payload,
            normalized_payload=payload,
            classification="new",
            errors=[],
        ))
    session.commit()
    return job.id


def test_excel_preview_import_review_and_publication(authenticated, session):
    client, headers = authenticated
    uploaded = upload_demo(client, headers)
    assert uploaded.status_code == 200, uploaded.text
    job_id = uploaded.json()["id"]
    preview = client.get(f"/api/v1/admin/imports/{job_id}/preview")
    assert preview.status_code == 200
    assert preview.json()["summary"]["new"] == 14

    confirmed = client.post(f"/api/v1/admin/imports/{job_id}/confirm", headers=headers)
    assert confirmed.status_code == 200, confirmed.text
    assert client.get("/api/v1/public/projects").json() == []

    production = session.query(ProductionObservation).order_by(ProductionObservation.record_key).all()
    assert len(production) == 2
    assert {item.calendar_basis for item in production} == {"calendar_year", "fiscal_year"}
    assert {item.ownership_basis for item in production} == {"project_100", "equity"}
    assert all(not item.published and item.review_status == "pending" for item in production)

    guidance_missing = session.query(GuidanceObservation).filter(GuidanceObservation.normalized_value.is_(None)).one()
    assert guidance_missing.missing_reason == "not_disclosed"

    repeated = upload_demo(client, headers)
    assert repeated.status_code == 200, repeated.text
    repeated_preview = client.get(f"/api/v1/admin/imports/{repeated.json()['id']}/preview").json()
    assert repeated_preview["summary"].get("no_change") == 14

    reviews = client.get("/api/v1/admin/reviews").json()
    production_reviews = [item for item in reviews if item["observation_type"] == "production"]
    for item in production_reviews:
        response = client.post(f"/api/v1/admin/reviews/{item['id']}/accept-and-publish", json={"comment": "fixture reviewed"}, headers=headers)
        assert response.status_code == 200

    projects = client.get("/api/v1/public/projects").json()
    assert {item["slug"] for item in projects} == {"escondida", "morenci"}
    detail = client.get("/api/v1/public/projects/morenci").json()
    assert detail["production"][0]["value"] == "78.900000"
    assert detail["production"][0]["ownership_basis"] == "equity"
    assert detail["production"][0]["source"]["is_demo"] is True


def test_null_api_is_structured_not_chinese_placeholder(authenticated, session):
    client, headers = authenticated
    uploaded = upload_demo(client, headers).json()
    client.post(f"/api/v1/admin/imports/{uploaded['id']}/confirm", headers=headers)
    reviews = client.get("/api/v1/admin/reviews").json()
    for item in reviews:
        client.post(f"/api/v1/admin/reviews/{item['id']}/accept-and-publish", json={}, headers=headers)
    detail = client.get("/api/v1/public/projects/morenci").json()
    missing = detail["guidance"][0]
    assert missing["value"] is None
    assert missing["missing_reason"] == "not_disclosed"
    assert "待补" not in str(missing)


def test_modify_accept_publish_and_reject(authenticated, session):
    client, headers = authenticated
    uploaded = upload_demo(client, headers).json()
    client.post(f"/api/v1/admin/imports/{uploaded['id']}/confirm", headers=headers)
    reviews = client.get("/api/v1/admin/reviews").json()
    first, second = reviews[0], reviews[1]
    modified = client.post(
        f"/api/v1/admin/reviews/{first['id']}/modify-accept-and-publish",
        json={"changes": {"source_locator": "manual-review:1"}, "comment": "modified"},
        headers=headers,
    )
    assert modified.status_code == 200, modified.text
    rejected = client.post(f"/api/v1/admin/reviews/{second['id']}/reject", json={"comment": "reject fixture row"}, headers=headers)
    assert rejected.status_code == 200
    rows = session.query(ReviewItem).filter(ReviewItem.id.in_([first["id"], second["id"]])).all()
    assert {row.status for row in rows} == {"modified_approved_published", "rejected"}
    modified_row = next(row for row in rows if row.status == "modified_approved_published")
    assert modified_row.before_payload["source_locator"] != modified_row.after_payload["source_locator"]
    assert modified_row.after_payload["source_locator"] == "manual-review:1"


def test_project_only_confirmation_reports_result_history_and_rejects_repeat(authenticated, session):
    client, headers = authenticated
    job_id = create_project_job(session, "project-alpha", "project-beta")

    response = client.post(f"/api/v1/admin/imports/{job_id}/confirm", headers=headers)

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "confirmed"
    assert result["confirmed_at"]
    assert result["result"] == {
        "new": 2,
        "update": 0,
        "no_change": 0,
        "pending_review_observations": 0,
        "by_sheet": {"projects": {"new": 2, "update": 0, "no_change": 0}},
    }
    session.expire_all()
    assert session.query(Project).filter(Project.slug.in_(["project-alpha", "project-beta"])).count() == 2
    assert session.query(ReviewItem).count() == 0

    repeated = client.post(f"/api/v1/admin/imports/{job_id}/confirm", headers=headers)
    assert repeated.status_code == 409
    assert repeated.json()["detail"] == "导入任务状态不可确认"
    assert session.query(Project).filter(Project.slug.in_(["project-alpha", "project-beta"])).count() == 2

    history = client.get("/api/v1/admin/imports").json()["items"]
    item = next(entry for entry in history if entry["id"] == job_id)
    assert item["status"] == "confirmed"
    assert item["confirmed_at"]
    assert item["applied_count"] == 2
    assert item["action_summary"]["pending_review_observations"] == 0

    detail = client.get(f"/api/v1/admin/imports/{job_id}/preview").json()
    assert all(row["confirmation_result"] == "applied" for row in detail["rows"])
    assert {
        row["entity"]["project"]["admin_path"] for row in detail["rows"]
    } == {
        "/admin/projects/project-alpha",
        "/admin/projects/project-beta",
    }


def test_confirmation_failure_rolls_back_all_rows(authenticated, session, monkeypatch):
    client, headers = authenticated
    job_id = create_project_job(session, "rollback-alpha", "rollback-beta")
    original_apply_row = import_service.apply_row
    call_count = 0

    def fail_on_second_row(db, sheet, payload, import_row):
        nonlocal call_count
        call_count += 1
        if call_count == 2:
            raise RuntimeError("forced transaction failure")
        return original_apply_row(db, sheet, payload, import_row)

    monkeypatch.setattr(import_service, "apply_row", fail_on_second_row)
    response = client.post(f"/api/v1/admin/imports/{job_id}/confirm", headers=headers)

    assert response.status_code == 500
    assert response.json()["detail"] == "确认导入失败，本次未写入数据库"
    session.expire_all()
    assert session.query(Project).filter(Project.slug.in_(["rollback-alpha", "rollback-beta"])).count() == 0
    job = session.get(ImportJob, job_id)
    assert job.status == "previewed"
    assert job.confirmed_at is None
    rows = session.query(ImportRow).filter(ImportRow.import_job_id == job_id).all()
    assert all(row.applied_record_id is None for row in rows)
