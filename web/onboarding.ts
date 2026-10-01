import type { App } from '@modelcontextprotocol/ext-apps';
import type { providersBrowser } from './providers';
import { preferenceStore } from './preferences';
import { providerMark } from './provider-logo';

const el = (id: string) => document.getElementById(id)!;
const btn = (id: string) => el(id) as HTMLButtonElement;
type Browser = ReturnType<typeof providersBrowser>;

export function createOnboarding(
  app: App,
  ready: () => Promise<void>,
  providers: Browser,
  showDirectory: () => void,
  loadUsage: () => Promise<void>
) {
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    /* Sandboxed hosts may block storage. */
  }
  const store = preferenceStore(storage);
  let active = false;
  let step = 1;
  let busy = false;
  let checking = false;
  const previewNames = [
    ['allbirds-com', 'Allbirds'],
    ['amazon-com', 'Amazon'],
    ['github-com', 'GitHub'],
    ['arxiv-org', 'arXiv'],
    ['pubmed-ncbi-nlm-nih-gov', 'PubMed'],
  ];
  for (const [id, name] of previewNames) {
    const mark = providerMark({ id, name, description: '' });
    el('onboarding-art').append(mark);
  }
  const flame = document.querySelector('.brand-icon')!.cloneNode(true);
  el('onboarding-art').append(flame);

  function feedback(message = '') {
    el('onboarding-feedback').textContent = message;
  }
  function lock(locked: boolean) {
    busy = locked;
    el('providers-view').inert = locked;
    for (const id of [
      'onboarding-skip',
      'onboarding-back-welcome',
      'onboarding-next',
      'onboarding-back-sources',
      'onboarding-attach',
      'manage-sources',
      'add-saved-sources',
    ])
      btn(id).disabled = locked;
  }
  function savedSources() {
    const value = store.read();
    el('saved-sources').hidden =
      active || !value.sources.length || el('providers-view').hidden;
    el('saved-sources-count').textContent =
      `${value.sources.length} saved ${value.sources.length === 1 ? 'source' : 'sources'}. Add them when you want to use them in a chat.`;
    el('onboarding-storage-note').hidden = store.persistent();
  }
  function selectionChanged() {
    const selections = providers.selection();
    el('onboarding-source-count').textContent = selections.length
      ? `${selections.length} ${selections.length === 1 ? 'source' : 'sources'} selected`
      : 'No sources selected';
    // Current-chat selection and saved source preferences are separate.
    // Clearing a chat attachment must not forget the user's saved sources.
    if (!active) savedSources();
  }
  function showStep(next: number) {
    step = next;
    feedback();
    el('onboarding-view').hidden = false;
    el('onboarding-welcome').hidden = step !== 1;
    el('onboarding-sources').hidden = step !== 2;
    el('onboarding-finish').hidden = step !== 3;
    el('providers-view').hidden = step !== 2;
    el('usage-view').hidden = true;
    el('saved-sources').hidden = true;
    document.querySelector<HTMLElement>('.app-tabs')!.hidden = true;
    document.querySelector<HTMLElement>('.heading-row')!.hidden = true;
    el('page-description').hidden = true;
    el('manage-sources').hidden = true;
    document.querySelector<HTMLElement>('.dashboard')!.dataset.onboarding =
      'true';
    for (const item of document.querySelectorAll<HTMLElement>('[data-step]')) {
      item.dataset.active = String(Number(item.dataset.step) === step);
      if (Number(item.dataset.step) === step)
        item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    }
    const panel = el(
      step === 1
        ? 'onboarding-welcome'
        : step === 2
          ? 'onboarding-sources'
          : 'onboarding-finish'
    );
    panel.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (step === 3) renderFinish();
  }
  async function checkConnection() {
    if (checking) return;
    checking = true;
    btn('onboarding-start').disabled = true;
    el('onboarding-retry').hidden = true;
    el('onboarding-connection').textContent =
      'Checking your Firecrawl connection…';
    el('onboarding-connection-indicator').dataset.connected = 'false';
    try {
      await ready();
      if (!app.getHostCapabilities()?.serverTools)
        throw new Error('Tool calls unavailable');
      const result = await app.callServerTool(
        { name: 'firecrawl_credit_usage', arguments: { view: 'current' } },
        { timeout: 15000 }
      );
      const value =
        result.structuredContent ??
        JSON.parse(
          result.content.find((item) => item.type === 'text')?.text ?? 'null'
        );
      if (result.isError || typeof value?.remainingCredits !== 'number')
        throw new Error('Account unavailable');
      el('onboarding-connection').textContent = 'Firecrawl connected';
      el('onboarding-connection-indicator').dataset.connected = 'true';
      el('onboarding-credit-note').textContent =
        `${new Intl.NumberFormat().format(value.remainingCredits)} credits available. Browsing providers is free.`;
      btn('onboarding-start').disabled = false;
    } catch {
      el('onboarding-connection').textContent =
        'Connect your Firecrawl account to get started';
      el('onboarding-credit-note').textContent =
        'Open this plugin’s connection settings in Plugins, connect your account, then retry here.';
      el('onboarding-retry').hidden = false;
    } finally {
      checking = false;
    }
  }
  async function chooseSources(restore = false) {
    if (busy) return;
    showStep(2);
    if (!restore) return;
    lock(true);
    try {
      const missing = await providers.restore(store.read().sources);
      if (missing)
        feedback(
          `${missing} saved ${missing === 1 ? 'source is' : 'sources are'} no longer in the catalog. Choose a replacement below.`
        );
    } catch {
      feedback(
        'Could not load your sources. Retry the catalog below, or skip setup for now.'
      );
    } finally {
      lock(false);
      selectionChanged();
    }
  }
  function renderFinish() {
    const selections = providers.selection();
    const list = el('onboarding-selected');
    list.replaceChildren();
    for (const { provider, tools } of selections) {
      const chip = document.createElement('div');
      chip.className = 'onboarding-source-chip';
      const label = document.createElement('span');
      label.textContent = `${provider.name}${tools ? ` · ${tools.length} tools` : ''}`;
      chip.append(providerMark(provider), label);
      list.append(chip);
    }
    const names = selections.map((s) => s.provider.name).join(' and ');
    const examples = names
      ? [
          `What can I do with ${names}?`,
          `Find useful information from ${names} and summarize it with sources.`,
        ]
      : ['Find a source for my next research question.'];
    el('onboarding-examples').replaceChildren(
      ...examples.map((example) => {
        const p = document.createElement('p');
        p.textContent = example;
        return p;
      })
    );
    const canAttach = !!app.getHostCapabilities()?.updateModelContext;
    btn('onboarding-attach').textContent =
      selections.length && canAttach
        ? 'Add sources to chat →'
        : 'Finish setup →';
    el('onboarding-host-note').textContent =
      !canAttach && selections.length
        ? 'This host cannot attach sources. We can save your choices; open a supported chat to use them.'
        : 'You write and send the request in your chat. Tool execution uses the provider’s published credit price.';
  }
  function leave() {
    active = false;
    providers.setDraftMode(false);
    el('onboarding-view').hidden = true;
    document.querySelector<HTMLElement>('.app-tabs')!.hidden = false;
    document.querySelector<HTMLElement>('.heading-row')!.hidden = false;
    el('page-description').hidden = false;
    el('manage-sources').hidden = false;
    delete document.querySelector<HTMLElement>('.dashboard')!.dataset
      .onboarding;
    showDirectory();
    savedSources();
    void loadUsage();
    btn('manage-sources').focus({ preventScroll: true });
  }
  async function finish(attach: boolean) {
    if (busy) return;
    lock(true);
    feedback();
    try {
      if (
        attach &&
        providers.selection().length &&
        app.getHostCapabilities()?.updateModelContext
      ) {
        feedback('Adding your sources to this chat…');
        if (!(await providers.publish())) {
          feedback(
            'Could not add your sources. Your choices are still here. Retry, change sources, or skip for now.'
          );
          return;
        }
      }
      store.write({
        version: 1,
        completed: true,
        sources: providers.preferences(),
      });
      if (!attach || !app.getHostCapabilities()?.updateModelContext)
        providers.resetSelection();
      leave();
    } finally {
      lock(false);
    }
  }
  async function manage() {
    if (busy) return;
    active = true;
    providers.setDraftMode(true);
    await chooseSources(true);
  }
  async function addSaved() {
    if (busy) return;
    lock(true);
    providers.setDraftMode(true);
    const status = el('saved-sources-status');
    status.textContent = 'Adding saved sources…';
    try {
      const missing = await providers.restore(store.read().sources);
      if (missing)
        throw new Error(
          'Some saved sources are unavailable. Choose Manage sources to review them.'
        );
      if (!(await providers.publish()))
        throw new Error(
          'Could not attach sources. Check your connection and host support, then retry.'
        );
      status.textContent =
        'Added to chat. Type your request in the native composer.';
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : 'Could not add sources.';
    } finally {
      providers.setDraftMode(false);
      lock(false);
    }
  }
  btn('onboarding-start').addEventListener('click', () => {
    void chooseSources(true);
  });
  btn('onboarding-retry').addEventListener('click', () => {
    void checkConnection();
  });
  btn('onboarding-next').addEventListener('click', () => showStep(3));
  btn('onboarding-back-welcome').addEventListener('click', () => {
    showStep(1);
    void checkConnection();
  });
  btn('onboarding-back-sources').addEventListener('click', () => {
    void chooseSources();
  });
  btn('onboarding-skip').addEventListener('click', () => {
    void finish(false);
  });
  btn('onboarding-attach').addEventListener('click', () => {
    void finish(true);
  });
  btn('manage-sources').addEventListener('click', () => {
    void manage();
  });
  btn('add-saved-sources').addEventListener('click', () => {
    void addSaved();
  });
  return {
    selectionChanged,
    viewChanged: savedSources,
    start() {
      if (store.read().completed) {
        leave();
        return;
      }
      active = true;
      providers.setDraftMode(true);
      showStep(1);
      savedSources();
      void checkConnection();
    },
  };
}
