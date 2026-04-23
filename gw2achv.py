#!/usr/bin/env python3
import json
import sys
import os
import requests
import threading
import webbrowser
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from rich.layout import Layout
from rich.live import Live
from rich.spinner import Spinner
from rich import box

BASE_URL = "https://api.guildwars2.com/v2"
SETTINGS_FILE = Path("settings.json")
MAX_WORKERS = 10
FETCH_THROTTLE = 0.05

DEFAULT_SETTINGS = {
    "api_key": "",
    "max_results": 40,
    "threshold_pct": 80,
    "use_last_tier": False,
    "language": "en",
}

SUPPORTED_LANGUAGES = ["en", "fr", "de", "es"]

ACCENT = "cyan"
DIM = "dim"
HIGHLIGHT_BG = ""

IS_WINDOWS = sys.platform == "win32"

if IS_WINDOWS:
    import msvcrt

    def _getch_raw() -> str:
        ch = msvcrt.getwch()
        if ch in ("\x00", "\xe0"):
            ch2 = msvcrt.getwch()
            if ch2 == "H": return "\x1b[A"
            if ch2 == "P": return "\x1b[B"
            return ""
        return ch

    def _read_password() -> str:
        chars = []
        while True:
            c = msvcrt.getwch()
            if c in ("\r", "\n"):
                sys.stdout.write("\n")
                break
            elif c == "\x08":
                if chars:
                    chars.pop()
                    sys.stdout.write("\b \b")
            elif c == "\x03":
                raise KeyboardInterrupt
            else:
                chars.append(c)
                sys.stdout.write("*")
            sys.stdout.flush()
        return "".join(chars).strip()

else:
    import tty
    import termios

    def _getch_raw() -> str:
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        try:
            tty.setraw(fd)
            ch = sys.stdin.read(1)
            if ch == "\x1b":
                import select
                r, _, _ = select.select([sys.stdin], [], [], 0.05)
                if r:
                    ch += sys.stdin.read(1)
                    r2, _, _ = select.select([sys.stdin], [], [], 0.05)
                    if r2:
                        ch += sys.stdin.read(1)
            return ch
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)

    def _read_password() -> str:
        fd = sys.stdin.fileno()
        old = termios.tcgetattr(fd)
        chars = []
        try:
            tty.setraw(fd)
            while True:
                c = sys.stdin.read(1)
                if c in ("\r", "\n"):
                    sys.stdout.write("\n")
                    sys.stdout.flush()
                    break
                elif c in ("\x7f", "\x08"):
                    if chars:
                        chars.pop()
                        sys.stdout.write("\b \b")
                        sys.stdout.flush()
                elif c == "\x03":
                    raise KeyboardInterrupt
                else:
                    chars.append(c)
                    sys.stdout.write("*")
                    sys.stdout.flush()
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, old)
        return "".join(chars).strip()


KEY_UP    = "UP"
KEY_DOWN  = "DOWN"
KEY_ENTER = "ENTER"

def getch() -> str:
    ch = _getch_raw()
    if ch in ("\x1b[A", "\x1bOA"): return KEY_UP
    if ch in ("\x1b[B", "\x1bOB"): return KEY_DOWN
    if ch in ("\r", "\n"):         return KEY_ENTER
    return ch


def read_line(label: str, default=None, password=False) -> str:
    hint = f" [{default}]" if default is not None else ""
    sys.stdout.write(f"\n  {label}{hint}: ")
    sys.stdout.flush()

    if password:
        value = _read_password()
    else:
        if not IS_WINDOWS:
            fd = sys.stdin.fileno()
            old = termios.tcgetattr(fd)
            termios.tcsetattr(fd, termios.TCSADRAIN, old)
        value = input().strip()

    return value if value else (str(default) if default is not None else "")


def load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return {**DEFAULT_SETTINGS, **json.loads(SETTINGS_FILE.read_text())}
        except Exception:
            pass
    return DEFAULT_SETTINGS.copy()


def save_settings(settings: dict) -> None:
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2))


def _cache_file(lang: str) -> Path:
    return Path(f"ach_cache_{lang}.json")


def load_ach_cache(lang: str = "en") -> dict:
    f = _cache_file(lang)
    if f.exists():
        try:
            return {int(k): v for k, v in json.loads(f.read_text()).items()}
        except Exception:
            pass
    return {}


def save_ach_cache(cache: dict, lang: str = "en") -> None:
    _cache_file(lang).write_text(json.dumps(cache, indent=2))


def clear_ach_cache(lang: str = "en") -> None:
    f = _cache_file(lang)
    if f.exists():
        f.unlink()


_session = requests.Session()


