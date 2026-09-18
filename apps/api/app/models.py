import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def uuid4() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class Metal(Base, TimestampMixin):
    __tablename__ = "metals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    name_zh: Mapped[str] = mapped_column(String(64), nullable=False)
    name_en: Mapped[str] = mapped_column(String(64), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Country(Base, TimestampMixin):
    __tablename__ = "countries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    iso2: Mapped[str] = mapped_column(String(2), unique=True, nullable=False)
    iso3: Mapped[str] = mapped_column(String(3), unique=True, nullable=False)
    name_zh: Mapped[str] = mapped_column(String(128), nullable=False)
    name_en: Mapped[str] = mapped_column(String(128), nullable=False)
    region: Mapped[str] = mapped_column(String(64), nullable=False)


class Company(Base, TimestampMixin):
    __tablename__ = "companies"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    canonical_name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(250))
    country_id: Mapped[str | None] = mapped_column(ForeignKey("countries.id"))
    website: Mapped[str | None] = mapped_column(String(500))
    fiscal_year_start_month: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    __table_args__ = (CheckConstraint("fiscal_year_start_month BETWEEN 1 AND 12", name="ck_company_fy_month"),)


class Project(Base, TimestampMixin):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    country_id: Mapped[str] = mapped_column(ForeignKey("countries.id"), nullable=False)
    operator_company_id: Mapped[str | None] = mapped_column(ForeignKey("companies.id"))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    status: Mapped[str] = mapped_column(String(32), default="operating", nullable=False)
    raw_material_route: Mapped[str | None] = mapped_column(String(64))


class ProjectOwnership(Base, TimestampMixin):
    __tablename__ = "project_ownership"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    company_id: Mapped[str] = mapped_column(ForeignKey("companies.id"), nullable=False)
    ownership_pct: Mapped[Decimal] = mapped_column(Numeric(9, 6), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date)
    __table_args__ = (
        CheckConstraint("ownership_pct >= 0 AND ownership_pct <= 100", name="ck_ownership_pct"),
        CheckConstraint("valid_to IS NULL OR valid_to >= valid_from", name="ck_ownership_dates"),
        UniqueConstraint("project_id", "company_id", "valid_from", name="uq_ownership_start"),
    )


class Source(Base, TimestampMixin):
    __tablename__ = "sources"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    organization_name: Mapped[str] = mapped_column(String(250), nullable=False)
    material_title: Mapped[str] = mapped_column(String(500), nullable=False)
    material_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    published_at: Mapped[date | None] = mapped_column(Date)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    verified_at: Mapped[date | None] = mapped_column(Date)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    normalized_url: Mapped[str | None] = mapped_column(String(1000), unique=True)
    final_url: Mapped[str | None] = mapped_column(String(1000))
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    mime_type: Mapped[str | None] = mapped_column(String(200))
    sha256: Mapped[str | None] = mapped_column(String(64), unique=True)
    local_storage_path: Mapped[str | None] = mapped_column(String(1000))
    http_status: Mapped[int | None] = mapped_column(Integer)
    retrieval_method: Mapped[str | None] = mapped_column(String(32))
    terms_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    terms_status: Mapped[str | None] = mapped_column(String(32))
    robots_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    robots_status: Mapped[str | None] = mapped_column(String(32))
    parse_status: Mapped[str] = mapped_column(String(32), default="not_parsed", nullable=False)
    source_tier: Mapped[str | None] = mapped_column(String(1))
    content_length: Mapped[int | None] = mapped_column(Integer)
    last_fetch_error: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        CheckConstraint("source_tier IS NULL OR source_tier IN ('A','B')", name="ck_source_tier"),
        CheckConstraint("parse_status IN ('not_parsed','parsed','failed')", name="ck_source_parse_status"),
    )


class ResearchRun(Base, TimestampMixin):
    __tablename__ = "research_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    requested_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    requested_metrics: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("status IN ('active','completed','failed')", name="ck_research_run_status"),
        Index("ix_research_runs_project_created", "project_id", "created_at"),
    )


