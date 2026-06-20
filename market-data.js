/* =====================================================================
   ProcureMind — LIVE MARKET DATA
   This file is rewritten automatically once a day by the ProcureMind
   auto-refresh task (an LLM market scan). The website reads it on load
   and re-prices every should-cost model from it.

     value  = latest level (UPDATED daily)
     base   = calibration level when the model was built (DO NOT change)
     mom    = month-over-month % move (UPDATED daily)

   should-cost auto-shifts by each category's exposure × (value/base − 1).
   ===================================================================== */
window.PM_DATA = {
  updated: "2026-06-15",
  nextRefresh: "daily · end of day",
  source: "Auto-refreshed by ProcureMind LLM market scan (public market sources)",
  market: {
    steel_hrc:   {label:"Steel (hot-rolled coil)", value:1105, base:1105, unit:"$/short ton", mom:3.5,  vol:"high", src:"Nucor / CRU",            note:"Tight supply, reduced imports pushing prices up."},
    aluminum:    {label:"Aluminum (LME)",          value:3150, base:3150, unit:"$/tonne",     mom:1.2,  vol:"high", src:"LME",                    note:"Off January highs but elevated."},
    copper:      {label:"Copper (LME)",            value:10900,base:10900,unit:"$/tonne",     mom:-1.8, vol:"high", src:"LME",                    note:"Took a breather after an explosive Q1."},
    crude_brent: {label:"Crude oil (Brent)",       value:88,   base:88,   unit:"$/barrel",    mom:-6.0, vol:"high", src:"EIA STEO",               note:"Volatile; eased on US–Iran talks."},
    diesel:      {label:"Diesel (retail)",         value:3.40, base:3.40, unit:"$/gallon",    mom:-2.0, vol:"med",  src:"EIA",                    note:"2026 average forecast $3.40/gal."},
    natgas:      {label:"Natural gas (Henry Hub)", value:3.80, base:3.80, unit:"$/MMBtu",     mom:1.0,  vol:"med",  src:"EIA",                    note:"Range-bound heading into summer."},
    power_comm:  {label:"Commercial electricity",  value:14.4, base:14.4, unit:"¢/kWh",       mom:0.6,  vol:"med",  src:"EIA / ChooseEnergy",     note:"Up ~6–10% year over year."},
    power_ind:   {label:"Industrial electricity",  value:8.54, base:8.54, unit:"¢/kWh",       mom:0.5,  vol:"med",  src:"EIA",                    note:"Lower than commercial tariffs."},
    pp_resin:    {label:"Polypropylene resin",     value:0.69, base:0.69, unit:"$/lb",        mom:1.0,  vol:"med",  src:"PlasticsTech / ICIS",    note:"N. America; PE up 15¢/lb YTD."},
    pe_resin:    {label:"Polyethylene resin",      value:0.72, base:0.72, unit:"$/lb",        mom:1.5,  vol:"med",  src:"PlasticsTech",           note:"Resin prices shifted up in Q2."},
    lumber:      {label:"Framing lumber",          value:623,  base:623,  unit:"$/MBF",       mom:2.0,  vol:"high", src:"CME / Madison's",        note:"Tight on tariffs + wildfire disruption."},
    concrete:    {label:"Ready-mix concrete",      value:155,  base:155,  unit:"$/cu yd",     mom:0.5,  vol:"low",  src:"ConcreteNetwork",        note:"$125–175/yd³ delivered."},
    containerbd: {label:"Containerboard",          value:920,  base:920,  unit:"$/ton",       mom:1.2,  vol:"med",  src:"Fastmarkets RISI",       note:"Second 2026 increase wave underway."},
    dryvan:      {label:"Truckload (dry van) spot",value:2.75, base:2.75, unit:"$/mile",      mom:1.5,  vol:"med",  src:"DAT / C.H. Robinson",    note:"Firming; contract +15–30%."},
    ocean_feu:   {label:"Ocean freight (40ft)",    value:3549, base:3549, unit:"$/FEU",       mom:3.0,  vol:"high", src:"Drewry WCI",             note:"Peak season + tariff front-loading."},
    jetfuel:     {label:"Jet fuel",                value:2.45, base:2.45, unit:"$/gallon",    mom:-3.0, vol:"high", src:"IATA / EIA",             note:"Tracks crude; volatile."},
    swe_rate:    {label:"Software contractor",     value:90,   base:90,   unit:"$/hour",      mom:0.3,  vol:"low",  src:"Glassdoor / Arc.dev",    note:"$50–110; AI/cloud $100+."},
    consult_day: {label:"Consulting day rate",     value:1800, base:1800, unit:"$/day",       mom:0.3,  vol:"low",  src:"ConsultingSuccess",      note:"Big-4 senior ~$258/hr."},
    janitorial:  {label:"Janitorial labour",       value:39,   base:39,   unit:"$/hour",      mom:0.3,  vol:"low",  src:"Angi / HomeGuide",       note:"$35–60/hr; labour 50–60% of cost."},
    bpo_off:     {label:"BPO agent (offshore)",    value:11,   base:11,   unit:"$/hour",      mom:0.2,  vol:"low",  src:"Helpware / CloudTalk",   note:"PH/IN voice & chat."},
    bpo_on:      {label:"BPO agent (onshore US)",  value:35,   base:35,   unit:"$/hour",      mom:0.3,  vol:"low",  src:"Contact Center USA",     note:"40–70% premium vs offshore."},
    staff_mu:    {label:"Staffing markup",         value:40,   base:40,   unit:"% over pay",  mom:0.0,  vol:"low",  src:"Upwork / altLINE",       note:"Temp markup 25–50%."},
    aws_vcpu:    {label:"Cloud compute (vCPU)",    value:0.040,base:0.040,unit:"$/vCPU-hr",   mom:-0.4, vol:"low",  src:"AWS EC2",                note:"List erosion ~5%/yr; commit −40–72%."},
    eci_wage:    {label:"Wage inflation (ECI)",    value:3.4,  base:3.4,  unit:"% YoY",       mom:0.0,  vol:"low",  src:"US BLS Q1'26",           note:"Benefits +3.6% YoY."}
  }
};
