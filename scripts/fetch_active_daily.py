#!/usr/bin/env python3
"""
Fetches active festival category IDs from the GW2 API and writes
data/daily-today.json.  Run daily via GitHub Actions (after fetch_cache.py).

The /achievements/daily endpoint was retired by ArenaNet when the old daily
system was replaced by the Wizard's Vault (August 2023).  This script now
only populates festival_cat_ids so the client can hide inactive festivals.
If the endpoint is unavailable it writes an empty file and exits cleanly.
"""

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE     = "https://api.guildwars2.com/v2"
DATA_DIR = Path(__file__).parent.parent / "data"


def _fetch(url):
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {url}", file=sys.stderr)
        raise
    except Exception as e:
        print(f"  Error: {e}", file=sys.stderr)
        raise


def build_ach_to_cat(categories):
    result = {}
    for cat_id, cat in categories.items():
        for ach_id in cat.get("achievements", []):
            result[ach_id] = int(cat_id)
    return result


def main():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out_path = DATA_DIR / "daily-today.json"

    cache_path = DATA_DIR / "cache-en.json"
    if not cache_path.exists():
        print("cache-en.json not found — run fetch_cache.py first.", file=sys.stderr)
        sys.exit(1)

    with cache_path.open(encoding="utf-8") as f:
        ach_to_cat = build_ach_to_cat(json.load(f).get("categories", {}))

    print("Fetching /achievements/daily for festival detection...")
    try:
        data = _fetch(f"{BASE}/achievements/daily")
        special_ids      = {e["id"] for e in data.get("special", [])}
        festival_cat_ids = sorted({ach_to_cat[a] for a in special_ids if a in ach_to_cat})
    except Exception:
        print("  Endpoint unavailable — no festival data.")
        festival_cat_ids = []

    result = {"date": today, "festival_cat_ids": festival_cat_ids}
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"  festival_cat_ids: {festival_cat_ids or 'none'}")
    print(f"Written {out_path}")


if __name__ == "__main__":
    main()
