"""Run the Phase 1A demo through public HTTP endpoints only."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import httpx


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--web-url", default="http://127.0.0.1:3000")
    parser.add_argument("--workbook", type=Path, required=True)
    parser.add_argument("--email", default="admin@example.com")
    parser.add_argument("--password", default=os.getenv("ACCEPTANCE_ADMIN_PASSWORD"))
    args = parser.parse_args()
    if not args.password:
        parser.error("--password or ACCEPTANCE_ADMIN_PASSWORD is required")

    with httpx.Client(base_url=args.base_url, timeout=30) as client:
        login = client.post("/api/v1/auth/login", json={"email": args.email, "password": args.password})
        login.raise_for_status()
        csrf = login.json()["csrf_token"]
        headers = {"X-CSRF-Token": csrf}

        template = client.get("/api/v1/admin/excel/template")
        template.raise_for_status()
        assert template.content.startswith(b"PK"), "Template response is not an XLSX archive"

        before = client.get("/api/v1/public/projects")
        before.raise_for_status()
        assert before.json() == [], "Acceptance database must start without public projects"

        with args.workbook.open("rb") as handle:
            upload = client.post(
                "/api/v1/admin/imports",
                headers=headers,
                files={"file": (args.workbook.name, handle, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            )
        upload.raise_for_status()
        job_id = upload.json()["id"]

        preview = client.get(f"/api/v1/admin/imports/{job_id}/preview")
        preview.raise_for_status()
        preview_body = preview.json()
        assert preview_body["summary"].get("new") == 14
        assert not preview_body["summary"].get("conflict")
        assert not preview_body["summary"].get("invalid")

        confirm = client.post(f"/api/v1/admin/imports/{job_id}/confirm", headers=headers)
        confirm.raise_for_status()
        pending_public = client.get("/api/v1/public/projects")
        pending_public.raise_for_status()
        assert pending_public.json() == [], "Pending observations leaked into the public API"

        reviews = client.get("/api/v1/admin/reviews")
        reviews.raise_for_status()
        pending_reviews = [item for item in reviews.json() if item["status"] == "pending"]
        assert len(pending_reviews) == 6
        rejected_review = next(item for item in pending_reviews if item["observation_type"] == "production")
        rejected = client.post(
            f"/api/v1/admin/reviews/{rejected_review['id']}/reject",
            headers={**headers, "Content-Type": "application/json"},
            json={"comment": "Phase 1A HTTP rejection verification"},
        )
        rejected.raise_for_status()

        accepted_reviews = [item for item in pending_reviews if item["id"] != rejected_review["id"]]
        for item in accepted_reviews:
            accepted = client.post(
                f"/api/v1/admin/reviews/{item['id']}/accept-and-publish",
                headers={**headers, "Content-Type": "application/json"},
                json={"comment": "Phase 1A HTTP acceptance verification"},
            )
            accepted.raise_for_status()

        published = client.get("/api/v1/public/projects")
        published.raise_for_status()
        slugs = sorted(project["slug"] for project in published.json())
        assert slugs == ["escondida", "morenci"]

        details = {}
        for slug in slugs:
            detail = client.get(f"/api/v1/public/projects/{slug}")
            detail.raise_for_status()
            details[slug] = detail.json()
        public_observations = [
            item
            for detail in details.values()
            for group in ("production", "guidance", "reserves")
            for item in detail[group]
        ]
        assert rejected_review["observation_id"] not in {item["id"] for item in public_observations}
        missing = [item for item in public_observations if item["value"] is None]
        assert missing and all(item["missing_reason"] for item in missing)
        assert all(item["value"] != "待补" for item in missing)

        with httpx.Client(base_url=args.web_url, timeout=30) as web:
            assert web.get("/").status_code == 200
            for slug in slugs:
                assert web.get(f"/projects/{slug}").status_code == 200

        with args.workbook.open("rb") as handle:
            repeat = client.post(
                "/api/v1/admin/imports",
                headers=headers,
                files={"file": (args.workbook.name, handle, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
            )
        repeat.raise_for_status()
        repeat_preview = client.get(f"/api/v1/admin/imports/{repeat.json()['id']}/preview")
        repeat_preview.raise_for_status()
        assert repeat_preview.json()["summary"] == {"no_change": 14}

        print(json.dumps({
            "initial_preview": preview_body["summary"],
            "pending_public_count": len(pending_public.json()),
            "pending_review_count": len(pending_reviews),
            "accepted_review_count": len(accepted_reviews),
            "rejected_review_count": 1,
            "published_projects": slugs,
            "repeat_preview": repeat_preview.json()["summary"],
            "template_download_verified": True,
            "null_missing_reason_verified": True,
            "public_web_routes_verified": True,
        }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
