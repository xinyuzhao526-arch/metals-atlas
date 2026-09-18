from datetime import date
from ipaddress import ip_address

import httpx
import pytest
from sqlalchemy import inspect

import app.research as research
from app.models import (
    Country, DocumentEvidence, ProductionObservation, Project, ResearchCandidate,
    ResearchRun, ReviewItem, Source, SourceFetchAttempt, User,
)
from app.research import (
    ResearchError, create_manual_candidate, create_research_run,
    fetch_source_document, normalize_url, publish_candidate, restore_candidate,
    set_candidate_ignored, validate_public_url,
)


def add_kansanshi(session):
    country = session.query(Country).filter_by(iso3="CHL").one()
    project = Project(slug="kansanshi", name="Kansanshi", country_id=country.id, status="operating")
    session.add(project)
    session.commit()
    return project


def official_html():
    return b"""<!doctype html><html><head>
    <title>Kansanshi annual production update</title>
    <meta property="og:site_name" content="First Quantum Minerals Ltd.">
    <meta property="article:published_time" content="2026-01-15T08:00:00Z">
    </head><body><article><h1>Kansanshi update</h1>
    <p>Kansanshi produced 100,000 tonnes of contained copper in 2025.</p>
    </article></body></html>"""


def mock_client():
    def handler(request: httpx.Request):
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nAllow: /", request=request)
        return httpx.Response(200, content=official_html(), headers={"content-type": "text/html"}, request=request)
    return httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False)


def candidate_payload(**changes):
    payload = {
        "metric_type": "production",
        "raw_value": "100000",
        "raw_unit": "t",
        "period_start": "2025-01-01",
        "period_end": "2025-12-31",
        "effective_date": "2025-12-31",
        "calendar_basis": "calendar_year",
        "period_type": "annual",
        "production_stage": "mine_contained_metal",
        "ownership_basis": "project_100",
        "confidence": "0.95",
        "evidence_type": "html_section",
        "evidence_locator": "article > p:nth-of-type(1)",
        "quoted_excerpt": "Kansanshi produced 100,000 tonnes of contained copper in 2025.",
        "extraction_method": "manual",
        "source_title": "Kansanshi annual production update",
        "publisher": "First Quantum Minerals Ltd.",
        "source_published_at": "2026-01-15",
    }
    payload.update(changes)
    return payload


def setup_source(session, tmp_path, monkeypatch):
    project = add_kansanshi(session)
    user = session.query(User).one()
    run = create_research_run(session, project, user)
    monkeypatch.setattr(research, "_resolved_ips", lambda host, port: {ip_address("93.184.216.34")})
    with mock_client() as client:
        source = fetch_source_document(session, run, "https://www.first-quantum.com/kansanshi-update?utm_source=test", tmp_path, client=client)
    return project, user, run, source


def test_url_normalization_and_ssrf(monkeypatch):
    assert normalize_url("HTTPS://Example.COM:443/report?utm_source=x&b=2&a=1#page=3") == "https://example.com/report?a=1&b=2"
    monkeypatch.setattr(research, "_resolved_ips", lambda host, port: {ip_address("10.0.0.2")})
    with pytest.raises(ResearchError, match="内网"):
        validate_public_url("https://example.com/report")
    monkeypatch.setattr(research, "_resolved_ips", lambda host, port: {ip_address("93.184.216.34")})
    assert validate_public_url("https://example.com/report") == "https://example.com/report"
    with pytest.raises(ResearchError):
        normalize_url("file:///etc/passwd")
    with pytest.raises(ResearchError):
        normalize_url("https://user:secret@example.com/report")


def test_fetch_url_and_sha_dedup(session, tmp_path, monkeypatch):
    _, user, run, first = setup_source(session, tmp_path, monkeypatch)
    assert first.source_tier == "A"
    assert first.sha256 and first.local_storage_path
    assert (tmp_path / first.local_storage_path).exists()
    with mock_client() as client:
        same_url = fetch_source_document(session, run, "https://www.first-quantum.com/kansanshi-update", tmp_path, client=client)
        same_hash = fetch_source_document(session, run, "https://www.first-quantum.com/alternate", tmp_path, client=client)
    assert same_url.id == first.id
    assert same_hash.id == first.id
    assert session.query(Source).filter(Source.sha256 == first.sha256).count() == 1
    assert session.query(SourceFetchAttempt).count() == 3