class ResearchDiscovery(Base, TimestampMixin):
    __tablename__ = "research_discoveries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    research_run_id: Mapped[str] = mapped_column(ForeignKey("research_runs.id"), nullable=False)
    query: Mapped[str | None] = mapped_column(Text)
    original_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    normalized_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    result_title: Mapped[str | None] = mapped_column(String(500))
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    result_rank: Mapped[int | None] = mapped_column(Integer)
    discovery_method: Mapped[str] = mapped_column(String(32), default="manual", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="discovered", nullable=False)
    source_document_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"))
    __table_args__ = (
        UniqueConstraint("research_run_id", "normalized_url", name="uq_research_discovery_url"),
        CheckConstraint("status IN ('discovered','fetched','failed','ignored')", name="ck_research_discovery_status"),
    )


class SourceFetchAttempt(Base):
    __tablename__ = "source_fetch_attempts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    research_run_id: Mapped[str] = mapped_column(ForeignKey("research_runs.id"), nullable=False)
    discovery_id: Mapped[str | None] = mapped_column(ForeignKey("research_discoveries.id"))
    source_document_id: Mapped[str | None] = mapped_column(ForeignKey("sources.id"))
    requested_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    final_url: Mapped[str | None] = mapped_column(String(1000))
    redirect_chain: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="started", nullable=False)
    http_status: Mapped[int | None] = mapped_column(Integer)
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("status IN ('started','succeeded','failed','blocked','rate_limited')", name="ck_source_fetch_status"),
        Index("ix_source_fetch_attempts_run_started", "research_run_id", "started_at"),
    )


class DocumentEvidence(Base, TimestampMixin):
    __tablename__ = "document_evidence"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    source_document_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(32), nullable=False)
    page_number: Mapped[int | None] = mapped_column(Integer)
    page_label: Mapped[str | None] = mapped_column(String(64))
    table_title: Mapped[str | None] = mapped_column(String(500))
    sheet_name: Mapped[str | None] = mapped_column(String(200))
    cell_range: Mapped[str | None] = mapped_column(String(64))
    json_path: Mapped[str | None] = mapped_column(String(500))
    quoted_excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    context_before: Mapped[str | None] = mapped_column(Text)
    context_after: Mapped[str | None] = mapped_column(Text)
    evidence_locator: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    locator_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    extraction_method: Mapped[str] = mapped_column(String(32), nullable=False)
    ai_confidence: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    __table_args__ = (
        UniqueConstraint("source_document_id", "locator_hash", name="uq_document_evidence_locator"),
        CheckConstraint("evidence_type IN ('pdf_page','html_section','table','cell','json_path')", name="ck_evidence_type"),
        CheckConstraint("page_number IS NULL OR page_number >= 1", name="ck_evidence_page_number"),
        CheckConstraint("ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)", name="ck_evidence_confidence"),
    )


