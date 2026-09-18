from __future__ import annotations

import hashlib
import ipaddress
import json
import re
import socket
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.extractors import DeterministicExtractor, ParsedSection
from app.imports import CALENDAR_BASES, OBSERVATION_MODELS, OWNERSHIP_BASES, PERIOD_TYPES, PRODUCTION_STAGES, observation_snapshot, raw_to_json
from app.models import (
    DocumentEvidence, GuidanceObservation, Metal, ProductionObservation, Project,
    ResearchCandidate, ResearchDiscovery, ResearchRun, ReserveObservation,
    ReviewItem, Source, SourceFetchAttempt, User, utcnow,
)


USER_AGENT = "MetalsAtlasResearch/0.2 (+http://localhost:3000/admin/research)"
MAX_DOCUMENT_BYTES = 25 * 1024 * 1024
TRACKING_PARAMETERS = {"fbclid", "gclid", "mc_cid", "mc_eid"}
OFFICIAL_DOMAINS = {"kansanshi": {"first-quantum.com", "www.first-quantum.com"}}
ALLOWED_CANDIDATE_CHANGES = {
    "raw_value", "raw_unit", "normalized_value", "normalized_unit", "missing_reason",
    "period_start", "period_end", "effective_date", "calendar_basis",
    "fiscal_year_label", "fiscal_year_start_month", "period_type",
    "production_stage", "ownership_basis", "confidence", "supersedes_observation_id",
}


class ResearchError(ValueError):
    pass


def normalize_url(value: str) -> str:
    parts = urlsplit(value.strip())
    if parts.scheme.lower() not in {"http", "https"}:
        raise ResearchError("只允许 http 或 https URL")
    if not parts.hostname or parts.username or parts.password:
        raise ResearchError("URL 主机无效，且不得包含用户名或密码")
    try:
        host = parts.hostname.encode("idna").decode("ascii").lower()
    except UnicodeError as exc:
        raise ResearchError("URL 主机名无效") from exc
    port = parts.port
    default_port = (parts.scheme.lower() == "http" and port == 80) or (parts.scheme.lower() == "https" and port == 443)
    netloc = f"{host}:{port}" if port and not default_port else host
    path = re.sub(r"/{2,}", "/", parts.path or "/")
    query = []
    for key, item in parse_qsl(parts.query, keep_blank_values=True):
        lowered = key.lower()
        if lowered.startswith("utm_") or lowered in TRACKING_PARAMETERS:
            continue
        query.append((key, item))
    query.sort()
    return urlunsplit((parts.scheme.lower(), netloc, path, urlencode(query, doseq=True), ""))


def _resolved_ips(hostname: str, port: int) -> set[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    try:
        rows = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ResearchError("URL 主机无法解析") from exc
    return {ipaddress.ip_address(row[4][0]) for row in rows}


def validate_public_url(value: str) -> str:
    normalized = normalize_url(value)
    parts = urlsplit(normalized)
    addresses = _resolved_ips(parts.hostname or "", parts.port or (443 if parts.scheme == "https" else 80))
    if not addresses:
        raise ResearchError("URL 主机没有可用地址")
    for address in addresses:
        if any((address.is_private, address.is_loopback, address.is_link_local, address.is_multicast, address.is_reserved, address.is_unspecified)):
            raise ResearchError("禁止访问本机、内网、链路本地或保留地址")
    return normalized


def _parse_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        return None


def _decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError) as exc:
        raise ResearchError("数值格式无效") from exc


def normalize_quantity(raw_value: Any, raw_unit: str | None) -> tuple[Decimal | None, str | None]:
    value = _decimal(raw_value)
    if value is None:
        return None, None
    unit = re.sub(r"\s+", " ", (raw_unit or "").strip().lower())
    if unit in {"t", "tonne", "tonnes", "metric ton", "metric tons"}:
        return value / Decimal("1000"), "kt"
    if unit in {"kt", "kilotonne", "kilotonnes", "thousand tonne", "thousand tonnes"}:
        return value, "kt"
    if unit in {"mt", "million tonnes", "million tonne"}:
        return value * Decimal("1000"), "kt"
    return value, raw_unit.strip() if raw_unit else None


