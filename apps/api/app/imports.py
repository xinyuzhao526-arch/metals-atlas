import hashlib
import shutil
from collections import Counter
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.excel import read_workbook
from app.models import (
    Company,
    Country,
    GuidanceObservation,
    ImportJob,
    ImportRow,
    Metal,
    ProductionObservation,
    Project,
    ProjectOwnership,
    ReserveObservation,
    ReviewItem,
    Source,
    utcnow,
)
from app.ownership import validate_ownership_overlap


OBSERVATION_MODELS = {
    "production": ProductionObservation,
    "guidance": GuidanceObservation,
    "reserves": ReserveObservation,
}
CALENDAR_BASES = {"calendar_year", "fiscal_year"}
PERIOD_TYPES = {"quarter", "ytd", "annual", "other"}
OWNERSHIP_BASES = {"project_100", "equity", "attributable", "consolidated", "unknown"}
PRODUCTION_STAGES = {"mine_contained_metal", "concentrate_contained_metal", "cathode", "anode_blister", "smelter_output"}


def equivalent_value(actual: Any, expected: Any) -> bool:
    if actual in (None, "") and expected in (None, ""):
        return True
    if isinstance(actual, (date, datetime)):
        actual = actual.date().isoformat() if isinstance(actual, datetime) else actual.isoformat()
    if isinstance(actual, Decimal):
        try:
            return actual == Decimal(str(expected))
        except InvalidOperation:
            return False
    return str(actual) == str(expected)


def as_date(value: Any, field: str, errors: list[str], required: bool = True) -> str | None:
    if value in (None, ""):
        if required:
            errors.append(f"{field} 必填")
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    try:
        return date.fromisoformat(str(value).strip()).isoformat()
    except ValueError:
        errors.append(f"{field} 必须为 YYYY-MM-DD")
        return None


def as_decimal(value: Any, field: str, errors: list[str], required: bool = False) -> str | None:
    if value in (None, ""):
        if required:
            errors.append(f"{field} 必填")
        return None
    try:
        return format(Decimal(str(value)), "f")
    except (InvalidOperation, ValueError):
        errors.append(f"{field} 必须为数值")
        return None


def as_int(value: Any, field: str, errors: list[str], required: bool = False) -> int | None:
    if value in (None, ""):
        if required:
            errors.append(f"{field} 必填")
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        errors.append(f"{field} 必须为整数")
        return None


def as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "是"}


def required_text(row: dict[str, Any], field: str, errors: list[str]) -> str | None:
    value = row.get(field)
    if value in (None, ""):
        errors.append(f"{field} 必填")
        return None
    return str(value).strip()


