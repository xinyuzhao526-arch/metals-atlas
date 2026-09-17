import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text, UniqueConstraint
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
    published_at: Mapped[date] = mapped_column(Date, nullable=False)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    verified_at: Mapped[date] = mapped_column(Date, nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


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
    __table_args__ = (UniqueConstraint("source_code", "record_key", name="uq_production_source_record"), *observation_checks("production"))


class GuidanceObservation(Base, ObservationMixin):
    __tablename__ = "guidance_observations"
    guidance_low: Mapped[Decimal | None] = mapped_column(Numeric(24, 6))
    guidance_high: Mapped[Decimal | None] = mapped_column(Numeric(24, 6))
    guidance_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    adjustment_type: Mapped[str | None] = mapped_column(String(64))
    adjustment_date: Mapped[date | None] = mapped_column(Date)
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