def _metadata_from_html(content: bytes, final_url: str) -> tuple[str, str, date | None]:
    soup = BeautifulSoup(content, "html.parser")
    fallback = urlsplit(final_url).path.rsplit("/", 1)[-1] or final_url
    title = " ".join((soup.title.get_text(" ", strip=True) if soup.title else fallback).split())
    site = soup.find("meta", attrs={"property": "og:site_name"}) or soup.find("meta", attrs={"name": "application-name"})
    publisher = str(site.get("content", "")).strip() if site else (urlsplit(final_url).hostname or "")
    published = None
    for attrs in ({"property": "article:published_time"}, {"name": "date"}, {"name": "publish-date"}, {"name": "publication_date"}):
        tag = soup.find("meta", attrs=attrs)
        if tag and tag.get("content"):
            published = _parse_date(tag.get("content"))
            if published:
                break
    if not published:
        time_tag = soup.find("time", attrs={"datetime": True})
        if time_tag:
            published = _parse_date(time_tag.get("datetime"))
    return title[:500], publisher[:250], published


def _metadata_from_pdf(content: bytes, final_url: str) -> tuple[str, str, date | None]:
    reader = PdfReader(BytesIO(content))
    metadata = reader.metadata or {}
    title = str(metadata.get("/Title") or urlsplit(final_url).path.rsplit("/", 1)[-1] or final_url)
    publisher = str(metadata.get("/Author") or urlsplit(final_url).hostname or "")
    return title[:500], publisher[:250], None


def _source_tier(project: Project, url: str) -> str | None:
    host = (urlsplit(url).hostname or "").lower()
    return "A" if any(host == domain or host.endswith(f".{domain}") for domain in OFFICIAL_DOMAINS.get(project.slug, set())) else None


def create_research_run(db: Session, project: Project, user: User, metrics: list[str] | None = None) -> ResearchRun:
    run = ResearchRun(project_id=project.id, requested_by=user.id, requested_metrics=metrics or ["production", "guidance"])
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def _check_robots(client: httpx.Client, normalized_url: str) -> tuple[str, datetime]:
    parts = urlsplit(normalized_url)
    robots_url = urlunsplit((parts.scheme, parts.netloc, "/robots.txt", "", ""))
    checked_at = utcnow()
    try:
        response = client.get(robots_url, headers={"User-Agent": USER_AGENT}, timeout=10)
    except httpx.HTTPError:
        return "unknown", checked_at
    if response.status_code != 200:
        return "unknown", checked_at
    parser = RobotFileParser()
    parser.set_url(robots_url)
    parser.parse(response.text.splitlines())
    return ("allowed" if parser.can_fetch(USER_AGENT, normalized_url) else "blocked"), checked_at


