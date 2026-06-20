    # ProcureMind &mdash; Should-Cost Intelligence Platform

> **Upload your own procurement data &mdash; BOM, materials, labor, historical POs, supplier quotes &mdash; and get a dynamic, defensible should-cost for any product or category.** Combines explainable rule-based bottom-up modelling with ML predictions trained on *your* purchase history. Compares against quotes, historical averages and live market data, then exports a one-page negotiation brief.

This repo started as a procurement-optimisation toolkit and has been re-architected into a full Should-Cost Intelligence Platform. The original Samir Saci EOQ tooling is preserved as a bonus.

---

## Quick start

```powershell
pip install -r requirements.txt
python run.py --seed         # creates db, loads 3 demo categories + ~40 POs, opens browser
```

Then open <http://127.0.0.1:8000/>:

* **00 &mdash; My Data** &nbsp;&middot;&nbsp; upload CSV/XLSX, define categories by hand, manage your data
* **01 &mdash; Should-Cost** &nbsp;&middot;&nbsp; bottom-up build, ML prediction, hybrid blend
* **02 &mdash; Live Market** &nbsp;&middot;&nbsp; commodity / freight / energy indices
* **03 &mdash; Cost Drivers** &nbsp;&middot;&nbsp; sensitivity + influenceable vs market-set
* **04 &mdash; Supplier Structure** &nbsp;&middot;&nbsp; reverse-engineered supplier P&amp;L
* **05 &mdash; Benchmark** &nbsp;&middot;&nbsp; quote vs target vs historical avg vs market
* **06 &mdash; Negotiation Brief** &nbsp;&middot;&nbsp; one-page brief, print or copy
* **07 &mdash; Refresh &amp; Risk** &nbsp;&middot;&nbsp; market-data status + commodity risk

API docs (Swagger UI): <http://127.0.0.1:8000/api/docs>

---

## How to start this project

### 1. Open a terminal in this folder

```powershell
cd "c:\Users\srao2\Claude\Projects\should cost\procurement-management"
```

### 2. Install dependencies

```powershell
pip install -r requirements.txt
```

### 3. First run (recommended)

This seeds demo data and starts the app:

```powershell
python run.py --seed
```

### 4. Normal run (no reseed)

```powershell
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### 5. Open the app

* App UI: <http://127.0.0.1:8000/>
* API docs: <http://127.0.0.1:8000/api/docs>

### 6. Verify the backend is healthy (optional)

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health"
```

Expected response includes `"status": "ok"`.

### 7. Stop the server

Press `Ctrl+C` in the terminal where the server is running.

---

## What's in this folder

| Path | Purpose |
|------|---------|
| `run.py` | Launcher (`python run.py [--seed] [--reload]`) |
| `backend/main.py` | FastAPI app &mdash; the public API + serves the frontend |
| `backend/db.py` | SQLAlchemy engine + session factory (SQLite by default) |
| `backend/models.py` | ORM models (Category, BomItem, MaterialPrice, PurchaseOrder, SupplierQuote, ShouldCostRun, &hellip;) |
| `backend/schemas.py` | Pydantic schemas (API contract) |
| `backend/ingest.py` | CSV/Excel parsers with column-name aliasing |
| `backend/engine.py` | **Should-cost engine** &mdash; rule-based + scikit-learn ML + hybrid blend |
| `backend/benchmark.py` | Gap analysis + negotiation brief generator |
| `backend/market.py` | Reads `market-data.js` (live indices) |
| `backend/seed.py` | One-shot demo seeder (`python -m backend.seed`) |
| `backend/config.py` | All paths and tunables (env-var overrides) |
| `index.html` | Curated 50-category benchmark UI (works offline) |
| `app.js` | Frontend overlay that adds the My-Data tab + API wiring |
| `market-data.js` | Daily-refreshed market indices the engine reads |
| `refresh_market_data.py` | Module-7 hook: rewrite `market-data.js` from a daily LLM market scan |
| `data/sample_*.csv` | Demo BOM / materials / labor / POs / quotes |
| `data/df_*.csv` | Sample SKU cost &amp; demand data for the bonus EOQ toolkit |
| `procurement_optimization.py` | **Bonus** &mdash; Samir Saci's EOQ / replenishment optimiser |
| `Procurement Strategy with Python.ipynb` | **Bonus** &mdash; same idea as a notebook |

