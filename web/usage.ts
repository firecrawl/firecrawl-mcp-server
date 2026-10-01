import { App, type McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { providersBrowser } from './providers';

const app = new App({ name: 'Firecrawl usage', version: '1.0.0' }, {});
const element = (id: string) => document.getElementById(id)!;
const refreshButton = element('refresh') as HTMLButtonElement;
const dashboardButton = element('open-dashboard') as HTMLButtonElement;
const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const month = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
let connected = false;
let loading = false;
let connection: Promise<void> | undefined;
let view: 'usage' | 'providers' = 'providers';
const providers = providersBrowser(app, ready);

function ready(): Promise<void> {
  if (!connection)
    connection = app
      .connect(undefined, { timeout: 10000 })
      .then(() => {
        connected = true;
        theme(app.getHostContext() ?? {});
        dashboardButton.disabled = !app.getHostCapabilities()?.openLinks;
      })
      .catch((error) => {
        connection = undefined;
        throw error;
      });
  return connection;
}
function navigate(next: 'usage' | 'providers'): void {
  view = next;
  element('providers-view').hidden = view !== 'providers';
  element('usage-view').hidden = view !== 'usage';
  document.querySelector('.dashboard')!.setAttribute('data-view', view);
  element('providers-tab').setAttribute(
    'aria-pressed',
    String(view === 'providers')
  );
  element('usage-tab').setAttribute('aria-pressed', String(view === 'usage'));
  element('page-title').textContent =
    view === 'providers' ? 'Explore providers' : 'Usage';
  element('page-description').textContent =
    view === 'providers'
      ? 'Choose data providers and bring their tools into your chat.'
      : 'Your credits and recent usage.';
  if (view === 'providers') void providers.activate();
  else providers.deactivate();
}

function theme(context: Pick<McpUiHostContext, 'theme'>): void {
  document.documentElement.dataset.theme =
    context.theme ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid usage data');
  return value as Record<string, unknown>;
}
function data(result: unknown): Record<string, unknown> {
  const response = record(result);
  if (response.isError) throw new Error('Usage request failed');
  if (response.structuredContent) return record(response.structuredContent);
  if (Array.isArray(response.content)) {
    const text = response.content.find((item) => item.type === 'text');
    if (text) return record(JSON.parse(text.text));
  }
  throw new Error('No usage data returned');
}
function amount(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? number.format(value)
    : 'Unavailable';
}
function parsedDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const result = new Date(value);
  return Number.isFinite(result.getTime()) ? result : undefined;
}
function balance(value: Record<string, unknown>): void {
  if (
    typeof value.remainingCredits !== 'number' ||
    !Number.isFinite(value.remainingCredits)
  )
    throw new Error('Missing balance');
  element('remaining').textContent = amount(value.remainingCredits);
  element('remaining').classList.remove('placeholder');
  element('plan').textContent = amount(value.planCredits);
  const start = parsedDate(value.billingPeriodStart);
  const end = parsedDate(value.billingPeriodEnd);
  element('billing').textContent =
    start && end
      ? `${date.format(start)} – ${date.format(end)}`
      : 'Unavailable';
}
function emptyHistory(message: string): void {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = message;
  element('history').replaceChildren(p);
  element('history-note').hidden = true;
}
function history(value: Record<string, unknown>): void {
  if (value.success !== true || !Array.isArray(value.periods))
    throw new Error('Missing usage history');
  const periods = value.periods
    .map((raw: unknown) => {
      const period = record(raw);
      const start = parsedDate(period.startDate);
      if (
        !start ||
        typeof period.creditsUsed !== 'number' ||
        !Number.isFinite(period.creditsUsed) ||
        period.creditsUsed < 0
      )
        throw new Error('Invalid monthly usage');
      return { start, credits: period.creditsUsed };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (!periods.length) {
    emptyHistory('No usage history yet.');
    return;
  }
  const maximum = Math.max(...periods.map((period) => period.credits), 1);
  const columns = periods.map((period) => {
    const column = document.createElement('div');
    column.className = 'month';
    column.setAttribute(
      'aria-label',
      `${month.format(period.start)}: ${number.format(period.credits)} credits used`
    );
    const used = document.createElement('span');
    used.className = 'month-amount';
    used.textContent = number.format(period.credits);
    const track = document.createElement('div');
    track.className = 'bar-track';
    track.setAttribute('aria-hidden', 'true');
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${(period.credits / maximum) * 100}%`;
    // Zero usage has no filled bar.
    if (period.credits === 0) bar.hidden = true;
    track.append(bar);
    const label = document.createElement('span');
    label.className = 'month-label';
    label.textContent = month.format(period.start);
    column.append(used, track, label);
    return column;
  });
  element('history').replaceChildren(...columns);
  element('history-note').hidden = false;
}
function error(id: string, message?: string): void {
  const target = element(id);
  target.hidden = !message;
  target.textContent = message ?? '';
}
function balanceUnavailable(): void {
  element('remaining').textContent = '—';
  element('remaining').classList.add('placeholder');
  element('plan').textContent = 'Unavailable';
  element('billing').textContent = 'Unavailable';
}
async function update(): Promise<void> {
  if (loading) return;
  loading = true;
  refreshButton.disabled = true;
  refreshButton.querySelector('span')!.textContent = 'Refreshing…';
  element('status').textContent = connected
    ? 'Updating usage…'
    : 'Connecting to Firecrawl…';
  for (const id of ['balance-section', 'usage-section'])
    element(id).setAttribute('aria-busy', 'true');
  try {
    await ready();
    if (!app.getHostCapabilities()?.serverTools)
      throw new Error('Host does not support tool calls');
    const results = await Promise.allSettled([
      app
        .callServerTool(
          { name: 'firecrawl_credit_usage', arguments: { view: 'current' } },
          { timeout: 15000 }
        )
        .then((result) => balance(data(result))),
      app
        .callServerTool(
          { name: 'firecrawl_credit_usage', arguments: { view: 'historical' } },
          { timeout: 15000 }
        )
        .then((result) => history(data(result))),
    ]);
    error('balance-error');
    error('history-error');
    if (results[0].status === 'rejected') {
      balanceUnavailable();
      error(
        'balance-error',
        'Could not load your balance. Refresh to retry. If needed, reconnect your Firecrawl account.'
      );
    }
    if (results[1].status === 'rejected') {
      emptyHistory('Usage is unavailable.');
      error('history-error', 'Could not load monthly usage. Refresh to retry.');
    }
    element('status').textContent = results.every(
      (result) => result.status === 'fulfilled'
    )
      ? `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())}`
      : 'Some data is unavailable';
  } catch {
    balanceUnavailable();
    emptyHistory('Usage is unavailable.');
    error(
      'balance-error',
      'Could not connect. Open this interface through the Firecrawl plugin, or reconnect your account, then refresh.'
    );
    element('status').textContent = 'Connection unavailable';
  } finally {
    loading = false;
    refreshButton.disabled = false;
    refreshButton.querySelector('span')!.textContent = 'Refresh';
    for (const id of ['balance-section', 'usage-section'])
      element(id).setAttribute('aria-busy', 'false');
  }
}

app.onhostcontextchanged = theme;
refreshButton.addEventListener('click', () => {
  if (view === 'providers') void providers.refresh();
  else void update();
});
element('providers-tab').addEventListener('click', () => navigate('providers'));
element('usage-tab').addEventListener('click', () => navigate('usage'));
dashboardButton.addEventListener('click', async () => {
  try {
    const result = await app.openLink({
      url: 'https://www.firecrawl.dev/app/usage',
    });
    if (result.isError) throw new Error('Link rejected');
  } catch {
    element('status').textContent = 'Could not open dashboard. Try again.';
  }
});
theme({});
navigate('providers');
void update();
