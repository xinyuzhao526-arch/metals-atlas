from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.imports import OBSERVATION_MODELS
from app.models import Company, Country, GuidanceObservation, ProductionObservation, Project, ProjectOwnership, ReserveObservation, Source


def decimal_string(value) -> str | None:
    return format(value, "f") if value is not None else None


def published_observations(db: Session, model, project_id: str):
    return list(db.scalars(select(model).where(model.project_id == project_id, model.review_status == "approved", model.published.is_(True)).order_by(model.effective_date.desc())))


def public_project_ids(db: Session) -> set[str]:
    ids: set[str] = set()
    for model in OBSERVATION_MODELS.values():
        ids.update(db.scalars(select(model.project_id).where(model.review_status == "approved", model.published.is_(True))))
    return ids


def list_projects(db: Session, q: str | None = None, country: str | None = None, status: str | None = None, stage: str | None = None) -> list[dict[str, Any]]:
    ids = public_project_ids(db)
    if not ids:
        return []
    projects = list(db.scalars(select(Project).where(Project.id.in_(ids)).order_by(Project.name)))
    result = []
    for project in projects:
        country_row = db.get(Country, project.country_id)
        if q and q.lower() not in f"{project.name} {project.slug} {country_row.name_zh} {country_row.name_en}".lower():
            continue
        if country and country_row.iso3 != country:
            continue
        if status and project.status != status:
            continue
        stages = set()
        for model in OBSERVATION_MODELS.values():
            stages.update(db.scalars(select(model.production_stage).where(model.project_id == project.id, model.review_status == "approved", model.published.is_(True))))
        if stage and stage not in stages:
            continue
        result.append({"slug": project.slug, "name": project.name, "country": {"iso3": country_row.iso3, "name_zh": country_row.name_zh, "name_en": country_row.name_en}, "status": project.status, "production_stages": sorted(stages)})
    return result


def serialize_observation(db: Session, observation, kind: str) -> dict[str, Any]:
    source = db.get(Source, observation.source_id)
    value = observation.normalized_value
    payload: dict[str, Any] = {
        "id": observation.id,
        "kind": kind,
        "value": decimal_string(value),
        "unit": observation.normalized_unit,
        "missing_reason": observation.missing_reason,
        "effective_date": observation.effective_date.isoformat(),
        "period": {"start": observation.period_start.isoformat(), "end": observation.period_end.isoformat(), "type": observation.period_type},
        "calendar_basis": observation.calendar_basis,
        "fiscal_year_label": observation.fiscal_year_label,
        "ownership_basis": observation.ownership_basis,
        "production_stage": observation.production_stage,
        "source": {"code": source.code, "organization_name": source.organization_name, "material_title": source.material_title, "material_url": source.material_url, "published_at": source.published_at.isoformat(), "verified_at": source.verified_at.isoformat(), "source_type": source.source_type, "is_demo": source.is_demo},
    }
    if isinstance(observation, GuidanceObservation):
        payload.update(guidance_low=decimal_string(observation.guidance_low), guidance_high=decimal_string(observation.guidance_high), guidance_kind=observation.guidance_kind)
    if isinstance(observation, ReserveObservation):
        payload.update(reserve_kind=observation.reserve_kind, classification=observation.classification, ore_tonnage=decimal_string(observation.ore_tonnage), grade_pct=decimal_string(observation.grade_pct))
    if isinstance(observation, ProductionObservation):
        payload.update(is_cumulative=observation.is_cumulative, is_estimate=observation.is_estimate)
    return payload


def project_detail(db: Session, slug: str) -> dict[str, Any] | None:
    project = db.scalar(select(Project).where(Project.slug == slug))
    if not project or project.id not in public_project_ids(db):
        return None
    country = db.get(Country, project.country_id)
    operator = db.get(Company, project.operator_company_id) if project.operator_company_id else None
    ownership = []
    for item in db.scalars(select(ProjectOwnership).where(ProjectOwnership.project_id == project.id).order_by(ProjectOwnership.valid_from.desc())):
        company = db.get(Company, item.company_id)
        ownership.append({"company": company.canonical_name, "ownership_pct": decimal_string(item.ownership_pct), "valid_from": item.valid_from.isoformat(), "valid_to": item.valid_to.isoformat() if item.valid_to else None})
    return {
        "slug": project.slug,
        "name": project.name,
        "country": {"iso3": country.iso3, "name_zh": country.name_zh, "name_en": country.name_en},
        "operator": operator.canonical_name if operator else None,
        "status": project.status,
        "raw_material_route": project.raw_material_route,
        "ownership": ownership,
        "production": [serialize_observation(db, row, "production") for row in published_observations(db, ProductionObservation, project.id)],
        "guidance": [serialize_observation(db, row, "guidance") for row in published_observations(db, GuidanceObservation, project.id)],
        "reserves": [serialize_observation(db, row, "reserves") for row in published_observations(db, ReserveObservation, project.id)],
    }

