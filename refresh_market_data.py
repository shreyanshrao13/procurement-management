"""
ProcureMind — Module 07: Category Market Refresh
================================================

Rewrites ``market-data.js`` so the Should-Cost web app re-prices itself
from the latest market levels. This is the Python side of the daily
auto-refresh pipeline described in the challenge brief:

    1. LLM / data feed pulls the latest commodity, freight, energy and
       labour benchmarks from public market sources.
    2. This script re-emits ``market-data.js`` (preserving the calibration
       ``base`` so should-cost auto-shifts via ``value/base - 1``).
    3. The site reads the file on load and re-prices all 50 categories.

Usage
-----
    # Apply manual overrides (idempotent — re-runs are safe)
    python refresh_market_data.py --set steel_hrc=1140 --set diesel=3.55

    # Tag the file with today's date and refresh notes
    python refresh_market_data.py --updated 2026-06-16 --note "weekly tick"

    # Dry-run (print the new file to stdout, don't write)
    python refresh_market_data.py --set copper=11200 --dry-run

The schema (label/value/base/unit/mom/vol/src/note per index) is the same
schema the site expects in ``window.PM_DATA``. ``base`` is *never*
overwritten — it is the calibration anchor each should-cost model was
built against. Only ``value``, ``mom``, ``note``, etc. should change.

This script is the hook a scheduled task or LLM agent should call.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
DATA_FILE = HERE / "market-data.js"

# Fields on each index that a refresh is allowed to touch.
REFRESHABLE_FIELDS = {"value", "mom", "vol", "src", "note", "label", "unit"}

# Header re-emitted on every write so the file stays self-documenting.
# ASCII-only on purpose so it survives any console encoding (Windows cp1252).
HEADER = """\
/* =====================================================================
   ProcureMind -- LIVE MARKET DATA
   This file is rewritten automatically once a day by the ProcureMind
   auto-refresh task (an LLM market scan). The website reads it on load
   and re-prices every should-cost model from it.

     value  = latest level (UPDATED daily)
     base   = calibration level when the model was built (DO NOT change)
     mom    = month-over-month % move (UPDATED daily)

   should-cost auto-shifts by each category's exposure x (value/base - 1).
   ===================================================================== */
