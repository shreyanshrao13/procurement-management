"""Launcher for the Should-Cost Platform.

Usage
-----
    python run.py                     # serve at http://127.0.0.1:8000
    python run.py --seed              # seed demo data first
    python run.py --port 9000 --host 0.0.0.0 --reload
"""

from __future__ import annotations

import argparse
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from backend import config  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--host", default=config.HOST)
    p.add_argument("--port", type=int, default=config.PORT)
    p.add_argument("--reload", action="store_true", help="Auto-reload on code change.")
    p.add_argument("--seed", action="store_true", help="Seed demo data before starting.")
    p.add_argument("--reset", action="store_true",
                   help="Drop all tables before seeding (use with --seed).")
    p.add_argument("--no-open", action="store_true", help="Don't auto-open the browser.")
    args = p.parse_args()

    if args.seed:
        from backend.seed import seed
        seed(reset=args.reset)

    import uvicorn
    url = f"http://{args.host if args.host != '0.0.0.0' else '127.0.0.1'}:{args.port}/"
    print(f"\nProcureMind Should-Cost Platform")
    print(f"  app           {url}")
    print(f"  api docs      {url}api/docs")
    print(f"  database      {config.DB_PATH}\n")
    if not args.no_open:
        webbrowser.open(url)
    uvicorn.run("backend.main:app", host=args.host, port=args.port, reload=args.reload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