def get_json(endpoint, params=None, api_key=None):
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    r = _session.get(
        f"{BASE_URL}{endpoint}",
        params=params,
        headers=headers,
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def fetch_batch(endpoint, batch, api_key=None):
    return get_json(
        endpoint,
        params={"ids": ",".join(str(x) for x in batch)},
        api_key=api_key,
    )


def get_in_parallel(endpoint, ids, api_key=None, batch_size=150):
    batches = [ids[i:i + batch_size] for i in range(0, len(ids), batch_size)]
    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(fetch_batch, endpoint, b, api_key): b for b in batches}
        for f in as_completed(futures):
            try:
                results.extend(f.result())
            except Exception:
                pass
    return results


def get_current_tier(tiers, progress):
    for i, tier in enumerate(tiers):
        if progress < tier["count"]:
            return i, tier
    return len(tiers) - 1, tiers[-1]


def format_rewards(tier_rewards, item_name_map, tier_points):
    parts = []
    if tier_points:
        parts.append(f"AP:{tier_points}")
    for reward in tier_rewards:
        rt = reward.get("type")
        if rt == "Coins":
            copper = reward.get("count", 0)
            g = copper // 10000
            s = (copper % 10000) // 100
            c = copper % 100
            coins = "".join([
                f"{g}g " if g else "",
                f"{s}s " if s else "",
                f"{c}c" if c or (not g and not s) else "",
            ]).strip()
            parts.append(coins)
        elif rt == "Item":
            iid   = reward.get("id")
            count = reward.get("count", 1)
            name  = item_name_map.get(iid, f"Item#{iid}")
            parts.append(f"{count}x {name}" if count > 1 else name)
        elif rt == "Mastery":
            parts.append(f"Mastery({reward.get('region', '?')})")
        else:
            parts.append(f"[{rt}]")
    return "  ".join(parts) if parts else "-"


def fetch_achievements(settings: dict, status_cb=None) -> list[dict]:
    api_key       = settings["api_key"]
    threshold     = settings["threshold_pct"] / 100
    max_res       = settings["max_results"]
    use_last_tier = settings.get("use_last_tier", False)
    lang          = settings.get("language", "en")

    if status_cb: status_cb("Fetching account achievements…")
    account_data = get_json("/account/achievements", api_key=api_key)
    progress_map = {e["id"]: e for e in account_data}
    needed_ids   = set(progress_map.keys())
    if status_cb: status_cb(f"Account has {len(needed_ids)} achievements in progress.")

    cache      = load_ach_cache(lang)
    cached_ids = set(cache.keys())
    missing    = list(needed_ids - cached_ids)

    if missing:
        if status_cb:
            status_cb(
                f"Cache has {len(cached_ids)} definitions — "
                f"fetching {len(missing)} new…"
            )
        fresh = get_in_parallel("/achievements", missing, api_key=api_key, lang=lang)
        for ach in fresh:
            cache[ach["id"]] = ach
        if status_cb: status_cb(f"Fetched {len(fresh)} definitions, saving cache…")
    else:
        if status_cb:
            status_cb(f"All {len(needed_ids)} definitions cached — skipping fetch.")

    cache = {k: v for k, v in cache.items() if k in needed_ids}
    save_ach_cache(cache, lang)

    definitions = [cache[i] for i in needed_ids if i in cache]

    if status_cb: status_cb(f"Filtering {len(definitions)} achievements…")
    rows = []
    for ach in definitions:
        aid   = ach["id"]
        flags = ach.get("flags", [])
        if "IgnoreNearlyComplete" in flags:
            continue
        entry = progress_map.get(aid, {})
        if entry.get("done", False):
            continue
        progress = entry.get("current", 0)
        tiers    = ach.get("tiers", [])
        if not tiers:
            continue
        tier_idx, current_tier = get_current_tier(tiers, progress)
        if use_last_tier:
            target_tier = tiers[-1]
            is_last     = True
        else:
            target_tier = current_tier
            is_last     = tier_idx == len(tiers) - 1
        required = target_tier["count"]
        if required == 0:
            continue
        ratio = progress / required
        if ratio < threshold:
            continue
        rows.append({
            "id":       aid,
            "name":     ach["name"],
            "progress": progress,
            "required": required,
            "percent":  round(ratio * 100, 1),
            "rewards":  ach.get("rewards", []) if is_last else [],
            "points":   target_tier.get("points", 0),
        })

    rows.sort(key=lambda x: x["percent"], reverse=True)
    rows = rows[:max_res]

    item_ids = [
        r["id"]
        for row in rows
        for r in row["rewards"]
        if r.get("type") == "Item" and "id" in r
    ]
    item_name_map = {}
    if item_ids:
        if status_cb: status_cb(f"Fetching names for {len(item_ids)} reward items…")
        items = get_in_parallel("/items", item_ids, api_key=api_key)
        item_name_map = {i["id"]: i["name"] for i in items}

    for row in rows:
        row["reward_str"] = format_rewards(row["rewards"], item_name_map, row["points"])

    return rows


