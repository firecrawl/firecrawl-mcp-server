import type { App } from '@modelcontextprotocol/ext-apps';
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

interface Category {
  id: string;
  label: string;
  description?: string;
}
interface ProviderState {
  providers: Provider[];
  categories: Category[];
  category: string;
  query: string;
  loading: boolean;
  error: string;
  categoryNote: string;
  status: string;
  retry: boolean;
  canContext: boolean;
  selected: Map<string, { provider: Provider; tools: Set<string> | null }>;
  dialogProvider: Provider | undefined;
  dialogTools: Capability[];
  dialogLoading: boolean;
  dialogError: boolean;
}
export function createProvidersStore(app: App, ready: () => Promise<void>) {
  const selected: ProviderState['selected'] = new Map();
  const toolCache = new Map<string, Promise<Capability[]>>();
  const contractCache = new Map<string, Promise<Capability>>();
  let generation = 0,
    dialogGeneration = 0,
    selectionVersion = 0;
  let initialized = false,
    canContext = false;
  let contextQueue: Promise<void> = Promise.resolve();
  let state: ProviderState = {
    providers: [],
    categories: [],
    category: '',
    query: '',
    loading: true,
    error: '',
    categoryNote: '',
    status: '',
    retry: false,
    canContext: false,
    selected: new Map(),
    dialogProvider: undefined,
    dialogTools: [],
    dialogLoading: false,
    dialogError: false,
  };
  const listeners = new Set<() => void>();
  function update(patch: Partial<ProviderState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
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
  async function syncSelection() {
    if (!canContext) return;
    const version = ++selectionVersion;
    const snapshot = [...selected.values()].map((s) => ({
      provider: s.provider,
      tools: s.tools ? new Set(s.tools) : null,
    }));
    update({ retry: false });
    update({
      status: snapshot.length
        ? 'Adding tools to your chat…'
        : 'Updating chat selection…',
    });
    try {
      const selections: Selection[] = [];
      for (const selection of snapshot) {
        if (version !== selectionVersion) return;
        const available = await tools(selection.provider);
        if (version !== selectionVersion) return;
        if (!available.length) {
          selected.delete(selection.provider.id);
          update({
            selected: new Map(selected),
            providers: state.providers.map((p) =>
              p.id === selection.provider.id ? { ...p, toolCount: 0 } : p
            ),
          });
          continue;
        }
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
      if (version !== selectionVersion) return;
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
      if (version !== selectionVersion) return;
      update({
        status: content.length
          ? 'Added to chat. Type your request in the chat composer.'
          : 'Select providers to add their tools to your chat.',
      });
    } catch (error) {
      if (version !== selectionVersion) return;

      update({
        retry: true,
        status:
          error instanceof Error &&
          /selection|selected|large/i.test(error.message)
            ? error.message
            : 'Could not update chat context. Your selection is saved here; retry.',
      });
    }
  }
  async function loadProviders() {
    const current = ++generation;
    update({ loading: true, providers: [], error: '' });
    try {
      const rows = await all(
        {
          level: 'providers',
          limit: 100,
          ...(state.category ? { categories: [state.category] } : {}),
        },
        'providers'
      );
      if (current !== generation) return;
      update({
        providers: [
          ...new Map(
            rows.map((row) => {
              const p = providerFrom(row);
              return [p.id, p];
            })
          ).values(),
        ],
      });
    } catch {
      if (current === generation)
        update({
          error:
            'Could not load the Alexandria catalog. Check your Firecrawl connection and account access, then retry.',
        });
    } finally {
      if (current === generation) update({ loading: false });
    }
  }
  async function loadCategories() {
    try {
      const rows = await all({ level: 'categories', limit: 100 }, 'categories');
      const categories = [
        ...new Map(
          rows
            .filter(
              (row) =>
                typeof row.id === 'string' &&
                row.id &&
                row.id.toLowerCase() !== 'all'
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
      update({
        categories,
        category:
          state.category && !categories.some((c) => c.id === state.category)
            ? ''
            : state.category,
        categoryNote: '',
      });
    } catch {
      update({
        categoryNote:
          'Categories unavailable. You can still search all providers.',
      });
    }
  }
  function changed() {
    update({ selected: new Map(selected) });
    void syncSelection();
  }
  async function inspect(provider: Provider) {
    const current = ++dialogGeneration;
    update({
      dialogProvider: provider,
      dialogTools: [],
      dialogLoading: true,
      dialogError: false,
    });
    try {
      const available = await tools(provider);
      if (current === dialogGeneration) update({ dialogTools: available });
    } catch {
      if (current === dialogGeneration) update({ dialogError: true });
    } finally {
      if (current === dialogGeneration) update({ dialogLoading: false });
    }
  }
  async function activate() {
    if (initialized) return;
    try {
      await ready();
      canContext = !!app.getHostCapabilities()?.updateModelContext;
      update({
        canContext,
        status: canContext
          ? 'Select providers to add their tools to your chat.'
          : 'This host cannot attach selections. Open the app in ChatGPT with a chat composer available.',
      });
      initialized = true;
      await Promise.all([loadProviders(), loadCategories()]);
    } catch {
      update({
        loading: false,
        error:
          'Could not connect. Open the app through the Firecrawl plugin and retry.',
      });
    }
  }
  const close = () => {
    ++dialogGeneration;
    update({ dialogProvider: undefined });
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot: () => state,
    activate,
    inspect,
    close,
    contract,
    query(query: string) {
      update({ query });
    },
    category(category: string) {
      if (category === state.category) return;
      update({ category });
      void loadProviders();
    },
    allCollections() {
      update({ query: '' });
      if (state.category) {
        update({ category: '' });
        void loadProviders();
      }
    },
    retry() {
      if (initialized) void loadProviders();
      else void activate();
    },
    retrySelection() {
      void syncSelection();
    },
    clear() {
      selected.clear();
      changed();
    },
    select(provider: Provider, checked: boolean) {
      if (!canContext || provider.toolCount === 0) return;
      if (checked) selected.set(provider.id, { provider, tools: null });
      else selected.delete(provider.id);
      changed();
    },
    selectTool(provider: Provider, capability: string, checked: boolean) {
      if (!canContext) return;
      const current = selected.get(provider.id);
      const ids =
        current?.tools === null
          ? new Set(state.dialogTools.map((t) => t.capability))
          : new Set(current?.tools ?? []);
      if (checked) ids.add(capability);
      else ids.delete(capability);
      if (ids.size) selected.set(provider.id, { provider, tools: ids });
      else selected.delete(provider.id);
      changed();
    },
    async refresh() {
      close();
      toolCache.clear();
      contractCache.clear();
      if (!initialized) {
        await activate();
        return;
      }
      await loadCategories();
      await loadProviders();
      if (selected.size) await syncSelection();
    },
  };
}
export type ProvidersStore = ReturnType<typeof createProvidersStore>;
