import type { FastMCP, FastMCPSessionAuth } from 'fastmcp';

export const FIRECRAWL_UI_URI = 'ui://firecrawl/workspace-v3.html';
export const FIRECRAWL_UI_MIME_TYPE = 'text/html;profile=mcp-app';

export const FIRECRAWL_UI_HTML = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Firecrawl</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: light-dark(#fbfaf7, #171715);
        --panel: light-dark(#ffffff, #22221f);
        --ink: light-dark(#1d1d1b, #f5f3ee);
        --muted: light-dark(#6d6b65, #aaa79f);
        --line: light-dark(#e7e3da, #3b3933);
        --accent: #ff4c00;
        --accent-ink: #fff;
        --soft: light-dark(#f2eee5, #2d2b26);
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--ink); background: var(--bg); }
      button, input { font: inherit; }
      .app { min-height: 420px; padding: 18px; }
      .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
      .brand { display: flex; align-items: center; gap: 10px; font-weight: 760; letter-spacing: -0.02em; }
      .mark { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; background: var(--accent); color: white; font-weight: 850; }
      .status { color: var(--muted); font-size: 12px; }
      .tabs { display: inline-flex; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
      .tab { border: 0; color: var(--muted); background: transparent; padding: 7px 12px; border-radius: 8px; cursor: pointer; }
      .tab[aria-selected="true"] { color: var(--ink); background: var(--soft); font-weight: 650; }
      .hero { margin: 22px 0 14px; }
      h1 { margin: 0 0 6px; font-size: clamp(25px, 5vw, 38px); line-height: 1.03; letter-spacing: -0.045em; }
      .lede { margin: 0; color: var(--muted); line-height: 1.45; }
      form { display: flex; gap: 9px; margin: 18px 0; }
      .field { min-width: 0; flex: 1; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; color: var(--ink); background: var(--panel); outline: none; }
      .field:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent); }
      .submit { border: 0; border-radius: 12px; padding: 0 17px; min-height: 44px; color: var(--accent-ink); background: var(--accent); font-weight: 720; cursor: pointer; }
      .submit:disabled { opacity: .55; cursor: wait; }
      .empty { margin-top: 22px; padding: 28px; border: 1px dashed var(--line); border-radius: 16px; color: var(--muted); text-align: center; }
      .results { display: grid; gap: 10px; }
      .result { display: block; padding: 14px; border: 1px solid var(--line); border-radius: 14px; color: inherit; background: var(--panel); text-decoration: none; }
      .result:hover { border-color: color-mix(in srgb, var(--accent) 55%, var(--line)); }
      .result-title { margin: 0 0 5px; font-size: 15px; font-weight: 720; }
      .result-url { margin: 0 0 7px; color: var(--accent); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .result-copy { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
      .badge { display: inline-flex; align-items: center; margin: 0 6px 7px 0; padding: 3px 7px; border-radius: 999px; color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); font-size: 11px; font-weight: 700; }
      .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
      .metric { padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
      .metric-label { color: var(--muted); font-size: 12px; }
      .metric-value { margin-top: 5px; font-size: 26px; font-weight: 760; letter-spacing: -0.04em; }
      .progress { height: 8px; margin: 16px 0 5px; overflow: hidden; border-radius: 999px; background: var(--soft); }
      .progress > span { display: block; height: 100%; border-radius: inherit; background: var(--accent); }
      .actions { display: flex; flex-wrap: wrap; gap: 7px; margin: 0 0 12px; }
      .secondary { border: 1px solid var(--line); border-radius: 9px; padding: 7px 10px; color: var(--ink); background: var(--panel); cursor: pointer; }
      .secondary:hover { border-color: var(--accent); }
      .secondary[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, var(--panel)); }
      .provider-card { min-width: 0; }
      .provider-card.selected { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
      .provider-card .actions { margin: 12px 0 0; }
      .provider-card .actions .secondary { flex: 1; }
      .selection-bar { position: sticky; bottom: 10px; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--accent) 48%, var(--line)); border-radius: 13px; background: color-mix(in srgb, var(--panel) 94%, transparent); backdrop-filter: blur(10px); }
      .selection-bar[hidden] { display: none; }
      .selection-copy { min-width: 0; font-size: 13px; }
      .selection-copy strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .chart { display: flex; align-items: end; gap: 10px; min-height: 180px; padding: 22px 4px 4px; }
      .bar-item { min-width: 0; flex: 1; display: grid; grid-template-rows: 22px 120px auto; gap: 6px; color: var(--muted); font-size: 11px; }
      .bar-value { color: var(--ink); font-weight: 700; }
      .bar-track { display: flex; align-items: end; height: 120px; border-bottom: 1px solid var(--line); background: repeating-linear-gradient(to bottom, transparent 0 29px, color-mix(in srgb, var(--line) 55%, transparent) 30px); }
      .bar { width: 100%; min-height: 3px; border-radius: 6px 6px 2px 2px; background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 68%, #fff), var(--accent)); }
      .run-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 7px; }
      .run-card { cursor: pointer; text-align: left; width: 100%; }
      .document { padding: 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); }
      .document h2 { margin: 0 0 5px; font-size: 18px; }
      .document pre { margin: 14px 0 0; max-height: 360px; overflow: auto; white-space: pre-wrap; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--muted); }
      .error { padding: 12px 14px; border: 1px solid color-mix(in srgb, #dc2626 45%, var(--line)); border-radius: 12px; color: light-dark(#991b1b, #fca5a5); background: light-dark(#fff7f7, #301c1c); }
      .skeleton { height: 78px; border-radius: 14px; background: linear-gradient(100deg, var(--soft) 20%, var(--panel) 40%, var(--soft) 60%); background-size: 240% 100%; animation: shimmer 1.2s infinite; }
      @keyframes shimmer { to { background-position-x: -240%; } }
      @media (max-width: 560px) { .app { padding: 14px; } form { flex-direction: column; } .submit { padding: 12px 16px; } }
      @media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
    </style>
  </head>
  <body>
    <main class="app">
      <div class="topbar">
        <div class="brand"><span class="mark">F</span><span>Firecrawl</span></div>
        <span class="status" id="status">Ready</span>
      </div>
      <div class="tabs" role="tablist" aria-label="Firecrawl tools">
        <button class="tab" role="tab" aria-selected="true" data-view="search">Search</button>
        <button class="tab" role="tab" aria-selected="false" data-view="read">Read URL</button>
        <button class="tab" role="tab" aria-selected="false" data-view="providers">Providers</button>
        <button class="tab" role="tab" aria-selected="false" data-view="results">Results</button>
        <button class="tab" role="tab" aria-selected="false" data-view="usage">Usage</button>
      </div>
      <section class="hero">
        <h1 id="heading">Search the live web.</h1>
        <p class="lede" id="lede">Find current sources and inspect the most relevant results.</p>
      </section>
      <form id="form">
        <input class="field" id="input" autocomplete="off" aria-label="Search query" placeholder="What do you want to find?" />
        <button class="submit" id="submit" type="submit">Search</button>
      </form>
      <section id="output" aria-live="polite"><div class="empty">Enter a topic to search the web.</div></section>
    </main>
    <script>
      const restored = window.openai && window.openai.widgetState && window.openai.widgetState.privateContent
        ? window.openai.widgetState.privateContent
        : {};
      const state = {
        view: "search",
        pending: false,
        usageLoaded: false,
        selectedProviders: new Set(Array.isArray(restored.selectedProviders) ? restored.selectedProviders : []),
        recentRuns: []
      };
      const pendingRequests = new Map();
      let nextRequestId = 1;
      const form = document.getElementById("form");
      const input = document.getElementById("input");
      const output = document.getElementById("output");
      const submit = document.getElementById("submit");
      const status = document.getElementById("status");
      const heading = document.getElementById("heading");
      const lede = document.getElementById("lede");

      function text(value) { return value == null ? "" : String(value); }
      function formatNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? new Intl.NumberFormat(document.documentElement.lang || "en-US").format(number) : "—";
      }
      function escapeHtml(value) {
        return text(value).replace(/[&<>"']/g, function (char) {
          return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
        });
      }
      function safeUrl(value) {
        try {
          const parsed = new URL(text(value));
          return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "#";
        } catch { return "#"; }
      }
      function persistState() {
        if (!window.openai || typeof window.openai.setWidgetState !== "function") return;
        window.openai.setWidgetState({
          modelContent: state.selectedProviders.size
            ? "Selected Alexandria providers: " + Array.from(state.selectedProviders).join(", ")
            : "No Alexandria providers selected.",
          privateContent: {
            selectedProviders: Array.from(state.selectedProviders)
          }
        });
      }
      function rememberRun(kind, title, detail, payload) {
        state.recentRuns.unshift({
          id: Date.now() + "-" + Math.random().toString(16).slice(2),
          kind: kind,
          title: text(title).slice(0, 120),
          detail: text(detail).slice(0, 240),
          at: new Date().toISOString(),
          payload: payload
        });
        state.recentRuns = state.recentRuns.slice(0, 12);
        persistState();
      }
      function setView(view) {
        state.view = ["search", "read", "providers", "results", "usage"].includes(view) ? view : "search";
        document.querySelectorAll(".tab").forEach(function (tab) {
          tab.setAttribute("aria-selected", String(tab.dataset.view === state.view));
        });
        const config = {
          search: ["Search the live web.", "Find current sources and inspect the most relevant results.", "What do you want to find?", "Search query", "Search", "Enter a topic to search the web."],
          read: ["Turn a page into clean data.", "Fetch one URL and read its extracted Markdown.", "https://example.com/article", "Page URL", "Read", "Enter a public URL to read it."],
          providers: ["Explore Alexandria providers.", "Browse structured data providers and discover their available capabilities.", "What data do you need? (optional)", "Provider search", "Find providers", "Search by data need, or browse all provider categories."],
          results: ["Recent results.", "Revisit searches and extracted pages from this workspace session.", "", "", "", "Your recent results will appear here."],
          usage: ["Track your Firecrawl usage.", "See remaining credits, plan allocation, billing dates, and historical consumption.", "", "", "", "Loading your current balance…"]
        }[state.view];
        heading.textContent = config[0];
        lede.textContent = config[1];
        input.placeholder = config[2];
        input.setAttribute("aria-label", config[3]);
        submit.textContent = config[4];
        form.hidden = state.view === "usage" || state.view === "results";
        output.innerHTML = '<div class="empty">' + config[5] + "</div>";
        if (state.view === "usage") {
          loadUsage("current");
        } else if (state.view === "results") {
          renderRecentResults();
        } else if (state.view === "providers") {
          loadProviders("");
        } else {
          input.focus();
        }
      }
      function setPending(pending) {
        state.pending = pending;
        submit.disabled = pending;
        status.textContent = pending
          ? ({ read: "Reading…", providers: "Loading providers…", usage: "Loading usage…" }[state.view] || "Searching…")
          : "Ready";
        if (pending) output.innerHTML = '<div class="results"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
      }
      function request(method, params) {
        if (method === "tools/call" && window.openai && typeof window.openai.callTool === "function") {
          return window.openai.callTool(params.name, params.arguments || {});
        }
        const id = nextRequestId++;
        window.parent.postMessage({ jsonrpc: "2.0", id: id, method: method, params: params }, "*");
        return new Promise(function (resolve, reject) { pendingRequests.set(id, { resolve: resolve, reject: reject }); });
      }
      function renderError(error) {
        const message = typeof error === "string"
          ? error
          : error && (error.message || error.code)
            ? (error.message || error.code)
            : "The request could not be completed.";
        output.innerHTML = '<div class="error">' + escapeHtml(message) + "</div>";
      }
      function renderSearch(payload) {
        const groups = payload && payload.data ? payload.data : payload || {};
        const items = []
          .concat(Array.isArray(groups.web) ? groups.web : [])
          .concat(Array.isArray(groups.news) ? groups.news : []);
        if (!items.length) {
          output.innerHTML = '<div class="empty">No matching results found.</div>';
          return;
        }
        output.innerHTML = '<div class="results">' + items.slice(0, 10).map(function (item) {
          const href = safeUrl(item.url);
          const title = item.title || item.name || href;
          const copy = item.description || item.snippet || item.markdown || "";
          return '<a class="result" href="' + escapeHtml(href) + '" target="_blank" rel="noreferrer">' +
            '<p class="result-title">' + escapeHtml(title) + '</p>' +
            '<p class="result-url">' + escapeHtml(href) + '</p>' +
            '<p class="result-copy">' + escapeHtml(text(copy).slice(0, 420)) + '</p></a>';
        }).join("") + "</div>";
      }
      function renderRecentResults() {
        if (!state.recentRuns.length) {
          output.innerHTML = '<div class="empty">Run a search or read a page to build a temporary results history for this workspace.</div>';
          return;
        }
        output.innerHTML = '<div class="actions"><span class="badge">Session only</span><span class="status">' + state.recentRuns.length + ' recent run' + (state.recentRuns.length === 1 ? '' : 's') + '</span><button class="secondary" type="button" data-clear-results>Clear</button></div>' +
          '<div class="results">' + state.recentRuns.map(function (run) {
            const when = new Date(run.at);
            const displayTime = Number.isNaN(when.getTime()) ? "Recent" : when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
            return '<button class="result run-card" type="button" data-run-id="' + escapeHtml(run.id) + '">' +
              '<div class="run-meta"><span class="badge">' + escapeHtml(run.kind) + '</span><span class="status">' + escapeHtml(displayTime) + '</span></div>' +
              '<p class="result-title">' + escapeHtml(run.title || "Untitled result") + '</p><p class="result-copy">' + escapeHtml(run.detail) + '</p></button>';
          }).join("") + '</div>';
      }
      function openRecentResult(id) {
        const run = state.recentRuns.find(function (candidate) { return candidate.id === id; });
        if (!run) return;
        document.querySelectorAll(".tab").forEach(function (tab) {
          tab.setAttribute("aria-selected", String(tab.dataset.view === "results"));
        });
        heading.textContent = run.title || "Saved result";
        lede.textContent = "Temporary result from this workspace session.";
        form.hidden = true;
        if (run.kind === "page") renderDocument(run.payload || {}); else renderSearch(run.payload || {});
      }
      function renderDocument(payload) {
        const metadata = payload && payload.metadata ? payload.metadata : {};
        const title = metadata.title || metadata.ogTitle || "Extracted page";
        const url = safeUrl(metadata.sourceURL || metadata.url || input.value);
        const body = payload && (payload.markdown || payload.summary || payload.answer) ? (payload.markdown || payload.summary || payload.answer) : "No readable text was returned.";
        output.innerHTML = '<article class="document"><h2>' + escapeHtml(title) + '</h2>' +
          '<a class="result-url" href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">' + escapeHtml(url) + '</a>' +
          '<pre>' + escapeHtml(body) + '</pre></article>';
      }
      function cataloguePage(payload) {
        const alexandria = payload && payload.data && Array.isArray(payload.data.alexandria)
          ? payload.data.alexandria[0]
          : undefined;
        return alexandria && alexandria.data ? alexandria.data : (payload && payload.data ? payload.data : payload || {});
      }
      function renderProviders(payload) {
        const page = cataloguePage(payload);
        const items = Array.isArray(page.items) ? page.items : [];
        if (!items.length) {
          output.innerHTML = '<div class="empty">No matching Alexandria providers or capabilities found.</div>';
          return;
        }
        const level = text(page.level || "providers");
        output.innerHTML = '<div class="actions"><span class="badge">' + escapeHtml(level) + '</span><span class="status">' + formatNumber(page.total || items.length) + ' results</span></div>' +
          '<div class="card-grid">' + items.map(function (item) {
            const id = item.id || item.provider || item.capability || item.name || "";
            const title = item.name || item.title || item.provider || item.id || item.capability || "Provider";
            const detail = item.description || item.about || item.summary || item.capability || "Alexandria data provider";
            const provider = item.provider && item.provider !== title ? '<span class="badge">' + escapeHtml(item.provider) + '</span>' : "";
            const cost = item.creditsCost != null ? '<span class="badge">' + escapeHtml(item.creditsCost) + ' credits</span>' : "";
            if (level === "categories") {
              return '<button type="button" class="result run-card" data-category="' + escapeHtml(id) + '">' + provider + cost +
                '<p class="result-title">' + escapeHtml(title) + '</p><p class="result-copy">' + escapeHtml(detail) + '</p></button>';
            }
            if (level === "providers") {
              const selected = state.selectedProviders.has(id);
              return '<article class="result provider-card' + (selected ? ' selected' : '') + '" data-provider-card="' + escapeHtml(id) + '">' + provider + cost +
                '<p class="result-title">' + escapeHtml(title) + '</p><p class="result-copy">' + escapeHtml(detail) + '</p>' +
                '<div class="actions"><button class="secondary" type="button" data-select-provider="' + escapeHtml(id) + '" aria-pressed="' + selected + '">' + (selected ? 'Selected' : 'Select') + '</button>' +
                '<button class="secondary" type="button" data-provider="' + escapeHtml(id) + '">View tools</button></div></article>';
            }
            return '<article class="result provider-card">' + provider + cost + '<p class="result-title">' + escapeHtml(title) + '</p><p class="result-copy">' + escapeHtml(detail) + '</p></article>';
          }).join("") + "</div>" +
          '<div class="selection-bar" data-selection-bar' + (state.selectedProviders.size ? '' : ' hidden') + '><div class="selection-copy"><strong data-selection-label>' + escapeHtml(Array.from(state.selectedProviders).join(", ")) + '</strong><span class="status">Selected providers are shared with the conversation.</span></div><div class="actions"><button class="secondary" type="button" data-clear-providers>Clear</button><button class="submit" type="button" data-use-providers>Use in chat</button></div></div>';
      }
      function toggleProvider(provider) {
        if (state.selectedProviders.has(provider)) state.selectedProviders.delete(provider);
        else state.selectedProviders.add(provider);
        persistState();
        const card = output.querySelector('[data-provider-card="' + CSS.escape(provider) + '"]');
        const button = output.querySelector('[data-select-provider="' + CSS.escape(provider) + '"]');
        if (card) card.classList.toggle("selected", state.selectedProviders.has(provider));
        if (button) {
          button.setAttribute("aria-pressed", String(state.selectedProviders.has(provider)));
          button.textContent = state.selectedProviders.has(provider) ? "Selected" : "Select";
        }
        const bar = output.querySelector("[data-selection-bar]");
        const label = output.querySelector("[data-selection-label]");
        if (bar) bar.hidden = state.selectedProviders.size === 0;
        if (label) label.textContent = Array.from(state.selectedProviders).join(", ");
      }
      function useSelectedProviders() {
        const providers = Array.from(state.selectedProviders);
        if (!providers.length) return;
        const prompt = "Use these Alexandria providers for my next request: " + providers.join(", ") + ". Ask me what data I want if it is not already clear.";
        if (window.openai && typeof window.openai.sendFollowUpMessage === "function") {
          window.openai.sendFollowUpMessage({ prompt: prompt, scrollToBottom: true });
        } else {
          window.parent.postMessage({ jsonrpc: "2.0", method: "ui/message", params: { role: "user", content: [{ type: "text", text: prompt }] } }, "*");
        }
      }
      function renderUsage(payload, historical) {
        if (historical) {
          const periods = Array.isArray(payload && payload.periods) ? payload.periods : [];
          const maximum = periods.reduce(function (max, period) { return Math.max(max, Number(period.creditsUsed) || 0); }, 0);
          output.innerHTML = '<div class="actions"><button class="secondary" type="button" data-usage-view="current">Current balance</button><button class="secondary" type="button" data-usage-view="historical" aria-pressed="true">History</button></div>' +
            (periods.length ? '<div class="chart" aria-label="Historical credit usage">' + periods.slice(-8).map(function (period) {
              const range = [period.startDate, period.endDate || "Current"].filter(Boolean).join(" – ");
              const height = maximum > 0 ? Math.max(3, (Number(period.creditsUsed) || 0) / maximum * 100) : 3;
              return '<div class="bar-item" title="' + escapeHtml(range) + '"><span class="bar-value">' + formatNumber(period.creditsUsed) + '</span><span class="bar-track"><span class="bar" style="height:' + height.toFixed(1) + '%"></span></span><span>' + escapeHtml(period.startDate || period.apiKey || "Period") + '</span></div>';
            }).join("") + '</div><div class="results">' + periods.map(function (period) {
              const range = [period.startDate, period.endDate || "Current"].filter(Boolean).join(" – ");
              return '<article class="result"><span class="badge">' + escapeHtml(period.apiKey || "All API keys") + '</span><p class="result-title">' + formatNumber(period.creditsUsed) + ' credits used</p><p class="result-copy">' + escapeHtml(range) + '</p></article>';
            }).join("") + '</div>' : '<div class="empty">No historical usage periods were returned.</div>');
          return;
        }
        const remaining = Number(payload && payload.remainingCredits);
        const plan = Number(payload && payload.planCredits);
        const used = Number.isFinite(plan) && Number.isFinite(remaining) ? Math.max(0, plan - remaining) : NaN;
        const usedPercent = Number.isFinite(used) && plan > 0 ? Math.min(100, Math.max(0, used / plan * 100)) : 0;
        output.innerHTML = '<div class="actions"><button class="secondary" type="button" data-usage-view="current" aria-pressed="true">Current balance</button><button class="secondary" type="button" data-usage-view="historical">History</button></div>' +
          '<div class="card-grid"><div class="metric"><div class="metric-label">Credits remaining</div><div class="metric-value">' + formatNumber(remaining) + '</div></div>' +
          '<div class="metric"><div class="metric-label">Plan credits</div><div class="metric-value">' + formatNumber(plan) + '</div></div></div>' +
          '<div class="progress" aria-label="Credit usage"><span style="width:' + usedPercent.toFixed(1) + '%"></span></div>' +
          '<p class="result-copy">Billing period: ' + escapeHtml(payload && payload.billingPeriodStart || "—") + ' – ' + escapeHtml(payload && payload.billingPeriodEnd || "—") + (Number.isFinite(remaining) && Number.isFinite(plan) && remaining > plan ? ' · Balance includes top-ups or grants.' : '') + '</p>';
      }
      async function loadUsage(view) {
        if (state.pending) return;
        setPending(true);
        try {
          const result = await request("tools/call", { name: "firecrawl_credit_usage", arguments: { view: view } });
          const payload = result && result.structuredContent ? result.structuredContent : result;
          if (payload && payload.error) throw payload.error;
          renderUsage(payload || {}, view === "historical");
          state.usageLoaded = true;
        } catch (error) { renderError(error); }
        finally { setPending(false); }
      }
      async function loadProviderCategory(category) {
        if (state.pending) return;
        setPending(true);
        try {
          const result = await request("tools/call", { name: "firecrawl_find_tools", arguments: { categories: [category], level: "providers", limit: 50 } });
          const payload = result && result.structuredContent ? result.structuredContent : result;
          if (payload && payload.error) throw payload.error;
          renderProviders(payload || {});
        } catch (error) { renderError(error); }
        finally { setPending(false); }
      }
      async function loadProviders(query) {
        if (state.pending) return;
        setPending(true);
        try {
          const result = await request("tools/call", { name: "firecrawl_find_tools", arguments: query ? { query: query, limit: 20 } : { limit: 50 } });
          const payload = result && result.structuredContent ? result.structuredContent : result;
          if (payload && payload.error) throw payload.error;
          renderProviders(payload || {});
        } catch (error) { renderError(error); }
        finally { setPending(false); }
      }
      async function loadProviderTools(provider) {
        if (state.pending) return;
        setPending(true);
        try {
          const result = await request("tools/call", { name: "firecrawl_find_tools", arguments: { providers: [provider], level: "tools", limit: 50 } });
          const payload = result && result.structuredContent ? result.structuredContent : result;
          if (payload && payload.error) throw payload.error;
          renderProviders(payload || {});
        } catch (error) { renderError(error); }
        finally { setPending(false); }
      }
      function applyInitialInput(params) {
        const candidate = params && params.arguments ? params.arguments : params;
        if (!candidate || typeof candidate !== "object") return;
        if (candidate.view) setView(candidate.view);
        if (candidate.query) { setView("search"); input.value = text(candidate.query); }
        if (candidate.url) { setView("read"); input.value = text(candidate.url); }
      }

      window.addEventListener("message", function (event) {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (!message || message.jsonrpc !== "2.0") return;
        if (message.id !== undefined && pendingRequests.has(message.id)) {
          const pending = pendingRequests.get(message.id);
          pendingRequests.delete(message.id);
          if (message.error) pending.reject(message.error); else pending.resolve(message.result);
          return;
        }
        if (message.method === "ui/notifications/tool-input") applyInitialInput(message.params);
      }, { passive: true });

      document.querySelectorAll(".tab").forEach(function (tab) {
        tab.addEventListener("click", function () { if (!state.pending) setView(tab.dataset.view); });
      });
      output.addEventListener("click", function (event) {
        const category = event.target.closest("[data-category]");
        if (category) loadProviderCategory(category.dataset.category);
        const provider = event.target.closest("[data-provider]");
        if (provider) loadProviderTools(provider.dataset.provider);
        const selectProvider = event.target.closest("[data-select-provider]");
        if (selectProvider) toggleProvider(selectProvider.dataset.selectProvider);
        if (event.target.closest("[data-use-providers]")) useSelectedProviders();
        if (event.target.closest("[data-clear-providers]")) {
          state.selectedProviders.clear();
          persistState();
          output.querySelectorAll("[data-provider-card]").forEach(function (card) { card.classList.remove("selected"); });
          output.querySelectorAll("[data-select-provider]").forEach(function (button) { button.setAttribute("aria-pressed", "false"); button.textContent = "Select"; });
          const bar = output.querySelector("[data-selection-bar]");
          if (bar) bar.hidden = true;
        }
        const usage = event.target.closest("[data-usage-view]");
        if (usage) loadUsage(usage.dataset.usageView);
        const run = event.target.closest("[data-run-id]");
        if (run) openRecentResult(run.dataset.runId);
        if (event.target.closest("[data-clear-results]")) {
          state.recentRuns = [];
          persistState();
          renderRecentResults();
        }
      });
      form.addEventListener("submit", async function (event) {
        event.preventDefault();
        const value = input.value.trim();
        if ((!value && state.view !== "providers") || state.pending) return;
        setPending(true);
        try {
          const result = state.view === "read"
            ? await request("tools/call", { name: "firecrawl_scrape", arguments: { url: value, formats: ["markdown"] } })
            : state.view === "providers"
              ? await request("tools/call", { name: "firecrawl_find_tools", arguments: value ? { query: value, limit: 20 } : { limit: 50 } })
              : await request("tools/call", { name: "firecrawl_search", arguments: { query: value, limit: 10, sources: [{ type: "web" }] } });
          const payload = result && result.structuredContent ? result.structuredContent : result;
          if (payload && payload.error) throw payload.error;
          if (state.view === "read") {
            renderDocument(payload || {});
            rememberRun("page", (payload && payload.metadata && (payload.metadata.title || payload.metadata.ogTitle)) || value, value, payload || {});
          }
          else if (state.view === "providers") renderProviders(payload || {});
          else {
            renderSearch(payload || {});
            const groups = payload && payload.data ? payload.data : payload || {};
            const count = (Array.isArray(groups.web) ? groups.web.length : 0) + (Array.isArray(groups.news) ? groups.news.length : 0);
            rememberRun("search", value, count + " result" + (count === 1 ? "" : "s"), payload || {});
          }
        } catch (error) { renderError(error); }
        finally { setPending(false); }
      });

      applyInitialInput(window.openai && window.openai.toolInput);
      persistState();
    </script>
  </body>
</html>`;

export function registerFirecrawlUi<T extends FastMCPSessionAuth>(server: FastMCP<T>): void {
  server.addResource({
    uri: FIRECRAWL_UI_URI,
    name: 'Firecrawl workspace',
    description: 'Interactive Firecrawl provider, results, usage, search, and page-reading workspace.',
    mimeType: FIRECRAWL_UI_MIME_TYPE,
    async load() {
      return {
        text: FIRECRAWL_UI_HTML,
        _meta: {
          ui: {
            prefersBorder: true,
            domain: 'https://mcp.firecrawl.dev',
            csp: { connectDomains: [], resourceDomains: [] },
          },
          'openai/widgetDomain': 'https://mcp.firecrawl.dev',
          'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'] },
          'openai/widgetDescription':
            'Explore Alexandria providers, revisit session results, search or read the web, and inspect Firecrawl credit usage.',
        },
      } as any;
    },
  });
}
