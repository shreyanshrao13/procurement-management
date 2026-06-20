/* =====================================================================
   ProcureMind Should-Cost Platform — frontend overlay
   ---------------------------------------------------------------------
   Sits on top of the offline benchmark UI (index.html) and adds the
   user-data-driven path:

     1. Detects the FastAPI backend at /api/health.
     2. Loads the user's categories from /api/categories and merges them
        into the existing dropdown under a new "Your data" optgroup.
     3. When a user category is picked, calls /api/should-cost and
        synthesises a category object compatible with the offline UI's
        render functions — so every existing tab "just works" with the
        engine's bottom-up + ML hybrid number.
     4. Adds a 00 — My Data tab with drag-and-drop CSV/XLSX uploads,
        a manual category form, and a list of everything you've loaded.

   If the backend is offline this file is a no-op — index.html keeps
   working as the curated 50-category benchmark.
   ===================================================================== */

(function () {
  "use strict";

  const API = "/api";
  const USER_PREFIX = "user_";

  const PMP = {
    status: "detecting",  // detecting | online | offline
    userCats: [],
    market: null,
  };

  // --------------------------------------------------------------- utils
  const el = (sel) => document.querySelector(sel);
  const els = (sel) => Array.from(document.querySelectorAll(sel));

  function toast(msg, kind = "ok") {
    const div = document.createElement("div");
    div.className = "alert " + (kind === "bad" ? "bad" : kind === "warn" ? "" : "ok");
    div.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:9999;max-width:340px;font-size:13px;box-shadow:0 12px 32px rgba(0,0,0,.4)";
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  async function apiJSON(path, opts = {}) {
    const r = await fetch(API + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`${r.status} ${r.statusText}: ${txt}`);
    }
    return r.json();
  }

  // --------------------------------------------------------------- init
  async function init() {
    // Wait until the offline UI has booted (it builds the select etc).
    if (!window.PM_CORE) {
      setTimeout(init, 50);
      return;
    }

    try {
      await fetch(API + "/health").then((r) => {
        if (!r.ok) throw new Error("backend not ready");
      });
      PMP.status = "online";
    } catch {
      PMP.status = "offline";
      return;  // overlay stays dormant
    }

    // Show backend status chip.
    el("#backendChip").style.display = "";
    el("#tab-data").style.display = "";

    await loadUserCategories();
    renderDataPanel();
    wireCategorySelectInterceptor();
    wireQuoteForApiCats();
    wireQtyForApiCats();
    wireTabClicks();
  }

  // --------------------------------------------------------- categories
  async function loadUserCategories() {
    try {
      PMP.userCats = await apiJSON("/categories");
    } catch (e) {
      PMP.userCats = [];
      toast("could not load categories: " + e.message, "bad");
      return;
    }
    el("#apiCount").textContent = PMP.userCats.length;

    const sel = el("#catSelect");
    // Drop any old "Your data" optgroup so re-loads stay clean.
    sel.querySelectorAll('optgroup[label="Your data"]').forEach((og) => og.remove());

    if (PMP.userCats.length === 0) return;

    const og = document.createElement("optgroup");
    og.label = "Your data";
    PMP.userCats.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = USER_PREFIX + c.id;
      const tags = [];
      if (c.n_bom_items) tags.push(`${c.n_bom_items} BOM`);
      if (c.n_pos) tags.push(`${c.n_pos} POs`);
      if (c.n_quotes) tags.push(`${c.n_quotes} quotes`);
      opt.textContent = `${c.name} ${tags.length ? "[" + tags.join(", ") + "]" : ""}`;
      og.appendChild(opt);
    });
    sel.insertBefore(og, sel.firstChild);  // surface user data first
  }

  function isApiCatId(id) {
    return typeof id === "string" && id.startsWith(USER_PREFIX);
  }

  function apiIdFrom(catVal) {
    return parseInt(String(catVal).replace(USER_PREFIX, ""), 10);
  }

  // ---------------------------------------- synthesise CAT-shaped object
  // The offline render functions read state.cat.{sc, mix, lo, hi, links,
  // drivers, vol, note, unit, name, fam}. We populate all of those from
  // the backend's /api/should-cost response so every tab keeps working.
  async function synthCatFromApi(userCatId, qty, marketScenario) {
    const body = JSON.stringify({
      category_id: userCatId,
      quantity: qty,
      market_scenario: marketScenario || {},
      method: "auto",
    });
    const data = await apiJSON("/should-cost", { method: "POST", body });
    const userCat = PMP.userCats.find((c) => c.id === userCatId) || {};
    const total = data.breakdown.total || data.hybrid_unit_cost || 1;

    // Roll overhead+freight into 'overhead' for the 4-bucket UI.
    const matShare = data.breakdown.materials / total;
    const labShare = data.breakdown.labor / total;
    const ovhShare = (data.breakdown.overhead + data.breakdown.freight) / total;
    const mgnShare = data.breakdown.margin / total;

    const drivers = (data.drivers || []).map((d) => ({
      n: d.name,
      share: d.share,
      inf: !!d.influenceable,
      lever:
        d.linked_indices && d.linked_indices.length
          ? `Exposed to: ${d.linked_indices.join(", ")} — track these indices`
          : "Configurable in your uploaded data",
    }));

    // Tag the category as live so renderRefresh() shows the right alerts.
    const note =
      (data.explanations || []).slice(0, 3).join(" · ") ||
      "Computed from your data via the should-cost engine.";

    return {
      id: USER_PREFIX + userCatId,
      _apiId: userCatId,
      _api: data,
      fam: "user",
      name: userCat.name || data.category_name || `Category ${userCatId}`,
      unit: userCat.unit || data.unit || "per unit",
      sc: data.hybrid_unit_cost,
      lo: data.band_low,
      hi: data.band_high,
      vol: "med",
      mix: { mat: matShare, lab: labShare, ovh: ovhShare, mgn: mgnShare },
      links: [],  // multiplier already applied server-side
      drivers,
      note,
      // extras the offline renderers don't know about — used in the
      // method banner we inject after render().
      _method: data.method_used,
      _ml_conf: data.ml_confidence,
      _historical: data.historical_avg,
      _market_ref: data.market_reference,
    };
  }

  // ------------------------------------------- intercept select changes
  function wireCategorySelectInterceptor() {
    const sel = el("#catSelect");
    // Capture-phase listener so we can short-circuit before the
    // built-in change handler (which would call the offline setCategory).
    sel.addEventListener(
      "change",
      async (e) => {
        const v = e.target.value;
        if (!isApiCatId(v)) return;
        e.stopImmediatePropagation();
        await selectUserCategory(apiIdFrom(v));
      },
      true
    );

    // FAM names the offline UI uses for the 6 built-in families. Add
    // a label for the user family so the brief reads cleanly.
    if (window.PM_CORE && window.PM_CORE.FAM) {
      window.PM_CORE.FAM.user = "Your data";
    }
  }

  async function selectUserCategory(userId, options = {}) {
    const PM_CORE = window.PM_CORE;
    PM_CORE.state.sim = {};
    showOverlay("Loading should-cost from your data…");
    try {
      const cat = await synthCatFromApi(userId, PM_CORE.state.qty || 1);
      PM_CORE.state.cat = cat;

      // Default the quote box to the user's actual quoted price if any,
      // otherwise sit ~15% above target so the gap analysis shows.
      let suggestedQuote = PM_CORE.niceRound(cat.sc * 1.15);
      try {
        const quotes = await apiJSON(`/categories/${userId}/quotes`);
        if (quotes && quotes.length > 0) {
          // Pick the cheapest open quote as the default to negotiate against.
          quotes.sort((a, b) => a.quoted_unit_price - b.quoted_unit_price);
          suggestedQuote = quotes[0].quoted_unit_price;
        }
      } catch { /* non-fatal */ }

      el("#quoteInput").value = suggestedQuote;
      PM_CORE.state.quote = suggestedQuote;
      el("#unitHint").textContent =
        (cat.unit || "per unit").replace("per ", "").split(" / ")[0] + "s";
      el("#quoteHint").textContent = cat.unit || "per unit";

      PM_CORE.render();
      injectMethodBanner(cat);

      // If the user landed here from the data tab, switch to Should-Cost.
      if (!options.stayOnData) {
        const calcTab = els(".tab").find((t) => t.dataset.p === "calc");
        if (calcTab) calcTab.click();
      }
    } catch (e) {
      toast("Could not load should-cost: " + e.message, "bad");
    } finally {
      hideOverlay();
    }
  }

  // After render(), append a small banner explaining which method was
  // used (rule / ml / hybrid) and key numbers from the API response.
  function injectMethodBanner(cat) {
    const panel = el("#panel-calc");
    if (!panel) return;
    const data = cat._api || {};
    const method = (data.method_used || "rule").toUpperCase();
    const conf =
      data.ml_confidence != null
        ? ` · ML confidence (OOB R²) ${(data.ml_confidence * 100).toFixed(0)}%`
        : "";
    const histLine = data.historical_avg
      ? `Historical avg: <b>${PM_CORE_money(data.historical_avg)}</b>/unit. `
      : "";
    const mktLine =
      data.market_reference != null
        ? `Market reference: <b>${PM_CORE_money(data.market_reference)}</b>. `
        : "";
    const banner = document.createElement("div");
    banner.className = "note";
    banner.style.marginTop = "16px";
    banner.innerHTML = `<b>Method:</b> <span class="badge lever">${method}</span>${conf} &middot; ${histLine}${mktLine}<br><span style="color:var(--mute);font-size:12px">${(data.explanations || []).join(" &middot; ")}</span>`;
    panel.appendChild(banner);
  }

  function PM_CORE_money(v) {
    return window.PM_CORE && window.PM_CORE.money
      ? window.PM_CORE.money(v)
      : "$" + Number(v).toFixed(2);
  }

  function wireQuoteForApiCats() {
    // The offline change handler already updates state.quote and re-renders.
    // We just append the method banner again on each re-render.
    const orig = window.PM_CORE.render;
    window.PM_CORE.render = function () {
      orig.apply(this, arguments);
      const cat = window.PM_CORE.state.cat;
      if (cat && cat._api) injectMethodBanner(cat);
    };
  }

  function wireQtyForApiCats() {
    // Volume changes don't normally re-call the engine, but for ML
    // categories the prediction is qty-aware, so re-fetch on change.
    const inp = el("#qtyInput");
    let timer;
    inp.addEventListener("input", () => {
      clearTimeout(timer);
      const cat = window.PM_CORE.state.cat;
      if (!cat || !cat._apiId) return;
      timer = setTimeout(() => selectUserCategory(cat._apiId, { stayOnData: true }), 350);
    });
  }

  function wireTabClicks() {
    // The offline UI already wires tab clicks. Nothing extra needed —
    // the panel-data div is already in the DOM and its rendered HTML
    // is set by renderDataPanel().
  }

  // ============================================================== UI
  // ----------------------------- overlays + style for the Data tab
  function ensureStyle() {
    if (el("#pmp-style")) return;
    const s = document.createElement("style");
    s.id = "pmp-style";
    s.textContent = `
      .pmp-drop{border:2px dashed var(--line);border-radius:12px;padding:18px;text-align:center;background:var(--glass);transition:border-color .15s,background .15s;cursor:pointer}
      .pmp-drop:hover,.pmp-drop.drag{border-color:var(--primary);background:rgba(124,92,255,.08)}
      .pmp-drop input{display:none}
      .pmp-drop b{color:var(--ink)}
      .pmp-drop small{color:var(--mute);font-size:11px;display:block;margin-top:5px;line-height:1.4}
      .pmp-cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}
      .pmp-overlay{position:fixed;inset:0;background:rgba(8,11,34,.6);backdrop-filter:blur(4px);z-index:9998;display:flex;align-items:center;justify-content:center;color:var(--ink);font-size:14px;font-weight:700}
      .pmp-overlay .box{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px 26px;box-shadow:0 16px 48px rgba(0,0,0,.5)}
      .pmp-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
      .pmp-form label{font-size:11px;font-weight:800;color:var(--mute);text-transform:uppercase;letter-spacing:.7px;margin-bottom:4px;display:block}
      .pmp-form .full{grid-column:1/-1}
      .pmp-cat-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--line2);font-size:13px}
      .pmp-cat-row:last-child{border-bottom:none}
      .pmp-cat-row b{color:var(--ink)}
      .pmp-cat-row .meta{color:var(--mute);font-size:11px}
      .pmp-method-pill{font-size:10.5px;font-weight:800;background:rgba(124,92,255,.18);color:#c4b5fd;padding:3px 8px;border-radius:6px;margin-left:6px}
    `;
    document.head.appendChild(s);
  }

  function showOverlay(msg) {
    ensureStyle();
    let o = el(".pmp-overlay");
    if (!o) {
      o = document.createElement("div");
      o.className = "pmp-overlay";
      o.innerHTML = `<div class="box">${msg}</div>`;
      document.body.appendChild(o);
    } else {
      o.querySelector(".box").textContent = msg;
    }
  }
  function hideOverlay() {
    el(".pmp-overlay")?.remove();
  }

  // ----------------------------- Data panel rendering
  function renderDataPanel() {
    ensureStyle();
    const panel = el("#panel-data");
    panel.innerHTML = `
      <div class="alert ok" style="margin-bottom:16px"><span>🟢</span><span>
        <b>Backend connected</b> at <code>${API}</code>. Upload your data below — should-cost is computed from <b>your</b> BOM, materials, labor, POs and supplier quotes (not generic benchmarks).</span></div>

      <div class="grid g-2">
        <div class="card"><div class="card-hd">
          <div><h3>📥 Upload your data</h3><div class="desc">Drop CSV or Excel files. Column names are flexible — we auto-detect aliases.</div></div></div>
          <div class="pmp-cards" id="pmp-uploads"></div>
          <div class="btn-row" style="margin-top:18px">
            <button class="btn btn-primary" id="pmp-seed">⚡ Load demo data</button>
            <button class="btn btn-ghost" id="pmp-refresh-cats">↻ Refresh categories</button>
            <a class="btn btn-ghost" href="/api/docs" target="_blank">📚 API docs</a>
          </div>
          <div id="pmp-log" class="note" style="margin-top:14px;display:none"></div>
        </div>

        <div class="card"><div class="card-hd">
          <div><h3>➕ Manual category</h3><div class="desc">No file? Define a category by hand. You can add BOM/POs/quotes later via upload.</div></div></div>
          <form id="pmp-newcat" class="pmp-form">
            <div><label>Code</label><input name="code" placeholder="WIDGET_X" required></div>
            <div><label>Name</label><input name="name" placeholder="Widget X" required></div>
            <div><label>Family</label><input name="family" value="custom"></div>
            <div><label>Unit</label><input name="unit" value="per unit"></div>
            <div><label>Region</label><input name="region" value="US"></div>
            <div><label>Currency</label><input name="currency" value="USD"></div>
            <div><label>Mix &mdash; materials</label><input name="mix_materials" type="number" step="0.01" value="0.45"></div>
            <div><label>Mix &mdash; labor</label><input name="mix_labor" type="number" step="0.01" value="0.25"></div>
            <div><label>Mix &mdash; overhead</label><input name="mix_overhead" type="number" step="0.01" value="0.15"></div>
            <div><label>Mix &mdash; margin</label><input name="mix_margin" type="number" step="0.01" value="0.15"></div>
            <div><label>Overhead rate</label><input name="overhead_rate" type="number" step="0.01" value="0.18"></div>
            <div><label>Target margin</label><input name="target_margin" type="number" step="0.01" value="0.12"></div>
            <div><label>Freight %</label><input name="freight_pct" type="number" step="0.01" value="0.05"></div>
            <div class="full"><label>Linked market indices (comma-sep)</label><input name="market_links" placeholder="steel_hrc, copper"></div>
            <div class="full" style="margin-top:6px"><button type="submit" class="btn btn-primary">Create category</button></div>
          </form>
        </div>
      </div>

      <div class="card" style="margin-top:18px"><div class="card-hd">
        <div><h3>📊 Your categories</h3><div class="desc">Click a row to load it &mdash; every other tab will recompute from your data.</div></div></div>
        <div id="pmp-cats-list"></div>
      </div>
    `;

    const grid = el("#pmp-uploads");
    grid.innerHTML = [
      ["categories",      "Categories",       "code, name, unit, currency, market_links"],
      ["bom",             "Bill of materials","category_code, material, qty_per_unit, uom"],
      ["materials",       "Material prices",  "material, price, uom, as_of"],
      ["labor",           "Labor inputs",     "category_code, hours_per_unit, rate_per_hour"],
      ["purchase_orders", "Historical POs",   "category_code, supplier, po_date, quantity, unit_price"],
      ["quotes",          "Supplier quotes",  "category_code, supplier, quoted_unit_price"],
    ].map(([kind, title, hint]) => `
      <label class="pmp-drop" data-kind="${kind}">
        <b>📄 ${title}</b>
        <small>${hint}<br>CSV or XLSX</small>
        <input type="file" accept=".csv,.xlsx,.xls" data-kind="${kind}">
      </label>
    `).join("");

    wireUploads();
    el("#pmp-seed").addEventListener("click", seedDemo);
    el("#pmp-refresh-cats").addEventListener("click", async () => {
      await loadUserCategories();
      renderUserCatList();
      toast("categories refreshed");
    });
    el("#pmp-newcat").addEventListener("submit", onCreateCategory);

    renderUserCatList();
  }

  function renderUserCatList() {
    const list = el("#pmp-cats-list");
    if (!list) return;
    if (PMP.userCats.length === 0) {
      list.innerHTML = `<div class="note">No categories yet. Click <b>Load demo data</b> for a worked example, or upload your own.</div>`;
      return;
    }
    list.innerHTML = PMP.userCats.map((c) => {
      const tags = [
        c.n_bom_items && `${c.n_bom_items} BOM lines`,
        c.n_pos && `${c.n_pos} historical POs`,
        c.n_quotes && `${c.n_quotes} quotes`,
      ].filter(Boolean).join(" · ") || "no inputs yet";
      const method = c.n_pos >= 20 ? "ml/hybrid" : "rule-based";
      return `
        <div class="pmp-cat-row" data-id="${c.id}" style="cursor:pointer">
          <div>
            <b>${c.name}</b> <span class="badge">${c.code}</span>
            <span class="pmp-method-pill">${method}</span>
            <div class="meta">${c.family} &middot; ${c.unit} &middot; ${c.currency} &middot; ${tags}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost" data-act="open" data-id="${c.id}">Open ▶</button>
            <button class="btn btn-ghost" data-act="brief" data-id="${c.id}" title="Open negotiation brief">📋</button>
            <button class="btn btn-ghost" data-act="del" data-id="${c.id}" title="Delete category">🗑</button>
          </div>
        </div>`;
    }).join("");

    list.querySelectorAll("[data-act='open']").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = parseInt(b.dataset.id, 10);
        el("#catSelect").value = USER_PREFIX + id;
        selectUserCategory(id);
      })
    );
    list.querySelectorAll("[data-act='brief']").forEach((b) =>
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = parseInt(b.dataset.id, 10);
        el("#catSelect").value = USER_PREFIX + id;
        await selectUserCategory(id);
        const briefTab = els(".tab").find((t) => t.dataset.p === "brief");
        if (briefTab) briefTab.click();
      })
    );
    list.querySelectorAll("[data-act='del']").forEach((b) =>
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = parseInt(b.dataset.id, 10);
        if (!confirm("Delete this category and all its BOM / POs / quotes?")) return;
        try {
          await fetch(`${API}/categories/${id}`, { method: "DELETE" });
          await loadUserCategories();
          renderUserCatList();
          toast("category deleted");
        } catch (err) {
          toast("delete failed: " + err.message, "bad");
        }
      })
    );
    list.querySelectorAll(".pmp-cat-row").forEach((row) =>
      row.addEventListener("click", () => {
        const id = parseInt(row.dataset.id, 10);
        el("#catSelect").value = USER_PREFIX + id;
        selectUserCategory(id);
      })
    );
  }

  // ----------------------------- Uploads
  function wireUploads() {
    els(".pmp-drop").forEach((drop) => {
      const kind = drop.dataset.kind;
      const input = drop.querySelector("input");
      input.addEventListener("change", async () => {
        if (!input.files?.length) return;
        await uploadFile(kind, input.files[0]);
        input.value = "";
      });
      ["dragenter", "dragover"].forEach((ev) =>
        drop.addEventListener(ev, (e) => {
          e.preventDefault();
          drop.classList.add("drag");
        })
      );
      ["dragleave", "drop"].forEach((ev) =>
        drop.addEventListener(ev, (e) => {
          e.preventDefault();
          drop.classList.remove("drag");
        })
      );
      drop.addEventListener("drop", async (e) => {
        const f = e.dataTransfer?.files?.[0];
        if (f) await uploadFile(kind, f);
      });
    });
  }

  async function uploadFile(kind, file) {
    const log = el("#pmp-log");
    log.style.display = "";
    log.innerHTML = `<b>Uploading</b> ${file.name} → /api/upload/${kind}…`;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch(`${API}/upload/${kind}`, { method: "POST", body: fd });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`${r.status}: ${txt}`);
      }
      const data = await r.json();
      log.innerHTML = `<b>✓ ${file.name}</b> &mdash; ${data.rows_inserted}/${data.rows_read} rows imported · ${data.categories_touched} categor${data.categories_touched === 1 ? "y" : "ies"} touched.`;
      await loadUserCategories();
      renderUserCatList();
      toast(`✓ ${kind}: ${data.rows_inserted} rows`);
    } catch (e) {
      log.innerHTML = `<b style="color:var(--rose)">✗ Upload failed:</b> ${e.message}`;
      toast("upload failed: " + e.message, "bad");
    }
  }

  // ----------------------------- Seed demo
  async function seedDemo() {
    if (!confirm("Load demo data (3 sample categories + ~40 historical POs)?")) return;
    showOverlay("Seeding demo data — please wait…");
    try {
      // Walk through the bundled samples in order.
      const samples = ["categories", "materials", "bom", "labor", "purchase_orders", "quotes"];
      for (const kind of samples) {
        const path = `/data/sample_${kind}.csv`;
        const r = await fetch(path);
        if (!r.ok) throw new Error(`could not fetch ${path}`);
        const blob = await r.blob();
        const f = new File([blob], `sample_${kind}.csv`, { type: "text/csv" });
        const fd = new FormData();
        fd.append("file", f);
        const up = await fetch(`${API}/upload/${kind}`, { method: "POST", body: fd });
        if (!up.ok) throw new Error(`${kind}: ${up.status} ${await up.text()}`);
      }
      await loadUserCategories();
      renderUserCatList();
      toast("✓ demo data loaded");
    } catch (e) {
      toast("seed failed: " + e.message, "bad");
    } finally {
      hideOverlay();
    }
  }

  // ----------------------------- Manual category create
  async function onCreateCategory(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {};
    fd.forEach((v, k) => {
      payload[k] = ["mix_materials", "mix_labor", "mix_overhead", "mix_margin", "overhead_rate", "target_margin", "freight_pct"].includes(k)
        ? parseFloat(v) || 0
        : String(v || "");
    });
    try {
      const cat = await apiJSON("/categories", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast(`✓ created ${cat.code}`);
      e.target.reset();
      await loadUserCategories();
      renderUserCatList();
    } catch (err) {
      toast("create failed: " + err.message, "bad");
    }
  }

  // ----------------------------- boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