def normalize_row(sheet: str, row: dict[str, Any], known: dict[str, set[str]]) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    payload: dict[str, Any] = {}
    record_id = str(row.get("record_id")).strip() if row.get("record_id") else None
    row_version = as_int(row.get("row_version"), "row_version", errors)
    payload.update(record_id=record_id, row_version=row_version)

    if sheet == "sources":
        for field in ("code", "organization_name", "material_title", "material_url", "source_type"):
            payload[field] = required_text(row, field, errors)
        payload["published_at"] = as_date(row.get("published_at"), "published_at", errors)
        payload["verified_at"] = as_date(row.get("verified_at"), "verified_at", errors)
        payload["is_demo"] = as_bool(row.get("is_demo"))
        payload["notes"] = str(row.get("notes")).strip() if row.get("notes") else None
        return payload, errors

    if sheet == "companies":
        payload["canonical_name"] = required_text(row, "canonical_name", errors)
        payload["legal_name"] = str(row.get("legal_name")).strip() if row.get("legal_name") else None
        payload["country_iso3"] = required_text(row, "country_iso3", errors)
        if payload["country_iso3"]:
            payload["country_iso3"] = payload["country_iso3"].upper()
            if payload["country_iso3"] not in known["countries"]:
                errors.append(f"未知 ISO3: {payload['country_iso3']}")
        payload["website"] = str(row.get("website")).strip() if row.get("website") else None
        payload["fiscal_year_start_month"] = as_int(row.get("fiscal_year_start_month"), "fiscal_year_start_month", errors, True)
        if payload["fiscal_year_start_month"] and not 1 <= payload["fiscal_year_start_month"] <= 12:
            errors.append("fiscal_year_start_month 必须为 1-12")
        return payload, errors

    if sheet == "projects":
        for field in ("slug", "name", "country_iso3"):
            payload[field] = required_text(row, field, errors)
        if payload["country_iso3"]:
            payload["country_iso3"] = payload["country_iso3"].upper()
            if payload["country_iso3"] not in known["countries"]:
                errors.append(f"未知 ISO3: {payload['country_iso3']}")
        payload["operator_company"] = str(row.get("operator_company")).strip() if row.get("operator_company") else None
        payload["latitude"] = as_decimal(row.get("latitude"), "latitude", errors)
        payload["longitude"] = as_decimal(row.get("longitude"), "longitude", errors)
        payload["status"] = str(row.get("status") or "operating").strip()
        payload["raw_material_route"] = str(row.get("raw_material_route")).strip() if row.get("raw_material_route") else None
        return payload, errors

    if sheet == "ownership":
        payload["project_slug"] = required_text(row, "project_slug", errors)
        payload["company_name"] = required_text(row, "company_name", errors)
        payload["ownership_pct"] = as_decimal(row.get("ownership_pct"), "ownership_pct", errors, True)
        if payload["ownership_pct"] is not None and not Decimal("0") <= Decimal(payload["ownership_pct"]) <= Decimal("100"):
            errors.append("ownership_pct 必须为 0-100")
        payload["valid_from"] = as_date(row.get("valid_from"), "valid_from", errors)
        payload["valid_to"] = as_date(row.get("valid_to"), "valid_to", errors, False)
        if payload["valid_from"] and payload["valid_to"] and payload["valid_to"] < payload["valid_from"]:
            errors.append("valid_to 不得早于 valid_from")
        return payload, errors

    payload["project_slug"] = required_text(row, "project_slug", errors)
    payload["metal_code"] = required_text(row, "metal_code", errors)
    payload["source_code"] = required_text(row, "source_code", errors)
    payload["record_key"] = required_text(row, "record_key", errors)
    payload["original_unit"] = str(row.get("original_unit")).strip() if row.get("original_unit") else None
    payload["normalized_unit"] = str(row.get("normalized_unit") or "kt").strip()
    payload["missing_reason"] = str(row.get("missing_reason")).strip() if row.get("missing_reason") else None
    payload["period_start"] = as_date(row.get("period_start"), "period_start", errors)
    payload["period_end"] = as_date(row.get("period_end"), "period_end", errors)
    payload["effective_date"] = as_date(row.get("effective_date"), "effective_date", errors)
    payload["calendar_basis"] = required_text(row, "calendar_basis", errors)
    payload["fiscal_year_label"] = str(row.get("fiscal_year_label")).strip() if row.get("fiscal_year_label") else None
    payload["fiscal_year_start_month"] = as_int(row.get("fiscal_year_start_month"), "fiscal_year_start_month", errors)
    payload["period_type"] = required_text(row, "period_type", errors)
    payload["ownership_basis"] = required_text(row, "ownership_basis", errors)
    payload["production_stage"] = required_text(row, "production_stage", errors)
    payload["source_published_at"] = as_date(row.get("source_published_at"), "source_published_at", errors)
    payload["source_locator"] = required_text(row, "source_locator", errors)
    payload["verified_at"] = as_date(row.get("verified_at"), "verified_at", errors)
    payload["notes"] = str(row.get("notes")).strip() if row.get("notes") else None

    if payload["calendar_basis"] not in CALENDAR_BASES:
        errors.append("calendar_basis 非法")
    if payload["period_type"] not in PERIOD_TYPES:
        errors.append("period_type 非法")
    if payload["ownership_basis"] not in OWNERSHIP_BASES:
        errors.append("ownership_basis 非法")
    if payload["production_stage"] not in PRODUCTION_STAGES:
        errors.append("production_stage 非法")
    if payload["calendar_basis"] == "fiscal_year" and (not payload["fiscal_year_label"] or not payload["fiscal_year_start_month"]):
        errors.append("财年记录必须填写 fiscal_year_label 和 fiscal_year_start_month")
    if payload["period_start"] and payload["period_end"] and payload["period_end"] < payload["period_start"]:
        errors.append("period_end 不得早于 period_start")
    if payload["project_slug"] not in known["projects"]:
        errors.append("project_slug 无法识别")
    if payload["metal_code"] not in known["metals"]:
        errors.append("metal_code 无法识别")
    if payload["source_code"] not in known["sources"]:
        errors.append("source_code 无法识别")

    if sheet == "production":
        payload["original_value"] = as_decimal(row.get("original_value"), "original_value", errors)
        payload["normalized_value"] = as_decimal(row.get("normalized_value"), "normalized_value", errors)
        payload["is_cumulative"] = as_bool(row.get("is_cumulative"))
        payload["is_estimate"] = as_bool(row.get("is_estimate"))
    elif sheet == "guidance":
        payload["guidance_low"] = as_decimal(row.get("guidance_low"), "guidance_low", errors)
        payload["guidance_high"] = as_decimal(row.get("guidance_high"), "guidance_high", errors)
        low = Decimal(payload["guidance_low"]) if payload["guidance_low"] is not None else None
        high = Decimal(payload["guidance_high"]) if payload["guidance_high"] is not None else None
        if low is not None and high is not None and high < low:
            errors.append("guidance_high 不得小于 guidance_low")
        midpoint = (low + high) / 2 if low is not None and high is not None else low or high
        payload["original_value"] = format(midpoint, "f") if midpoint is not None else None
        payload["normalized_value"] = payload["original_value"]
        payload["guidance_kind"] = required_text(row, "guidance_kind", errors)
        if payload["guidance_kind"] not in {"initial", "revision", "maintained"}:
            errors.append("guidance_kind 非法")
        payload["adjustment_type"] = str(row.get("adjustment_type")).strip() if row.get("adjustment_type") else None
        payload["adjustment_date"] = as_date(row.get("adjustment_date"), "adjustment_date", errors, False)
    else:
        payload["contained_metal_value"] = as_decimal(row.get("contained_metal_value"), "contained_metal_value", errors)
        payload["original_value"] = payload["contained_metal_value"]
        payload["normalized_value"] = payload["contained_metal_value"]
        payload["reserve_kind"] = required_text(row, "reserve_kind", errors)
        if payload["reserve_kind"] not in {"reserve", "resource"}:
            errors.append("reserve_kind 非法")
        payload["classification"] = required_text(row, "classification", errors)
        payload["ore_tonnage"] = as_decimal(row.get("ore_tonnage"), "ore_tonnage", errors)
        payload["grade_pct"] = as_decimal(row.get("grade_pct"), "grade_pct", errors)

    if payload.get("normalized_value") is None and not payload.get("missing_reason"):
        errors.append("数值为空时必须填写 missing_reason")
    return payload, errors


