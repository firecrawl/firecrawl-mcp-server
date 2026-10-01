import { execFileSync } from 'node:child_process';

// Run with the fixture preview already listening. No paid calls or real chats.
const url = process.argv[2] ?? 'http://127.0.0.1:4173';
const session = 'firecrawl-provider-verification';
function browser(...args) {
  return execFileSync(
    'npx',
    ['--yes', 'agent-browser@0.38.1', '--session', session, ...args],
    { encoding: 'utf8', timeout: 60000 }
  );
}
async function verify() {
  const doc = () => document.getElementById('view').contentDocument;
  const get = (id) => doc()?.getElementById(id);
  const latest = () => window.modelContexts.at(-1);
  const selection = () =>
    latest()?.content.length
      ? {
          providers: latest().content.map((item) =>
            JSON.parse(
              item.text.split('Selected Alexandria provider and tools:\n')[1]
            )
          ),
        }
      : undefined;
  const check = (condition, reason) => {
    if (!condition) throw new Error(reason);
  };
  const wait = async (predicate, reason = 'preview state') => {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > 6000)
        throw new Error('Timed out waiting for ' + reason);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  };
  const change = async (id, value) => {
    if (id === 'provider-category') {
      get('provider-category').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      );
      await wait(
        () => doc().querySelector(`[role="option"][data-category="${value}"]`),
        'category dropdown'
      );
      doc().querySelector(`[role="option"][data-category="${value}"]`).click();
      await wait(
        () =>
          get('provider-category').getAttribute('aria-expanded') === 'false',
        'category selected'
      );
      return;
    }
    const input = get(id);
    Object.getOwnPropertyDescriptor(
      doc().defaultView.HTMLInputElement.prototype,
      'value'
    ).set.call(input, value);
    get(id).dispatchEvent(
      new Event(id === 'provider-search' ? 'input' : 'change', {
        bubbles: true,
      })
    );
  };
  const choose = (id) =>
    get('provider-grid')
      .querySelector(`[data-provider="${id}"] [role="checkbox"]`)
      .click();
  const inspect = (id) =>
    get('provider-grid')
      .querySelector(`[data-provider="${id}"] .provider-actions button.button`)
      .click();
  const safeCalls = () => {
    check(window.messages.length === 0, 'Selection must never send a message');
    check(
      window.calls.every((c) =>
        ['firecrawl_find_tools', 'firecrawl_credit_usage'].includes(c.name)
      ),
      'Browsing must not execute paid capabilities'
    );
  };
  const load = async (mode = 'normal') => {
    safeCalls();
    document.getElementById('scenario').value = mode;
    const previous = doc();
    document.getElementById('reload').click();
    await wait(
      () =>
        doc() !== previous &&
        get('providers-tab')?.getAttribute('aria-selected') === 'true',
      'usage'
    );
    check(
      !get('providers-view').hidden && get('usage-view').hidden,
      'Providers opens by default'
    );
    check(
      get('providers-tab').getAttribute('aria-selected') === 'true' &&
        get('usage-tab').getAttribute('aria-selected') === 'false',
      'Default tab matches visible view'
    );
    await wait(
      () =>
        !get('catalog-error').hidden ||
        get('provider-count').textContent === '6 providers',
      'catalog'
    );
    check(
      !doc().querySelector(
        'textarea, .selection-tray, #use-in-chat, #use-in-new-chat'
      ),
      'No custom chat composer or sticky tray'
    );
  };
  await load();
  check(
    !window.calls.some((c) => c.name === 'firecrawl_credit_usage'),
    'Provider landing defers usage requests'
  );
  get('providers-tab').focus();
  get('providers-tab').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
  );
  await wait(() => !get('usage-view').hidden, 'keyboard tab switch');
  check(
    doc().activeElement.id === 'usage-tab',
    'Tabs move keyboard focus with selection'
  );
  get('usage-tab').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
  );
  await wait(() => !get('providers-view').hidden, 'keyboard tabs return');
  get('provider-category').focus();
  get('provider-category').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
  );
  await wait(
    () => doc().querySelector('[role="listbox"]'),
    'keyboard dropdown open'
  );
  doc()
    .querySelector('[role="listbox"]')
    .dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
  await wait(
    () =>
      !doc().querySelector('[role="listbox"]') &&
      doc().activeElement.id === 'provider-category',
    'dropdown escape restores focus'
  );
  const logos = [...doc().querySelectorAll('.provider-logo')];
  logos.forEach((image) => {
    image.loading = 'eager';
  });
  await wait(
    () => logos.length === 6 && logos.every((image) => image.naturalWidth > 0),
    'bundled logos'
  );
  check(
    !get('results-tab') && !get('results-view'),
    'Providers and Usage only'
  );
  check(
    window.calls.filter(
      (c) =>
        c.name === 'firecrawl_find_tools' && c.arguments.level === 'providers'
    ).length === 3,
    'Catalog must follow all pages'
  );
  choose('allbirds-com');
  inspect('amazon-com');
  await wait(
    () =>
      get('provider-tools')?.querySelectorAll('[role="checkbox"]').length === 2
  );
  get('provider-tools')
    .querySelector('[aria-label="Select tool Offer"]')
    .click();
  get('provider-tools').querySelector('summary').focus();
  get('provider-tools').querySelector('summary').click();
  await wait(() =>
    get('provider-tools').querySelector('pre')?.textContent.includes('asin')
  );
  check(
    doc().activeElement.tagName === 'SUMMARY',
    'Contract inspection keeps keyboard focus'
  );
  get('close-provider-dialog').click();
  await wait(
    () =>
      selection()?.providers.length === 2 &&
      get('selection-status').textContent.includes('Added'),
    'mixed composer attachment'
  );
  check(
    latest()
      .content.map((c) => c._meta['openai/title'])
      .join(',') === 'Allbirds,Amazon US',
    'Provider names label native annotations'
  );
  check(
    !latest().structuredContent,
    'Removing a native chip must not leave a hidden duplicate of its context'
  );
  check(
    selection().providers[0].capabilities.length === 2 &&
      selection().providers[0].scope === 'provider',
    'Whole provider tool summaries'
  );
  check(
    selection().providers[1].capabilities.length === 1 &&
      selection().providers[1].capabilities[0].options[0].name === 'asin',
    'Exact subset and full contract'
  );
  check(
    latest().content.every(
      (c) =>
        c.text.includes('firecrawl_scrape') && c.text.includes('contractLookup')
    ),
    'Execution guidance reaches native chat context'
  );
  await change('provider-search', 'PubMed');
  check(
    get('provider-grid').children.length === 1,
    'Search finds provider from the last page'
  );
  await change('provider-search', '');
  await change('provider-category', 'finance');
  await wait(() => get('provider-count').textContent === '1 provider');
  check(
    get('selection-count').textContent === '2 selected',
    'Selections survive filters'
  );
  get('clear-selection').click();
  await wait(() => latest()?.content.length === 0, 'clear context');
  check(
    !latest().structuredContent && get('selection-controls').hidden,
    'Clearing removes context attachment and compact controls'
  );
  document.getElementById('scenario').value = 'category-slow';
  window.discoveryResponses = [];
  await change('provider-category', 'shopping');
  await change('provider-category', 'research');
  await wait(
    () =>
      get('provider-count').textContent === '1 provider' &&
      get('provider-grid').textContent.includes('PubMed'),
    'latest category response'
  );
  await wait(
    () => window.discoveryResponses.includes('shopping'),
    'older category response'
  );
  check(
    window.discoveryResponses.indexOf('research') <
      window.discoveryResponses.indexOf('shopping') &&
      get('provider-grid').textContent.includes('PubMed') &&
      !get('provider-grid').textContent.includes('Allbirds'),
    'Reversed category responses preserve latest filter'
  );
  document.getElementById('scenario').value = 'normal';

  await load('context-slow');
  choose('allbirds-com');
  // Change selection while the first host write is still awaiting acknowledgement.
  await wait(() => window.calls.some((c) => c.arguments.level === 'tools'));
  await new Promise((resolve) => setTimeout(resolve, 250));
  choose('amazon-com');
  choose('allbirds-com');
  await wait(
    () =>
      selection()?.providers.length === 1 &&
      selection().providers[0].id === 'amazon-com' &&
      get('selection-status').textContent.includes('Added'),
    'latest serialized context'
  );
  await new Promise((resolve) => setTimeout(resolve, 700));
  check(
    selection().providers.length === 1 &&
      selection().providers[0].id === 'amazon-com',
    'Stale preparation and host acknowledgements cannot replace the latest selection'
  );
  choose('amazon-com');
  await wait(() => latest()?.content.length === 0, 'deselection clear');

  await load('catalog-error');
  check(!get('catalog-error').hidden, 'Catalog failure visible');
  document.getElementById('scenario').value = 'normal';
  get('catalog-retry').click();
  await wait(() => get('provider-count').textContent === '6 providers');
  document.getElementById('scenario').value = 'context-error';
  choose('allbirds-com');
  await wait(() => !get('retry-selection').hidden, 'context failure');
  check(
    get('selection-status').textContent.includes('Could not update') &&
      get('selection-count').textContent === '1 selected',
    'Context error preserves local selection without claiming success'
  );
  document.getElementById('scenario').value = 'normal';
  get('retry-selection').click();
  await wait(
    () =>
      selection()?.providers.length === 1 &&
      get('selection-status').textContent.includes('Added'),
    'context retry'
  );

  await load('zero-tools');
  check(
    get('provider-grid').querySelector(
      '[data-provider="allbirds-com"] [role="checkbox"]'
    ).disabled,
    'Known zero-tool provider cannot be selected'
  );
  await load('empty-tools');
  choose('allbirds-com');
  await wait(
    () =>
      get('provider-grid').querySelector(
        '[data-provider="allbirds-com"] [role="checkbox"]'
      ).disabled,
    'removed provider tools'
  );
  check(
    get('selection-controls').hidden &&
      get('retry-selection').hidden &&
      latest()?.content.length === 0,
    'Empty tool lookup removes selection and clears context without retry'
  );

  await load('tools-error');
  choose('allbirds-com');
  await wait(
    () => !get('retry-selection').hidden,
    'selection preparation failure'
  );
  inspect('amtrak-com');
  await wait(() =>
    get('provider-tools')?.textContent.includes('Could not load')
  );
  document.getElementById('scenario').value = 'normal';
  get('provider-tools').querySelector('button').click();
  await wait(
    () =>
      get('provider-tools')?.querySelectorAll('[role="checkbox"]').length === 2
  );
  document.getElementById('scenario').value = 'tools-error';
  get('provider-tools').querySelector('summary').click();
  await wait(() =>
    get('provider-tools')
      .querySelector('pre')
      ?.textContent.includes('Could not load')
  );
  const details = get('provider-tools').querySelector('details');
  details.open = false;
  await new Promise((resolve) => setTimeout(resolve, 100));
  document.getElementById('scenario').value = 'normal';
  details.open = true;
  await wait(() => details.querySelector('pre')?.textContent.includes('asin'));
  get('close-provider-dialog').click();
  get('retry-selection').click();
  await wait(
    () => selection()?.providers[0].id === 'allbirds-com',
    'preparation retry'
  );

  await load('categories-error');
  await wait(() => get('category-note').textContent.includes('unavailable'));
  check(
    get('provider-grid').children.length === 6,
    'Category failure allows full catalog'
  );
  await load('unsupported-message');
  choose('allbirds-com');
  await wait(
    () => selection()?.providers.length === 1,
    'context without messaging support'
  );
  await load('unsupported-context');
  check(
    [...get('provider-grid').querySelectorAll('[role="checkbox"]')].every(
      (input) => input.disabled
    ),
    'Selection disabled without model-context capability'
  );
  inspect('allbirds-com');
  await wait(
    () =>
      get('provider-tools')?.querySelectorAll('[role="checkbox"]').length === 2
  );
  check(
    [...get('provider-tools')?.querySelectorAll('[role="checkbox"]')].every(
      (input) => input.disabled
    ) && get('select-provider').disabled,
    'Tool selection also capability gated'
  );
  check(
    window.modelContexts.length === 0,
    'Unsupported hosts never receive context writes'
  );

  const usageMode = async (mode) => {
    document.getElementById('scenario').value = mode;
    const previous = doc();
    document.getElementById('reload').click();
    await wait(
      () => doc() !== previous && get('usage-tab'),
      'usage scenario ' + mode
    );
    get('usage-tab').click();
    await wait(
      () =>
        !get('usage-view').hidden &&
        get('balance-section').getAttribute('aria-busy') === 'false' &&
        get('usage-section').getAttribute('aria-busy') === 'false' &&
        window.calls.some((c) => c.arguments.view === 'historical'),
      'usage loaded'
    );
  };
  for (const [mode, remaining, columns, balanceError, historyError] of [
    ['normal', '8,750', 31, false, false],
    ['extra', '1,250', 31, false, false],
    ['zero', '0', 31, false, false],
    ['empty', '8,750', 0, false, false],
    ['metadata', '8,750', 31, false, false],
    ['balance-error', '—', 31, true, false],
    ['history-error', '8,750', 0, false, true],
    ['legacy-history', '8,750', 0, false, true],
    ['error', '—', 0, true, true],
  ]) {
    await usageMode(mode);
    check(get('remaining').textContent === remaining, mode + ' balance');
    check(
      get('history').querySelectorAll('.period').length === columns,
      mode + ' rolling month usage'
    );
    check(
      get('balance-error').hidden === !balanceError,
      mode + ' balance error'
    );
    check(
      get('history-error').hidden === !historyError,
      mode + ' history error'
    );
    if (mode === 'extra')
      check(
        get('plan').textContent === '1,000',
        'Top-ups do not inflate plan allowance'
      );
    if (mode === 'zero')
      check(
        get('history').querySelectorAll('.bar[hidden]').length === 1,
        'Zero usage has no filled bar'
      );
    if (mode === 'empty')
      check(
        get('history').textContent.includes('No usage history yet'),
        'Empty history'
      );
    if (mode === 'metadata')
      check(
        get('billing').textContent === 'Unavailable',
        'Missing billing dates'
      );
  }
  await usageMode('normal');
  const balanceCalls = () =>
    window.calls.filter(
      (c) =>
        c.name === 'firecrawl_credit_usage' && c.arguments.view === 'current'
    ).length;
  const originalBalanceCalls = balanceCalls();
  for (const [range, columns, total, label] of [
    ['day', 25, '3,250', 'Last 24 hours'],
    ['week', 8, '720', 'Last 7 days'],
    ['month', 31, '14,880', 'Last 30 days'],
  ]) {
    get(`usage-${range}-tab`).click();
    await wait(
      () =>
        get(`usage-${range}-tab`).getAttribute('aria-selected') === 'true' &&
        get('usage-section').getAttribute('aria-busy') === 'false',
      range + ' range'
    );
    check(
      get(`usage-${range}-tab`).getAttribute('aria-selected') === 'true',
      range + ' selected'
    );
    check(
      get('history').querySelectorAll('.period').length === columns &&
        get('usage-total').textContent.includes(total),
      range + ' bins and total'
    );
    check(
      get('usage-section').textContent.includes(label),
      range + ' range label'
    );
    check(
      window.calls.some((c) => c.arguments.timeRange === range),
      range + ' passed to MCP'
    );
  }
  check(
    balanceCalls() === originalBalanceCalls,
    'Range changes do not fetch balance again'
  );
  get('usage-month-tab').focus();
  get('usage-month-tab').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
  );
  await wait(() => get('usage-section').getAttribute('aria-busy') === 'false');
  check(
    doc().activeElement === get('usage-day-tab') &&
      get('usage-day-tab').getAttribute('aria-selected') === 'true',
    'Range tabs support keyboard navigation'
  );
  await usageMode('history-slow');
  get('usage-day-tab').click();
  get('usage-week-tab').click();
  await wait(() => get('usage-section').getAttribute('aria-busy') === 'false');
  await new Promise((resolve) => setTimeout(resolve, 900));
  check(
    get('usage-week-tab').getAttribute('aria-selected') === 'true' &&
      get('history').querySelectorAll('.period').length === 8 &&
      get('usage-total').textContent.includes('720'),
    'Slow old range cannot overwrite current range'
  );
  document.getElementById('scenario').value = 'history-error';
  get('usage-day-tab').click();
  await wait(() => !get('history-error').hidden);
  check(
    get('remaining').textContent === '8,750' &&
      !get('history').querySelector('.period'),
    'Range error clears the old chart without clearing balance'
  );
  document.getElementById('scenario').value = 'normal';
  get('usage-month-tab').click();
  await wait(
    () =>
      get('usage-month-tab').getAttribute('aria-selected') === 'true' &&
      get('usage-section').getAttribute('aria-busy') === 'false'
  );
  check(
    get('history-error').hidden &&
      get('history').querySelectorAll('.period').length === 31,
    'Range switching recovers from errors'
  );
  await usageMode('normal');
  document.getElementById('scenario').value = 'error';
  get('refresh').click();
  await wait(
    () => !get('balance-error').hidden && !get('history-error').hidden,
    'failed refresh'
  );
  check(
    get('remaining').textContent === '—' &&
      !get('history').querySelector('.period'),
    'Failed refresh clears stale data'
  );
  document.getElementById('scenario').value = 'normal';
  get('refresh').click();
  await wait(
    () => get('remaining').textContent === '8,750',
    'refresh recovery'
  );
  const previousWidth = document.getElementById('width').value;
  document.getElementById('width').value = '320';
  document.getElementById('width').dispatchEvent(new Event('change'));
  check(get('usage-section').scrollWidth <= get('usage-section').clientWidth && get('history').scrollWidth <= get('history').clientWidth, 'Rolling chart fits narrow screens');
  document.getElementById('width').value = previousWidth;
  document.getElementById('width').dispatchEvent(new Event('change'));
  get('open-dashboard').click();
  await wait(() => window.lastOpenedUrl, 'dashboard link');
  check(
    window.lastOpenedUrl === 'https://www.firecrawl.dev/app/usage',
    'Production dashboard destination'
  );
  const usageWidth = doc()
    .querySelector('.dashboard')
    .getBoundingClientRect().width;
  get('providers-tab').click();
  await wait(
    () => get('provider-count').textContent === '6 providers',
    'providers for visual checks'
  );
  check(
    doc().querySelector('.dashboard').getBoundingClientRect().width ===
      usageWidth,
    'Consistent Providers and Usage width'
  );
  inspect('allbirds-com');
  await wait(
    () => get('provider-dialog')?.getAttribute('data-state') === 'open',
    'provider modal'
  );
  for (const mode of ['dark', 'light']) {
    const control = document.getElementById('theme');
    control.value = mode;
    control.dispatchEvent(new Event('change'));
    await wait(
      () => doc().documentElement.dataset.theme === mode,
      'live theme change'
    );
    const style = doc().defaultView.getComputedStyle(
      doc().querySelector('[data-state="open"].backdrop-blur-md')
    );
    const canvas = doc().createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    context.fillStyle = style.backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const [red, , , alpha] = context.getImageData(0, 0, 1, 1).data;
    check(mode === 'dark' ? red < 30 : red > 230, mode + ' modal backdrop');
    check(
      alpha > 195 && alpha < 210 && style.backdropFilter === 'blur(12px)',
      'Firecrawl modal overlay'
    );
  }
  document.getElementById('view').style.height = '420px';
  const toolsPane = get('provider-tools');
  await wait(
    () => toolsPane.scrollHeight > toolsPane.clientHeight,
    'dialog scroll region'
  );
  const footer = get('provider-dialog').querySelector('.dialog-footer');
  await wait(
    () =>
      doc().defaultView.innerHeight === 420 &&
      footer.getBoundingClientRect().bottom <= 420,
    'Dialog actions fit a short viewport'
  );
  toolsPane.scrollTop = toolsPane.scrollHeight;
  check(
    footer.getBoundingClientRect().bottom <= 420,
    'Dialog actions remain visible while scrolling'
  );
  get('provider-dialog').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  );
  await wait(() => !get('provider-dialog'), 'dialog closes on Escape');
  await wait(
    () => doc().activeElement?.textContent === 'View tools',
    'dialog restores focus'
  );
  document.getElementById('view').style.height = '940px';
  document.getElementById('width').value = '320';
  document.getElementById('width').dispatchEvent(new Event('change'));
  check(
    doc().documentElement.scrollWidth <= 320,
    'No horizontal page overflow on mobile'
  );
  get('usage-tab').click();
  check(doc().documentElement.scrollWidth <= 320, 'Usage fits mobile width');
  safeCalls();
  check(window.previewErrors.length === 0, 'No preview JavaScript errors');
  return {
    passed: true,
    checks: [
      'rolling usage ranges, independent balance, keyboard navigation, stale responses and recovery',
      'zero-tool and empty-tool providers',
      'reversed category responses',
      'providers opens by default',
      'keyboard tabs, dropdown Escape and focus restoration',
      'short viewport dialog scrolling and visible actions',
      'pagination and search',
      'category races',
      'mixed named context annotations',
      'exact contracts',
      'replacement and clearing',
      'concurrent selection',
      'context and discovery retries',
      'host capability gates',
      'no message or paid execution',
      'no custom chatbox or sticky tray',
      'all usage states and partial failures',
      'refresh clearing and recovery',
      'production dashboard link',
      'consistent tab widths and mobile layout',
      'live theme changes and modal backdrops',
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