def fetch_source_document(db: Session, run: ResearchRun, url: str, storage_dir: Path, *, client: httpx.Client | None = None) -> Source:
    normalized = validate_public_url(url)
    project = db.get(Project, run.project_id)
    if project is None:
        raise ResearchError("研究项目不存在")
    discovery = db.scalar(select(ResearchDiscovery).where(
        ResearchDiscovery.research_run_id == run.id,
        ResearchDiscovery.normalized_url == normalized,
    ))
    if discovery is None:
        discovery = ResearchDiscovery(
            research_run_id=run.id, original_url=url, normalized_url=normalized,
            domain=urlsplit(normalized).hostname or "", discovery_method="manual",
        )
        db.add(discovery)
        db.flush()
    attempt = SourceFetchAttempt(
        research_run_id=run.id, discovery_id=discovery.id,
        requested_url=normalized, redirect_chain=[],
    )
    db.add(attempt)
    db.flush()
    existing = db.scalar(select(Source).where(Source.normalized_url == normalized))
    if existing:
        discovery.status = "fetched"
        discovery.source_document_id = existing.id
        attempt.status = "succeeded"
        attempt.source_document_id = existing.id
        attempt.final_url = existing.final_url or existing.material_url
        attempt.http_status = existing.http_status
        attempt.completed_at = utcnow()
        db.commit()
        return existing

    owns_client = client is None
    active_client = client or httpx.Client(follow_redirects=False)
    try:
        robots_status, robots_checked_at = _check_robots(active_client, normalized)
        if robots_status == "blocked":
            raise ResearchError("robots.txt 不允许获取该 URL")
        current = normalized
        redirects: list[str] = []
        response: httpx.Response | None = None
        for _ in range(6):
            current = validate_public_url(current)
            response = active_client.get(
                current,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/pdf"},
                timeout=30,
            )
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location:
                    raise ResearchError("重定向响应缺少 Location")
                current = urljoin(current, location)
                redirects.append(normalize_url(current))
                continue
            break
        else:
            raise ResearchError("重定向次数超过限制")
        assert response is not None
        attempt.redirect_chain = redirects
        attempt.final_url = current
        attempt.http_status = response.status_code
        if response.status_code == 429:
            attempt.status = "rate_limited"
            raise ResearchError("来源网站返回 429，请稍后重试")
        if response.status_code < 200 or response.status_code >= 300:
            raise ResearchError(f"来源网站返回 HTTP {response.status_code}")
        content = response.content
        if len(content) > MAX_DOCUMENT_BYTES:
            raise ResearchError("来源文件超过 25 MB 限制")
        mime = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if mime not in {"application/pdf", "text/html", "application/xhtml+xml"}:
            if content.startswith(b"%PDF-"):
                mime = "application/pdf"
            elif b"<html" in content[:2048].lower():
                mime = "text/html"
            else:
                raise ResearchError(f"不支持的文档类型: {mime or 'unknown'}")
        digest = hashlib.sha256(content).hexdigest()
        duplicate = db.scalar(select(Source).where(Source.sha256 == digest))
        if duplicate:
            discovery.status = "fetched"
            discovery.source_document_id = duplicate.id
            attempt.status = "succeeded"
            attempt.source_document_id = duplicate.id
            attempt.completed_at = utcnow()
            db.commit()
            return duplicate
        if mime == "application/pdf":
            title, publisher, published_at = _metadata_from_pdf(content, current)
            extension = ".pdf"
        else:
            title, publisher, published_at = _metadata_from_html(content, current)
            extension = ".html"
        relative_path = Path(digest[:2]) / f"{digest}{extension}"
        target = storage_dir / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        source = Source(
            code=f"WEB-{digest[:24].upper()}", organization_name=publisher,
            material_title=title, material_url=normalized, normalized_url=normalized,
            final_url=current, published_at=published_at, verified_at=None,
            source_type="official_web_document", is_demo=False, fetched_at=utcnow(),
            mime_type=mime, sha256=digest,
            local_storage_path=str(relative_path).replace("\\", "/"),
            http_status=response.status_code, retrieval_method="http_fetch",
            terms_checked_at=utcnow(), terms_status="not_checked",
            robots_checked_at=robots_checked_at, robots_status=robots_status,
            parse_status="not_parsed", source_tier=_source_tier(project, current),
            content_length=len(content),
        )
        db.add(source)
        db.flush()
        discovery.status = "fetched"
        discovery.result_title = title
        discovery.source_document_id = source.id
        attempt.status = "succeeded"
        attempt.source_document_id = source.id
        attempt.completed_at = utcnow()
        db.commit()
        db.refresh(source)
        return source
    except (ResearchError, httpx.HTTPError, ValueError) as exc:
        if attempt.status != "rate_limited":
            attempt.status = "blocked" if "robots.txt" in str(exc) or "禁止访问" in str(exc) else "failed"
        attempt.error_code = "fetch_failed"
        attempt.error_message = str(exc)[:1000]
        attempt.completed_at = utcnow()
        discovery.status = "failed"
        db.commit()
        raise ResearchError(str(exc)) from exc
    finally:
        if owns_client:
            active_client.close()