def known_references(db: Session, workbook: dict[str, list[tuple[int, dict[str, Any]]]]) -> dict[str, set[str]]:
    return {
        "countries": set(db.scalars(select(Country.iso3))),
        "sources": set(db.scalars(select(Source.code))) | {str(r.get("code")).strip() for _, r in workbook["sources"] if r.get("code")},
        "projects": set(db.scalars(select(Project.slug))) | {str(r.get("slug")).strip() for _, r in workbook["projects"] if r.get("slug")},
        "metals": set(db.scalars(select(Metal.code))),
    }


def find_existing(db: Session, sheet: str, payload: dict[str, Any]):
    if sheet == "sources":
        return db.scalar(select(Source).where(Source.code == payload.get("code")))
    if sheet == "companies":
        return db.scalar(select(Company).where(Company.canonical_name == payload.get("canonical_name")))
    if sheet == "projects":
        return db.scalar(select(Project).where(Project.slug == payload.get("slug")))
    if sheet == "ownership":
        project = db.scalar(select(Project).where(Project.slug == payload.get("project_slug")))
        company = db.scalar(select(Company).where(Company.canonical_name == payload.get("company_name")))
        if not project or not company or not payload.get("valid_from"):
            return None
        return db.scalar(select(ProjectOwnership).where(ProjectOwnership.project_id == project.id, ProjectOwnership.company_id == company.id, ProjectOwnership.valid_from == date.fromisoformat(payload["valid_from"])))
    model = OBSERVATION_MODELS[sheet]
    return db.scalar(select(model).where(model.source_code == payload.get("source_code"), model.record_key == payload.get("record_key")))