def make_header(title: str) -> Panel:
    return Panel(
        Text(title, justify="center", style=f"bold {ACCENT}"),
        style=ACCENT,
        padding=(0, 2),
    )


def make_footer(keys):
    t = Text(justify="center")
    for i, (key, label) in enumerate(keys):
        if i:
            t.append("    ")
        t.append(f" {key} ", style=f"bold reverse {ACCENT}")
        if label:
            t.append(f" {label}", style="default")
    return t


def pct_style(pct):
    if pct >= 99: return "bold green"
    if pct >= 95: return "green"
    if pct >= 90: return "yellow"
    return ""


class SetupScreen:
    def run(self, console, settings):
        console.clear()
        console.print(make_header("GW2 Achievement Tracker — Setup"))
        console.print()
        console.print(Panel(
            "No API key found.\n\n"
            "Generate one at "
            "[link=https://account.arena.net/applications]"
            "account.arena.net/applications[/link]\n"
            "Tick [bold]account[/bold] and [bold]progression[/bold].",
            border_style=ACCENT,
            padding=(1, 4),
        ))
        key = read_line("Paste your API key", password=True)
        if not key:
            sys.exit(0)
        settings["api_key"] = key
        save_settings(settings)
        input("\n  Press Enter to continue…")
        return "main"


class SettingsScreen:
    def run(self, console, settings):
        draft = dict(settings)
        while True:
            console.clear()
            console.print(make_header("Settings"))
            console.print()

            key_display = (
                draft["api_key"][:8] + "…" + draft["api_key"][-4:]
                if len(draft["api_key"]) > 12
                else draft["api_key"]
            ) or "[red]not set[/]"

            tier_mode = "Final tier" if draft["use_last_tier"] else "Next tier"
            cache_size = len(load_ach_cache())
            cache_info = f"{cache_size} definitions" if cache_size else "[dim]empty[/]"

            tbl = Table(box=box.SIMPLE, show_header=False, padding=(0, 3))
            tbl.add_column("Key",   style=ACCENT, width=6)
            tbl.add_column("Field", style=DIM,    width=20)
            tbl.add_column("Value")
            tbl.add_row("1", "Max results",     str(draft["max_results"]))
            tbl.add_row("2", "Min threshold %", str(draft["threshold_pct"]))
            tbl.add_row("3", "Tier target",     tier_mode)
            tbl.add_row("4", "API key",         key_display)
            tbl.add_row("5", "Cache",           cache_info)
            tbl.add_row("6", "Language",        draft.get("language", "en"))
            console.print(tbl)
            console.print()
            console.print(Panel(make_footer([
                ("1", "max results"),
                ("2", "threshold"),
                ("3", "toggle mode"),
                ("4", "api key"),
                ("5", "clear cache"),
                ("6", "language"),
                ("S", "save"),
                ("Q", "cancel"),
            ])))

            k = getch()
            if k == "1":
                try:
                    draft["max_results"] = max(1, int(read_line("Max results", draft["max_results"])))
                except Exception:
                    pass
            elif k == "2":
                try:
                    draft["threshold_pct"] = max(1, min(100, int(read_line("Threshold %", draft["threshold_pct"]))))
                except Exception:
                    pass
            elif k == "3":
                draft["use_last_tier"] = not draft["use_last_tier"]
            elif k == "4":
                v = read_line("New API key", password=True)
                if v:
                    draft["api_key"] = v
            elif k == "5":
                clear_ach_cache()
            elif k == "6":
                idx = SUPPORTED_LANGUAGES.index(draft.get("language", "en"))
                draft["language"] = SUPPORTED_LANGUAGES[(idx + 1) % len(SUPPORTED_LANGUAGES)]
            elif k in ("s", "S"):
                settings.update(draft)
                save_settings(settings)
                return "main"
            elif k in ("q", "Q", "\x1b"):
                return "main"