---

## System architecture

```text
                                       +-------------------------+
   browser (index.html + app.js) <-->  |     FastAPI backend     |
                                       |  +-------------------+  |
                                       |  |  /api/upload/*    |  |
                                       |  |  /api/categories  |  |
                                       |  |  /api/should-cost |  |
                                       |  |  /api/benchmark   |  |
                                       |  |  /api/brief       |  |
                                       |  |  /api/market      |  |
                                       |  +-------------------+  |
                                       |          |              |
                                       |   +------+------+       |
                                       |   |  engine     |       |
                                       |   |   rule-based|       |
                                       |   |   ML (sklearn)      |
                                       |   |   hybrid blend      |
                                       |   +------+------+       |
                                       |          |              |
                                       |   +------+------+       |
                                       |   |  SQLite DB  |       |
                                       |   +-------------+       |
                                       +-------------------------+
                                                   ^
                                                   | (daily refresh)
                                          market-data.js
                                                   ^
                                          refresh_market_data.py
                                                   ^
                                              LLM market scan
```

* **Frontend** &mdash; static HTML+JS; works offline against the curated 50 categories, augments itself with the My-Data tab when the backend is reachable.
* **Backend** &mdash; FastAPI; serves the frontend AND exposes the API. Single process, single port.
* **Engine** &mdash; pure Python; rule-based bottom-up build is the spine, ML is layered on top when the user has enough historical POs.
* **Storage** &mdash; SQLite by default. Set `PROCUREMIND_DB=postgresql+psycopg://...` for Postgres &mdash; nothing else changes.
* **Market data** &mdash; `market-data.js` is the live-data layer; `refresh_market_data.py` is the cron hook a scheduled task or LLM agent calls.

---

## Database schema

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `categories` | one row per product/category | `code`, `name`, `unit`, `currency`, mix %, `overhead_rate`, `target_margin`, `freight_pct`, `market_links` |
| `bom_items` | BOM lines per category | `category_id`, `material`, `qty_per_unit`, `uom`, `yield_pct`, `market_index` |
| `labor_inputs` | labor steps per category | `category_id`, `operation`, `hours_per_unit`, `rate_per_hour`, `region` |
| `material_prices` | latest unit price per material | `material`, `price`, `uom`, `as_of`, `source` (`user`, `market`, `quote`) |
| `purchase_orders` | historical PO lines &mdash; ML training set | `category_id`, `supplier`, `po_date`, `quantity`, `unit_price`, `region`, `spec` (JSON) |
| `supplier_quotes` | open quotes you're negotiating | `category_id`, `supplier`, `quoted_unit_price`, `quantity`, `valid_until` |
| `should_cost_runs` | audit log of every estimate produced | `category_id`, `method` (rule/ml/hybrid), `inputs` (JSON), `outputs` (JSON) |

All time columns are UTC. JSON columns let you stash arbitrary spec attributes (gauge, weight, dimensions, &hellip;) that the ML model picks up as features automatically.

---