def classify_row(db: Session, sheet: str, payload: dict[str, Any]) -> tuple[str, str | None, list[str], int | None]:
    stable = find_existing(db, sheet, payload)
    by_id = None
    if payload.get("record_id"):
        model = {"sources": Source, "companies": Company, "projects": Project, "ownership": ProjectOwnership, **OBSERVATION_MODELS}[sheet]
        by_id = db.get(model, payload["record_id"])
        if by_id is None or stable is None or by_id.id != stable.id:
            return "conflict", getattr(stable, "id", None), ["UUID 与稳定键不一致"], None
    existing = by_id or stable
    if not existing:
        return "new", None, [], None
    version = getattr(existing, "row_version", None)
    if payload.get("row_version") is not None and version is not None and payload["row_version"] != version:
        return "conflict", existing.id, ["row_version 已过期"], version
    return ("no_change" if payload_matches(db, sheet, payload, existing) else "update"), existing.id, [], version


def payload_matches(db: Session, sheet: str, payload: dict[str, Any], existing: Any) -> bool:
    ignore = {"record_id", "row_version"}
    if sheet == "sources":
        fields = ["code", "organization_name", "material_title", "material_url", "published_at", "source_type", "verified_at", "is_demo", "notes"]
    elif sheet == "companies":
        country = db.get(Country, existing.country_id) if existing.country_id else None
        current = {"canonical_name": existing.canonical_name, "legal_name": existing.legal_name, "country_iso3": country.iso3 if country else None, "website": existing.website, "fiscal_year_start_month": existing.fiscal_year_start_month}
        return all(equivalent_value(current.get(k), payload.get(k)) for k in current)
    elif sheet == "projects":
        country = db.get(Country, existing.country_id)
        operator = db.get(Company, existing.operator_company_id) if existing.operator_company_id else None
        current = {"slug": existing.slug, "name": existing.name, "country_iso3": country.iso3, "operator_company": operator.canonical_name if operator else None, "latitude": existing.latitude, "longitude": existing.longitude, "status": existing.status, "raw_material_route": existing.raw_material_route}
        return all(equivalent_value(current.get(k), payload.get(k)) for k in current)
    elif sheet == "ownership":
        fields = ["ownership_pct", "valid_from", "valid_to"]
    else:
        fields = [k for k in payload if k not in ignore]
        project = db.get(Project, existing.project_id)
        metal = db.get(Metal, existing.metal_id)
        source = db.get(Source, existing.source_id)
        mapping = {"project_slug": project.slug, "metal_code": metal.code, "source_code": source.code}
        for key in fields:
            expected = payload.get(key)
            actual = mapping.get(key, getattr(existing, key, None))
            if not equivalent_value(actual, expected):
                return False
        return True
    for field in fields:
        actual = getattr(existing, field)
        if not equivalent_value(actual, payload.get(field)):
            return False
    return True


