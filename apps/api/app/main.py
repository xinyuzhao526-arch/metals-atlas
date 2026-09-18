from collections import Counter
from contextlib import asynccontextmanager
from datetime import datetime
import logging
from pathlib import Path
from typing import Any

from fastapi import Cookie, Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.admin_projects import admin_project_detail, list_admin_projects
from app.auth import COOKIE_NAME, admin_write, clear_session, current_user, issue_session, revoke_session, verify_password
from app.config import get_settings
from app.database import get_db
from app.excel import build_template
from app.imports import OBSERVATION_MODELS, create_preview, confirm_import, import_action_summary, preview_before_payload, preview_field_diff, save_upload
from app.models import Country, ImportJob, ImportRow, Project, ResearchCandidate, ResearchDiscovery, ResearchRun, ReviewItem, Source, User, utcnow
from app.public import list_projects, project_detail, public_revision_chain, public_source_detail
from app.research import (
    ResearchError,
    create_manual_candidate,
    create_research_run,
    extract_deterministic_candidates,
    fetch_source_document,
    publish_candidate,
    restore_candidate,
    serialize_candidate,
    serialize_source,
    set_candidate_ignored,
)
from app.reviews import accept_and_publish, modify_accept_and_publish, reject


settings = get_settings()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    settings.source_storage_dir.mkdir(parents=True, exist_ok=True)
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


class ResearchRunBody(BaseModel):
    project_ref: str
    requested_metrics: list[str] = Field(default_factory=lambda: ["production", "guidance"])


class ResearchUrlBody(BaseModel):
    url: str


class ExtractDocumentBody(BaseModel):
    research_run_id: str


class ManualCandidateBody(BaseModel):
    research_run_id: str
    metric_type: str = "production"
    raw_value: str | None = None
    raw_unit: str | None = None
    normalized_value: str | None = None
    normalized_unit: str | None = None
    missing_reason: str | None = None
    period_start: str | None = None
    period_end: str | None = None
    effective_date: str | None = None
    calendar_basis: str | None = None
    fiscal_year_label: str | None = None
    fiscal_year_start_month: int | None = None
    period_type: str | None = None
    production_stage: str | None = None
    ownership_basis: str | None = None
    confidence: str = "1"
    evidence_type: str | None = None
    page_number: int | None = None
    evidence_locator: str | None = None
    quoted_excerpt: str
    extraction_method: str = "manual"
    source_title: str | None = None
    publisher: str | None = None
    source_published_at: str | None = None
    supersedes_observation_id: str | None = None
    candidate_payload: dict[str, Any] = Field(default_factory=dict)


class PublishCandidateBody(BaseModel):
    changes: dict[str, Any] = Field(default_factory=dict)


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


@app.get("/api/v1/admin/research/projects")
def research_projects(_user: User = Depends(current_user), db: Session = Depends(get_db)):
    projects = list(db.scalars(select(Project).order_by(Project.name)))
    return [{"id": item.id, "slug": item.slug, "name": item.name} for item in projects]


@app.post("/api/v1/admin/research/runs")
def create_research(body: ResearchRunBody, user: User = Depends(admin_write), db: Session = Depends(get_db)):
    project = db.scalar(select(Project).where(or_(Project.id == body.project_ref, Project.slug == body.project_ref)))
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    run = create_research_run(db, project, user, body.requested_metrics)
    return {"id": run.id, "status": run.status, "project": {"id": project.id, "slug": project.slug, "name": project.name}}


@app.get("/api/v1/admin/research/runs")
def research_runs(_user: User = Depends(current_user), db: Session = Depends(get_db)):
    result = []
    for run in db.scalars(select(ResearchRun).order_by(ResearchRun.created_at.desc())):
        project = db.get(Project, run.project_id)
        discoveries = list(db.scalars(select(ResearchDiscovery).where(ResearchDiscovery.research_run_id == run.id)))
        candidates = list(db.scalars(select(ResearchCandidate).where(ResearchCandidate.research_run_id == run.id)))
        result.append({
            "id": run.id,
            "status": run.status,
            "requested_metrics": run.requested_metrics,
            "created_at": run.created_at,
            "project": {"id": project.id, "slug": project.slug, "name": project.name},
            "document_count": sum(1 for item in discoveries if item.source_document_id),
            "candidate_counts": dict(Counter(item.status for item in candidates)),
        })
    return {"items": result}


@app.get("/api/v1/admin/research/runs/{run_id}")
def research_run_detail(run_id: str, _user: User = Depends(current_user), db: Session = Depends(get_db)):
    run = db.get(ResearchRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="研究任务不存在")
    project = db.get(Project, run.project_id)
    discoveries = list(db.scalars(select(ResearchDiscovery).where(ResearchDiscovery.research_run_id == run.id).order_by(ResearchDiscovery.created_at.desc())))
    documents = []
    for item in discoveries:
        if item.source_document_id:
            source = db.get(Source, item.source_document_id)
            if source:
                documents.append(serialize_source(source))
    candidates = list(db.scalars(select(ResearchCandidate).where(ResearchCandidate.research_run_id == run.id).order_by(ResearchCandidate.created_at.desc())))
    return {
        "id": run.id,
        "status": run.status,
        "project": {"id": project.id, "slug": project.slug, "name": project.name},
        "documents": documents,
        "candidates": [serialize_candidate(db, item) for item in candidates],
        "ai_extractor": {
            "configured": bool(settings.extraction_api_key and settings.extraction_model),
            "model": settings.extraction_model,
            "note": "ChatGPT/Codex 订阅不是网站 API 凭据；在线 AI 需单独配置供应商实现和密钥。",
        },
    }


