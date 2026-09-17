from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.imports import OBSERVATION_MODELS, raw_to_json
from app.models import Company, Country, Metal, Project, ProjectOwnership, Source


COMPLETENESS_LABELS = {
    "only_project_master": "仅项目主数据",
    "missing_operator": "缺运营方",
    "missing_company_ownership": "缺公司/持股",
    "missing_source": "缺来源",
    "missing_production": "缺产量",
    "missing_guidance": "缺指引",
    "missing_reserves": "缺储量",
    "reviewable_observations": "已有可审核观察数据",
    "published_data": "已有公开数据",
}


def _project_relations(db: Session, project: Project) -> dict[str, Any]:
    country = db.get(Country, project.country_id)
    operator = db.get(Company, project.operator_company_id) if project.operator_company_id else None
    ownership = list(
        db.scalars(
            select(ProjectOwnership)
            .where(ProjectOwnership.project_id == project.id)
            .order_by(ProjectOwnership.valid_from.desc())
        )
    )
    observations = {
        kind: list(
            db.scalars(
                select(model)
                .where(model.project_id == project.id)
                .order_by(model.effective_date.desc())
            )
        )
        for kind, model in OBSERVATION_MODELS.items()
    }
    return {
        "country": country,
        "operator": operator,
        "ownership": ownership,
        "observations": observations,
    }


def _completeness(relations: dict[str, Any]) -> tuple[list[str], int, int]:
    observations = relations["observations"]
    all_observations = [row for rows in observations.values() for row in rows]
    pending_count = sum(1 for row in all_observations if row.review_status == "pending")
    published_count = sum(
        1 for row in all_observations if row.review_status == "approved" and row.published
    )
    codes: list[str] = []
    if not all_observations:
        codes.append("only_project_master")
    if relations["operator"] is None:
        codes.append("missing_operator")
    if not relations["ownership"]:
        codes.append("missing_company_ownership")
    if not all_observations:
        codes.append("missing_source")
    for kind in ("production", "guidance", "reserves"):
        if not observations[kind]:
            codes.append(f"missing_{kind}")
    if pending_count:
        codes.append("reviewable_observations")
    if published_count:
        codes.append("published_data")
    return codes, pending_count, published_count


def project_summary(db: Session, project: Project) -> dict[str, Any]:
    relations = _project_relations(db, project)
    codes, pending_count, published_count = _completeness(relations)
    country = relations["country"]
    operator = relations["operator"]
    observation_count = sum(len(rows) for rows in relations["observations"].values())
    return {
        "id": project.id,
        "name": project.name,
        "slug": project.slug,
        "country": {
            "iso3": country.iso3,
            "name_zh": country.name_zh,
            "name_en": country.name_en,
        },
        "operator": (
            {"id": operator.id, "canonical_name": operator.canonical_name}
            if operator
            else None
        ),
        "status": project.status,
        "raw_material_route": project.raw_material_route,
        "latitude": raw_to_json(project.latitude),
        "longitude": raw_to_json(project.longitude),
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "has_observations": observation_count > 0,
        "observation_count": observation_count,
        "pending_observation_count": pending_count,
        "published_observation_count": published_count,
        "completeness": [
            {"code": code, "label": COMPLETENESS_LABELS[code]} for code in codes
        ],
    }


def list_admin_projects(
    db: Session,
    *,
    q: str | None = None,
    country: str | None = None,
    status: str | None = None,
    completeness: str | None = None,
    sort: str = "created_desc",
    page: int = 1,
    page_size: int = 25,
) -> dict[str, Any]:
    projects = list(db.scalars(select(Project)))
    items = [project_summary(db, project) for project in projects]
    needle = (q or "").strip().casefold()
    country_code = (country or "").strip().upper()
    status_code = (status or "").strip()
    completeness_code = (completeness or "").strip()
    if needle:
        items = [item for item in items if needle in f"{item['name']} {item['slug']}".casefold()]
    if country_code:
        items = [item for item in items if item["country"]["iso3"] == country_code]
    if status_code:
        items = [item for item in items if item["status"] == status_code]
    if completeness_code:
        items = [
            item
            for item in items
            if completeness_code in {entry["code"] for entry in item["completeness"]}
        ]

    if sort == "name_desc":
        items.sort(key=lambda item: (item["name"].casefold(), item["slug"]), reverse=True)
    elif sort == "created_asc":
        items.sort(key=lambda item: (item["created_at"], item["name"].casefold()))
    elif sort == "created_desc":
        items.sort(key=lambda item: (item["created_at"], item["name"].casefold()), reverse=True)
    else:
        items.sort(key=lambda item: (item["name"].casefold(), item["slug"]))

    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    total = len(items)
    start = (page - 1) * page_size
    countries = sorted(
        (
            {"iso3": row.iso3, "name_zh": row.name_zh}
            for row in db.scalars(select(Country).order_by(Country.iso3))
        ),
        key=lambda item: item["iso3"],
    )
    statuses = sorted(set(db.scalars(select(Project.status))))
    return {
        "items": items[start : start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
        "filters": {
            "countries": countries,
            "statuses": statuses,
            "completeness": [
                {"code": code, "label": label}
                for code, label in COMPLETENESS_LABELS.items()
            ],
        },
    }


def admin_project_detail(db: Session, project_ref: str) -> dict[str, Any] | None:
    project = db.scalar(
        select(Project).where(or_(Project.id == project_ref, Project.slug == project_ref))
    )
    if project is None:
        return None
    relations = _project_relations(db, project)
    ownership = []
    for row in relations["ownership"]:
        company = db.get(Company, row.company_id)
        ownership.append(
            {
                "id": row.id,
                "company": {
                    "id": company.id,
                    "canonical_name": company.canonical_name,
                },
                "ownership_pct": raw_to_json(row.ownership_pct),
                "valid_from": row.valid_from,
                "valid_to": row.valid_to,
            }
        )

    sources: dict[str, dict[str, Any]] = {}
    serialized_observations: dict[str, list[dict[str, Any]]] = {}
    observation_missing: list[dict[str, Any]] = []
    for kind, rows in relations["observations"].items():
        serialized_observations[kind] = []
        for row in rows:
            source = db.get(Source, row.source_id)
            metal = db.get(Metal, row.metal_id)
            payload = {
                column.name: raw_to_json(getattr(row, column.name))
                for column in row.__table__.columns
            }
            payload["metal_code"] = metal.code
            payload["source"] = {
                "id": source.id,
                "code": source.code,
                "organization_name": source.organization_name,
                "material_title": source.material_title,
                "material_url": source.material_url,
                "published_at": source.published_at,
                "verified_at": source.verified_at,
                "source_type": source.source_type,
                "is_demo": source.is_demo,
            }
            sources[source.id] = payload["source"]
            if row.normalized_value is None:
                observation_missing.append(
                    {
                        "kind": kind,
                        "record_key": row.record_key,
                        "field": "normalized_value",
                        "reason": row.missing_reason,
                    }
                )
            serialized_observations[kind].append(payload)

    project_missing = [
        field
        for field, value in {
            "operator_company": project.operator_company_id,
            "raw_material_route": project.raw_material_route,
            "latitude": project.latitude,
            "longitude": project.longitude,
        }.items()
        if value is None
    ]
    return {
        "project": project_summary(db, project),
        "ownership": ownership,
        "sources": list(sources.values()),
        "observations": serialized_observations,
        "missing": {
            "project_fields": project_missing,
            "observations": observation_missing,
        },
    }