def test_candidate_publish_idempotence_public_whitelist_and_revision(authenticated, session, tmp_path, monkeypatch):
    client, _headers = authenticated
    project, user, run, source = setup_source(session, tmp_path, monkeypatch)
    candidate = create_manual_candidate(session, run, source, candidate_payload())
    assert candidate.status == "ready"
    assert candidate.normalized_value == 100
    assert client.get("/api/v1/public/projects/kansanshi").status_code == 404

    kind, observation_id, repeated = publish_candidate(session, candidate.id, user)
    assert kind == "production"
    assert repeated is False
    kind2, observation_id2, repeated2 = publish_candidate(session, candidate.id, user)
    assert (kind2, observation_id2, repeated2) == (kind, observation_id, True)
    observation = session.get(ProductionObservation, observation_id)
    assert observation.review_status == "approved" and observation.published and observation.is_current
    review = session.query(ReviewItem).filter_by(research_candidate_id=candidate.id).one()
    assert review.status == "approved_published"
    assert client.get("/api/v1/admin/reviews").json() == []

    detail = client.get("/api/v1/public/projects/kansanshi")
    assert detail.status_code == 200
    assert [item["id"] for item in detail.json()["production"]] == [observation_id]
    source_response = client.get(f"/api/v1/public/observations/production/{observation_id}/source")
    assert source_response.status_code == 200
    public = source_response.json()
    assert public["evidence"]["quoted_excerpt"].startswith("Kansanshi produced")
    assert public["administrator_confirmed"] is True
    for internal in ("local_storage_path", "notes", "confirmed_by", "extraction_prompt_version", "blocking_issues"):
        assert internal not in public

    revised = create_manual_candidate(session, run, source, candidate_payload(
        raw_value="101000",
        quoted_excerpt="Kansanshi produced 101,000 tonnes of contained copper in the revised update.",
        evidence_locator="article > p.revised",
        supersedes_observation_id=observation_id,
    ))
    _, revised_id, _ = publish_candidate(session, revised.id, user)
    session.refresh(observation)
    assert observation.is_current is False and observation.published is True
    latest = client.get("/api/v1/public/projects/kansanshi").json()["production"]
    assert [item["id"] for item in latest] == [revised_id]
    chain = client.get(f"/api/v1/public/observations/production/{revised_id}/revisions").json()["items"]
    assert [item["observation_id"] for item in chain] == [observation_id, revised_id]


def test_needs_attention_modify_publish_ignore_restore_and_null(session, tmp_path, monkeypatch):
    _, user, run, source = setup_source(session, tmp_path, monkeypatch)
    candidate = create_manual_candidate(session, run, source, candidate_payload(
        raw_value="102000", ownership_basis="", confidence="0.60",
        evidence_locator="article > p.low-confidence",
    ))
    assert candidate.status == "needs_attention"
    with pytest.raises(ResearchError):
        publish_candidate(session, candidate.id, user)
    session.rollback()
    set_candidate_ignored(session, candidate)
    assert candidate.status == "ignored"
    restore_candidate(session, candidate)
    assert candidate.status == "needs_attention"
    _, observation_id, _ = publish_candidate(session, candidate.id, user, {"ownership_basis": "project_100", "confidence": "0.90"})
    assert session.get(ProductionObservation, observation_id).published is True

    null_candidate = create_manual_candidate(session, run, source, candidate_payload(
        raw_value=None, raw_unit="kt", normalized_value=None, normalized_unit="kt",
        missing_reason="not_disclosed", evidence_locator="article > p.null",
        quoted_excerpt="The document does not disclose the requested production value.",
    ))
    _, null_id, _ = publish_candidate(session, null_candidate.id, user)
    null_row = session.get(ProductionObservation, null_id)
    assert null_row.original_value is None and null_row.normalized_value is None
    assert null_row.missing_reason == "not_disclosed"


def test_pdf_page_evidence_and_schema_constraints(session, tmp_path, monkeypatch):
    _, _, run, source = setup_source(session, tmp_path, monkeypatch)
    source.mime_type = "application/pdf"
    candidate = create_manual_candidate(session, run, source, candidate_payload(
        raw_value="103000", evidence_type="pdf_page", page_number=7,
        evidence_locator="", quoted_excerpt="Kansanshi produced 103,000 tonnes of contained copper.",
    ))
    evidence = session.get(DocumentEvidence, candidate.evidence_id)
    assert evidence.page_number == 7
    assert evidence.evidence_locator == {"page_number": 7}
    inspector = inspect(session.bind)
    assert {"research_runs", "research_discoveries", "source_fetch_attempts", "document_evidence", "research_candidates"}.issubset(set(inspector.get_table_names()))
    candidate_columns = {item["name"] for item in inspector.get_columns("research_candidates")}
    assert {"status", "evidence_id", "candidate_fingerprint", "published_observation_id", "confirmed_at"}.issubset(candidate_columns)