@app.post("/api/v1/admin/research/runs/{run_id}/documents")
def add_research_document(run_id: str, body: ResearchUrlBody, _user: User = Depends(admin_write), db: Session = Depends(get_db)):
    run = db.get(ResearchRun, run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="研究任务不存在")
    try:
        source = fetch_source_document(db, run, body.url, settings.source_storage_dir)
    except ResearchError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return serialize_source(source)


@app.post("/api/v1/admin/research/documents/{source_id}/extract")
def extract_research_document(source_id: str, body: ExtractDocumentBody, _user: User = Depends(admin_write), db: Session = Depends(get_db)):
    run = db.get(ResearchRun, body.research_run_id)
    source = db.get(Source, source_id)
    if run is None or source is None:
        raise HTTPException(status_code=404, detail="研究任务或来源文档不存在")
    try:
        candidates = extract_deterministic_candidates(db, run, source, settings.source_storage_dir)
    except ResearchError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"items": [serialize_candidate(db, item) for item in candidates], "extraction_method": "deterministic"}


@app.post("/api/v1/admin/research/documents/{source_id}/candidates")
def add_manual_candidate(source_id: str, body: ManualCandidateBody, _user: User = Depends(admin_write), db: Session = Depends(get_db)):
    run = db.get(ResearchRun, body.research_run_id)
    source = db.get(Source, source_id)
    if run is None or source is None:
        raise HTTPException(status_code=404, detail="研究任务或来源文档不存在")
    try:
        candidate = create_manual_candidate(db, run, source, body.model_dump())
    except ResearchError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return serialize_candidate(db, candidate)


@app.get("/api/v1/admin/research/candidates")
def research_candidates(run_id: str | None = None, _user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(ResearchCandidate).order_by(ResearchCandidate.created_at.desc())
    if run_id:
        query = query.where(ResearchCandidate.research_run_id == run_id)
    return {"items": [serialize_candidate(db, item) for item in db.scalars(query)]}


@app.get("/api/v1/admin/research/candidates/{candidate_id}")
def research_candidate(candidate_id: str, _user: User = Depends(current_user), db: Session = Depends(get_db)):
    candidate = db.get(ResearchCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="候选不存在")
    return serialize_candidate(db, candidate)


@app.post("/api/v1/admin/research/candidates/{candidate_id}/publish")
def publish_research_candidate(candidate_id: str, user: User = Depends(admin_write), db: Session = Depends(get_db)):
    try:
        observation_type, observation_id, idempotent = publish_candidate(db, candidate_id, user)
    except ResearchError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"status": "published", "observation_type": observation_type, "observation_id": observation_id, "idempotent": idempotent}


@app.post("/api/v1/admin/research/candidates/{candidate_id}/publish-modified")
def publish_modified_research_candidate(candidate_id: str, body: PublishCandidateBody, user: User = Depends(admin_write), db: Session = Depends(get_db)):
    try:
        observation_type, observation_id, idempotent = publish_candidate(db, candidate_id, user, body.changes)
    except ResearchError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"status": "published", "observation_type": observation_type, "observation_id": observation_id, "idempotent": idempotent}


@app.post("/api/v1/admin/research/candidates/{candidate_id}/ignore")
def ignore_research_candidate(candidate_id: str, _user: User = Depends(admin_write), db: Session = Depends(get_db)):
    candidate = db.get(ResearchCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="候选不存在")
    try:
        set_candidate_ignored(db, candidate)
    except ResearchError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"status": "ignored"}


@app.post("/api/v1/admin/research/candidates/{candidate_id}/restore")
def restore_research_candidate(candidate_id: str, _user: User = Depends(admin_write), db: Session = Depends(get_db)):
    candidate = db.get(ResearchCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail="候选不存在")
    try:
        restore_candidate(db, candidate)
    except ResearchError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"status": candidate.status, "candidate": serialize_candidate(db, candidate)}


@app.get("/api/v1/admin/reviews")
def review_list(_user: User = Depends(current_user), db: Session = Depends(get_db)):
    items = list(db.scalars(select(ReviewItem).where(ReviewItem.status == "pending").order_by(ReviewItem.created_at.desc())))
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


@app.get("/api/v1/public/observations/{kind}/{observation_id}/source")
def public_observation_source(kind: str, observation_id: str, db: Session = Depends(get_db)):
    result = public_source_detail(db, kind, observation_id)
    if result is None:
        raise HTTPException(status_code=404, detail="来源不存在或观察记录尚未发布")
    return result


@app.get("/api/v1/public/observations/{kind}/{observation_id}/revisions")
def public_observation_revisions(kind: str, observation_id: str, db: Session = Depends(get_db)):
    result = public_revision_chain(db, kind, observation_id)
    if result is None:
        raise HTTPException(status_code=404, detail="观察记录不存在或尚未发布")
    return {"items": result}
