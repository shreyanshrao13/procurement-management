# Optional: daily market-data refresh (set up in your own Claude Cowork)

`ProcureMind.html` works perfectly on its own — just open it. The market
prices in it are a fixed snapshot. This file explains how to make those prices
**refresh automatically every morning**, the same way the sender has it set up.

> **Important:** a scheduled task does **not** travel inside this zip. Scheduled
> tasks live in Claude's own folder on each person's computer, not in the
> project. So you set up your own copy — it takes about 30 seconds with the
> steps below. (This is completely optional; skip it and the app still works.)

## What you need
- The **Claude desktop app with Cowork** (the auto-refresh needs a Pro or Max plan).
- The app **open at run time** — if your computer/app is closed at 7am, the task
  runs the next time you open the app.
- Internet in the morning (just for the price lookup).

## How to set it up
1. Unzip this folder somewhere on your computer.
2. In Claude Cowork, create a project and **connect this folder**.
3. Send Claude this message:

   > Set up a daily scheduled task at 7am that follows the instructions in
   > SETUP-daily-market-refresh.md (the "TASK PROMPT" section below). It should
   > refresh the market data inside ProcureMind.html in this folder.

4. Approve the task when prompted. Tip: click **"Run now"** once so it pre-approves
   web search + file editing, and future 7am runs won't pause for permission.

That's it. After it runs, click **"↻ Reload latest"** in the app to see new numbers.

## Good to know
- The refreshed values are **Claude's web-researched estimates from public
  sources**, not a paid real-time market feed — fine for directional repricing,
  but sanity-check before a high-stakes negotiation.
- Change the time, pause, or delete it anytime from the **Scheduled** section of
  the Cowork sidebar.

---

## TASK PROMPT (this is what the scheduled task should run)

Objective: Refresh the live market data baked into the ProcureMind should-cost web app so its estimates re-price against current commodity, energy, freight, and labor benchmarks.

File to update: the file `ProcureMind.html` in this project folder. If a file named `market-data.js` exists in the same folder, update it too with the identical values — it uses the same schema.

Background: ProcureMind.html contains an inlined JavaScript block shaped like:
`window.PM_DATA = { updated: "YYYY-MM-DD", nextRefresh: "...", source: "...", market: { <id>: {label, value, base, unit, mom, vol, src, note}, ... } };`
The app reads this on load and shifts every should-cost model by each category's exposure × (value/base − 1).

Steps:
1. Open ProcureMind.html and locate the window.PM_DATA block (search for "window.PM_DATA").
2. For each index id in `market`, use web search to find the most recent published level and its approximate month-over-month % change from public sources. The indices and units are: steel_hrc (US steel hot-rolled coil, $/short ton); aluminum (LME, $/tonne); copper (LME, $/tonne); crude_brent (Brent, $/barrel); diesel (US retail, $/gallon); natgas (Henry Hub, $/MMBtu); power_comm (US commercial electricity, ¢/kWh); power_ind (US industrial electricity, ¢/kWh); pp_resin (polypropylene, $/lb); pe_resin (polyethylene, $/lb); lumber (framing, $/MBF); concrete (ready-mix, $/cu yd); containerbd (containerboard, $/ton); dryvan (truckload dry-van spot, $/mile); ocean_feu (ocean 40ft/FEU, $/FEU); jetfuel ($/gallon); swe_rate (software contractor, $/hour); consult_day (consulting day rate, $/day); janitorial ($/hour); bpo_off (offshore BPO, $/hour); bpo_on (onshore US BPO, $/hour); staff_mu (staffing markup, % over pay); aws_vcpu (AWS vCPU, $/vCPU-hour); eci_wage (US Employment Cost Index wage inflation, % YoY). Batch related items into single searches (metals together, energy together, freight together) — aim for roughly 6–10 searches total.
3. Update ONLY `value` (new level, a number) and `mom` (month-over-month %, e.g. 1.5 or -2.0) per index. You may also refresh `note`/`src`. DO NOT change `base` — it is the calibration anchor; changing it breaks the live-vs-baseline math.
4. Update the top-level `updated` field to today's date (YYYY-MM-DD).
5. If you can't confidently find a current figure, leave that index's `value` and `base` unchanged and set its `mom` to 0.
6. Save in place — change only value/mom/note/src/updated; preserve all other content, structure, indentation, and quoting so the file stays valid.
7. Verify the window.PM_DATA block is still valid (balanced braces; every entry keeps both value and base) and that you changed only data, not code.

Constraints: keep the exact same set of index ids; do not modify any other part of ProcureMind.html (CSS, the 50 built-in categories, or the engine code). Finish with a one-line summary of which indices moved most and the new "updated" date.
