"""Local-disk media storage.

Swap this module for S3/OSS in production; nothing else imports the filesystem.
"""
from __future__ import annotations

import os
import shutil
import uuid
from typing import BinaryIO

from .config import settings

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".txt"}
MAX_BYTES = 12 * 1024 * 1024


class UnsupportedMedia(ValueError):
    pass


def _ensure_root() -> str:
    os.makedirs(settings.media_root, exist_ok=True)
    return settings.media_root


def save_upload(fileobj: BinaryIO, filename: str, subdir: str = "") -> tuple[str, str]:
    """Persist an upload and return ``(absolute_path, public_url)``."""
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise UnsupportedMedia(f"unsupported file type: {ext or 'unknown'}")

    root = _ensure_root()
    target_dir = os.path.join(root, subdir) if subdir else root
    os.makedirs(target_dir, exist_ok=True)

    name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(target_dir, name)
    with open(path, "wb") as out:
        shutil.copyfileobj(fileobj, out, length=1024 * 1024)

    if os.path.getsize(path) > MAX_BYTES:
        os.remove(path)
        raise UnsupportedMedia("file too large")

    rel = os.path.join(subdir, name) if subdir else name
    return path, f"{settings.media_base_url}/{rel.replace(os.sep, '/')}"


def public_url(path: str) -> str:
    root = os.path.abspath(_ensure_root())
    abs_path = os.path.abspath(path)
    if abs_path.startswith(root):
        rel = os.path.relpath(abs_path, root).replace(os.sep, "/")
        return f"{settings.media_base_url}/{rel}"
    return path