def preview_before_payload(db: Session, row: ImportRow) -> dict[str, Any] | None:
    if not row.matched_record_id or not row.normalized_payload:
        return None
    model = {
        "sources": Source,
        "companies": Company,
        "projects": Project,
        "ownership": ProjectOwnership,
        **OBSERVATION_MODELS,
    }.get(row.sheet_name)
    if model is None:
        return None
    existing = db.get(model, row.matched_record_id)
    if existing is None:
        return None

    normalized = row.normalized_payload
    before: dict[str, Any] = {
        "record_id": existing.id,
        "row_version": getattr(existing, "row_version", None),
    }
    relationships: dict[str, Any] = {}
    if row.sheet_name == "companies":
        country = db.get(Country, existing.country_id) if existing.country_id else None
        relationships["country_iso3"] = country.iso3 if country else None
    elif row.sheet_name == "projects":
        country = db.get(Country, existing.country_id)
        operator = db.get(Company, existing.operator_company_id) if existing.operator_company_id else None
        relationships.update(
            country_iso3=country.iso3 if country else None,
            operator_company=operator.canonical_name if operator else None,
        )
    elif row.sheet_name == "ownership":
        project = db.get(Project, existing.project_id)
        company = db.get(Company, existing.company_id)
        relationships.update(
            project_slug=project.slug if project else None,
            company_name=company.canonical_name if company else None,
        )
    elif row.sheet_name in OBSERVATION_MODELS:
        project = db.get(Project, existing.project_id)
        metal = db.get(Metal, existing.metal_id)
        source = db.get(Source, existing.source_id)
        relationships.update(
            project_slug=project.slug if project else None,
            metal_code=metal.code if metal else None,
            source_code=source.code if source else None,
        )

    for field_name in normalized:
        if field_name.startswith("_") or field_name in before:
            continue
        before[field_name] = relationships.get(
            field_name,
            getattr(existing, field_name, None),
        )
    return raw_to_json(before)


def preview_field_diff(
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> dict[str, dict[str, Any]]:
    if before is None or after is None:
        return {}
    result: dict[str, dict[str, Any]] = {}
    for field_name, after_value in after.items():
        if field_name.startswith("_") or field_name in {"record_id", "row_version"}:
            continue
        before_value = before.get(field_name)
        if not equivalent_value(before_value, after_value):
            result[field_name] = {
                "before": raw_to_json(before_value),
                "after": raw_to_json(after_value),
            }
    return result


def create_preview(db: Session, source_path: Path, filename: str, user_id: str) -> ImportJob:
    workbook = read_workbook(source_path)
    known = known_references(db, workbook)
    digest = hashlib.sha256(source_path.read_bytes()).hexdigest()
    job = ImportJob(filename=filename, file_hash=digest, file_path=str(source_path), uploaded_by=user_id, status="previewed", summary={})
    db.add(job)
    db.flush()
    counts: Counter[str] = Counter()
    duplicate_keys: dict[tuple[str, str, str], tuple[dict[str, Any], ImportRow]] = {}
    for sheet, rows in workbook.items():
        for row_number, raw in rows:
            normalized, errors = normalize_row(sheet, raw, known)
            classification = "invalid" if errors else "new"
            matched_id = None
            matched_version = None
            if not errors:
                classification, matched_id, conflict_errors, matched_version = classify_row(db, sheet, normalized)
                errors.extend(conflict_errors)
            if sheet in OBSERVATION_MODELS and not errors:
                key = (sheet, normalized["source_code"], normalized["record_key"])
                previous = duplicate_keys.get(key)
                if previous:
                    if previous[0] != normalized:
                        classification = "conflict"
                        errors.append("工作簿内稳定键重复且内容不一致")
                        previous[1].classification = "conflict"
                        previous[1].errors = [*previous[1].errors, "工作簿内稳定键重复且内容不一致"]
                    else:
                        classification = "no_change"
                else:
                    duplicate_keys[key] = (normalized, None)  # type: ignore[arg-type]
            normalized["_matched_version"] = matched_version
            import_row = ImportRow(import_job_id=job.id, sheet_name=sheet, row_number=row_number, raw_payload=raw_to_json(raw), normalized_payload=normalized, matched_record_id=matched_id, classification=classification, errors=errors)
            db.add(import_row)
            db.flush()
            if sheet in OBSERVATION_MODELS and not errors:
                duplicate_keys[(sheet, normalized["source_code"], normalized["record_key"])] = (normalized, import_row)
            counts[classification] += 1
    job.summary = dict(counts)
    db.commit()
    db.refresh(job)
    return job


def raw_to_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: raw_to_json(item) for key, item in value.items()}
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    return value


