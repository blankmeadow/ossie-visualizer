from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import init_db
from .routers import learning, profile, sources, vocabulary

logging.basicConfig(level=logging.INFO if not settings.debug else logging.DEBUG)

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description=(
        "个人英语词库 MVP。家长负责把学习内容加进来，孩子负责开始学习，"
        "其余由系统自动完成。"
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profile.router)
app.include_router(sources.router)
app.include_router(learning.router)
app.include_router(vocabulary.router)


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    os.makedirs(settings.media_root, exist_ok=True)
    app.mount(settings.media_base_url, StaticFiles(directory=settings.media_root), name="media")


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "ai_provider": settings.ai_provider}
