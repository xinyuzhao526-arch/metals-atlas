from datetime import date

import pytest
from sqlalchemy import inspect

from app.models import Company, Project, ProjectOwnership
from app.ownership import validate_ownership_overlap


def test_observation_idempotency_constraints(session):
    inspector = inspect(session.bind)
    expected = {
        "production_observations": "uq_production_source_record",
        "guidance_observations": "uq_guidance_source_record",
        "reserve_observations": "uq_reserve_source_record",
    }
    for table, constraint_name in expected.items():
        constraints = {item["name"]: item["column_names"] for item in inspector.get_unique_constraints(table)}
        assert constraints[constraint_name] == ["source_code", "record_key"]


def test_ownership_overlap_is_checked_in_service(session):
    country = session.query(__import__("app.models", fromlist=["Country"]).Country).filter_by(iso3="CHL").one()
    company = Company(canonical_name="Example", country_id=country.id, fiscal_year_start_month=1)
    project = Project(slug="example", name="Example", country_id=country.id)
    session.add_all([company, project])
    session.commit()
    existing = ProjectOwnership(project_id=project.id, company_id=company.id, ownership_pct=50, valid_from=date(2025, 1, 1), valid_to=date(2025, 12, 31))
    session.add(existing)
    session.commit()

    with pytest.raises(ValueError, match="重叠"):
        validate_ownership_overlap(session, project.id, company.id, date(2025, 12, 31), None)
    validate_ownership_overlap(session, project.id, company.id, date(2026, 1, 1), None)

