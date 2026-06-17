#!/usr/bin/env python3
"""
Fetches GW2 public data in English and writes to data/.
Run daily via GitHub Actions or locally:  python scripts/fetch_cache.py
Serve locally for testing:               python -m http.server 8000
"""

import json
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

BASE        = "https://api.guildwars2.com/v2"
ICON_PREFIX = "https://render.guildwars2.com/file/"
ICON_SUFFIX = ".png"
LANGS       = ["en"]
DATA_DIR    = Path(__file__).parent.parent / "data"
BATCH       = 200

# Achievement fields that are identical across all languages
BASE_KEYS = {"id", "flags", "tiers", "type", "rewards", "bits", "icon", "prerequisites", "point_cap"}
# Achievement fields that differ per language
LANG_KEYS = {"name", "description", "requirement", "locked_text"}

# Global semaphore: caps concurrent HTTP requests across all threads.
# Keeps us well below the GW2 API rate limit; tune down if 429s become frequent.
_API_SEM = threading.Semaphore(8)


def _fetch(url, retries=3):
    for attempt in range(retries):
        try:
            with _API_SEM:
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


def get_batched(endpoint, ids, lang):
    """Fetch ids in batches of BATCH, sequentially within a single call.
    The global semaphore handles rate limiting; no sleep needed here."""
    results = []
    for i in range(0, len(ids), BATCH):
        batch = ids[i : i + BATCH]
        results.extend(get(endpoint, {"ids": ",".join(str(x) for x in batch), "lang": lang}))
    return results


def compact_icon(url):
    """Strip the constant render URL prefix/suffix, keeping just HASH/ID."""
    if url and url.startswith(ICON_PREFIX) and url.endswith(ICON_SUFFIX):
        return url[len(ICON_PREFIX):-len(ICON_SUFFIX)]
    return url


def fetch_lang(lang):
    print(f"  [{lang}] fetching achievement IDs...")
    all_ids = get("/achievements", {"lang": lang})
    print(f"  [{lang}] {len(all_ids)} achievements, fetching definitions...")
    achs_list    = get_batched("/achievements", all_ids, lang)
    achievements = {str(a["id"]): a for a in achs_list}

    # Groups and categories are independent — fetch in parallel
    print(f"  [{lang}] groups + categories...")
    with ThreadPoolExecutor(max_workers=2) as pool:
        f_groups = pool.submit(get, "/achievements/groups",     {"ids": "all", "lang": lang})
        f_cats   = pool.submit(get, "/achievements/categories", {"ids": "all", "lang": lang})
        groups_raw = f_groups.result()
        cats_raw   = f_cats.result()

    groups     = sorted(
        [g for g in groups_raw if g.get("categories")],
        key=lambda g: g.get("order", 0),
    )
    categories = {str(c["id"]): c for c in cats_raw}

    item_ids, title_ids, skin_ids, minipet_mini_ids = set(), set(), set(), set()
    for ach in achievements.values():
        for r in ach.get("rewards", []):
            if r.get("type") == "Item"  and r.get("id"): item_ids.add(r["id"])
            if r.get("type") == "Title" and r.get("id"): title_ids.add(r["id"])
        for b in ach.get("bits", []):
            if b.get("type") == "Item"    and b.get("id"): item_ids.add(b["id"])
            if b.get("type") == "Minipet" and b.get("id"): minipet_mini_ids.add(b["id"])
            if b.get("type") == "Skin"    and b.get("id"): skin_ids.add(b["id"])

    # Items, titles, skins, minis are all independent — fetch in parallel
    def _fetch_items():
        if not item_ids:
            return {}, {}
        print(f"  [{lang}] {len(item_ids)} item names...")
        names, descs = {}, {}
        for i in get_batched("/items", list(item_ids), lang):
            names[str(i["id"])] = i["name"]
            if i.get("description"):
                descs[str(i["id"])] = i["description"]
        return names, descs

    def _fetch_titles():
        if not title_ids:
            return {}
        print(f"  [{lang}] {len(title_ids)} title names...")
        return {str(t["id"]): t["name"] for t in get_batched("/titles", list(title_ids), lang)}

    def _fetch_skins():
        if not skin_ids:
            return {}, {}
        print(f"  [{lang}] {len(skin_ids)} skin names...")
        try:
            names, descs = {}, {}
            for s in get_batched("/skins", list(skin_ids), lang):
                names[str(s["id"])] = s["name"]
                if s.get("description"):
                    descs[str(s["id"])] = s["description"]
            return names, descs
        except Exception as e:
            print(f"  [{lang}] skins failed (non-fatal): {e}")
            return {}, {}

    def _fetch_minis():
        if not minipet_mini_ids:
            return {}
        print(f"  [{lang}] mini names...")
        try:
            minis_raw    = get("/minis", {"ids": "all", "lang": lang})
            minipet_strs = {str(x) for x in minipet_mini_ids}
            return {
                str(m["id"]): m["name"]
                for m in minis_raw
                if str(m.get("id", "")) in minipet_strs and m.get("name")
            }
        except Exception as e:
            print(f"  [{lang}] minis failed (non-fatal): {e}")
            return {}

    with ThreadPoolExecutor(max_workers=4) as pool:
        f_items  = pool.submit(_fetch_items)
        f_titles = pool.submit(_fetch_titles)
        f_skins  = pool.submit(_fetch_skins)
        f_minis  = pool.submit(_fetch_minis)
        items, item_descs = f_items.result()
        titles            = f_titles.result()
        skins, skin_descs = f_skins.result()
        mini_names        = f_minis.result()

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