## Backend API design

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/health` | liveness + version |
| `GET`  | `/api/market` | parsed `market-data.js` |
| `GET`  | `/api/categories` | list categories (with row counts) |
| `POST` | `/api/categories` | create a category |
| `GET / PUT / DELETE` | `/api/categories/{id}` | read / update / delete |
| `GET / PUT` | `/api/categories/{id}/bom` | list / replace BOM |
| `GET / PUT` | `/api/categories/{id}/labor` | list / replace labor |
| `GET / POST` | `/api/categories/{id}/quotes` | list / add supplier quote |
| `GET / POST` | `/api/categories/{id}/pos` | list / add historical PO |
| `POST` | `/api/upload/categories` | bulk upload (CSV/XLSX) |
| `POST` | `/api/upload/bom` | &nbsp; |
| `POST` | `/api/upload/labor` | &nbsp; |
| `POST` | `/api/upload/materials` | &nbsp; |
| `POST` | `/api/upload/purchase_orders` | &nbsp; |
| `POST` | `/api/upload/quotes` | &nbsp; |
| `POST` | `/api/should-cost` | run the engine for one category |
| `POST` | `/api/benchmark` | gap analysis (quote vs target vs history vs market) |
| `POST` | `/api/brief` | full negotiation brief payload |

All POST bodies and responses are documented in Swagger at `/api/docs`.

### Sample request

```json
POST /api/should-cost
{
  "category_id": 1,
  "quantity": 180000,
  "region": "US",
  "market_scenario": {"steel_hrc": 5.0},
  "method": "auto"
}
```

### Sample response (truncated)

```json
{
  "category_id": 1,
  "category_name": "Stamped Steel Bracket",
  "currency": "USD",
  "unit": "per piece",
  "quantity": 180000,
  "method_used": "hybrid",
  "rule_unit_cost": 2.91,
  "ml_unit_cost": 3.04,
  "ml_confidence": 0.71,
  "hybrid_unit_cost": 2.97,
  "breakdown": {
    "materials": 1.32,
    "labor": 0.71,
    "overhead": 0.37,
    "freight": 0.10,
    "margin": 0.36,
    "total": 2.86
  },
  "drivers": [
    {"name": "Materials / commodities", "share": 0.46, "influenceable": true,
     "linked_indices": ["steel_hrc"], "value_per_unit": 1.32},
    {"name": "Labor", "share": 0.25, "influenceable": false, "linked_indices": [],
     "value_per_unit": 0.71}
  ],
  "explanations": [
    "HRC Steel Sheet: 0.8 kg × 1.18 (user-uploaded price) = 1.03",
    "labor [stamping]: 0.012h × 38.00/h = 0.46",
    "method: hybrid — 50% rule + 50% ML (24 POs, OOB R²=0.71)"
  ],
  "historical_avg": 2.78,
  "market_reference": 1105,
  "market_multiplier": 0.05,
  "band_low": 2.55,
  "band_high": 3.10
}
```

---

## ML approach

We train **per-category** so each category has its own model. The training set is that category's historical POs.

```text
features  = supplier (one-hot)
            region (one-hot)
            quantity, log(quantity)
            month, year
            spec_* (any column the user uploads on the PO sheet)
target    = unit_price
algorithm = scikit-learn RandomForestRegressor, OOB-scored
```

Why a random forest:

* **Tabular &amp; small** &mdash; tree ensembles dominate gradient-boosting/LR on tabular data &lt;10k rows.
* **Free OOB confidence** &mdash; we use OOB R² as a "trust this number?" signal without a separate validation split.
* **Handles mixed types** &mdash; supplier and region as one-hot, quantity as numeric, free-form spec fields auto-detected.
* **Explainable** &mdash; we always serve a rule-based breakdown alongside the ML number, so the buyer can defend the target.

### Hybrid blend rule

```text
n = number of historical PO rows for this category

n < 20         -> 100% rule-based   (not enough data; trust the build)
20 <= n < 100  -> ramp ML weight from 0 to 0.7 linearly
n >= 100       -> cap ML weight at 0.7

