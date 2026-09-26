#!/usr/bin/env python3
"""
Syncs event timer sequences from the GW2 wiki's canonical data source.
Only the `sequences` field (partial + pattern) is overwritten — custom colors,
chatlinks, wiki links and segment names in our local file are preserved.
Events that exist on the wiki but not locally (e.g. new maps) are added as-is.

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

    # Build lookup: zone name → wiki event
    wiki_by_name: dict[str, dict] = {
        ev["name"]: ev
        for ev in wiki_events.values()
        if "name" in ev and "sequences" in ev
    }
    print(f"  {len(wiki_by_name)} events loaded from wiki")

    if not DATA_FILE.exists():
        local = {"events": wiki_events}
        DATA_FILE.write_text(
            json.dumps(local, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"  Created from scratch ({len(wiki_events)} events)")
        return

    local = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    updated = []
    unchanged = []
    skipped = []

    # Add events that are new on the wiki (e.g. new maps), keeping wiki order
    local_names = {ev.get("name", "") for ev in local["events"].values()}
    added = [
        key for key, ev in wiki_events.items()
        if key not in local["events"] and ev.get("name", "") not in local_names
    ]
    if added:
        merged = {}
        for key, ev in wiki_events.items():
            if key in added:
                merged[key] = ev
            elif key in local["events"]:
                merged[key] = local["events"][key]
        # Keep local-only events (not on the wiki) at their end position
        for key, ev in local["events"].items():
            merged.setdefault(key, ev)
        local["events"] = merged

    for key, ev in local["events"].items():
        if key in added:
            continue
        name = ev.get("name", "")
        if name not in wiki_by_name:
            continue
        wiki_ev = wiki_by_name[name]
        wiki_seq = wiki_ev["sequences"]
        if wiki_seq == ev.get("sequences"):
            unchanged.append(name)
        else:
            # Sequences reference segments by key; only sync when every local
            # segment key still names the same segment on the wiki (new wiki
            # segments are appended). A renumbering would mislabel segments.
            wiki_segs = wiki_ev.get("segments", {})
            local_segs = ev.setdefault("segments", {})
            if all(
                k in wiki_segs and wiki_segs[k].get("name") == seg.get("name")
                for k, seg in local_segs.items()
            ):
                for k, seg in wiki_segs.items():
                    local_segs.setdefault(k, seg)
                ev["sequences"] = wiki_seq
                updated.append(name)
            else:
                skipped.append(name)

    if added or updated:
        DATA_FILE.write_text(
            json.dumps(local, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    if added:
        print(f"  Added   : {len(added)}")
        for key in added:
            print(f"    + {wiki_events[key].get('name', key)}")
    if updated:
        print(f"  Updated : {len(updated)}")
        for n in updated:
            print(f"    • {n}")
    elif not added:
        print("  No sequence changes — data already up to date")

    print(f"  Unchanged: {len(unchanged)}")
    if skipped:
        print(f"  Skipped (segments renumbered on wiki, review manually): {len(skipped)}")
        for n in skipped:
            print(f"    ! {n}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
