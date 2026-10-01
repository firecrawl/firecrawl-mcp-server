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
  const change = (id, value) => {
    if (id === 'provider-category') {
      doc().querySelector(`[data-category="${value}"]`).click();
      return;
    }
    get(id).value = value;
    get(id).dispatchEvent(
      new Event(id === 'provider-search' ? 'input' : 'change', {
        bubbles: true,
      })
    );
  };
  const choose = (id) =>
    get('provider-grid').querySelector(`[data-provider="${id}"] input`).click();
  const inspect = (id) =>
    get('provider-grid')
      .querySelector(`[data-provider="${id}"] button`)
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
      () => doc() !== previous && get('remaining')?.textContent === '8,750',
      'usage'
    );
    get('providers-tab').click();
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
  const logos = [...get('provider-grid').querySelectorAll('.provider-logo')];
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
    () => get('provider-tools').querySelectorAll('input').length === 2
  );
  get('provider-tools')
    .querySelector('[data-capability="products/offer"]')
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
  change('provider-search', 'PubMed');
  check(
    get('provider-grid').children.length === 1,
    'Search finds provider from the last page'
  );
  change('provider-search', '');
  change('provider-category', 'finance');
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
  change('provider-category', 'shopping');
  change('provider-category', 'research');
  await wait(
    () =>
      get('provider-count').textContent === '1 provider' &&
      get('provider-grid').textContent.includes('PubMed'),
    'latest category response'
  );

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

  await load('tools-error');
  choose('allbirds-com');
  await wait(
    () => !get('retry-selection').hidden,
    'selection preparation failure'
  );
  inspect('amtrak-com');
  await wait(() =>
    get('provider-tools').textContent.includes('Could not load')
  );
  document.getElementById('scenario').value = 'normal';
  get('provider-tools').querySelector('button').click();
  await wait(
    () => get('provider-tools').querySelectorAll('input').length === 2
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
    [...get('provider-grid').querySelectorAll('input')].every(
      (input) => input.disabled
    ),
    'Selection disabled without model-context capability'
  );
  inspect('allbirds-com');
  await wait(
    () => get('provider-tools').querySelectorAll('input').length === 2
  );
  check(
    [...get('provider-tools').querySelectorAll('input')].every(
      (input) => input.disabled
    ) && get('select-provider').disabled,
    'Tool selection also capability gated'
  );
  check(
    window.modelContexts.length === 0,
    'Unsupported hosts never receive context writes'
  );
  safeCalls();
  check(window.previewErrors.length === 0, 'No preview JavaScript errors');
  return {
    passed: true,
    checks: [
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
