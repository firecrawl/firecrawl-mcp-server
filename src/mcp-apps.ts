// MCP Apps (io.modelcontextprotocol/ui): an inline view for Alexandria results.
// Hosts without MCP Apps support ignore the tool's `_meta.ui` and the resource.

export const ALEXANDRIA_RESULTS_URI = 'ui://firecrawl/alexandria-results.html';
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

export type AlexandriaView = {
  provider: string;
  capability: string;
  creditsCost?: number;
  error?: string;
  columns: string[];
  rows: Record<string, string>[];
  chart?: { label: string; value: string };
};

/**
 * Turns a firecrawl_scrape structured result into tables, one per Alexandria call.
 * Serialized into the widget with Function#toString, so it must stay self-contained.
 */
export function alexandriaViews(result: unknown): AlexandriaView[] {
  const MAX_ROWS = 50;
  const MAX_COLUMNS = 6;
  const items = (result as any)?.data?.alexandria;
  if (!Array.isArray(items)) return [];
  const scalar = (value: unknown) =>
    value === null || ['string', 'number', 'boolean'].includes(typeof value);
  const firstRows = (value: unknown, depth: number): any[] | undefined => {
    if (Array.isArray(value))
      return value.some((row) => row && typeof row === 'object' && !Array.isArray(row))
        ? value
        : undefined;
    if (!value || typeof value !== 'object' || depth > 2) return undefined;
    for (const child of Object.values(value)) {
      const rows = firstRows(child, depth + 1);
      if (rows) return rows;
    }
    return undefined;
  };
  return items
    .filter((item: any) => item && item.provider !== 'firecrawl')
    .map((item: any) => {
      const view: AlexandriaView = {
        provider: String(item.provider ?? ''),
        capability: String(item.capability ?? ''),
        creditsCost: typeof item.creditsCost === 'number' ? item.creditsCost : undefined,
        columns: [],
        rows: [],
      };
      if (item.error) {
        view.error = String(item.error.message ?? item.error.code ?? 'Provider error');
        return view;
      }
      const source = (firstRows(item.data, 0) ?? (item.data && typeof item.data === 'object' ? [item.data] : []))
        .filter((row: any) => row && typeof row === 'object' && !Array.isArray(row))
        .slice(0, MAX_ROWS);
      const columns: string[] = [];
      for (const row of source)
        for (const [key, value] of Object.entries(row))
          if (scalar(value) && !columns.includes(key)) columns.push(key);
      view.columns = columns.slice(0, MAX_COLUMNS);
      view.rows = source.map((row: any) =>
        Object.fromEntries(view.columns.map((key) => [key, row[key] == null ? '' : String(row[key])]))
      );
      const numeric = (key: string) =>
        view.rows.length > 1 &&
        view.rows.filter((row) => row[key] !== '' && Number.isFinite(Number(row[key]))).length >=
          view.rows.length * 0.8;
      const value = view.columns.find(numeric);
      const label = view.columns.find((key) => key !== value && !numeric(key));
      if (value && label) view.chart = { label, value };
      return view;
    });
}

const STYLE = `
:root{color-scheme:light dark;--fg:var(--color-text-primary,light-dark(#171717,#fafafa));--muted:var(--color-text-secondary,light-dark(#666,#a3a3a3));--line:var(--color-border-primary,light-dark(#e5e5e5,#333));--heat:#fa5d19;font-family:var(--font-sans,system-ui,sans-serif)}
body{margin:0;padding:12px;color:var(--fg);background:transparent;font-size:13px}
section+section{margin-top:16px}
h2{margin:0 0 8px;font-size:13px;font-weight:600}
h2 span{color:var(--muted);font-weight:400}
.err{color:#d93025}
.bars{display:grid;grid-template-columns:minmax(80px,30%) 1fr auto;gap:4px 8px;align-items:center;margin-bottom:10px}
.bar{height:10px;border-radius:3px;background:var(--heat)}
.num{font-variant-numeric:tabular-nums;color:var(--muted)}
.wrap{overflow-x:auto}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--line);white-space:nowrap;max-width:280px;overflow:hidden;text-overflow:ellipsis}
th{color:var(--muted);font-weight:500}
`;

function widgetScript(viewsSource: string): string {
  return `
const alexandriaViews = ${viewsSource};
let nextId = 1;
const pending = new Map();
function send(method, params, isRequest) {
  const message = { jsonrpc: '2.0', method, params };
  if (!isRequest) return parent.postMessage(message, '*');
  const id = nextId++;
  parent.postMessage({ ...message, id }, '*');
  return new Promise((resolve) => pending.set(id, resolve));
}
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function resize() {
  send('ui/notifications/size-changed', { width: document.documentElement.scrollWidth, height: document.body.scrollHeight });
}
function render(result) {
  const root = document.getElementById('root');
  root.replaceChildren();
  for (const view of alexandriaViews(result?.structuredContent)) {
    const section = el('section');
    const title = el('h2', view.provider + '/' + view.capability);
    if (view.creditsCost !== undefined) title.append(el('span', ' · ' + view.creditsCost + ' credits'));
    section.append(title);
    if (view.error) section.append(el('div', view.error, 'err'));
    if (view.chart) {
      const bars = el('div', undefined, 'bars');
      const rows = view.rows.slice(0, 12);
      const max = Math.max(...rows.map((row) => Math.abs(Number(row[view.chart.value]))), 1);
      for (const row of rows) {
        const value = Number(row[view.chart.value]);
        const bar = el('div', undefined, 'bar');
        bar.style.width = Math.max(2, (Math.abs(value) / max) * 100) + '%';
        bars.append(el('div', row[view.chart.label]), bar, el('div', row[view.chart.value], 'num'));
      }
      section.append(bars);
    }
    if (view.rows.length) {
      const table = el('table');
      const head = el('tr');
      for (const column of view.columns) head.append(el('th', column));
      table.append(head);
      for (const row of view.rows) {
        const tr = el('tr');
        for (const column of view.columns) tr.append(el('td', row[column]));
        table.append(tr);
      }
      const wrap = el('div', undefined, 'wrap');
      wrap.append(table);
      section.append(wrap);
    }
    root.append(section);
  }
  resize();
}
window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || message.jsonrpc !== '2.0') return;
  if (message.id !== undefined && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
    return;
  }
  if (message.method === 'ui/notifications/tool-result') render(message.params);
  if (message.method === 'ui/notifications/host-context-changed') applyHost(message.params);
});
function applyHost(context) {
  const variables = context?.styles?.variables ?? {};
  for (const [name, value] of Object.entries(variables)) document.documentElement.style.setProperty(name, value);
}
send('ui/initialize', {
  appInfo: { name: 'firecrawl-alexandria-results', version: '1.0.0' },
  appCapabilities: { availableDisplayModes: ['inline'] },
  protocolVersion: '2026-01-26',
}, true).then((result) => {
  applyHost(result?.hostContext);
  send('ui/notifications/initialized', {});
});
`;
}

export function alexandriaResultsHtml(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body><div id="root"></div><script>${widgetScript(alexandriaViews.toString())}</script></body></html>`;
}