def build_base_cache(en_data):
    """Build the language-neutral base from English data."""
    ach_base = {}
    for id_str, ach in en_data["achievements"].items():
        obj = {k: v for k, v in ach.items() if k in BASE_KEYS}
        if "icon" in obj:
            obj["icon"] = compact_icon(obj["icon"])
        ach_base[id_str] = obj

    groups_base = [
        {k: v for k, v in g.items() if k in {"id", "order", "categories"}}
        for g in en_data["groups"]
    ]

    cats_base = {}
    for id_str, cat in en_data["categories"].items():
        obj = {k: v for k, v in cat.items() if k in {"id", "order", "achievements", "icon"}}
        if "icon" in obj:
            obj["icon"] = compact_icon(obj["icon"])
        cats_base[id_str] = obj

    return {"achievements": ach_base, "groups": groups_base, "categories": cats_base}


def build_lang_cache(lang_data):
    """Build the language-specific strings file from lang data."""
    ach_strings = {}
    for id_str, ach in lang_data["achievements"].items():
        obj = {k: v for k, v in ach.items() if k in LANG_KEYS and v}
        if obj:
            ach_strings[id_str] = obj

    group_strings = {}
    for g in lang_data["groups"]:
        obj = {k: v for k, v in g.items() if k in {"name", "description"} and v}
        if obj:
            group_strings[str(g["id"])] = obj

    cat_strings = {}
    for id_str, cat in lang_data["categories"].items():
        obj = {k: v for k, v in cat.items() if k in {"name", "description"} and v}
        if obj:
            cat_strings[id_str] = obj

    return {
        "ach_strings":   ach_strings,
        "group_strings": group_strings,
        "cat_strings":   cat_strings,
        "items":         lang_data["items"],
        "titles":        lang_data["titles"],
        "skins":         lang_data["skins"],
        "item_descs":    lang_data.get("item_descs", {}),
        "skin_descs":    lang_data.get("skin_descs", {}),
        "mini_names":    lang_data.get("mini_names", {}),
    }


def fetch_icons(en_achievements):
    """Fetch and write language-neutral icon data for items, minis, and skins."""
    item_ids, minipet_mini_ids, skin_ids = set(), set(), set()
    for ach in en_achievements.values():
        for r in ach.get("rewards", []):
            if r.get("type") == "Item" and r.get("id"):
                item_ids.add(r["id"])
        for b in ach.get("bits", []):
            if b.get("type") == "Item"    and b.get("id"): item_ids.add(b["id"])
            if b.get("type") == "Minipet" and b.get("id"): minipet_mini_ids.add(b["id"])
            if b.get("type") == "Skin"    and b.get("id"): skin_ids.add(b["id"])

    def _fetch_item_icons():
        if not item_ids:
            return {}, {}
        print(f"  [icons] {len(item_ids)} item icons + rarities...")
        icons, rarities = {}, {}
        for i in get_batched("/items", list(item_ids), "en"):
            if i.get("icon"):
                icons[str(i["id"])] = compact_icon(i["icon"])
            if i.get("rarity"):
                rarities[str(i["id"])] = i["rarity"]
        return icons, rarities

    def _fetch_mini_icons():
        if not minipet_mini_ids:
            return {}
        print(f"  [icons] fetching all minis for icons...")
        try:
            minis_raw    = get("/minis", {"ids": "all"})
            minipet_strs = {str(x) for x in minipet_mini_ids}
            return {
                str(m["id"]): compact_icon(m["icon"])
                for m in minis_raw
                if str(m.get("id", "")) in minipet_strs and m.get("icon")
            }
        except Exception as e:
            print(f"  [icons] minis failed (non-fatal): {e}")
            return {}

    def _fetch_skin_icons():
        if not skin_ids:
            return {}
        print(f"  [icons] {len(skin_ids)} skin icons...")
        try:
            return {
                str(s["id"]): compact_icon(s["icon"])
                for s in get_batched("/skins", list(skin_ids), "en")
                if s.get("icon")
            }
        except Exception as e:
            print(f"  [icons] skins failed (non-fatal): {e}")
            return {}

    with ThreadPoolExecutor(max_workers=3) as pool:
        f_items = pool.submit(_fetch_item_icons)
        f_minis = pool.submit(_fetch_mini_icons)
        f_skins = pool.submit(_fetch_skin_icons)
        item_icons, item_rarities = f_items.result()
        mini_icons                = f_minis.result()
        skin_icons                = f_skins.result()

    (DATA_DIR / "items").mkdir(exist_ok=True)
    (DATA_DIR / "minis").mkdir(exist_ok=True)
    (DATA_DIR / "skins").mkdir(exist_ok=True)
    (DATA_DIR / "items" / "icons.json").write_text(to_json(item_icons),      encoding="utf-8")
    (DATA_DIR / "items" / "rarities.json").write_text(to_json(item_rarities), encoding="utf-8")
    (DATA_DIR / "minis" / "icons.json").write_text(to_json(mini_icons),      encoding="utf-8")
    (DATA_DIR / "skins" / "icons.json").write_text(to_json(skin_icons),      encoding="utf-8")
    print(f"  [icons] {len(item_icons)} items, {len(mini_icons)} minis, {len(skin_icons)} skins, {len(item_rarities)} rarities")


