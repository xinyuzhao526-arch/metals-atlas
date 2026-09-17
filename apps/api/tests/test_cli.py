from contextlib import contextmanager
from secrets import token_urlsafe

import pytest
from sqlalchemy import select

from app import cli
from app.auth import verify_password
from app.country_reference import COUNTRIES
from app.models import Country, User


def country_reference(iso3: str):
    return next(country for country in COUNTRIES if country.iso3 == iso3)


def test_seed_countries_creates_missing_and_is_idempotent(session):
    original = {
        country.iso3: (
            country.id,
            country.iso2,
            country.name_en,
            country.name_zh,
            country.region,
        )
        for country in session.scalars(
            select(Country).where(Country.iso3.in_(["CHL", "USA"]))
        )
    }

    first = cli.seed_countries(session)
    assert (first.added, first.skipped, first.updated, first.conflicts) == (15, 2, 0, 0)
    assert session.query(Country).count() == 17
    for iso3, expected in original.items():
        country = session.scalar(select(Country).where(Country.iso3 == iso3))
        assert country is not None
        assert (
            country.id,
            country.iso2,
            country.name_en,
            country.name_zh,
            country.region,
        ) == expected

    second = cli.seed_countries(session)
    assert (second.added, second.skipped, second.updated, second.conflicts) == (0, 17, 0, 0)
    assert session.query(Country).count() == 17


def test_seed_countries_supplements_empty_fields(session):
    country = session.scalar(select(Country).where(Country.iso3 == "CHL"))
    assert country is not None
    country.name_zh = ""
    country.region = ""
    session.commit()

    report = cli.seed_countries(session, [country_reference("CHL")])

    session.refresh(country)
    assert (report.added, report.skipped, report.updated, report.conflicts) == (0, 0, 1, 0)
    assert country.name_zh == "智利"
    assert country.region == "South America"


def test_seed_countries_reports_conflict_without_overwrite(session):
    country = session.scalar(select(Country).where(Country.iso3 == "USA"))
    assert country is not None
    country.name_en = "United States of America"
    session.commit()

    report = cli.seed_countries(session, [country_reference("USA")])

    session.refresh(country)
    assert (report.added, report.skipped, report.updated, report.conflicts) == (0, 0, 0, 1)
    assert country.name_en == "United States of America"
    assert report.conflict_details[0]["iso3"] == "USA"
    assert "name_en" in report.conflict_details[0]["fields"]


def test_reset_admin_password_uses_hidden_confirmation(monkeypatch, session):
    candidate = token_urlsafe(24)
    answers = iter([candidate, candidate])
    monkeypatch.setattr(cli, "getpass", lambda _prompt: next(answers))

    @contextmanager
    def use_test_session():
        yield session

    monkeypatch.setattr(cli, "SessionLocal", use_test_session)
    cli.reset_admin_password()

    user = session.scalar(select(User))
    assert user is not None
    assert verify_password(candidate, user.password_hash)


def test_reset_admin_password_rejects_mismatched_confirmation(monkeypatch, session):
    user = session.scalar(select(User))
    assert user is not None
    original_hash = user.password_hash
    answers = iter([token_urlsafe(24), token_urlsafe(24)])
    monkeypatch.setattr(cli, "getpass", lambda _prompt: next(answers))

    @contextmanager
    def use_test_session():
        yield session

    monkeypatch.setattr(cli, "SessionLocal", use_test_session)
    with pytest.raises(SystemExit, match="不一致"):
        cli.reset_admin_password()

    session.refresh(user)
    assert user.password_hash == original_hash


def test_visible_password_prompt_is_explicit(monkeypatch, capsys):
    candidate = token_urlsafe(24)
    answers = iter([candidate, candidate])
    monkeypatch.setattr("builtins.input", lambda _prompt: next(answers))
    monkeypatch.setattr(cli, "getpass", lambda _prompt: pytest.fail("visible mode must not use getpass"))

    assert cli.prompt_new_password(show_input=True) == candidate
    assert "密码将在终端中显示" in capsys.readouterr().out