def import_action_summary(rows: list[ImportRow]) -> dict[str, Any]:
    by_sheet: dict[str, dict[str, int]] = {}
    for row in rows:
        counts = by_sheet.setdefault(row.sheet_name, {"new": 0, "update": 0, "no_change": 0})
        if row.classification in counts:
            counts[row.classification] += 1
    return {
        "new": sum(1 for row in rows if row.classification == "new"),
        "update": sum(1 for row in rows if row.classification == "update"),
        "no_change": sum(1 for row in rows if row.classification == "no_change"),
        "pending_review_observations": sum(
            1
            for row in rows
            if row.sheet_name in OBSERVATION_MODELS
            and row.classification in {"new", "update"}
        ),
        "by_sheet": by_sheet,
    }


def confirm_import(db: Session, job: ImportJob) -> dict[str, Any]:
    if job.status != "previewed":
        raise ValueError("导入任务状态不可确认")
    rows = list(db.scalars(select(ImportRow).where(ImportRow.import_job_id == job.id).order_by(ImportRow.created_at)))
    if any(row.classification in {"conflict", "invalid"} for row in rows):
        raise ValueError("存在冲突或校验失败，不能确认导入")
    result = import_action_summary(rows)
    for sheet in ["sources", "companies", "projects", "ownership", "production", "guidance", "reserves"]:
        for row in [item for item in rows if item.sheet_name == sheet and item.classification != "no_change"]:
            record = apply_row(db, sheet, row.normalized_payload or {}, row)
            row.applied_record_id = record.id
    job.status = "confirmed"
    job.confirmed_at = utcnow()
    db.commit()
    return result


def country_by_iso3(db: Session, iso3: str) -> Country:
    country = db.scalar(select(Country).where(Country.iso3 == iso3))
    if not country:
        raise ValueError(f"国家代码无法识别: {iso3}")
    return country


