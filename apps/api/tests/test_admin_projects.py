from app.models import Country, Project


def add_project(session, slug: str, *, country_iso3: str = "CHL", status: str = "operating") -> Project:
    country = session.query(Country).filter_by(iso3=country_iso3).one()
    project = Project(
        slug=slug,
        name=slug.replace("-", " ").title(),
        country_id=country.id,
        status=status,
    )
    session.add(project)
    session.commit()
    return project


def test_admin_project_api_requires_login(client, session):
    project = add_project(session, "private-project")

    assert client.get("/api/v1/admin/projects").status_code == 401
    assert client.get(f"/api/v1/admin/projects/{project.slug}").status_code == 401


def test_admin_lists_master_only_project_while_public_api_hides_it(authenticated, session):
    client, _headers = authenticated
    project = add_project(session, "master-only")

    response = client.get("/api/v1/admin/projects")

    assert response.status_code == 200
    item = next(row for row in response.json()["items"] if row["id"] == project.id)
    assert item["has_observations"] is False
    assert item["pending_observation_count"] == 0
    assert item["published_observation_count"] == 0
    codes = {entry["code"] for entry in item["completeness"]}
    assert {
        "only_project_master",
        "missing_operator",
        "missing_company_ownership",
        "missing_source",
        "missing_production",
        "missing_guidance",
        "missing_reserves",
    }.issubset(codes)
    assert client.get("/api/v1/public/projects").json() == []

    detail = client.get(f"/api/v1/admin/projects/{project.slug}")
    assert detail.status_code == 200
    assert detail.json()["project"]["id"] == project.id
    assert detail.json()["observations"] == {
        "production": [],
        "guidance": [],
        "reserves": [],
    }


def test_admin_project_filters_country_status_completeness_and_sort(authenticated, session):
    client, _headers = authenticated
    add_project(session, "zulu-project", country_iso3="CHL", status="operating")
    add_project(session, "alpha-project", country_iso3="USA", status="planned")

    assert [
        item["slug"]
        for item in client.get("/api/v1/admin/projects", params={"country": "USA"}).json()["items"]
    ] == ["alpha-project"]
    assert [
        item["slug"]
        for item in client.get("/api/v1/admin/projects", params={"status": "planned"}).json()["items"]
    ] == ["alpha-project"]
    completeness = client.get(
        "/api/v1/admin/projects",
        params={"completeness": "only_project_master", "sort": "name_asc"},
    ).json()
    assert [item["slug"] for item in completeness["items"]] == [
        "alpha-project",
        "zulu-project",
    ]
    searched = client.get("/api/v1/admin/projects", params={"q": "Zulu"}).json()
    assert [item["slug"] for item in searched["items"]] == ["zulu-project"]
