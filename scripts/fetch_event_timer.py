#!/usr/bin/env python3
"""
Syncs event timer sequences from the GW2 wiki's canonical data source.
Only the `sequences` field (partial + pattern) is overwritten — custom colors,
chatlinks, wiki links and segment names in our local file are preserved.

Run daily via GitHub Actions or locally:
    python scripts/fetch_event_timer.py
"""

import json
import sys
import urllib.request
from pathlib import Path

WIKI_URL  = "https://wiki.guildwars2.com/wiki/Widget:Event_timer/data.json?action=raw"
DATA_FILE = Path(__file__).parent.parent / "data" / "event-timer.json"


def _fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "GW2AchTracker/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main():
    print("Fetching wiki event timer data …")
    wiki_raw = _fetch(WIKI_URL)

    # The wiki JSON may be wrapped under an "events" key or be flat
    wiki_events: dict = wiki_raw.get("events", wiki_raw)

    # Build lookup: zone name → sequences
    wiki_by_name: dict[str, dict] = {
        ev["name"]: ev["sequences"]
        for ev in wiki_events.values()
        if "name" in ev and "sequences" in ev
    }
    print(f"  {len(wiki_by_name)} events loaded from wiki")

    local = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    updated = []
    unchanged = []

    for key, ev in local["events"].items():
        name = ev.get("name", "")
        if name not in wiki_by_name:
            continue
        wiki_seq = wiki_by_name[name]
        if wiki_seq == ev.get("sequences"):
            unchanged.append(name)
        else:
            ev["sequences"] = wiki_seq
            updated.append(name)

    if updated:
        DATA_FILE.write_text(
            json.dumps(local, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"  Updated : {len(updated)}")
        for n in updated:
            print(f"    • {n}")
    else:
        print("  No sequence changes — data already up to date")

    print(f"  Unchanged: {len(unchanged)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
