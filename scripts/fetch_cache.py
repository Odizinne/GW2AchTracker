#!/usr/bin/env python3
"""
Fetches GW2 public data for all 4 supported languages and writes to data/.
Run daily via GitHub Actions or locally:  python scripts/fetch_cache.py
Serve locally for testing:               python -m http.server 8000
"""

import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE     = "https://api.guildwars2.com/v2"
LANGS    = ["en", "fr", "de", "es"]
DATA_DIR = Path(__file__).parent.parent / "data"
BATCH    = 200


def _fetch(url, retries=3):
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 5 * 2 ** attempt
                print(f"    rate limited, waiting {wait}s...")
                time.sleep(wait)
            elif attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise
        except Exception:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise
    raise RuntimeError(f"Failed after {retries} attempts: {url}")


def get(endpoint, params=None):
    url = BASE + endpoint
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items())
    return _fetch(url)


def get_batched(endpoint, ids, lang, pause=0.05):
    results = []
    for i in range(0, len(ids), BATCH):
        batch = ids[i : i + BATCH]
        chunk = get(endpoint, {"ids": ",".join(str(x) for x in batch), "lang": lang})
        results.extend(chunk)
        if i + BATCH < len(ids):
            time.sleep(pause)
    return results


def fetch_lang(lang):
    print(f"  [{lang}] fetching achievement IDs...")
    all_ids = get("/achievements", {"lang": lang})
    print(f"  [{lang}] {len(all_ids)} achievements, fetching definitions...")
    achs_list    = get_batched("/achievements", all_ids, lang)
    achievements = {str(a["id"]): a for a in achs_list}

    print(f"  [{lang}] groups + categories...")
    groups_raw = get("/achievements/groups",     {"ids": "all", "lang": lang})
    cats_raw   = get("/achievements/categories", {"ids": "all", "lang": lang})
    groups     = sorted(
        [g for g in groups_raw if g.get("categories")],
        key=lambda g: g.get("order", 0),
    )
    categories = {str(c["id"]): c for c in cats_raw}

    item_ids, title_ids, skin_ids = set(), set(), set()
    minipet_mini_ids = set()
    for ach in achievements.values():
        for r in ach.get("rewards", []):
            if r.get("type") == "Item"  and r.get("id"): item_ids.add(r["id"])
            if r.get("type") == "Title" and r.get("id"): title_ids.add(r["id"])
        for b in ach.get("bits", []):
            if b.get("type") == "Item"    and b.get("id"): item_ids.add(b["id"])
            if b.get("type") == "Minipet" and b.get("id"): minipet_mini_ids.add(b["id"])
            if b.get("type") == "Skin"    and b.get("id"): skin_ids.add(b["id"])

    items, titles, skins = {}, {}, {}
    item_descs, skin_descs = {}, {}
    if item_ids:
        print(f"  [{lang}] {len(item_ids)} item names...")
        for i in get_batched("/items", list(item_ids), lang):
            items[str(i["id"])] = i["name"]
            if i.get("description"):
                item_descs[str(i["id"])] = i["description"]
    if title_ids:
        print(f"  [{lang}] {len(title_ids)} title names...")
        for t in get_batched("/titles", list(title_ids), lang):
            titles[str(t["id"])] = t["name"]
    if skin_ids:
        print(f"  [{lang}] {len(skin_ids)} skin names...")
        try:
            for s in get_batched("/skins", list(skin_ids), lang):
                skins[str(s["id"])] = s["name"]
                if s.get("description"):
                    skin_descs[str(s["id"])] = s["description"]
        except Exception as e:
            print(f"  [{lang}] skins failed (non-fatal): {e}")

    mini_names = {}
    if minipet_mini_ids:
        print(f"  [{lang}] mini names...")
        try:
            minis_raw    = get("/minis", {"ids": "all", "lang": lang})
            minipet_strs = {str(x) for x in minipet_mini_ids}
            for m in minis_raw:
                mini_id = str(m.get("id", ""))
                if mini_id in minipet_strs and m.get("name"):
                    mini_names[mini_id] = m["name"]
        except Exception as e:
            print(f"  [{lang}] minis failed (non-fatal): {e}")

    return {
        "achievements": achievements,
        "groups":       groups,
        "categories":   categories,
        "items":        items,
        "titles":       titles,
        "skins":        skins,
        "item_descs":   item_descs,
        "skin_descs":   skin_descs,
        "mini_names":   mini_names,
    }