def parse_source_document(source: Source, storage_dir: Path) -> list[ParsedSection]:
    if not source.local_storage_path:
        raise ResearchError("来源文档没有本地文件")
    path = (storage_dir / source.local_storage_path).resolve()
    root = storage_dir.resolve()
    if root not in path.parents:
        raise ResearchError("来源文件路径无效")
    content = path.read_bytes()
    sections: list[ParsedSection] = []
    if source.mime_type == "application/pdf":
        reader = PdfReader(BytesIO(content))
        for page_number, page in enumerate(reader.pages, start=1):
            text = "\n".join(line.strip() for line in (page.extract_text() or "").splitlines() if line.strip())
            if text:
                sections.append(ParsedSection(
                    text=text, evidence_type="pdf_page",
                    locator={"page_number": page_number}, page_number=page_number,
                ))
    else:
        soup = BeautifulSoup(content, "html.parser")
        for node in soup(["script", "style", "noscript", "svg"]):
            node.decompose()
        for index, node in enumerate(soup.find_all(["h1", "h2", "h3", "article", "main"])):
            text = " ".join(node.get_text(" ", strip=True).split())
            if len(text) >= 40:
                sections.append(ParsedSection(
                    text=text[:20000], evidence_type="html_section",
                    locator={"tag": node.name, "index": index},
                ))
        if not sections:
            text = " ".join(soup.get_text(" ", strip=True).split())
            if text:
                sections.append(ParsedSection(
                    text=text[:50000], evidence_type="html_section",
                    locator={"selector": "body"},
                ))
    return sections


def _candidate_snapshot(candidate: ResearchCandidate) -> dict[str, Any]:
    return raw_to_json({column.name: getattr(candidate, column.name) for column in candidate.__table__.columns})


def _validate_candidate(candidate: ResearchCandidate, source: Source, evidence: DocumentEvidence) -> list[str]:
    issues: list[str] = []
    required = {
        "raw_unit": candidate.raw_unit, "normalized_unit": candidate.normalized_unit,
        "period_start": candidate.period_start, "period_end": candidate.period_end,
        "effective_date": candidate.effective_date, "calendar_basis": candidate.calendar_basis,
        "period_type": candidate.period_type, "production_stage": candidate.production_stage,
        "ownership_basis": candidate.ownership_basis,
    }
    for field, value in required.items():
        if value in (None, ""):
            issues.append(f"{field} 无法确认")
    if candidate.normalized_value is None and not candidate.missing_reason:
        issues.append("normalized_value 为空时必须填写 missing_reason")
    if candidate.calendar_basis not in CALENDAR_BASES:
        issues.append("calendar_basis 非法或不明确")
    if candidate.period_type not in PERIOD_TYPES:
        issues.append("period_type 非法或不明确")
    if candidate.production_stage not in PRODUCTION_STAGES:
        issues.append("production_stage 非法或不明确")
    if candidate.ownership_basis not in OWNERSHIP_BASES:
        issues.append("ownership_basis 非法或不明确")
    if candidate.calendar_basis == "fiscal_year" and (not candidate.fiscal_year_label or not candidate.fiscal_year_start_month):
        issues.append("财年记录必须填写财年标签和起始月")
    if candidate.period_start and candidate.period_end and candidate.period_end < candidate.period_start:
        issues.append("period_end 不得早于 period_start")
    if candidate.confidence < Decimal("0.8000"):
        issues.append("置信度低于 0.80")
    if not source.material_url or not source.organization_name or not source.material_title or not source.published_at:
        issues.append("来源机构、标题、链接或发布日期不完整")
    if not evidence.quoted_excerpt.strip() or not evidence.evidence_locator:
        issues.append("证据摘录或定位不完整")
    if evidence.evidence_type == "pdf_page" and not evidence.page_number:
        issues.append("PDF 证据必须提供页码")
    return issues