class ResearchCandidate(Base, TimestampMixin):
    __tablename__ = "research_candidates"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    research_run_id: Mapped[str] = mapped_column(ForeignKey("research_runs.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(32), default="project", nullable=False)
    metric_type: Mapped[str] = mapped_column(String(32), nullable=False)
    raw_value: Mapped[str | None] = mapped_column(String(100))
    raw_unit: Mapped[str | None] = mapped_column(String(32))
    normalized_value: Mapped[Decimal | None] = mapped_column(Numeric(24, 6))
    normalized_unit: Mapped[str | None] = mapped_column(String(32))
    missing_reason: Mapped[str | None] = mapped_column(String(64))
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    effective_date: Mapped[date | None] = mapped_column(Date)
    calendar_basis: Mapped[str | None] = mapped_column(String(32))
    fiscal_year_label: Mapped[str | None] = mapped_column(String(32))
    fiscal_year_start_month: Mapped[int | None] = mapped_column(Integer)
    period_type: Mapped[str | None] = mapped_column(String(32))
    production_stage: Mapped[str | None] = mapped_column(String(64))
    ownership_basis: Mapped[str | None] = mapped_column(String(32))
    source_document_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), nullable=False)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("document_evidence.id"), nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="needs_attention", nullable=False)
    blocking_issues: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    validation_warnings: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    unresolved_fields: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    candidate_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    extracted_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    extraction_method: Mapped[str] = mapped_column(String(32), nullable=False)
    extraction_model: Mapped[str | None] = mapped_column(String(200))
    extraction_prompt_version: Mapped[str | None] = mapped_column(String(64))
    candidate_fingerprint: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    candidate_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    published_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    administrator_changes: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    supersedes_observation_id: Mapped[str | None] = mapped_column(String(36))
    published_observation_type: Mapped[str | None] = mapped_column(String(32))
    published_observation_id: Mapped[str | None] = mapped_column(String(36))
    confirmed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint("metric_type IN ('production','guidance','reserves')", name="ck_candidate_metric_type"),
        CheckConstraint("status IN ('ready','needs_attention','ignored','published')", name="ck_candidate_status"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_candidate_confidence"),
        CheckConstraint("extraction_method IN ('fixture','deterministic','ai','manual')", name="ck_candidate_extraction_method"),
        Index("ix_research_candidates_project_status", "project_id", "status"),
    )