def apply_row(db: Session, sheet: str, payload: dict[str, Any], import_row: ImportRow):
    existing = find_existing(db, sheet, payload)
    if sheet == "sources":
        record = existing or Source()
        for field in ["code", "organization_name", "material_title", "material_url", "source_type", "is_demo", "notes"]:
            setattr(record, field, payload.get(field))
        record.published_at = date.fromisoformat(payload["published_at"])
        record.verified_at = date.fromisoformat(payload["verified_at"])
    elif sheet == "companies":
        record = existing or Company()
        record.canonical_name = payload["canonical_name"]
        record.legal_name = payload.get("legal_name")
        record.country_id = country_by_iso3(db, payload["country_iso3"]).id
        record.website = payload.get("website")
        record.fiscal_year_start_month = payload["fiscal_year_start_month"]
    elif sheet == "projects":
        record = existing or Project()
        record.slug = payload["slug"]
        record.name = payload["name"]
        record.country_id = country_by_iso3(db, payload["country_iso3"]).id
        operator = db.scalar(select(Company).where(Company.canonical_name == payload.get("operator_company"))) if payload.get("operator_company") else None
        record.operator_company_id = operator.id if operator else None
        record.latitude = Decimal(payload["latitude"]) if payload.get("latitude") else None
        record.longitude = Decimal(payload["longitude"]) if payload.get("longitude") else None
        record.status = payload["status"]
        record.raw_material_route = payload.get("raw_material_route")
    elif sheet == "ownership":
        project = db.scalar(select(Project).where(Project.slug == payload["project_slug"]))
        company = db.scalar(select(Company).where(Company.canonical_name == payload["company_name"]))
        if not project or not company:
            raise ValueError("持股项目或公司无法识别")
        record = existing or ProjectOwnership(project_id=project.id, company_id=company.id)
        valid_from = date.fromisoformat(payload["valid_from"])
        valid_to = date.fromisoformat(payload["valid_to"]) if payload.get("valid_to") else None
        validate_ownership_overlap(db, project.id, company.id, valid_from, valid_to, record.id if existing else None)
        record.ownership_pct = Decimal(payload["ownership_pct"])
        record.valid_from = valid_from
        record.valid_to = valid_to
    else:
        model = OBSERVATION_MODELS[sheet]
        record = existing or model()
        before = observation_snapshot(record) if existing else None
        project = db.scalar(select(Project).where(Project.slug == payload["project_slug"]))
        metal = db.scalar(select(Metal).where(Metal.code == payload["metal_code"]))
        source = db.scalar(select(Source).where(Source.code == payload["source_code"]))
        if not project or not metal or not source:
            raise ValueError("观察记录引用无法识别")
        if source.code != payload["source_code"]:
            raise ValueError("source_code 与 source_id 不一致")
        record.project_id, record.metal_id, record.source_id = project.id, metal.id, source.id
        for field in ["source_code", "record_key", "original_unit", "normalized_unit", "missing_reason", "calendar_basis", "fiscal_year_label", "period_type", "ownership_basis", "production_stage", "source_locator", "notes"]:
            setattr(record, field, payload.get(field))
        for field in ["original_value", "normalized_value"]:
            setattr(record, field, Decimal(payload[field]) if payload.get(field) is not None else None)
        record.fiscal_year_start_month = payload.get("fiscal_year_start_month")
        for field in ["period_start", "period_end", "effective_date", "source_published_at", "verified_at"]:
            setattr(record, field, date.fromisoformat(payload[field]))
        if sheet == "production":
            record.is_cumulative, record.is_estimate = payload["is_cumulative"], payload["is_estimate"]
        elif sheet == "guidance":
            record.guidance_low = Decimal(payload["guidance_low"]) if payload.get("guidance_low") is not None else None
            record.guidance_high = Decimal(payload["guidance_high"]) if payload.get("guidance_high") is not None else None
            record.guidance_kind = payload["guidance_kind"]
            record.adjustment_type = payload.get("adjustment_type")
            record.adjustment_date = date.fromisoformat(payload["adjustment_date"]) if payload.get("adjustment_date") else None
        else:
            record.contained_metal_value = Decimal(payload["contained_metal_value"]) if payload.get("contained_metal_value") is not None else None
            record.reserve_kind = payload["reserve_kind"]
            record.classification = payload["classification"]
            record.ore_tonnage = Decimal(payload["ore_tonnage"]) if payload.get("ore_tonnage") else None
            record.grade_pct = Decimal(payload["grade_pct"]) if payload.get("grade_pct") else None
        record.review_status = "pending"
        record.published = False
        record.row_version = (record.row_version or 0) + 1 if existing else 1
        db.add(record)
        db.flush()
        review = db.scalar(select(ReviewItem).where(ReviewItem.observation_type == sheet, ReviewItem.observation_id == record.id))
        if not review:
            review = ReviewItem(observation_type=sheet, observation_id=record.id)
        review.import_row_id = import_row.id
        review.status = "pending"
        review.before_payload = before
        review.after_payload = observation_snapshot(record)
        review.reviewer_id = None
        review.reviewer_comment = None
        review.reviewed_at = None
        db.add(review)
        return record
    db.add(record)
    db.flush()
    return record


def observation_snapshot(record: Any) -> dict[str, Any]:
    if not getattr(record, "id", None):
        return {}
    result: dict[str, Any] = {}
    for column in record.__table__.columns:
        value = getattr(record, column.name)
        result[column.name] = raw_to_json(value)
    return result


def save_upload(upload_file, target_dir: Path) -> Path:
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{hashlib.sha256((upload_file.filename or 'upload').encode()).hexdigest()[:12]}-{upload_file.filename or 'upload.xlsx'}"
    with target.open("wb") as destination:
        shutil.copyfileobj(upload_file.file, destination)
    return target
