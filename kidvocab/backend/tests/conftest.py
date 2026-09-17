from __future__ import annotations

import os
import sys
import tempfile

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

_TMP = tempfile.mkdtemp(prefix="kidvocab-test-")
os.environ.setdefault("KIDVOCAB_DATABASE_URL", f"sqlite:///{_TMP}/test.db")
os.environ.setdefault("KIDVOCAB_MEDIA_ROOT", os.path.join(_TMP, "media"))
os.environ.setdefault("KIDVOCAB_AI_PROVIDER", "mock")

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.deps import create_anonymous_child  # noqa: E402


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
        session.commit()
    finally:
        session.close()


@pytest.fixture()
def child(db):
    c = create_anonymous_child(db, grade=3)
    db.commit()
    return c


@pytest.fixture()
def client(db):
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    def override():
        yield db

    app.dependency_overrides[get_db] = override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def media_dir():
    return os.environ["KIDVOCAB_MEDIA_ROOT"]