class MainScreen:
    def __init__(self):
        self.rows      = []
        self.cursor    = 0
        self.scroll    = 0
        self.status    = "Press R to fetch achievements."
        self.loading   = False
        self.error     = ""
        self._lock     = threading.Lock()
        self._last_refresh = 0.0
        self._live     = None
        self._console  = None

    def _refresh(self, force: bool = False):
        now = time.monotonic()
        if not force and (now - self._last_refresh) < FETCH_THROTTLE:
            return
        with self._lock:
            self._build_and_push()
        self._last_refresh = now

    def _build_and_push(self):
        visible = max(1, self._console.height - 11)

        if self.loading:
            status_widget = Spinner("dots", text=Text(self.status, style=ACCENT))
        else:
            style = "red" if self.error else DIM
            status_widget = Text(self.error or self.status, style=style)

        layout = Layout()
        layout.split_column(
            Layout(make_header("GW2 Nearly-Complete Achievements"), size=3),
            Layout(self._build_table(visible)),
            Layout(Panel(status_widget), size=3),
            Layout(Panel(make_footer([
                ("R", "refresh"),
                ("↑↓", "move"),
                ("Enter", "wiki"),
                ("S", "settings"),
                ("Q", "quit"),
            ])), size=3),
        )
        self._live.update(layout, refresh=True)

    def _build_table(self, visible):
        visible = max(1, visible - 1)

        tbl = Table(box=box.SIMPLE_HEAD, expand=True)
        tbl.add_column("%",           width=6,  justify="right")
        tbl.add_column("Progress",    width=10, justify="right", style=DIM)
        tbl.add_column("Achievement", ratio=3)
        tbl.add_column("Rewards",     ratio=2,  style=DIM)

        if not self.rows:
            tbl.add_row("", "", "No data — press R", "")
            return tbl

        self.cursor = max(0, min(self.cursor, len(self.rows) - 1))

        if self.cursor < self.scroll:
            self.scroll = self.cursor
        elif self.cursor >= self.scroll + visible:
            self.scroll = self.cursor - visible + 1

        self.scroll = max(0, min(self.scroll, max(0, len(self.rows) - visible)))

        for idx in range(self.scroll, min(self.scroll + visible, len(self.rows))):
            row      = self.rows[idx]
            selected = idx == self.cursor
            tbl.add_row(
                Text(f"{row['percent']}%", style=pct_style(row["percent"])),
                f"{row['progress']}/{row['required']}",
                Text(row["name"], style="bold" if selected else "default"),
                row["reward_str"],
                style="reverse" if selected else "",
            )

        return tbl

    def _do_fetch(self, settings):
        def cb(msg):
            self.status = msg
            self._refresh(force=False)

        try:
            self.rows   = fetch_achievements(settings, cb)
            self.cursor = 0
            self.scroll = 0
            self.status = f"Loaded {len(self.rows)} achievements."
            self.error  = ""
        except Exception as e:
            self.error  = str(e)

        self.loading = False
        self._refresh(force=True)

    def run(self, console, settings):
        self._console = console
        with Live(console=console, screen=True, auto_refresh=False) as live:
            self._live = live
            self._refresh(force=True)

            def spinner_tick():
                while self.loading:
                    time.sleep(0.1)
                    if self.loading:
                        self._live.refresh()

            while True:
                k = getch()

                if k in ("q", "Q"):
                    return "quit"

                elif k in ("s", "S"):
                    return "settings"

                elif k in ("r", "R") and not self.loading:
                    self.loading = True
                    self.error   = ""
                    self.rows    = []
                    self.cursor  = 0
                    self.scroll  = 0
                    self.status  = "Starting…"
                    self._refresh(force=True)
                    threading.Thread(target=self._do_fetch,   args=(settings,), daemon=True).start()
                    threading.Thread(target=spinner_tick, daemon=True).start()

                elif k == KEY_UP and self.rows:
                    self.cursor = max(0, self.cursor - 1)
                    self._refresh(force=True)

                elif k == KEY_DOWN and self.rows:
                    self.cursor = min(len(self.rows) - 1, self.cursor + 1)
                    self._refresh(force=True)

                elif k == KEY_ENTER and self.rows:
                    lang = settings.get("language", "en")
                    wiki_host = "wiki" if lang == "en" else f"wiki-{lang}"
                    url = (
                        f"https://{wiki_host}.guildwars2.com/wiki/"
                        + self.rows[self.cursor]["name"].replace(" ", "_")
                    )
                    webbrowser.open(url)


def main():
    console  = Console()
    settings = load_settings()

    if not settings["api_key"]:
        SetupScreen().run(console, settings)
        settings = load_settings()

    screens = {
        "main":     MainScreen(),
        "settings": SettingsScreen(),
        "setup":    SetupScreen(),
    }

    next_screen = "main"
    while next_screen not in ("quit", None):
        if next_screen == "settings":
            screens["settings"] = SettingsScreen()
        next_screen = screens[next_screen].run(console, settings)
        settings = load_settings()

    console.clear()
    console.print(f"[{ACCENT}]Bye![/]")


if __name__ == "__main__":
    main()