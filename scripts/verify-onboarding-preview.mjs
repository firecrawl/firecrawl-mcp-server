import { execFileSync } from 'node:child_process';
const session = 'firecrawl-onboarding-verification';
const url = process.argv[2] ?? 'http://127.0.0.1:4183/?onboarding=1';
const browser = (...args) =>
  execFileSync(
    'npx',
    ['--yes', 'agent-browser@0.38.1', '--session', session, ...args],
    { encoding: 'utf8', timeout: 60000 }
  );
async function verify() {
  const doc = () => document.getElementById('view').contentDocument;
  const get = (id) => doc()?.getElementById(id);
  const check = (condition, reason) => {
    if (!condition) throw Error(reason);
  };
  const wait = async (predicate, reason) => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > 7000) throw Error('Timed out: ' + reason);
      await new Promise((r) => setTimeout(r, 40));
    }
  };
  const key = 'firecrawl.provider-onboarding.v1';
  const prefs = () => JSON.parse(doc().defaultView.localStorage.getItem(key));
  const safe = () => {
    check(!window.messages.length, 'No messages sent');
    check(
      window.calls.every((call) =>
        ['firecrawl_find_tools', 'firecrawl_credit_usage'].includes(call.name)
      ),
      'Only free discovery and usage calls'
    );
  };
  const load = async (fixture = 'fresh', scenario = 'normal') => {
    safe();
    const previous = doc();
    window.calls = [];
    window.messages = [];
    window.modelContexts = [];
    document.getElementById('scenario').value = scenario;
    document.getElementById('view').src =
      '/usage.html?fixture=' + fixture + '&t=' + Date.now();
    await wait(
      () => doc() !== previous && get('manage-sources'),
      'resource reload'
    );
    await wait(
      () =>
        fixture === 'persist'
          ? get('onboarding-view').hidden
          : get('onboarding-connection')?.textContent !==
            'Checking your Firecrawl connection…',
      'initialization'
    );
  };
  const choose = (id) =>
    get('provider-grid').querySelector(`[data-provider="${id}"] input`).click();
  const picker = async () => {
    get('onboarding-start').click();
    await wait(
      () =>
        get('provider-count').textContent === '6 providers' &&
        !get('onboarding-next').disabled,
      'source catalog'
    );
  };
  await load();
  check(
    !get('onboarding-welcome').hidden && !get('onboarding-start').disabled,
    'First visit welcomes connected user'
  );
  check(
    get('onboarding-credit-note').textContent.includes('8,750'),
    'Actual credit balance'
  );
  await picker();
  choose('allbirds-com');
  get('provider-grid')
    .querySelector('[data-provider="amazon-com"] button')
    .click();
  await wait(
    () => get('provider-tools').querySelectorAll('input').length === 2,
    'tool inspection'
  );
  get('provider-tools')
    .querySelector('[data-capability="products/offer"]')
    .click();
  get('close-provider-dialog').click();
  check(window.modelContexts.length === 0, 'Source selection is a draft');
  get('onboarding-next').click();
  check(
    get('onboarding-selected').children.length === 2,
    'Finish summarizes source and individual-tool choices'
  );
  get('onboarding-attach').click();
  await wait(() => get('onboarding-view').hidden, 'native attachment');
  check(window.modelContexts.length === 1, 'One explicit context attachment');
  check(
    window.modelContexts[0].content.length === 2 &&
      !window.modelContexts[0].structuredContent,
    'Removable native provider blocks'
  );
  check(
    prefs().completed && prefs().sources.length === 2,
    'Completion persists after successful attachment'
  );
  check(
    prefs().sources.find((s) => s.id === 'amazon-com').tools[0] ===
      'products/offer',
    'Individual tools persist'
  );
  await load('persist');
  await wait(
    () => get('provider-count').textContent === '6 providers',
    'returning catalog'
  );
  check(
    window.modelContexts.length === 0 && !get('saved-sources').hidden,
    'Returning visits do not automatically attach'
  );
  get('add-saved-sources').click();
  await wait(
    () => get('saved-sources-status').textContent.startsWith('Added'),
    'explicit saved-source attachment'
  );
  check(
    window.modelContexts[0].content.length === 2,
    'Saved exact source selections attach'
  );
  get('clear-selection').click();
  await wait(
    () => window.modelContexts.at(-1)?.content.length === 0,
    'clear current-chat context'
  );
  check(
    prefs().sources.length === 2,
    'Clearing chat context keeps saved preferences'
  );
  get('usage-tab').click();
  check(get('saved-sources').hidden, 'Saved-source banner hides on Usage');
  get('providers-tab').click();
  check(
    !get('saved-sources').hidden,
    'Saved-source banner returns on Providers'
  );
  get('manage-sources').click();
  await wait(
    () =>
      get('provider-grid').querySelector('[data-provider="allbirds-com"] input')
        ?.checked && !get('onboarding-next').disabled,
    'saved choices restored'
  );
  const previousContexts = window.modelContexts.length;
  choose('allbirds-com');
  get('onboarding-next').click();
  document.getElementById('scenario').value = 'context-error';
  get('onboarding-attach').click();
  await wait(
    () => get('onboarding-feedback').textContent.includes('Could not'),
    'attachment failure'
  );
  check(
    !get('onboarding-view').hidden && prefs().sources.length === 2,
    'Failed attachment retains draft and prior saved preferences'
  );
  check(
    window.modelContexts.length === previousContexts,
    'Failed attachment reports no success'
  );
  document.getElementById('scenario').value = 'normal';
  get('onboarding-attach').click();
  await wait(() => get('onboarding-view').hidden, 'attachment retry');
  check(
    prefs().sources.length === 1,
    'Successful retry commits edited preferences'
  );
  await load('fresh', 'error');
  check(
    get('onboarding-start').disabled && !get('onboarding-retry').hidden,
    'Disconnected accounts have a recoverable connection state'
  );
  document.getElementById('scenario').value = 'normal';
  get('onboarding-retry').click();
  await wait(() => !get('onboarding-start').disabled, 'connection retry');
  document.getElementById('scenario').value = 'catalog-error';
  get('onboarding-start').click();
  await wait(() => !get('catalog-error').hidden, 'catalog error');
  get('onboarding-skip').click();
  await wait(() => get('onboarding-view').hidden, 'skip failed catalog');
  check(prefs().completed, 'Skip is remembered');
  await load('fresh', 'unsupported-context');
  await picker();
  choose('allbirds-com');
  get('onboarding-next').click();
  check(
    get('onboarding-attach').textContent.includes('Finish setup'),
    'Unsupported context has an honest finish action'
  );
  get('onboarding-attach').click();
  await wait(() => get('onboarding-view').hidden, 'unsupported finish');
  check(
    window.modelContexts.length === 0 && prefs().sources.length === 1,
    'Unsupported hosts save preferences without publishing'
  );
  get('add-saved-sources').click();
  await wait(
    () => get('saved-sources-status').textContent.includes('Could not'),
    'unsupported attach failure'
  );
  check(
    prefs().sources.length === 1,
    'Failed saved-source attachment does not discard preferences'
  );
  await load('blocked');
  check(!get('onboarding-storage-note').hidden, 'Blocked storage is disclosed');
  await picker();
  choose('allbirds-com');
  get('onboarding-next').click();
  get('onboarding-attach').click();
  await wait(
    () => get('onboarding-view').hidden,
    'storage-blocked session attachment'
  );
  check(
    window.modelContexts.length === 1,
    'Storage-blocked host can still attach'
  );
  await load('fresh');
  doc().defaultView.localStorage.setItem(
    key,
    JSON.stringify({
      version: 1,
      completed: true,
      sources: [{ id: 'retired-provider', tools: null }],
    })
  );
  await load('persist');
  get('manage-sources').click();
  await wait(
    () => get('onboarding-feedback').textContent.includes('no longer'),
    'unavailable saved provider'
  );
  check(
    get('onboarding-source-count').textContent === 'No sources selected',
    'Missing source is not silently attached'
  );
  check(
    window.modelContexts.length === 0,
    'Preference resolution never publishes implicitly'
  );
  await load();
  const width = document.getElementById('width');
  width.value = '320';
  width.dispatchEvent(new Event('change'));
  const theme = document.getElementById('theme');
  theme.value = 'dark';
  theme.dispatchEvent(new Event('change'));
  await wait(
    () => doc().documentElement.dataset.theme === 'dark',
    'dark theme'
  );
  check(
    doc().documentElement.scrollWidth <= doc().documentElement.clientWidth,
    'Welcome fits narrow screens'
  );
  await picker();
  check(
    doc().documentElement.scrollWidth <= doc().documentElement.clientWidth,
    'Source picker fits narrow screens'
  );
  safe();
  check(!window.previewErrors.length, 'No JavaScript errors');
  return {
    passed: true,
    checks: [
      'first-use connection and retry',
      'provider and tool draft selection',
      'explicit native attachment',
      'completion and preference persistence',
      'returning visits without automatic context',
      'saved source attachment and navigation',
      'manage sources and failed attachment retry',
      'skip and discovery failures',
      'unsupported host capabilities',
      'blocked storage',
      'removed providers',
      'dark theme and mobile layout',
      'no messages or paid execution',
    ],
  };
}
try {
  browser('open', url);
  console.log(browser('eval', '(' + verify.toString() + ')()'));
} catch (error) {
  console.error(error.stderr || error.message);
  process.exitCode = 1;
} finally {
  browser('close');
}
