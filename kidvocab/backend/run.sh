#!/usr/bin/env bash
# Start the API on http://127.0.0.1:8000  (docs at /docs)
set -euo pipefail
cd "$(dirname "$0")"
[ -d .venv ] || python3 -m venv .venv
./.venv/bin/pip install -q -r requirements.txt
exec ./.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
