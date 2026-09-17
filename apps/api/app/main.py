from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime
import logging
from pathlib import Path
from typing import Any

from fastapi import Cookie, Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.admin_projects import admin_project_detail, list_admin_projects
from app.auth import COOKIE_NAME, admin_write, clear_session, current_user, issue_session, revoke_session, verify_password
from app.config import get_settings
from app.database import get_db
from app.excel import build_template
from app.imports import OBSERVATION_MODELS, create_preview, confirm_import, import_action_summary, preview_before_payload, preview_field_diff, save_upload
from app.models import Country, ImportJob, ImportRow, Project, ReviewItem, User, utcnow
from app.public import list_projects, project_detail
from app.reviews import accept_and_publish, modify_accept_and_publish, reject


settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="全球金属供给图谱 API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[settings.web_origin], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class ReviewBody(BaseModel):
    comment: str | None = None


class ModifyReviewBody(ReviewBody):
    changes: dict[str, Any]


@app.get("/health/live")
def live() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
def ready(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(select(1))
    return {"status": "ready"}


@app.post("/api/v1/auth/login")
def login(body: LoginBody, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    user.last_login_at = utcnow()
    db.commit()
    csrf = issue_session(response, user)
    return {"user": {"id": user.id, "email": user.email, "display_name": user.display_name}, "csrf_token": csrf}


@app.post("/api/v1/auth/logout")
def logout(
    response: Response,
    _user: User = Depends(admin_write),
    session_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
):
    revoke_session(session_token)
    clear_session(response)
    return {"ok": True}


@app.get("/api/v1/auth/me")
def me(user: User = Depends(current_user)):
    return {"id": user.id, "email": user.email, "display_name": user.display_name}


@app.get("/api/v1/admin/excel/template")
def excel_template(_user: User = Depends(current_user), db: Session = Depends(get_db)):
    country_iso3s = db.scalars(select(Country.iso3).order_by(Country.iso3)).all()
    return StreamingResponse(iter([build_template(country_iso3s)]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": 'attachment; filename="metals-atlas-phase1a-template.xlsx"'})


@app.get("/api/v1/admin/projects")
def admin_projects(
    q: str | None = None,
    country: str | None = None,
    status: str | None = None,
    completeness: str | None = None,
    sort: str = "created_desc",
    page: int = 1,
    page_size: int = 25,
    _user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    return list_admin_projects(
        db,
        q=q,
        country=country,
        status=status,
        completeness=completeness,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@app.get("/api/v1/admin/projects/{project_ref}")
def admin_project(project_ref: str, _user: User = Depends(current_user), db: Session = Depends(get_db)):
    result = admin_project_detail(db, project_ref)
    if result is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return result


@app.post("/api/v1/admin/imports")
def upload_import(file: UploadFile = File(...), user: User = Depends(admin_write), db: Session = Depends(get_db)):
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="只支持 .xlsx 文件")
    path = save_upload(file, settings.upload_dir)
    try:
        job = create_preview(db, path, file.filename or "upload.xlsx", user.id)
    except ValueError as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"id": job.id, "status": job.status, "summary": job.summary}


@app.get("/api/v1/admin/imports")
def import_history(limit: int = 20, _user: User = Depends(current_user), db: Session = Depends(get_db)):
    jobs = list(db.scalars(select(ImportJob).order_by(ImportJob.created_at.desc()).limit(max(1, min(limit, 100)))))
    items = []
    for job in jobs:
        rows = list(db.scalars(select(ImportRow).where(ImportRow.import_job_id == job.id)))
        summary = {
            name: int(job.summary.get(name, 0))
            for name in ("new", "update", "no_change", "conflict", "invalid")
        }
        items.append(
            {
                "id": job.id,
                "filename": job.filename,
                "status": job.status,
                "summary": summary,
                "previewed_at": job.previewed_at,
                "confirmed_at": job.confirmed_at,
                "created_at": job.created_at,
                "row_count": len(rows),
                "applied_count": sum(1 for row in rows if row.applied_record_id),
                "error_count": sum(1 for row in rows if row.errors),
                "action_summary": import_action_summary(rows),
            }
        )
    return {"items": items}


def import_row_entity(db: Session, row: ImportRow) -> dict[str, Any] | None:
    payload = row.normalized_payload or {}
    project = None
    if row.sheet_name == "projects":
        record_id = row.applied_record_id or row.matched_record_id
        project = db.get(Project, record_id) if record_id else None
        label = project.name if project else payload.get("name") or payload.get("slug")
    else:
        project_slug = payload.get("project_slug")
        project = db.scalar(select(Project).where(Project.slug == project_slug)) if project_slug else None
        label = (
            payload.get("canonical_name")
            or payload.get("code")
            or payload.get("record_key")
            or payload.get("company_name")
        )
    return {
        "type": row.sheet_name,
        "id": row.applied_record_id or row.matched_record_id,
        "label": label,
        "project": (
            {
                "id": project.id,
                "slug": project.slug,
                "name": project.name,
                "admin_path": f"/admin/projects/{project.slug}",
            }
            if project
            else None
        ),
    }


@app.get("/api/v1/admin/imports/{job_id}/preview")
def import_preview(job_id: str, _user: User = Depends(current_user), db: Session = Depends(get_db)):
    job = db.get(ImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="导入任务不存在")
    rows = list(db.scalars(select(ImportRow).where(ImportRow.import_job_id == job_id).order_by(ImportRow.sheet_name, ImportRow.row_number)))
    classifications = ("new", "update", "no_change", "conflict", "invalid")
    summary = {name: int(job.summary.get(name, 0)) for name in classifications}
    sheet_counts = dict(Counter(row.sheet_name for row in rows))
    preview_rows = []
    for row in rows:
        before = preview_before_payload(db, row)
        if job.status == "confirmed":
            confirmation_result = (
                "skipped" if row.classification == "no_change"
                else "applied" if row.applied_record_id
                else "failed"
            )
        else:
            confirmation_result = "not_confirmed"
        preview_rows.append(
            {
                "id": row.id,
                "sheet": row.sheet_name,
                "row_number": row.row_number,
                "classification": row.classification,
                "errors": row.errors,
                "warnings": [],
                "confirmation_result": confirmation_result,
                "applied_record_id": row.applied_record_id,
                "entity": import_row_entity(db, row),
                "raw": row.raw_payload,
                "normalized": row.normalized_payload,
                "before": before,
                "diff": preview_field_diff(before, row.normalized_payload),
            }
        )
    return {
        "id": job.id,
        "filename": job.filename,
        "status": job.status,
        "previewed_at": job.previewed_at,
        "confirmed_at": job.confirmed_at,
        "summary": summary,
        "sheet_counts": sheet_counts,
        "action_summary": import_action_summary(rows),
        "rows": preview_rows,
    }


@app.post("/api/v1/admin/imports/{job_id}/confirm")
def confirm(job_id: str, _user: User = Depends(admin_write), db: Session = Depends(get_db)):
    job = db.get(ImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="导入任务不存在")
    try:
        result = confirm_import(db, job)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("Import confirmation failed for job %s", job_id)
        raise HTTPException(status_code=500, detail="确认导入失败，本次未写入数据库") from exc
    return {
        "id": job.id,
        "status": job.status,
        "confirmed_at": job.confirmed_at,
        "result": result,
    }


@app.get("/api/v1/admin/reviews")
def review_list(_user: User = Depends(current_user), db: Session = Depends(get_db)):
    items = list(db.scalars(select(ReviewItem).order_by(ReviewItem.created_at.desc())))
    return [{"id": item.id, "observation_type": item.observation_type, "observation_id": item.observation_id, "status": item.status, "before": item.before_payload, "after": item.after_payload, "comment": item.reviewer_comment} for item in items]


@app.get("/api/v1/admin/reviews/{review_id}")
def review_detail(review_id: str, _user: User = Depends(current_user), db: Session = Depends(get_db)):
    item = db.get(ReviewItem, review_id)
    if not item:
        raise HTTPException(status_code=404, detail="审核项不存在")
    return {"id": item.id, "observation_type": item.observation_type, "observation_id": item.observation_id, "status": item.status, "before": item.before_payload, "after": item.after_payload, "comment": item.reviewer_comment}


@app.post("/api/v1/admin/reviews/{review_id}/accept-and-publish")
def accept_publish(review_id: str, body: ReviewBody, user: User = Depends(admin_write), db: Session = Depends(get_db)):
    item = db.get(ReviewItem, review_id)
    if not item:
        raise HTTPException(status_code=404, detail="审核项不存在")
    accept_and_publish(db, item, user, body.comment)
    return {"status": "approved_published"}


@app.post("/api/v1/admin/reviews/{review_id}/modify-accept-and-publish")
def modify_publish(review_id: str, body: ModifyReviewBody, user: User = Depends(admin_write), db: Session = Depends(get_db)):
    item = db.get(ReviewItem, review_id)
    if not item:
        raise HTTPException(status_code=404, detail="审核项不存在")
    try:
        modify_accept_and_publish(db, item, user, body.changes, body.comment)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"status": "modified_approved_published"}


@app.post("/api/v1/admin/reviews/{review_id}/reject")
def reject_review(review_id: str, body: ReviewBody, user: User = Depends(admin_write), db: Session = Depends(get_db)):
    item = db.get(ReviewItem, review_id)
    if not item:
        raise HTTPException(status_code=404, detail="审核项不存在")
    reject(db, item, user, body.comment)
    return {"status": "rejected"}


@app.get("/api/v1/public/projects")
def public_projects(q: str | None = None, country: str | None = None, status: str | None = None, stage: str | None = None, db: Session = Depends(get_db)):
    return list_projects(db, q, country, status, stage)


@app.get("/api/v1/public/projects/{slug}")
def public_project(slug: str, db: Session = Depends(get_db)):
    result = project_detail(db, slug)
    if not result:
        raise HTTPException(status_code=404, detail="项目不存在或尚未发布")
    return result