class ObservationMixin(TimestampMixin):
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    metal_id: Mapped[str] = mapped_column(ForeignKey("metals.id"), nullable=False)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), nullable=False)
    source_code: Mapped[str] = mapped_column(String(120), nullable=False)
    record_key: Mapped[str] = mapped_column(String(200), nullable=False)
    original_value: Mapped[Decimal | None] = mapped_column(Numeric(24, 6))
    original_unit: Mapped[str | None] = mapped_column(String(32))
    normalized_value: Mapped[Decimal | None] = mapped_column(Numeric(24, 6))
    normalized_unit: Mapped[str] = mapped_column(String(32), default="kt", nullable=False)
    missing_reason: Mapped[str | None] = mapped_column(String(64))
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    calendar_basis: Mapped[str] = mapped_column(String(32), nullable=False)
    fiscal_year_label: Mapped[str | None] = mapped_column(String(32))
    fiscal_year_start_month: Mapped[int | None] = mapped_column(Integer)
    period_type: Mapped[str] = mapped_column(String(32), nullable=False)
    ownership_basis: Mapped[str] = mapped_column(String(32), nullable=False)
    production_stage: Mapped[str] = mapped_column(String(64), nullable=False)
    source_published_at: Mapped[date] = mapped_column(Date, nullable=False)
    source_locator: Mapped[str] = mapped_column(String(500), nullable=False)
    verified_at: Mapped[date] = mapped_column(Date, nullable=False)
    review_status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    row_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    evidence_id: Mapped[str | None] = mapped_column(ForeignKey("document_evidence.id"))
    research_candidate_id: Mapped[str | None] = mapped_column(ForeignKey("research_candidates.id"), unique=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


def observation_checks(prefix: str) -> tuple[CheckConstraint, ...]:
    return (
        CheckConstraint("period_end >= period_start", name=f"ck_{prefix}_period_dates"),
        CheckConstraint("calendar_basis IN ('calendar_year','fiscal_year')", name=f"ck_{prefix}_calendar_basis"),
        CheckConstraint("period_type IN ('quarter','ytd','annual','other')", name=f"ck_{prefix}_period_type"),
        CheckConstraint("ownership_basis IN ('project_100','equity','attributable','consolidated','unknown')", name=f"ck_{prefix}_ownership_basis"),
        CheckConstraint("review_status IN ('pending','approved','rejected')", name=f"ck_{prefix}_review_status"),
        CheckConstraint("normalized_value IS NOT NULL OR missing_reason IS NOT NULL", name=f"ck_{prefix}_missing_reason"),
        CheckConstraint("calendar_basis != 'fiscal_year' OR (fiscal_year_label IS NOT NULL AND fiscal_year_start_month BETWEEN 1 AND 12)", name=f"ck_{prefix}_fiscal_fields"),
    )


class ProductionObservation(Base, ObservationMixin):
    __tablename__ = "production_observations"
    is_cumulative: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_estimate: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    supersedes_id: Mapped[str | None] = mapped_column(ForeignKey("production_observations.id"), unique=True)
    __table_args__ = (UniqueConstraint("source_code", "record_key", name="uq_production_source_record"), *observation_checks("production"))


class GuidanceObservation(Base, ObservationMixin):
    __tablename__ = "guidance_observations"
    guidance_low: Mapped[Decimal | None] = mapped_column(Numeric(24, 6))
    guidance_high: Mapped[Decimal | None] = mapped_column(Numeric(24, 6))
    guidance_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    adjustment_type: Mapped[str | None] = mapped_column(String(64))
    adjustment_date: Mapped[date | None] = mapped_column(Date)
    supersedes_id: Mapped[str | None] = mapped_column(ForeignKey("guidance_observations.id"), unique=True)
    __table_args__ = (
        UniqueConstraint("source_code", "record_key", name="uq_guidance_source_record"),
        CheckConstraint("guidance_kind IN ('initial','revision','maintained')", name="ck_guidance_kind"),
        CheckConstraint("guidance_high IS NULL OR guidance_low IS NULL OR guidance_high >= guidance_low", name="ck_guidance_range"),
        *observation_checks("guidance"),
    )


class ReserveObservation(Base, ObservationMixin):
    __tablename__ = "reserve_observations"
    reserve_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    classification: Mapped[str] = mapped_column(String(64), nullable=False)
    ore_tonnage: Mapped[Decimal | None] = mapped_column(Numeric(24, 6))
    grade_pct: Mapped[Decimal | None] = mapped_column(Numeric(12, 6))
    contained_metal_value: Mapped[Decimal | None] = mapped_column(Numeric(24, 6))
    supersedes_id: Mapped[str | None] = mapped_column(ForeignKey("reserve_observations.id"), unique=True)
    __table_args__ = (
        UniqueConstraint("source_code", "record_key", name="uq_reserve_source_record"),
        CheckConstraint("reserve_kind IN ('reserve','resource')", name="ck_reserve_kind"),
        *observation_checks("reserve"),
    )


class ImportJob(Base, TimestampMixin):
    __tablename__ = "import_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    file_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    uploaded_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="previewed", nullable=False)
    summary: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    previewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ImportRow(Base, TimestampMixin):
    __tablename__ = "import_rows"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    import_job_id: Mapped[str] = mapped_column(ForeignKey("import_jobs.id"), nullable=False)
    sheet_name: Mapped[str] = mapped_column(String(64), nullable=False)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    normalized_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    matched_record_id: Mapped[str | None] = mapped_column(String(36))
    classification: Mapped[str] = mapped_column(String(32), nullable=False)
    errors: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    applied_record_id: Mapped[str | None] = mapped_column(String(36))
    __table_args__ = (UniqueConstraint("import_job_id", "sheet_name", "row_number", name="uq_import_row"),)


class ReviewItem(Base, TimestampMixin):
    __tablename__ = "review_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    observation_type: Mapped[str] = mapped_column(String(32), nullable=False)
    observation_id: Mapped[str] = mapped_column(String(36), nullable=False)
    import_row_id: Mapped[str | None] = mapped_column(ForeignKey("import_rows.id"))
    research_candidate_id: Mapped[str | None] = mapped_column(ForeignKey("research_candidates.id"), unique=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    before_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    after_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    reviewer_comment: Mapped[str | None] = mapped_column(Text)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("observation_type", "observation_id", name="uq_review_observation"),)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), default="Administrator", nullable=False)
    password_hash: Mapped[str] = mapped_column(String(500), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
