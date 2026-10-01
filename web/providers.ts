import { providerMark } from './provider-logo';
import type { App } from '@modelcontextprotocol/ext-apps';
import type { SourcePreference } from './preferences';
import {
  buildSelectionContext,
  capabilityFrom,
  catalogPage,
  nextPage,
  providerFrom,
  type Capability,
  type JsonRecord,
  type Provider,
  type Selection,
} from './catalog';

const el = (id: string) => document.getElementById(id)!;
const button = (label: string, className = 'secondary-button') => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  return b;
};
const text = (tag: string, value: string, className = '') => {
  const e = document.createElement(tag);
  e.textContent = value;
  e.className = className;
  return e;
};

export function providersBrowser(
  app: App,
  ready: () => Promise<void>,
  onSelectionChange: () => void = () => undefined
) {
  const search = el('provider-search') as HTMLInputElement;
  const categoryNav = el('provider-categories');
  let category = '';
  let categories: { id: string; label: string; description?: string }[] = [];
  const dialog = el('provider-dialog') as HTMLDialogElement;
  const retrySelection = el('retry-selection') as HTMLButtonElement;
  const selected = new Map<
    string,
    { provider: Provider; tools: Set<string> | null }
  >();
  const toolCache = new Map<string, Promise<Capability[]>>();
  const contractCache = new Map<string, Promise<Capability>>();
  let providers: Provider[] = [],
    generation = 0,
    loading = false,
    initialized = false;
  let selectionVersion = 0;
  let contextQueue: Promise<void> = Promise.resolve();
  let dialogProvider: Provider | undefined,
    dialogTools: Capability[] = [],
    dialogGeneration = 0;
  let canContext = false;
  let draftMode = false;
  let activation: Promise<void> | undefined;

  async function call(args: JsonRecord, level: string) {
    await ready();
    return catalogPage(
      await app.callServerTool(
        { name: 'firecrawl_find_tools', arguments: args },
        { timeout: 30000 }
      ),
      level
    );
  }
  async function all(args: JsonRecord, level: string): Promise<JsonRecord[]> {
    const rows: JsonRecord[] = [],
      seen = new Set<string>();
    let next: JsonRecord | undefined = args,
      version: unknown;
    for (let pages = 0; next; pages++) {
      if (pages >= 100 || seen.has(JSON.stringify(next)))
        throw new Error('Catalog pagination did not finish');
      seen.add(JSON.stringify(next));
      const page = await call(next, level);
      if (version && page.catalogueVersion && page.catalogueVersion !== version)
        throw new Error('Catalog changed; retry');
      version = page.catalogueVersion ?? version;
      rows.push(...page.items);
      next = nextPage(page, level);
    }
    return rows;
  }
  function tools(provider: Provider): Promise<Capability[]> {
    if (!toolCache.has(provider.id)) {
      const promise = all(
        { providers: [provider.id], level: 'tools', expand: [], limit: 100 },
        'tools'
      )
        .then((rows) => rows.map((row) => capabilityFrom(row, provider.id)))
        .catch((error) => {
          toolCache.delete(provider.id);
          throw error;
        });
      toolCache.set(provider.id, promise);
    }
    return toolCache.get(provider.id)!;
  }
  function contract(provider: string, capability: string): Promise<Capability> {
    const key = JSON.stringify([provider, capability]);
    if (!contractCache.has(key)) {
      const promise = all(
        {
          providers: [provider],
          capabilities: [capability],
          level: 'tools',
          expand: ['options', 'response'],
          limit: 100,
        },
        'tools'
      )
        .then((rows) => {
          const row = rows.find(
            (r) => r.provider === provider && r.capability === capability
          );
          if (!row) throw new Error('This capability is no longer available');
          return capabilityFrom(row, provider);
        })
        .catch((error) => {
          contractCache.delete(key);
          throw error;
        });
      contractCache.set(key, promise);
    }
    return contractCache.get(key)!;
  }
  function renderSelection() {
    el('selection-controls').hidden = selected.size === 0;
    el('selection-count').textContent = `${selected.size} selected`;
    (el('clear-selection') as HTMLButtonElement).disabled = !selected.size;
  }
  function checkbox(provider: Provider) {
    const label = text('label', '', 'provider-select');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.disabled = !canContext && !draftMode;
    input.checked = selected.has(provider.id);
    input.indeterminate = selected.get(provider.id)?.tools != null;
    input.setAttribute('aria-label', `Select ${provider.name}`);
    input.addEventListener('change', () => {
      if (input.checked) selected.set(provider.id, { provider, tools: null });
      else selected.delete(provider.id);
      changed();
    });
    label.append(input, text('span', 'Select'));
    return label;
  }
  function providerCard(provider: Provider) {
    const card = text('article', '', 'provider-card');
    card.dataset.selected = String(selected.has(provider.id));
    card.dataset.provider = provider.id;
    const head = text('div', '', 'provider-card-header');
    const mark = providerMark(provider);
    const title = text('div', '', 'provider-identity');
    title.append(
      text('h3', provider.name),
      text('p', provider.id, 'provider-id')
    );
    head.append(mark, title);
    const actions = text('div', '', 'provider-actions');
    const inspect = button('View tools');
    inspect.addEventListener('click', () => {
      void inspectProvider(provider);
    });
    actions.append(checkbox(provider), inspect);
    card.append(head, text('p', provider.description, 'provider-description'));
    if (provider.toolCount !== undefined)
      card.append(
        text('span', `${provider.toolCount} tools`, 'provider-tool-count')
      );
    card.append(actions);
    return card;
  }
  function chooseCategory(id: string) {
    if (id === category) return;
    category = id;
    renderCategories();
    void loadProviders();
  }
  function renderCategories() {
    const focused = (document.activeElement as HTMLElement | null)?.dataset
      .category;
    categoryNav.replaceChildren();
    for (const item of [{ id: '', label: 'All' }, ...categories]) {
      const tab = button(item.label, 'provider-category-tab');
      tab.dataset.category = item.id;
      tab.setAttribute('aria-pressed', String(item.id === category));
      if ('description' in item && item.description)
        tab.title = item.description;
      tab.addEventListener('click', () => chooseCategory(item.id));
      categoryNav.append(tab);
    }
    if (focused !== undefined) {
      const tab = [
        ...categoryNav.querySelectorAll<HTMLButtonElement>('button'),
      ].find((item) => item.dataset.category === focused);
      tab?.focus({ preventScroll: true });
    }
  }
  function renderShelf(id: string, label: string, items: Provider[]) {
    const shelf = text('section', '', 'provider-shelf');
    const heading = text('div', '', 'provider-shelf-heading');
    const title = text('h2', label);
    title.id = `provider-shelf-${id}`;
    shelf.setAttribute('aria-labelledby', title.id);
    const identity = text('div', '', 'provider-shelf-identity');
    identity.append(title, text('span', String(items.length), 'label'));
    const actions = text('div', '', 'provider-shelf-actions');
    const row = text('div', '', 'provider-shelf-row');
    row.setAttribute('role', 'region');
    row.setAttribute('aria-label', `${label} providers`);
    row.tabIndex = 0;
    if (items.length > 4) {
      for (const direction of [-1, 1]) {
        const scroll = button(
          direction < 0 ? '‹' : '›',
          'provider-shelf-arrow'
        );
        scroll.setAttribute(
          'aria-label',
          `Scroll ${label} ${direction < 0 ? 'back' : 'forward'}`
        );
        scroll.addEventListener('click', () =>
          row.scrollBy({
            left: direction * row.clientWidth,
            behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'instant'
              : 'smooth',
          })
        );
        actions.append(scroll);
      }
    }
    const viewAll = button('View all →', 'text-button');
    viewAll.setAttribute(
      'aria-label',
      `View all ${items.length} ${label} providers`
    );
    viewAll.addEventListener('click', () => chooseCategory(id));
    actions.append(viewAll);
    heading.append(identity, actions);
    for (const provider of items.slice(0, 12))
      row.append(providerCard(provider));
    shelf.append(heading, row);
    return shelf;
  }
  function renderProviders() {
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = providers.filter((p) =>
      `${p.name} ${p.id} ${p.description}`.toLocaleLowerCase().includes(query)
    );
    const grid = el('provider-grid');
    grid.replaceChildren();
    const collection = categories.find((item) => item.id === category);
    el('provider-collection-heading').hidden = !category;
    el('provider-collection-title').textContent = collection?.label ?? category;
    el('provider-count').textContent = loading
      ? 'Loading providers…'
      : `${filtered.length} ${query ? 'matching ' : ''}${filtered.length === 1 ? 'provider' : 'providers'}`;
    const shelves =
      !category && !query
        ? categories
            .map((item) => ({
              ...item,
              providers: filtered.filter((provider) =>
                provider.categories?.includes(
                  item.id.toLocaleLowerCase().replaceAll(' ', '-')
                )
              ),
            }))
            .filter((item) => item.providers.length)
            .sort((a, b) => b.providers.length - a.providers.length)
        : [];
    grid.classList.toggle('provider-collections', shelves.length > 0);
    if (shelves.length) {
      for (const shelf of shelves)
        grid.append(renderShelf(shelf.id, shelf.label, shelf.providers));
      const grouped = new Set(
        shelves.flatMap((shelf) =>
          shelf.providers.map((provider) => provider.id)
        )
      );
      const remaining = filtered.filter(
        (provider) => !grouped.has(provider.id)
      );
      if (remaining.length) {
        const group = text('section', '', 'provider-unclassified');
        group.append(text('h2', 'More providers'));
        const cards = text('div', '', 'provider-grid');
        cards.append(...remaining.map(providerCard));
        group.append(cards);
        grid.append(group);
      }
    } else {
      grid.append(...filtered.map(providerCard));
    }
    el('provider-empty').hidden = loading || filtered.length > 0;
    el('provider-empty').textContent = query
      ? 'No providers match your search. Try a different name or category.'
      : 'No providers in this category.';
  }
  function changed() {
    renderSelection();
    onSelectionChange();
    if (!draftMode) void syncSelection();
    else
      el('selection-status').textContent =
        'Choose your sources. They will be added to chat when you finish setup.';
    for (const card of el('provider-grid').querySelectorAll<HTMLElement>(
      '.provider-card'
    )) {
      const selection = selected.get(card.dataset.provider!);
      card.dataset.selected = String(!!selection);
      const input = card.querySelector<HTMLInputElement>('input')!;
      input.checked = !!selection;
      input.indeterminate = selection?.tools != null;
    }
    if (dialog.open && dialogProvider) {
      const selection = selected.get(dialogProvider.id);
      for (const input of el(
        'provider-tools'
      ).querySelectorAll<HTMLInputElement>('input'))
        input.checked =
          !!selection &&
          (selection.tools === null ||
            selection.tools.has(input.dataset.capability!));
      el('select-provider').textContent =
        selection?.tools === null ? 'Remove provider' : 'Select provider';
    }
  }
  function renderDialogTools() {
    const list = el('provider-tools');
    list.replaceChildren();
    if (!dialogProvider) return;
    const provider = dialogProvider;
    for (const capability of dialogTools) {
      const row = text('article', '', 'capability-row');
      const heading = text('label', '', 'capability-heading');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.disabled = !canContext && !draftMode;
      const selection = selected.get(provider.id);
      check.checked =
        !!selection &&
        (selection.tools === null ||
          selection.tools.has(capability.capability));
      check.setAttribute('aria-label', `Select tool ${capability.name}`);
      check.dataset.capability = capability.capability;
      check.addEventListener('change', () => {
        const current = selected.get(provider.id);
        const ids =
          current?.tools === null
            ? new Set(dialogTools.map((t) => t.capability))
            : new Set(current?.tools ?? []);
        if (check.checked) ids.add(capability.capability);
        else ids.delete(capability.capability);
        if (ids.size) selected.set(provider.id, { provider, tools: ids });
        else selected.delete(provider.id);
        changed();
      });
      heading.append(check, text('strong', capability.name));
      row.append(
        heading,
        text('code', capability.capability, 'capability-id'),
        text('p', capability.description)
      );
      if (capability.creditsCost !== undefined)
        row.append(
          text(
            'span',
            `${capability.creditsCost} credits${capability.perRecord ? ' / record' : ' / call'}`,
            'badge'
          )
        );
      const details = document.createElement('details');
      const summary = text('summary', 'Input and output contract');
      details.append(summary);
      details.addEventListener('toggle', () => {
        if (!details.open || details.dataset.loaded) return;
        details.dataset.loaded = 'loading';
        details.querySelector('pre')?.remove();
        const body = text('pre', 'Loading contract…', 'contract');
        details.append(body);
        void contract(provider.id, capability.capability)
          .then((data) => {
            body.textContent = JSON.stringify(
              {
                options: data.options,
                requiresOneOf: data.requiresOneOf,
                response: data.response,
              },
              null,
              2
            );
            details.dataset.loaded = 'true';
          })
          .catch(() => {
            body.textContent =
              'Could not load the contract. Close and reopen to retry.';
            delete details.dataset.loaded;
          });
      });
      row.append(details);
      list.append(row);
    }
    if (!dialogTools.length)
      list.append(
        text(
          'p',
          'No tools are currently available for this provider.',
          'empty'
        )
      );
    const selectAll = el('select-provider') as HTMLButtonElement;
    selectAll.disabled = (!canContext && !draftMode) || !dialogTools.length;
    selectAll.textContent =
      selected.get(provider.id)?.tools === null
        ? 'Remove provider'
        : 'Select provider';
  }
  async function inspectProvider(provider: Provider) {
    dialogProvider = provider;
    dialogTools = [];
    const current = ++dialogGeneration;
    el('provider-dialog-name').textContent = provider.name;
    el('provider-dialog-description').textContent = provider.description;
    el('provider-tools').replaceChildren(text('p', 'Loading tools…', 'empty'));
    (el('select-provider') as HTMLButtonElement).disabled = true;
    if (!dialog.open) dialog.showModal();
    try {
      const available = await tools(provider);
      if (current !== dialogGeneration) return;
      dialogTools = available;
      renderDialogTools();
    } catch {
      if (current !== dialogGeneration) return;
      const retry = button('Retry');
      retry.addEventListener('click', () => {
        void inspectProvider(provider);
      });
      el('provider-tools').replaceChildren(
        text(
          'p',
          'Could not load tools. Check your Firecrawl connection and retry.',
          'error'
        ),
        retry
      );
    }
  }
  async function loadProviders() {
    const current = ++generation;
    loading = true;
    providers = [];
    renderProviders();
    el('catalog-error').hidden = true;
    (el('catalog-retry') as HTMLButtonElement).disabled = true;
    const args: JsonRecord = {
      level: 'providers',
      limit: 100,
      ...(category ? { categories: [category] } : {}),
    };
    try {
      const rows = await all(args, 'providers');
      if (current !== generation) return;
      providers = [
        ...new Map(
          rows.map((row) => {
            const p = providerFrom(row);
            return [p.id, p];
          })
        ).values(),
      ];
    } catch {
      if (current !== generation) return;
      el('catalog-error').hidden = false;
      el('catalog-error-message').textContent =
        'Could not load the Alexandria catalog. Check your Firecrawl connection and account access, then retry.';
    } finally {
      if (current === generation) {
        loading = false;
        (el('catalog-retry') as HTMLButtonElement).disabled = false;
        renderProviders();
      }
    }
  }
  async function loadCategories() {
    try {
      const rows = await all({ level: 'categories', limit: 100 }, 'categories');
      categories = [
        ...new Map(
          rows
            .filter(
              (row) =>
                typeof row.id === 'string' &&
                row.id &&
                row.id.toLocaleLowerCase() !== 'all'
            )
            .map((row) => {
              const id = String(row.id);
              return [
                id,
                {
                  id,
                  label: id
                    .split('-')
                    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                    .join(' '),
                  ...(typeof row.description === 'string'
                    ? { description: row.description }
                    : {}),
                },
              ];
            })
        ).values(),
      ];
      if (category && !categories.some((item) => item.id === category))
        category = '';
      el('category-note').textContent = '';
      renderCategories();
      renderProviders();
    } catch {
      el('category-note').textContent =
        'Categories unavailable. You can still search all providers.';
    }
  }
  async function syncSelection(): Promise<boolean> {
    if (!canContext) return false;
    const version = ++selectionVersion;
    const snapshot = [...selected.values()].map((s) => ({
      provider: s.provider,
      tools: s.tools ? new Set(s.tools) : null,
    }));
    retrySelection.hidden = true;
    el('selection-status').textContent = snapshot.length
      ? 'Adding tools to your chat…'
      : 'Updating chat selection…';
    try {
      const selections: Selection[] = [];
      for (const selection of snapshot) {
        if (version !== selectionVersion) return false;
        const available = await tools(selection.provider);
        const chosen = selection.tools
          ? available.filter((t) => selection.tools!.has(t.capability))
          : available;
        if (selection.tools && chosen.length !== selection.tools.size)
          throw new Error(
            'Some selected tools are no longer available. Review your selection.'
          );
        const capabilities = selection.tools
          ? await Promise.all(
              chosen.map((t) => contract(t.provider, t.capability))
            )
          : chosen;
        selections.push({
          provider: selection.provider,
          capabilities,
          scope: selection.tools ? 'tools' : 'provider',
        });
      }
      if (version !== selectionVersion) return false;
      const { content } = buildSelectionContext(selections);
      // Serialize host writes and discard stale preparation when selection changes.
      // Each provider lives in its removable native content block. A hidden
      // structured copy would survive when the user removes a composer chip.
      const payload = { content };
      const publish = contextQueue
        .catch(() => undefined)
        .then(async () => {
          if (version !== selectionVersion) return;
          await app.updateModelContext(payload, { timeout: 15000 });
        });
      contextQueue = publish;
      await publish;
      if (version !== selectionVersion) return false;
      el('selection-status').textContent = content.length
        ? 'Added to chat. Type your request in the chat composer.'
        : 'Select providers to add their tools to your chat.';
      return true;
    } catch (error) {
      if (version !== selectionVersion) return false;
      retrySelection.hidden = false;
      el('selection-status').textContent =
        error instanceof Error &&
        /selection|selected|large/i.test(error.message)
          ? error.message
          : 'Could not update chat context. Your selection is saved here; retry.';
      return false;
    }
  }
  search.addEventListener('input', renderProviders);
  el('all-provider-collections').addEventListener('click', () => {
    search.value = '';
    chooseCategory('');
  });
  el('catalog-retry').addEventListener('click', () => {
    if (initialized) void loadProviders();
    else void activate();
  });
  el('clear-selection').addEventListener('click', () => {
    selected.clear();
    changed();
  });
  el('close-provider-dialog').addEventListener('click', () => dialog.close());
  el('select-provider').addEventListener('click', () => {
    if (!dialogProvider || (!canContext && !draftMode)) return;
    if (selected.get(dialogProvider.id)?.tools === null)
      selected.delete(dialogProvider.id);
    else
      selected.set(dialogProvider.id, {
        provider: dialogProvider,
        tools: null,
      });
    changed();
  });
  retrySelection.addEventListener('click', () => {
    void syncSelection();
  });
  renderSelection();
  async function initialize() {
    if (initialized) return;
    try {
      await ready();
      canContext = !!app.getHostCapabilities()?.updateModelContext;
      el('selection-status').textContent = canContext
        ? 'Select providers to add their tools to your chat.'
        : 'This host cannot attach selections. Open the app in ChatGPT with a chat composer available.';
      renderSelection();
      initialized = true;
      await Promise.all([loadProviders(), loadCategories()]);
    } catch {
      el('catalog-error').hidden = false;
      el('catalog-error-message').textContent =
        'Could not connect. Open the app through the Firecrawl plugin and retry.';
    }
  }
  function activate(): Promise<void> {
    if (!activation)
      activation = initialize().finally(() => {
        activation = undefined;
      });
    return activation;
  }
  return {
    selection: () =>
      [...selected.values()].map(({ provider, tools }) => ({
        provider,
        tools: tools === null ? null : [...tools],
      })),
    preferences: (): SourcePreference[] =>
      [...selected.values()].map(({ provider, tools }) => ({
        id: provider.id,
        tools: tools === null ? null : [...tools],
      })),
    setDraftMode(draft: boolean) {
      draftMode = draft;
      selectionVersion++;
      retrySelection.hidden = true;
      if (draft)
        el('selection-status').textContent =
          'Choose your sources. They will be added to chat when you finish setup.';
      else if (!selected.size || !canContext)
        el('selection-status').textContent = canContext
          ? 'Select providers to add their tools to your chat.'
          : 'This host cannot attach selections. Open the app in ChatGPT with a chat composer available.';
      renderProviders();
    },
    async restore(sources: SourcePreference[]) {
      await activate();
      if (category) {
        category = '';
        renderCategories();
        await loadProviders();
      }
      // Resolve stored IDs against the current authenticated catalog.
      if (!el('catalog-error').hidden) throw new Error('Catalog unavailable');
      selected.clear();
      for (const source of sources) {
        const provider = providers.find((p) => p.id === source.id);
        if (provider)
          selected.set(source.id, {
            provider,
            tools: source.tools === null ? null : new Set(source.tools),
          });
      }
      search.value = '';
      renderProviders();
      renderSelection();
      onSelectionChange();
      return sources.length - selected.size;
    },
    publish: syncSelection,
    resetSelection() {
      selected.clear();
      renderProviders();
      renderSelection();
    },
    async refresh() {
      toolCache.clear();
      contractCache.clear();
      if (dialog.open) dialog.close();
      if (initialized) {
        await loadCategories();
        await loadProviders();
        if (selected.size) await syncSelection();
      } else await activate();
    },
    activate,
    deactivate() {
      if (dialog.open) dialog.close();
    },
  };
}
