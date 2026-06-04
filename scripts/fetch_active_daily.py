#!/usr/bin/env python3
"""
Fetches active festival category IDs and writes data/daily-today.json.
Run daily via GitHub Actions (after fetch_cache.py).

Detection strategy (first success wins):
  1. GW2 API /achievements/daily — retired Aug 2023, kept as future-proof hook
  2. GW2 Wiki pages — parse exact year-by-year festival dates from wikitext
  3. Hardcoded date ranges — broad fallback if the wiki is unreachable
"""

import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

BASE     = "https://api.guildwars2.com/v2"
WIKI_API = "https://wiki.guildwars2.com/api.php"
DATA_DIR = Path(__file__).parent.parent / "data"

# (wiki_page_name, daily_category_id)
# Category IDs from cache-en.json cat_strings — "Daily <Festival>" entries.
FESTIVAL_WIKI_PAGES = [
    ("Lunar_New_Year",             201),
    ("Super_Adventure_Festival",   162),
    ("Dragon_Bash",                233),
    ("Festival_of_the_Four_Winds", 213),
    ("Halloween",                   79),
    ("Wintersday",                  98),
]

# Broad fallback ranges used only when the wiki is unreachable.
# (keyword_in_category_name, start_month, start_day, end_month, end_day)
# Year-wrapping ranges have start_month > end_month (e.g. Wintersday Dec–Jan).
FESTIVAL_DATE_RANGES = [
    ("lunar new year",  1, 15,  3,  1),
    ("fool",            3, 28,  4, 15),
    ("super adventure", 4,  1,  5, 15),
    ("dragon bash",     5, 20,  7, 10),
    ("halloween",      10,  1, 11, 10),
    ("mad king",       10,  1, 11, 10),
    ("wintersday",     12,  1,  1, 20),
]

# Matches "(YYYY-MM-DD — YYYY-MM-DD)" in wikitext (em-dash or en-dash).
_DATE_RE = re.compile(r'\((\d{4}-\d{2}-\d{2})\s+[—–-]\s+(\d{4}-\d{2}-\d{2})\)')


def _fetch(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read())


def build_ach_to_cat(categories):
    result = {}
    for cat_id, cat in categories.items():
        for ach_id in cat.get("achievements", []):
            result[ach_id] = int(cat_id)
    return result


# ── Strategy 1: GW2 API ──────────────────────────────────────────────────────

def festival_cats_from_api(ach_to_cat):
    url = f"{BASE}/achievements/daily"
    try:
        data = _fetch(url)
        special_ids = {e["id"] for e in data.get("special", [])}
        if special_ids:
            cats = sorted({ach_to_cat[a] for a in special_ids if a in ach_to_cat})
            if cats:
                print(f"  API: found {len(cats)} festival categories")
                return cats
        print("  API: no special achievements returned")
    except urllib.error.HTTPError as e:
        print(f"  API: HTTP {e.code}", file=sys.stderr)
    except Exception as e:
        print(f"  API: {e}", file=sys.stderr)
    return None


# ── Strategy 2: GW2 Wiki ─────────────────────────────────────────────────────

def _wiki_wikitext(page):
    params = urllib.parse.urlencode({
        "action": "parse", "page": page,
        "prop": "wikitext", "format": "json",
    })
    data = _fetch(f"{WIKI_API}?{params}")
    return data.get("parse", {}).get("wikitext", {}).get("*", "")


def _is_active(start_str, end_str, today):
    start = date.fromisoformat(start_str)
    end   = date.fromisoformat(end_str)
    return start <= today <= end


def festival_cats_from_wiki(today):
    year = today.year
    active = []
    any_page_ok = False

    for page, cat_id in FESTIVAL_WIKI_PAGES:
        try:
            wikitext = _wiki_wikitext(page)
            any_page_ok = True
            for m in _DATE_RE.finditer(wikitext):
                s, e = m.group(1), m.group(2)
                # Include ranges that touch the current year (handles Dec–Jan wrap)
                if str(year) not in s and str(year) not in e:
                    continue
                if _is_active(s, e, today):
                    print(f"  Wiki: {page} active ({s} — {e})")
                    active.append(cat_id)
                    break
        except Exception as ex:
            print(f"  Wiki: could not fetch {page}: {ex}", file=sys.stderr)

    return sorted(active) if any_page_ok else None


# ── Strategy 3: Hardcoded date ranges ────────────────────────────────────────

def _in_range(month, day, sm, sd, em, ed):
    if sm <= em:
        return (month > sm or (month == sm and day >= sd)) and \
               (month < em or (month == em and day <= ed))
    return month > sm or (month == sm and day >= sd) or \
           month < em or (month == em and day <= ed)


def festival_cats_from_dates(cat_strings, base_categories, today):
    month, day = today.month, today.day
    active_kw = {kw for kw, sm, sd, em, ed in FESTIVAL_DATE_RANGES
                 if _in_range(month, day, sm, sd, em, ed)}
    if not active_kw:
        return []
    result = set()
    for cat_id, strings in cat_strings.items():
        name = strings.get("name", "").lower()
        if "daily" not in name:
            continue
        if not any(kw in name for kw in active_kw):
            continue
        if base_categories.get(cat_id, {}).get("achievements"):
            result.add(int(cat_id))
    return sorted(result)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    today_dt  = datetime.now(timezone.utc)
    today     = today_dt.date()
    today_str = today.isoformat()
    out_path  = DATA_DIR / "daily-today.json"

    base_cache_path = DATA_DIR / "cache-base.json"
    lang_cache_path = DATA_DIR / "cache-en.json"

    if not base_cache_path.exists():
        print("cache-base.json not found — run fetch_cache.py first.", file=sys.stderr)
        sys.exit(1)

    with base_cache_path.open(encoding="utf-8") as f:
        base_data = json.load(f)
    base_categories = base_data.get("categories", {})
    ach_to_cat = build_ach_to_cat(base_categories)

    cat_strings = {}
    if lang_cache_path.exists():
        with lang_cache_path.open(encoding="utf-8") as f:
            cat_strings = json.load(f).get("cat_strings", {})

    festival_cat_ids = None

    print("Strategy 1: GW2 API /achievements/daily")
    festival_cat_ids = festival_cats_from_api(ach_to_cat)

    if festival_cat_ids is None:
        print("Strategy 2: GW2 Wiki festival pages")
        festival_cat_ids = festival_cats_from_wiki(today)

    if festival_cat_ids is None:
        print("Strategy 3: hardcoded date ranges (wiki unreachable)")
        festival_cat_ids = festival_cats_from_dates(cat_strings, base_categories, today_dt)

    result = {"date": today_str, "festival_cat_ids": festival_cat_ids or []}
    out_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(f"festival_cat_ids: {festival_cat_ids or 'none'}")
    print(f"Written {out_path}")


if __name__ == "__main__":
    main()