def revalidate_candidate(candidate: ResearchCandidate, source: Source, evidence: DocumentEvidence) -> None:
    issues = _validate_candidate(candidate, source, evidence)
    candidate.blocking_issues = issues
    candidate.unresolved_fields = {item.split(" ", 1)[0]: item for item in issues if "无法确认" in item}
    if candidate.status not in {"ignored", "published"}:
        candidate.status = "ready" if not issues else "needs_attention"


def create_manual_candidate(db: Session, run: ResearchRun, source: Source, payload: dict[str, Any]) -> ResearchCandidate:
    project = db.get(Project, run.project_id)
    if project is None:
        raise ResearchError("研究项目不存在")
    if payload.get("source_title"):
        source.material_title = str(payload["source_title"]).strip()
    if payload.get("publisher"):
        source.organization_name = str(payload["publisher"]).strip()
    if payload.get("source_published_at"):
        source.published_at = _parse_date(payload["source_published_at"])
    raw_value = payload.get("raw_value")
    raw_unit = str(payload.get("raw_unit") or "").strip() or None
    normalized_value = _decimal(payload.get("normalized_value"))
    normalized_unit = str(payload.get("normalized_unit") or "").strip() or None
    if normalized_value is None and raw_value not in (None, ""):
        normalized_value, normalized_unit = normalize_quantity(raw_value, raw_unit)
    evidence_type = str(payload.get("evidence_type") or ("pdf_page" if source.mime_type == "application/pdf" else "html_section"))
    page_number = int(payload["page_number"]) if payload.get("page_number") not in (None, "") else None
    locator_text = str(payload.get("evidence_locator") or "").strip()
    locator = {"page_number": page_number} if evidence_type == "pdf_page" else {"section": locator_text}
    excerpt = str(payload.get("quoted_excerpt") or "").strip()
    locator_hash = hashlib.sha256(json.dumps(
        {"type": evidence_type, "locator": locator, "excerpt": excerpt},
        ensure_ascii=False, sort_keys=True,
    ).encode()).hexdigest()
    evidence = db.scalar(select(DocumentEvidence).where(
        DocumentEvidence.source_document_id == source.id,
        DocumentEvidence.locator_hash == locator_hash,
    ))
    method = str(payload.get("extraction_method") or "manual")
    confidence = _decimal(payload.get("confidence")) or Decimal("1")
    if evidence is None:
        evidence = DocumentEvidence(
            source_document_id=source.id, evidence_type=evidence_type,
            page_number=page_number, quoted_excerpt=excerpt,
            evidence_locator=locator, locator_hash=locator_hash,
            extraction_method=method,
            ai_confidence=confidence if method == "ai" else None,
        )
        db.add(evidence)
        db.flush()
    fingerprint_payload = {
        "source": source.sha256 or source.id, "project": project.id,
        "metric_type": payload.get("metric_type"), "raw_value": raw_value,
        "raw_unit": raw_unit, "period_start": payload.get("period_start"),
        "period_end": payload.get("period_end"), "evidence": evidence.id,
    }
    fingerprint = hashlib.sha256(json.dumps(fingerprint_payload, sort_keys=True, default=str).encode()).hexdigest()
    existing = db.scalar(select(ResearchCandidate).where(ResearchCandidate.candidate_fingerprint == fingerprint))
    if existing:
        return existing
    candidate = ResearchCandidate(
        research_run_id=run.id, project_id=project.id,
        metric_type=str(payload.get("metric_type") or "production"),
        raw_value=str(raw_value).replace(",", "") if raw_value not in (None, "") else None,
        raw_unit=raw_unit, normalized_value=normalized_value,
        normalized_unit=normalized_unit,
        missing_reason=str(payload.get("missing_reason") or "").strip() or None,
        period_start=_parse_date(payload.get("period_start")),
        period_end=_parse_date(payload.get("period_end")),
        effective_date=_parse_date(payload.get("effective_date")),
        calendar_basis=str(payload.get("calendar_basis") or "").strip() or None,
        fiscal_year_label=str(payload.get("fiscal_year_label") or "").strip() or None,
        fiscal_year_start_month=int(payload["fiscal_year_start_month"]) if payload.get("fiscal_year_start_month") not in (None, "") else None,
        period_type=str(payload.get("period_type") or "").strip() or None,
        production_stage=str(payload.get("production_stage") or "").strip() or None,
        ownership_basis=str(payload.get("ownership_basis") or "").strip() or None,
        source_document_id=source.id, evidence_id=evidence.id,
        confidence=confidence, status="needs_attention",
        candidate_payload=payload.get("candidate_payload") or {},
        extracted_payload=raw_to_json(payload), extraction_method=method,
        extraction_model=payload.get("extraction_model"),
        extraction_prompt_version=payload.get("extraction_prompt_version"),
        candidate_fingerprint=fingerprint,
        supersedes_observation_id=payload.get("supersedes_observation_id"),
    )
    revalidate_candidate(candidate, source, evidence)
    db.add(candidate)
    db.flush()
    candidate.candidate_snapshot = _candidate_snapshot(candidate)
    source.parse_status = "parsed"
    db.commit()
    db.refresh(candidate)
    return candidate


