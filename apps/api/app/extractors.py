from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Protocol


@dataclass(frozen=True)
class ParsedSection:
    text: str
    evidence_type: str
    locator: dict[str, object]
    page_number: int | None = None


@dataclass(frozen=True)
class ExtractedFact:
    metric_type: str
    raw_value: str | None
    raw_unit: str | None
    excerpt: str
    section: ParsedSection
    confidence: Decimal
    extraction_method: str
    payload: dict[str, object]


class Extractor(Protocol):
    name: str

    def extract(self, project_name: str, sections: list[ParsedSection]) -> list[ExtractedFact]: ...


class FixtureExtractor:
    """Deterministic test-only extractor; production code never selects it implicitly."""

    name = "fixture"

    def extract(self, project_name: str, sections: list[ParsedSection]) -> list[ExtractedFact]:
        if not sections:
            return []
        section = sections[0]
        return [
            ExtractedFact(
                metric_type="production",
                raw_value="1000",
                raw_unit="t",
                excerpt=section.text[:500],
                section=section,
                confidence=Decimal("0.99"),
                extraction_method="fixture",
                payload={"fixture": True, "project_name": project_name},
            )
        ]


class DeterministicExtractor:
    """Narrow fallback for obvious production sentences; it does not infer periods or bases."""

    name = "deterministic"
    _production = re.compile(
        r"(?P<excerpt>[^.\n]{0,180}(?:produced|production)[^.\n]{0,100}?"
        r"(?P<value>\d[\d,]*(?:\.\d+)?)\s*(?P<unit>kt|kilotonnes?|thousand tonnes?|tonnes?|metric tons?)[^.\n]{0,180})",
        re.IGNORECASE,
    )

    def extract(self, project_name: str, sections: list[ParsedSection]) -> list[ExtractedFact]:
        facts: list[ExtractedFact] = []
        project_token = project_name.casefold()
        for section in sections:
            for match in self._production.finditer(section.text):
                excerpt = " ".join(match.group("excerpt").split())
                if project_token not in excerpt.casefold() and project_token not in section.text.casefold():
                    continue
                facts.append(
                    ExtractedFact(
                        metric_type="production",
                        raw_value=match.group("value").replace(",", ""),
                        raw_unit=match.group("unit"),
                        excerpt=excerpt,
                        section=section,
                        confidence=Decimal("0.65"),
                        extraction_method=self.name,
                        payload={},
                    )
                )
        return facts


class AIExtractor:
    """Provider-neutral boundary. A configured provider is intentionally deferred to Phase 1B.2."""

    name = "ai"

    def __init__(self, model: str | None, api_key: str | None):
        self.model = model
        self.api_key = api_key

    @property
    def configured(self) -> bool:
        return bool(self.model and self.api_key)

    def extract(self, project_name: str, sections: list[ParsedSection]) -> list[ExtractedFact]:
        raise RuntimeError("在线 AI 提取器尚未配置供应商实现；请使用 deterministic 或 manual")
