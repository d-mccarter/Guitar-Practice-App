#!/usr/bin/env python3
"""Increment build.json — run automatically via pre-push hook."""
import json
from datetime import datetime, timezone
from pathlib import Path

path = Path(__file__).resolve().parent.parent / "build.json"
data = {"build": 0, "updated": ""}
if path.exists():
    data = json.loads(path.read_text(encoding="utf-8"))

data["build"] = int(data.get("build", 0)) + 1
data["updated"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print(data["build"])