def extract_deterministic_candidates(db: Session, run: ResearchRun, source: Source, storage_dir: Path) -> list[ResearchCandidate]:
    project = db.get(Project, run.project_id)
    if project is None:
        raise ResearchError("研究项目不存在")
    sections = parse_source_document(source, storage_dir)
    source.parse_status = "parsed" if sections else "failed"
    facts = DeterministicExtractor().extract(project.name, sections)
    candidates = []
    for fact in facts:
        candidates.append(create_manual_candidate(db, run, source, {
            "metric_type": fact.metric_type, "raw_value": fact.raw_value,
            "raw_unit": fact.raw_unit, "quoted_excerpt": fact.excerpt,
            "evidence_type": fact.section.evidence_type,
            "page_number": fact.section.page_number,
            "evidence_locator": json.dumps(fact.section.locator, ensure_ascii=False),
            "confidence": str(fact.confidence),
            "extraction_method": fact.extraction_method,
            "candidate_payload": fact.payload,
        }))
    db.commit()
    return candidates


def serialize_source(source: Source) -> dict[str, Any]:
    return {
        "id": source.id, "code": source.code,
        "original_url": source.material_url, "final_url": source.final_url,
        "title": source.material_title, "publisher": source.organization_name,
        "published_at": source.published_at, "fetched_at": source.fetched_at,
        "mime_type": source.mime_type, "http_status": source.http_status,
        "retrieval_method": source.retrieval_method,
        "robots_status": source.robots_status, "terms_status": source.terms_status,
        "parse_status": source.parse_status, "source_tier": source.source_tier,
    }


