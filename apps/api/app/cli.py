import argparse
import json
from dataclasses import dataclass, field
from getpass import getpass
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import ensure_single_admin, hash_password
from app.config import get_settings
from app.country_reference import COUNTRIES, COUNTRY_REFERENCE_VERSION, CountryReference
from app.database import SessionLocal
from app.models import Country, User


@dataclass
class CountrySeedReport:
    added: int = 0
    skipped: int = 0
    updated: int = 0
    conflicts: int = 0
    conflict_details: list[dict[str, object]] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        return {
            "reference_version": COUNTRY_REFERENCE_VERSION,
            "added": self.added,
            "skipped": self.skipped,
            "updated": self.updated,
            "conflicts": self.conflicts,
            "conflict_details": self.conflict_details,
        }


def seed_countries(
    db: Session,
    countries: Iterable[CountryReference] = COUNTRIES,
) -> CountrySeedReport:
    report = CountrySeedReport()
    fields = ("iso2", "name_en", "name_zh", "region")
    for reference in countries:
        existing = db.scalar(select(Country).where(Country.iso3 == reference.iso3))
        iso2_owner = db.scalar(select(Country).where(Country.iso2 == reference.iso2))
        if existing is None:
            if iso2_owner is not None:
                report.conflicts += 1
                report.conflict_details.append(
                    {
                        "iso3": reference.iso3,
                        "fields": {
                            "iso2": {
                                "database_iso3": iso2_owner.iso3,
                                "reference": reference.iso2,
                            }
                        },
                    }
                )
                continue
            db.add(
                Country(
                    iso2=reference.iso2,
                    iso3=reference.iso3,
                    name_en=reference.name_en,
                    name_zh=reference.name_zh,
                    region=reference.region,
                )
            )
            db.flush()
            report.added += 1
            continue

        conflicts: dict[str, dict[str, str]] = {}
        supplements: dict[str, str] = {}
        for field_name in fields:
            actual = getattr(existing, field_name)
            expected = getattr(reference, field_name)
            if actual in (None, ""):
                supplements[field_name] = expected
            elif actual != expected:
                conflicts[field_name] = {
                    "database": str(actual),
                    "reference": expected,
                }
        if iso2_owner is not None and iso2_owner.id != existing.id:
            conflicts["iso2"] = {
                "database_iso3": iso2_owner.iso3,
                "reference": reference.iso2,
            }
        if conflicts:
            report.conflicts += 1
            report.conflict_details.append(
                {"iso3": reference.iso3, "fields": conflicts}
            )
            continue
        if supplements:
            for field_name, value in supplements.items():
                setattr(existing, field_name, value)
            report.updated += 1
        else:
            report.skipped += 1
    db.commit()
    return report


def prompt_new_password(show_input: bool = False) -> str:
    if show_input:
        print("警告：密码将在终端中显示，请确认周围无人旁观且未在录屏。")
        read_password = input
        password_prompt = "新管理员密码（输入可见）: "
        confirmation_prompt = "再次输入新管理员密码（输入可见）: "
    else:
        read_password = getpass
        password_prompt = "新管理员密码（输入不会显示）: "
        confirmation_prompt = "再次输入新管理员密码: "
    password = read_password(password_prompt)
    confirmation = read_password(confirmation_prompt)
    if password != confirmation:
        raise SystemExit("两次输入的密码不一致，未进行任何修改")
    if len(password) < 12:
        raise SystemExit("管理员密码至少需要 12 个字符，未进行任何修改")
    return password


def reset_admin_password(show_input: bool = False) -> None:
    with SessionLocal() as db:
        users = list(db.scalars(select(User)))
        if len(users) != 1:
            raise SystemExit(f"Phase 1A 密码重置要求数据库中恰好存在一个管理员，当前数量: {len(users)}")
        user = users[0]
        print(f"正在重置管理员密码: {user.email}")
        user.password_hash = hash_password(prompt_new_password(show_input=show_input))
        user.is_active = True
        db.commit()
        print(f"管理员密码已重置: {user.email}")


def main() -> int:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    create_admin = commands.add_parser("create-admin")
    create_admin.add_argument("--email")
    create_admin.add_argument("--password")
    reset_password = commands.add_parser("reset-admin-password")
    reset_password.add_argument(
        "--show-input",
        action="store_true",
        help="在终端显示密码输入（仅用于无人旁观、未录屏的本地终端）",
    )
    commands.add_parser("seed-countries")
    args = parser.parse_args()
    if args.command == "create-admin":
        settings = get_settings()
        email = args.email or settings.admin_email
        password = args.password or settings.admin_password
        if not password or len(password) < 12:
            raise SystemExit("管理员密码至少需要 12 个字符")
        with SessionLocal() as db:
            user = ensure_single_admin(db, email, password)
            print(f"Administrator ready: {user.email}")
    elif args.command == "reset-admin-password":
        reset_admin_password(show_input=args.show_input)
    elif args.command == "seed-countries":
        with SessionLocal() as db:
            report = seed_countries(db)
        print(json.dumps(report.as_dict(), ensure_ascii=False, sort_keys=True))
        return 1 if report.conflicts else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
