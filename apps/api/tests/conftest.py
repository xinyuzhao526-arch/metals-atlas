import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.auth import ensure_single_admin
from app.database import Base, get_db
from app.main import app
from app.models import Country, Metal


@pytest.fixture()
def session(tmp_path: Path):
    test_database_url = os.getenv("TEST_DATABASE_URL")
    if test_database_url:
        engine = create_engine(test_database_url, pool_pre_ping=True)
        table_names = ", ".join(f'"{table.name}"' for table in reversed(Base.metadata.sorted_tables))
        with engine.begin() as connection:
            connection.execute(text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE"))
    else:
        engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with factory() as db:
        db.add_all([
            Metal(code="Cu", name_zh="铜", name_en="Copper"),
            Country(iso2="CL", iso3="CHL", name_zh="智利", name_en="Chile", region="South America"),
            Country(iso2="US", iso3="USA", name_zh="美国", name_en="United States", region="North America"),
        ])
        db.commit()
        ensure_single_admin(db, "admin@example.com", "test-password-123")
        yield db
    engine.dispose()


@pytest.fixture()
def client(session):
    def override_db():
        yield session

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def authenticated(client: TestClient):
    response = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "test-password-123"})
    assert response.status_code == 200
    return client, {"X-CSRF-Token": response.json()["csrf_token"]}
