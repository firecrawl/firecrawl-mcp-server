import firecrawlIcon from './firecrawl-icon.svg';
import { useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { App, type McpUiHostContext } from '@modelcontextprotocol/ext-apps';
import { RefreshCw } from 'lucide-react';
import Button from './ui/button';
import { Tabs } from './ui/tabs';
import { ProvidersView } from './providers-view';
import { createProvidersStore } from './providers';

const app = new App({ name: 'Firecrawl usage', version: '1.0.0' }, {});
let connection: Promise<void> | undefined;
const ready = () =>
  (connection ??= app
    .connect(undefined, { timeout: 10000 })
    .then(() => {
      theme(app.getHostContext() ?? {});
      update({ canLink: !!app.getHostCapabilities()?.openLinks });
    })
    .catch((error) => {
      connection = undefined;
      throw error;
    }));
const providers = createProvidersStore(app, ready);
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
const listeners = new Set<() => void>();
let state = {
  view: 'providers',
  loading: true,
  remaining: '—',
  plan: '—',
  billing: 'Loading…',
  periods: [] as { start: Date; credits: number }[],
  empty: 'Loading usage…',
  balanceError: '',
  historyError: '',
  status: 'Connecting to Firecrawl…',
  canLink: false,
};
const snapshot = () => state;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function update(patch: Partial<typeof state>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}
function theme(context: Pick<McpUiHostContext, 'theme'>) {
  document.documentElement.dataset.theme =
    context.theme ??
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid usage data');
  return value as Record<string, unknown>;
}
function data(result: unknown) {
  const response = record(result);
  if (response.isError) throw new Error('Usage request failed');
  if (response.structuredContent) return record(response.structuredContent);
  if (Array.isArray(response.content)) {
    const text = response.content.find((item) => item.type === 'text');
    if (text) return record(JSON.parse(text.text));
  }
  throw new Error('No usage data returned');
}
const amount = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? number.format(value)
    : 'Unavailable';
function parsedDate(value: unknown) {
  if (typeof value !== 'string') return;
  const result = new Date(value);
  return Number.isFinite(result.getTime()) ? result : undefined;
}
function balance(value: Record<string, unknown>) {
  if (
    typeof value.remainingCredits !== 'number' ||
    !Number.isFinite(value.remainingCredits)
  )
    throw new Error('Missing balance');
  const start = parsedDate(value.billingPeriodStart),
    end = parsedDate(value.billingPeriodEnd);
  update({
    remaining: amount(value.remainingCredits),
    plan: amount(value.planCredits),
    billing:
      start && end
        ? `${date.format(start)} – ${date.format(end)}`
        : 'Unavailable',
  });
}
function history(value: Record<string, unknown>) {
  if (value.success !== true || !Array.isArray(value.periods))
    throw new Error('Missing usage history');
  const periods = value.periods
    .map((raw: unknown) => {
      const period = record(raw),
        start = parsedDate(period.startDate);
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
  update({ periods, empty: 'No usage history yet.' });
}
let loading = false;
async function refreshUsage() {
  if (loading) return;
  loading = true;
  update({
    loading: true,
    status: connection ? 'Updating usage…' : 'Connecting to Firecrawl…',
  });
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
    update({ balanceError: '', historyError: '' });
    if (results[0].status === 'rejected')
      update({
        remaining: '—',
        plan: 'Unavailable',
        billing: 'Unavailable',
        balanceError:
          'Could not load your balance. Refresh to retry. If needed, reconnect your Firecrawl account.',
      });
    if (results[1].status === 'rejected')
      update({
        periods: [],
        empty: 'Usage is unavailable.',
        historyError: 'Could not load monthly usage. Refresh to retry.',
      });
    update({
      status: results.every((result) => result.status === 'fulfilled')
        ? `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())}`
        : 'Some data is unavailable',
    });
  } catch {
    update({
      remaining: '—',
      plan: 'Unavailable',
      billing: 'Unavailable',
      periods: [],
      empty: 'Usage is unavailable.',
      balanceError:
        'Could not connect. Open this interface through the Firecrawl plugin, or reconnect your account, then refresh.',
      status: 'Connection unavailable',
    });
  } finally {
    loading = false;
    update({ loading: false });
  }
}
export function Dashboard() {
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  const providerState = useSyncExternalStore(
    providers.subscribe,
    providers.snapshot,
    providers.snapshot
  );
  useEffect(() => {
    void providers.activate();
    void refreshUsage();
  }, []);
  const maximum = Math.max(...state.periods.map((p) => p.credits), 1);
  const isProviders = state.view === 'providers';
  return (
    <main className="dashboard" data-view={state.view}>
      <header className="page-header">
        <div className="brand">
          <span
            className="brand-icon"
            dangerouslySetInnerHTML={{
              __html: firecrawlIcon,
            }}
          />
          Firecrawl
        </div>
        <div className="app-tabs">
          <Tabs
            label="Firecrawl app"
            value={state.view}
            onChange={(view) => {
              update({ view });
              if (view !== 'providers') providers.close();
            }}
            items={[
              {
                value: 'providers',
                label: 'Providers',
                id: 'providers-tab',
                panel: 'providers-view',
              },
              {
                value: 'usage',
                label: 'Usage',
                id: 'usage-tab',
                panel: 'usage-view',
              },
            ]}
          />
        </div>
        <div className="heading-row">
          <h1 id="page-title">{isProviders ? 'Explore providers' : 'Usage'}</h1>
          <Button
            id="refresh"
            variant="secondary"
            disabled={isProviders ? providerState.loading : state.loading}
            onClick={() => {
              if (isProviders) void providers.refresh();
              else void refreshUsage();
            }}
          >
            <RefreshCw size={16} />
            <span>
              {(isProviders ? providerState.loading : state.loading)
                ? 'Refreshing…'
                : 'Refresh'}
            </span>
          </Button>
        </div>
        <p id="page-description">
          {isProviders
            ? 'Choose data providers and bring their tools into your chat.'
            : 'Your credits and recent usage.'}
        </p>
      </header>
      <div
        id="providers-view"
        role="tabpanel"
        aria-labelledby="providers-tab"
        hidden={!isProviders}
      >
        <ProvidersView store={providers} />
      </div>
      <div
        id="usage-view"
        role="tabpanel"
        aria-labelledby="usage-tab"
        hidden={isProviders}
      >
        <section
          className="balance-section"
          aria-labelledby="balance-heading"
          aria-busy={state.loading}
          id="balance-section"
        >
          <div className="section-heading">
            <h2 id="balance-heading">Credit balance</h2>
            <span className="badge">Account</span>
          </div>
          <p className="label">Credits remaining</p>
          <p
            id="remaining"
            className={`credit-value${state.remaining === '—' ? ' placeholder' : ''}`}
          >
            {state.remaining}
          </p>
          <div className="plan-row">
            <span>Plan credits</span>
            <strong id="plan">{state.plan}</strong>
          </div>
          <p className="balance-note">
            Your balance includes available top-ups and grants.
          </p>
          <div className="billing-row">
            <span className="label">Billing period</span>
            <span id="billing">{state.billing}</span>
          </div>
          <p
            id="balance-error"
            className="error"
            role="status"
            hidden={!state.balanceError}
          >
            {state.balanceError}
          </p>
        </section>
        <section
          className="usage-section"
          aria-labelledby="usage-heading"
          aria-busy={state.loading}
          id="usage-section"
        >
          <div className="section-heading">
            <h2 id="usage-heading">Monthly usage</h2>
            <span className="label">Credits</span>
          </div>
          <p className="usage-note">
            Recent calendar months, separate from your billing period.
          </p>
          <div id="history" className="history">
            {state.periods.length ? (
              state.periods.map((period, index) => (
                <div
                  className="month"
                  key={period.start.toISOString()}
                  aria-label={`${month.format(period.start)}: ${number.format(period.credits)} credits used`}
                >
                  <span className="month-amount">
                    {number.format(period.credits)}
                  </span>
                  <div className="bar-track" aria-hidden="true">
                    <div
                      className="bar"
                      hidden={period.credits === 0}
                      style={{ height: `${(period.credits / maximum) * 100}%` }}
                      data-latest={index === state.periods.length - 1}
                    />
                  </div>
                  <span className="month-label">
                    {month.format(period.start)}
                  </span>
                </div>
              ))
            ) : (
              <p className="empty">{state.empty}</p>
            )}
          </div>
          <p
            id="history-error"
            className="error"
            role="status"
            hidden={!state.historyError}
          >
            {state.historyError}
          </p>
          <p
            id="history-note"
            className="history-note"
            hidden={!state.periods.length}
          >
            Recent history covers up to 90 days. The earliest month may be
            partial.
          </p>
        </section>
      </div>
      <footer>
        <span id="status" role="status" aria-live="polite">
          {state.status}
        </span>
        <Button
          variant="tertiary"
          id="open-dashboard"
          disabled={!state.canLink}
          onClick={async () => {
            try {
              const result = await app.openLink({
                url: 'https://www.firecrawl.dev/app/usage',
              });
              if (result.isError) throw new Error('Link rejected');
            } catch {
              update({ status: 'Could not open dashboard. Try again.' });
            }
          }}
        >
          Open dashboard <span aria-hidden="true">↗</span>
        </Button>
      </footer>
    </main>
  );
}
if (typeof window !== 'undefined') {
  app.onhostcontextchanged = theme;
  theme({});
  createRoot(document.getElementById('app')!).render(<Dashboard />);
}