"""


def parse_market_js(text: str) -> dict[str, Any]:
    """Extract the ``window.PM_DATA = {...}`` object as a Python dict.

    The file is hand-written JS (with comments + non-quoted keys) so we
    cannot ``json.loads`` it directly. We strip the assignment, comments
    and trailing semicolon, then quote the keys so it becomes valid JSON.
    """
    # Drop block + line comments
    no_block = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    no_line = re.sub(r"//[^\n]*", "", no_block)

    # Grab everything between `window.PM_DATA =` and the trailing `;`
    m = re.search(r"window\.PM_DATA\s*=\s*(\{.*\})\s*;?\s*$", no_line, flags=re.DOTALL)
    if not m:
        raise ValueError("Could not find `window.PM_DATA = {...}` in market-data.js")
    obj_src = m.group(1)

    # Quote bare keys: foo: -> "foo":
    obj_src = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', obj_src)
    # Drop trailing commas before } or ]
    obj_src = re.sub(r",\s*([}\]])", r"\1", obj_src)

    return json.loads(obj_src)


def _fmt_value(v: Any) -> str:
    """Format a Python value back to JS source.

    Numbers stay numbers, strings get JSON-escaped (so unicode and quotes
    are safe), bools/None map to JS literals.
    """
    if isinstance(v, bool):
        return "true" if v else "false"
    if v is None:
        return "null"
    if isinstance(v, (int, float)):
        return repr(v)
    return json.dumps(str(v), ensure_ascii=False)


def emit_market_js(data: dict[str, Any]) -> str:
    """Render the dict back to the JS file format the site expects."""
    out = [HEADER, "window.PM_DATA = {"]
    out.append(f'  updated: {_fmt_value(data.get("updated", str(date.today())))},')
    out.append(f'  nextRefresh: {_fmt_value(data.get("nextRefresh", "daily · end of day"))},')
    out.append(f'  source: {_fmt_value(data.get("source", "Auto-refreshed by ProcureMind LLM market scan (public market sources)"))},')
    out.append("  market: {")

    market = data.get("market", {})
    rows = []
    for key, idx in market.items():
        # Stable, readable field order matching the original file.
        order = ["label", "value", "base", "unit", "mom", "vol", "src", "note"]
        parts = []
        for f in order:
            if f in idx:
                parts.append(f"{f}:{_fmt_value(idx[f])}")
        # Surface any extra fields we didn't anticipate.
        for f, v in idx.items():
            if f not in order:
                parts.append(f"{f}:{_fmt_value(v)}")
        rows.append(f"    {key}: {{{', '.join(parts)}}}")
    out.append(",\n".join(rows))
    out.append("  }")
    out.append("};")
    return "\n".join(out) + "\n"


def apply_overrides(data: dict[str, Any], overrides: list[tuple[str, str, str]]) -> None:
    """Apply ``key.field=value`` overrides in-place against ``data['market']``.

    Each override is ``(key, field, raw_value)``. ``raw_value`` is parsed
    as JSON so numbers stay numeric (``1140`` -> int, ``3.55`` -> float),
    quoted strings stay strings, and booleans work too.
    """
    market = data.setdefault("market", {})
    for key, field, raw in overrides:
        if key not in market:
            raise KeyError(
                f"Unknown index '{key}'. Add it to market-data.js first or "
                f"check the spelling. Known: {', '.join(sorted(market))}"
            )
        if field not in REFRESHABLE_FIELDS:
            raise ValueError(
                f"Refusing to overwrite '{field}' on '{key}'. "
                f"Only {sorted(REFRESHABLE_FIELDS)} are refreshable. "
                f"(In particular, 'base' is the calibration anchor — never touch it.)"
            )
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw  # treat as plain string if not valid JSON
        market[key][field] = parsed


def parse_set_arg(s: str) -> tuple[str, str, str]:
    """Parse ``key=value`` or ``key.field=value`` into (key, field, value)."""
    if "=" not in s:
        raise argparse.ArgumentTypeError(
            f"--set expects key=value or key.field=value, got: {s!r}"
        )
    lhs, _, value = s.partition("=")
    if "." in lhs:
        key, field = lhs.split(".", 1)
    else:
        key, field = lhs, "value"
    return key.strip(), field.strip(), value.strip()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="Refresh ProcureMind's market-data.js (Module 07).",
    )
    p.add_argument(
        "--set",
        action="append",
        default=[],
        type=parse_set_arg,
        metavar="key[.field]=value",
        help="Update an index. Defaults to .value. Examples: "
             "steel_hrc=1140  diesel.mom=2.5  copper.note=\"easing\".",
    )
    p.add_argument("--updated", default=None,
                   help="Stamp on the file's `updated` field (default: today).")
    p.add_argument("--note", default=None,
                   help="Optional refresh note recorded as the source string.")
    p.add_argument("--file", default=str(DATA_FILE),
                   help=f"Path to market-data.js (default: {DATA_FILE}).")
    p.add_argument("--dry-run", action="store_true",
                   help="Print the new file instead of writing it.")
    args = p.parse_args(argv)

    # The file (and many index `note` fields) contain UTF-8. On Windows the
    # default console codepage is cp1252, which trips on characters like the
    # unicode minus sign. Reconfigure stdout so --dry-run can stream cleanly.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    data_path = Path(args.file)
    if not data_path.is_file():
        print(f"error: {data_path} does not exist", file=sys.stderr)
        return 2

    data = parse_market_js(data_path.read_text(encoding="utf-8"))
    apply_overrides(data, args.set)

    data["updated"] = args.updated or str(date.today())
    if args.note:
        data["source"] = args.note

    new_text = emit_market_js(data)
    if args.dry_run:
        sys.stdout.write(new_text)
        return 0

    data_path.write_text(new_text, encoding="utf-8")
    print(
        f"refreshed {data_path.name}: {len(args.set)} override(s) applied, "
        f"updated={data['updated']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