def to_json(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def main():
    start = time.monotonic()
    DATA_DIR.mkdir(exist_ok=True)

    version_path = DATA_DIR / "version.json"
    versions     = json.loads(version_path.read_text()) if version_path.exists() else {}
    today        = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    print("Checking GW2 build ID...")
    try:
        current_build   = get("/build")["id"]
        last_build      = versions.get("_build")
        all_files_exist = (DATA_DIR / "cache-base.json").exists() and all(
            (DATA_DIR / f"cache-{lang}.json").exists() for lang in LANGS
        )

        if last_build and current_build != last_build:
            print(f"Build changed: {last_build} → {current_build}")
        elif not all_files_exist:
            missing = (["base"] if not (DATA_DIR / "cache-base.json").exists() else []) + [
                l for l in LANGS if not (DATA_DIR / f"cache-{l}.json").exists()
            ]
            print(f"Missing cache files: {missing}, fetching...")
        else:
            print(f"Build {current_build} — checking for data changes...")

    except Exception as e:
        print(f"Could not fetch build ID ({e}), proceeding anyway...")
        current_build = None

    changed       = []
    any_failed    = False
    lang_data_map = {}

    # Fetch all languages in parallel
    print(f"\nFetching {LANGS} in parallel...")
    with ThreadPoolExecutor(max_workers=len(LANGS)) as pool:
        futures = {pool.submit(fetch_lang, lang): lang for lang in LANGS}
        for future in as_completed(futures):
            lang = futures[future]
            try:
                lang_data_map[lang] = future.result()
            except Exception as e:
                print(f"  [{lang}] FAILED: {e}", file=sys.stderr)
                any_failed = True

    # Write language-neutral base cache (derived from English data, same for all langs)
    if "en" in lang_data_map:
        base_path = DATA_DIR / "cache-base.json"
        base_json = to_json(build_base_cache(lang_data_map["en"]))
        if not base_path.exists() or base_path.read_text(encoding="utf-8") != base_json:
            base_path.write_text(base_json, encoding="utf-8")
            print(f"\n[base] written ({len(base_json) // 1024} KB)")
            changed.append("base")
        else:
            print(f"\n[base] no changes")

    # Write per-language string caches (names, descriptions, item/title/skin names)
    for lang, data in lang_data_map.items():
        path     = DATA_DIR / f"cache-{lang}.json"
        new_json = to_json(build_lang_cache(data))
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
    if icons_outdated and "en" in lang_data_map and not any_failed:
        print("\nFetching icons...")
        try:
            fetch_icons(lang_data_map["en"]["achievements"])
            versions["icons"] = str(current_build)
        except Exception as e:
            print(f"Icons fetch FAILED (non-fatal): {e}", file=sys.stderr)

    if current_build is not None and not any_failed:
        versions["_build"] = current_build

    if changed or (current_build is not None and not any_failed):
        version_path.write_text(json.dumps(versions, indent=2), encoding="utf-8")

    elapsed = time.monotonic() - start
    if changed:
        print(f"\nUpdated: {changed}")
    else:
        print("\nNo data changes detected.")
    print(f"Done in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