def serialize_candidate(db: Session, candidate: ResearchCandidate) -> dict[str, Any]:
    project = db.get(Project, candidate.project_id)
    source = db.get(Source, candidate.source_document_id)
    evidence = db.get(DocumentEvidence, candidate.evidence_id)
    return {
        "id": candidate.id,
        "project": {"id": project.id, "slug": project.slug, "name": project.name},
        "metric_type": candidate.metric_type,
        "raw_value": candidate.raw_value, "raw_unit": candidate.raw_unit,
        "normalized_value": raw_to_json(candidate.normalized_value),
        "normalized_unit": candidate.normalized_unit,
        "missing_reason": candidate.missing_reason,
        "period_start": candidate.period_start, "period_end": candidate.period_end,
        "effective_date": candidate.effective_date,
        "calendar_basis": candidate.calendar_basis,
        "fiscal_year_label": candidate.fiscal_year_label,
        "fiscal_year_start_month": candidate.fiscal_year_start_month,
        "period_type": candidate.period_type,
        "production_stage": candidate.production_stage,
        "ownership_basis": candidate.ownership_basis,
        "confidence": raw_to_json(candidate.confidence), "status": candidate.status,
        "blocking_issues": candidate.blocking_issues,
        "validation_warnings": candidate.validation_warnings,
        "extraction_method": candidate.extraction_method,
        "extraction_model": candidate.extraction_model,
        "supersedes_observation_id": candidate.supersedes_observation_id,
        "published_observation_id": candidate.published_observation_id,
        "confirmed_at": candidate.confirmed_at,
        "source": serialize_source(source),
        "evidence": {
            "id": evidence.id, "type": evidence.evidence_type,
            "page_number": evidence.page_number, "table_title": evidence.table_title,
            "quoted_excerpt": evidence.quoted_excerpt,
            "locator": evidence.evidence_locator,
            "extraction_method": evidence.extraction_method,
        },
    }


def _apply_candidate_changes(candidate: ResearchCandidate, changes: dict[str, Any]) -> None:
    unknown = set(changes) - ALLOWED_CANDIDATE_CHANGES
    if unknown:
        raise ResearchError(f"不可修改字段: {', '.join(sorted(unknown))}")
    for field, value in changes.items():
        if field in {"period_start", "period_end", "effective_date"}:
            value = _parse_date(value)
        elif field in {"normalized_value", "confidence"}:
            value = _decimal(value)
        elif field == "fiscal_year_start_month":
            value = int(value) if value not in (None, "") else None
        elif isinstance(value, str):
            value = value.strip() or None
        setattr(candidate, field, value)