def fetch_icons(en_achievements):
    """Fetch and write language-neutral icon URLs for items, minis, and skins."""
    item_ids, minipet_mini_ids, skin_ids = set(), set(), set()
    for ach in en_achievements.values():
        for r in ach.get("rewards", []):
            if r.get("type") == "Item" and r.get("id"):
                item_ids.add(r["id"])
        for b in ach.get("bits", []):
            if b.get("type") == "Item"    and b.get("id"): item_ids.add(b["id"])
            if b.get("type") == "Minipet" and b.get("id"): minipet_mini_ids.add(b["id"])
            if b.get("type") == "Skin"    and b.get("id"): skin_ids.add(b["id"])

    item_icons    = {}
    item_rarities = {}
    if item_ids:
        print(f"  [icons] {len(item_ids)} item icons + rarities...")
        for i in get_batched("/items", list(item_ids), "en"):
            if i.get("icon"):
                item_icons[str(i["id"])] = i["icon"]
            if i.get("rarity"):
                item_rarities[str(i["id"])] = i["rarity"]

    mini_icons = {}
    if minipet_mini_ids:
        print(f"  [icons] fetching all minis for icons...")
        try:
            minis_raw    = get("/minis", {"ids": "all"})
            minipet_strs = {str(x) for x in minipet_mini_ids}
            for m in minis_raw:
                mini_id = str(m.get("id", ""))
                if mini_id in minipet_strs and m.get("icon"):
                    mini_icons[mini_id] = m["icon"]
        except Exception as e:
            print(f"  [icons] minis failed (non-fatal): {e}")

    skin_icons = {}
    if skin_ids:
        print(f"  [icons] {len(skin_ids)} skin icons...")
        try:
            for s in get_batched("/skins", list(skin_ids), "en"):
                if s.get("icon"):
                    skin_icons[str(s["id"])] = s["icon"]
        except Exception as e:
            print(f"  [icons] skins failed (non-fatal): {e}")

    (DATA_DIR / "items").mkdir(exist_ok=True)
    (DATA_DIR / "minis").mkdir(exist_ok=True)
    (DATA_DIR / "skins").mkdir(exist_ok=True)
    (DATA_DIR / "items" / "icons.json").write_text(to_json(item_icons),    encoding="utf-8")
    (DATA_DIR / "items" / "rarities.json").write_text(to_json(item_rarities), encoding="utf-8")
    (DATA_DIR / "minis" / "icons.json").write_text(to_json(mini_icons),    encoding="utf-8")
    (DATA_DIR / "skins" / "icons.json").write_text(to_json(skin_icons),    encoding="utf-8")
    print(f"  [icons] {len(item_icons)} items, {len(mini_icons)} minis, {len(skin_icons)} skins, {len(item_rarities)} rarities")


def to_json(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def main():
    DATA_DIR.mkdir(exist_ok=True)

    version_path = DATA_DIR / "version.json"
    versions     = json.loads(version_path.read_text()) if version_path.exists() else {}
    today        = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Fast early-exit: if the GW2 build ID hasn't changed and all cache files exist,
    # no game data could have changed — skip the full fetch entirely.
    print("Checking GW2 build ID...")
    try:
        current_build   = get("/build")["id"]
        last_build      = versions.get("_build")
        all_files_exist = all((DATA_DIR / f"cache-{lang}.json").exists() for lang in LANGS)

        if last_build and current_build != last_build:
            print(f"Build changed: {last_build} → {current_build}")
        elif not all_files_exist:
            missing = [l for l in LANGS if not (DATA_DIR / f"cache-{lang}.json").exists()]
            print(f"Missing cache files for: {missing}, fetching...")
        else:
            print(f"First run (build {current_build}), fetching all languages...")

    except Exception as e:
        print(f"Could not fetch build ID ({e}), proceeding anyway...")
        current_build = None

    changed    = []
    any_failed = False
    en_data    = None

    for lang in LANGS:
        path = DATA_DIR / f"cache-{lang}.json"
        print(f"\nFetching {lang}...")
        try:
            data     = fetch_lang(lang)
            new_json = to_json(data)
        except Exception as e:
            print(f"  [{lang}] FAILED: {e}", file=sys.stderr)
            any_failed = True
            continue

        if lang == "en":
            en_data = data

        if path.exists() and path.read_text(encoding="utf-8") == new_json:
            print(f"  [{lang}] no changes in data")
            continue

        path.write_text(new_json, encoding="utf-8")
        print(f"  [{lang}] written ({len(new_json) // 1024} KB)")
        versions[lang] = today
        changed.append(lang)

    # Fetch icons once (language-neutral). Re-fetch if build changed or files missing.
    all_icon_files = all([
        (DATA_DIR / "items" / "icons.json").exists(),
        (DATA_DIR / "items" / "rarities.json").exists(),
        (DATA_DIR / "minis" / "icons.json").exists(),
        (DATA_DIR / "skins" / "icons.json").exists(),
    ])
    icons_outdated = (
        versions.get("icons") != str(current_build)
        or not all_icon_files
    )
    if icons_outdated and en_data is not None and not any_failed:
        print("\nFetching icons...")
        try:
            fetch_icons(en_data["achievements"])
            versions["icons"] = str(current_build)
        except Exception as e:
            print(f"Icons fetch FAILED (non-fatal): {e}", file=sys.stderr)

    # Only store the build ID when every language succeeded, so a partial failure
    # causes the next run to retry rather than skip.
    if current_build is not None and not any_failed:
        versions["_build"] = current_build

    if changed or (current_build is not None and not any_failed):
        version_path.write_text(json.dumps(versions, indent=2), encoding="utf-8")

    if changed:
        print(f"\nUpdated languages: {changed}")
    else:
        print("\nNo data changes detected.")


if __name__ == "__main__":
    main()