ML weight is further multiplied by min(OOB R², 1.0).
If OOB R² < 0.2 the ML path is dropped entirely (model is too weak).
```

The rule-based number always retains at least 30% of the headline. Procurement teams need a defensible cost build &mdash; "the model said so" doesn't survive a supplier challenge.

---

## Frontend flow

1. **Open the app.** `index.html` loads the curated 50-category benchmark immediately; `app.js` pings `/api/health`.
2. **If the backend is reachable**, the **My Data** tab and a "Backend connected" header chip appear, and your categories show up in the dropdown under a *"Your data"* optgroup.
3. **Pick a user category.** `app.js` calls `/api/should-cost` and synthesises a category object compatible with the offline render functions, so every existing tab (drivers, supplier, benchmark, brief) re-renders against your data.
4. **Upload more data** at any time on the My Data tab. The engine re-prices on the next selection.
5. **Save / share** the negotiation brief from tab 06 (Print &amp; Save as PDF, or Copy brief text).

The UI is purely vanilla JS &mdash; no build step, no node_modules.

---

## File-by-file changes vs. the original repo

| Status | Path | Notes |
|--------|------|-------|
| **new** | `backend/` (entire package) | FastAPI app + engine + ingest + ORM |
| **new** | `app.js` | Frontend overlay for My-Data tab + API integration |
| **new** | `index.html` | The 50-category UI (re-used + extended with one extra tab + a small `window.PM_CORE` export) |
| **new** | `market-data.js` | Live indices |
| **new** | `refresh_market_data.py` | Daily market refresh hook |
| **new** | `run.py` | Launcher |
| **new** | `data/sample_*.csv` | Demo data: 3 categories + BOM + labor + 39 POs + 4 quotes + 8 material prices |
| kept | `procurement_optimization.py` | Bonus EOQ optimiser |
| kept | `Procurement Strategy with Python.ipynb` | Bonus notebook |
| kept | `data/df_costsku.csv`, `df_demandsku.csv` | Sample SKU data for the bonus |
| updated | `requirements.txt`, `pyproject.toml` | New deps: fastapi, sqlalchemy, scikit-learn, openpyxl, &hellip; |

---

## Sample input / output

### Input &mdash; sample BOM upload

```csv
category_code,material,qty_per_unit,uom,yield_pct,market_index
STEEL_BRACKET,HRC Steel Sheet,0.8,kg,0.92,steel_hrc
STEEL_BRACKET,Paint (powder coat),0.05,kg,0.95,
STEEL_BRACKET,Hardware (bolts/nuts),0.02,kg,1.00,
```

### Input &mdash; historical PO upload (the ML training set)

```csv
category_code,supplier,po_date,quantity,unit_price,region,currency,thickness_mm,gauge
STEEL_BRACKET,Acme Stamping,2025-01-15,12000,2.45,US,USD,2.0,14
STEEL_BRACKET,Acme Stamping,2025-02-12,15000,2.41,US,USD,2.0,14
... (39 rows total in data/sample_purchase_orders.csv)
```

`thickness_mm` and `gauge` are **arbitrary spec columns** &mdash; the ingest pipeline keeps them, stuffs them into the `spec` JSON column on each PO, and the ML model picks them up as features automatically.

### Output &mdash; benchmark + brief (`POST /api/brief`)

```json
{
  "category": "Stamped Steel Bracket",
  "quantity": 180000,
  "currency": "USD",
  "target_price": 2.97,
  "aggressive_anchor": 2.55,
  "walk_away": 3.10,
  "quote": 3.32,
  "annual_savings": 63000.0,
  "savings_pct": 10.5,
  "verdict": "out-of-band",
  "verdict_msg": "Quote is +11.8% above should-cost AND above the market band — strong case to push back.",
  "leverage_points": [
    "Materials / commodities (46% of cost) — exposed to steel_hrc",
    "Overhead (13% of cost)",
    "Freight & logistics (3% of cost)",
    "Supplier margin (12% of cost)"
  ],
  "market_context": [
    "Steel (hot-rolled coil) 1105 $/short ton (+3.5% MoM, rising) — push for index caps and lock current pricing"
  ],
  "concessions": [
    "Volume / spend commitment — consolidate 180,000 piece/yr into one award for a tiered discount.",
    "Longer contract term (2–3 years) for a lower unit rate and a price-hold/index cap.",
    "Faster payment terms in exchange for a price concession.",
    "Reference customer / case study in return for best-in-class pricing."
  ],
  "method_used": "hybrid",
  "ml_confidence": 0.71,
  "text": "NEGOTIATION BRIEF — Stamped Steel Bracket\n2026-06-15\n\nVolume: 180,000 per piece/yr | Currency: USD\nSupplier quote: 3.32 USD (598,000/yr)\n\nPRICE POSITIONS (per unit)\n- Opening anchor (aggressive): 2.55\n- Target (should-cost):        2.97\n- Walk-away (do not exceed):   3.10\n..."
}
```

---

## Implementation plan (delivered)

| Phase | What was built | Files |
|-------|---------------|-------|
| 1 &mdash; Foundations | Deps, config, DB, ORM, Pydantic schemas | `pyproject.toml`, `requirements.txt`, `backend/{config,db,models,schemas}.py` |
| 2 &mdash; Ingest | CSV/XLSX parsers with column aliasing for 6 file types | `backend/ingest.py` |
| 3 &mdash; Engine | Rule-based bottom-up build + scikit-learn random forest + hybrid blend | `backend/engine.py`, `backend/market.py` |
| 4 &mdash; Benchmark/Brief | Gap analysis + leverage + concessions + plain-text brief | `backend/benchmark.py` |
| 5 &mdash; API | FastAPI endpoints, file uploads, static frontend serving | `backend/main.py` |
| 6 &mdash; Demo data | 3 categories, 39 historical POs, 4 quotes, 8 material prices | `data/sample_*.csv`, `backend/seed.py` |
| 7 &mdash; Frontend | My-Data tab, drag-and-drop uploads, manual category form, API integration overlay | `index.html` (extended), `app.js` |
| 8 &mdash; Launcher / docs | `python run.py --seed` end-to-end | `run.py`, this README |

### Suggested next steps (not in this delivery)

* **Auth &amp; multi-tenant** &mdash; switch to Postgres, add an `Org` table and a `tenant_id` filter middleware.
* **Stronger ML** &mdash; add a gradient-boosting ensemble + per-feature SHAP explanations to enrich the driver list.
* **Scheduled refresh** &mdash; wire `refresh_market_data.py` into Windows Task Scheduler / cron / GitHub Actions.
* **Bulk export** &mdash; `/api/export/{category}/brief.pdf` for offline distribution.
* **Currency conversion** &mdash; pull FX rates and normalise to a presentation currency.

---

## Bonus &mdash; EOQ / replenishment optimiser (Samir Saci)

Once a should-cost has been agreed, this answers the *how-much-to-order* question:

```powershell
python procurement_optimization.py
```

Or open `Procurement Strategy with Python.ipynb`. Reference: <https://www.samirsaci.com/procurement-process-optimization-with-python/>.

---

## Configuration

All env-var overrides (12-factor):

| Var | Default | Purpose |
|-----|---------|---------|
| `PROCUREMIND_DB` | `should_cost.db` | path or full SQLAlchemy URL |
| `PROCUREMIND_HOST` | `127.0.0.1` | uvicorn bind |
| `PROCUREMIND_PORT` | `8000` | uvicorn port |
| `PROCUREMIND_ML_MIN_ROWS` | `20` | minimum POs before ML kicks in |
| `PROCUREMIND_ML_FULL_TRUST_ROWS` | `100` | rows at which ML weight caps |
| `PROCUREMIND_BAND_LOW_PCT` | `0.25` | low-band quantile of historical POs |
| `PROCUREMIND_BAND_HIGH_PCT` | `0.75` | high-band quantile |
| `PROCUREMIND_MAX_UPLOAD_MB` | `25` | upload size limit |
| `PROCUREMIND_CURRENCY` | `USD` | default presentation currency |