def publish_candidate(db: Session, candidate_id: str, user: User, changes: dict[str, Any] | None = None):
    candidate = db.scalar(select(ResearchCandidate).where(ResearchCandidate.id == candidate_id).with_for_update())
    if candidate is None:
        raise ResearchError("候选不存在")
    if candidate.status == "published":
        return candidate.published_observation_type, candidate.published_observation_id, True
    if candidate.status == "ignored":
        raise ResearchError("暂不处理的候选必须先恢复")
    before = _candidate_snapshot(candidate)
    if changes:
        _apply_candidate_changes(candidate, changes)
    source = db.get(Source, candidate.source_document_id)
    evidence = db.get(DocumentEvidence, candidate.evidence_id)
    if source is None or evidence is None:
        raise ResearchError("候选来源或证据不存在")
    revalidate_candidate(candidate, source, evidence)
    if candidate.blocking_issues:
        raise ResearchError("候选仍有阻断问题: " + "；".join(candidate.blocking_issues))
    project = db.get(Project, candidate.project_id)
    metal = db.scalar(select(Metal).where(Metal.code == "Cu"))
    if project is None or metal is None or source.published_at is None:
        raise ResearchError("项目、铜金属字典或来源发布日期不完整")
    model = OBSERVATION_MODELS[candidate.metric_type]
    superseded = None
    if candidate.supersedes_observation_id:
        superseded = db.get(model, candidate.supersedes_observation_id)
        if superseded is None or superseded.project_id != project.id or not superseded.published:
            raise ResearchError("被修订记录不存在、项目不一致或尚未发布")
        if not superseded.is_current:
            raise ResearchError("只能修订当前版本")
    common = dict(
        project_id=project.id, metal_id=metal.id,
        source_id=source.id, source_code=source.code,
        record_key=f"research:{candidate.candidate_fingerprint[:32]}",
        original_value=_decimal(candidate.raw_value), original_unit=candidate.raw_unit,
        normalized_value=candidate.normalized_value, normalized_unit=candidate.normalized_unit,
        missing_reason=candidate.missing_reason,
        period_start=candidate.period_start, period_end=candidate.period_end,
        effective_date=candidate.effective_date,
        calendar_basis=candidate.calendar_basis,
        fiscal_year_label=candidate.fiscal_year_label,
        fiscal_year_start_month=candidate.fiscal_year_start_month,
        period_type=candidate.period_type, ownership_basis=candidate.ownership_basis,
        production_stage=candidate.production_stage,
        source_published_at=source.published_at,
        source_locator=json.dumps(evidence.evidence_locator, ensure_ascii=False),
        verified_at=date.today(), review_status="approved", published=True,
        row_version=1, notes=None, evidence_id=evidence.id,
        research_candidate_id=candidate.id, is_current=True,
        confirmed_by=user.id, confirmed_at=utcnow(),
        supersedes_id=superseded.id if superseded else None,
    )
    payload = candidate.candidate_payload or {}
    if candidate.metric_type == "production":
        observation = ProductionObservation(
            **common,
            is_cumulative=bool(payload.get("is_cumulative", candidate.period_type == "ytd")),
            is_estimate=bool(payload.get("is_estimate", False)),
        )
    elif candidate.metric_type == "guidance":
        low = _decimal(payload.get("guidance_low")) or candidate.normalized_value
        high = _decimal(payload.get("guidance_high")) or candidate.normalized_value
        observation = GuidanceObservation(
            **common, guidance_low=low, guidance_high=high,
            guidance_kind=str(payload.get("guidance_kind") or "initial"),
            adjustment_type=payload.get("adjustment_type"),
            adjustment_date=_parse_date(payload.get("adjustment_date")),
        )
    else:
        observation = ReserveObservation(
            **common, reserve_kind=str(payload.get("reserve_kind") or "reserve"),
            classification=str(payload.get("classification") or "reported"),
            ore_tonnage=_decimal(payload.get("ore_tonnage")),
            grade_pct=_decimal(payload.get("grade_pct")),
            contained_metal_value=candidate.normalized_value,
        )
    if superseded:
        superseded.is_current = False
        superseded.superseded_at = utcnow()
    db.add(observation)
    db.flush()
    after = observation_snapshot(observation)
    db.add(ReviewItem(
        observation_type=candidate.metric_type,
        observation_id=observation.id,
        research_candidate_id=candidate.id,
        status="modified_approved_published" if changes else "approved_published",
        before_payload=before, after_payload=after,
        reviewer_id=user.id,
        reviewer_comment="Phase 1B 资料研究单级确认发布",
        reviewed_at=utcnow(),
    ))
    candidate.candidate_snapshot = before
    candidate.published_snapshot = after
    candidate.administrator_changes = raw_to_json(changes) if changes else None
    candidate.status = "published"
    candidate.published_observation_type = candidate.metric_type
    candidate.published_observation_id = observation.id
    candidate.confirmed_by = user.id
    candidate.confirmed_at = observation.confirmed_at
    source.verified_at = date.today()
    db.commit()
    return candidate.metric_type, observation.id, False


def set_candidate_ignored(db: Session, candidate: ResearchCandidate) -> None:
    if candidate.status == "published":
        raise ResearchError("已发布候选不能暂不处理")
    candidate.status = "ignored"
    db.commit()


def restore_candidate(db: Session, candidate: ResearchCandidate) -> None:
    if candidate.status != "ignored":
        raise ResearchError("只有暂不处理的候选可以恢复")
    source = db.get(Source, candidate.source_document_id)
    evidence = db.get(DocumentEvidence, candidate.evidence_id)
    if source is None or evidence is None:
        raise ResearchError("候选来源或证据不存在")
    candidate.status = "needs_attention"
    revalidate_candidate(candidate, source, evidence)
    db.commit()
