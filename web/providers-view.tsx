import { useState, useSyncExternalStore, useRef } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Capability, Provider } from './catalog';
import { providerLogoSrc } from './provider-logo';
import { ProviderLogo } from './ui/provider-logo';
import type { ProvidersStore } from './providers';
import Button from './ui/button';
import Input from './ui/input';
import Checkbox from './ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';

function ProviderMark({ provider }: { provider: Provider }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = providerLogoSrc(provider);
  return (
    <span
      className="provider-mark"
      aria-hidden="true"
      data-loaded={loaded || undefined}
    >
      <span className="provider-initials">
        {provider.name.slice(0, 2).toUpperCase()}
      </span>
      {src && !failed && (
        <ProviderLogo
          className="provider-logo"
          alt=""
          width={24}
          height={24}
          loading="lazy"
          decoding="async"
          src={src}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setFailed(true);
          }}
        />
      )}
    </span>
  );
}
function Contract({
  store,
  tool,
}: {
  store: ProvidersStore;
  tool: Capability;
}) {
  const [value, setValue] = useState('Loading contract…');
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <details
      onToggle={async (event) => {
        if (!event.currentTarget.open || loaded || pending) return;
        setPending(true);
        try {
          const data = await store.contract(tool.provider, tool.capability);
          setValue(
            JSON.stringify(
              {
                options: data.options,
                requiresOneOf: data.requiresOneOf,
                response: data.response,
              },
              null,
              2
            )
          );
          setLoaded(true);
        } catch {
          setValue('Could not load the contract. Close and reopen to retry.');
        } finally {
          setPending(false);
        }
      }}
    >
      <summary>Input and output contract</summary>
      <pre className="contract">{value}</pre>
    </details>
  );
}
function Shelf({
  id,
  label,
  providers,
  renderCard,
  store,
}: {
  id: string;
  label: string;
  providers: Provider[];
  renderCard: (p: Provider) => React.ReactNode;
  store: ProvidersStore;
}) {
  const row = useRef<HTMLDivElement>(null);
  return (
    <section
      className="provider-shelf"
      aria-labelledby={`provider-shelf-${id}`}
    >
      <div className="provider-shelf-heading">
        <div className="provider-shelf-identity">
          <h2 id={`provider-shelf-${id}`}>{label}</h2>
          <span className="label">{providers.length}</span>
        </div>
        <div className="provider-shelf-actions">
          {providers.length > 4 &&
            [-1, 1].map((direction) => (
              <Button
                key={direction}
                variant="tertiary"
                aria-label={`Scroll ${label} ${direction < 0 ? 'back' : 'forward'}`}
                onClick={() =>
                  row.current?.scrollBy({
                    left: direction * row.current.clientWidth,
                    behavior: matchMedia('(prefers-reduced-motion: reduce)')
                      .matches
                      ? 'instant'
                      : 'smooth',
                  })
                }
              >
                {direction < 0 ? (
                  <ChevronLeft size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </Button>
            ))}
          <Button
            variant="tertiary"
            aria-label={`View all ${providers.length} ${label} providers`}
            onClick={() => store.category(id)}
          >
            View all →
          </Button>
        </div>
      </div>
      <div
        className="provider-shelf-row"
        role="region"
        aria-label={`${label} providers`}
        tabIndex={0}
        ref={row}
      >
        {providers.slice(0, 12).map(renderCard)}
      </div>
    </section>
  );
}
export function ProvidersView({ store }: { store: ProvidersStore }) {
  const state = useSyncExternalStore(
    store.subscribe,
    store.snapshot,
    store.snapshot
  );
  const dialogTrigger = useRef<HTMLButtonElement | null>(null);
  const query = state.query.trim().toLowerCase();
  const filtered = state.providers.filter((p) =>
    `${p.name} ${p.id} ${p.description}`.toLowerCase().includes(query)
  );
  const shelves =
    !state.category && !query
      ? state.categories
          .map((c) => ({
            ...c,
            providers: filtered.filter((p) =>
              p.categories?.includes(c.id.toLowerCase().replaceAll(' ', '-'))
            ),
          }))
          .filter((c) => c.providers.length)
          .sort((a, b) => b.providers.length - a.providers.length)
      : [];
  const grouped = new Set(shelves.flatMap((s) => s.providers.map((p) => p.id)));
  const remaining = filtered.filter((p) => !grouped.has(p.id));
  const card = (provider: Provider) => (
    <article
      key={provider.id}
      className="provider-card"
      data-provider={provider.id}
      data-selected={state.selected.has(provider.id)}
    >
      <div className="provider-card-header">
        <ProviderMark provider={provider} />
        <div className="provider-identity">
          <h3>{provider.name}</h3>
          <p className="provider-id">{provider.id}</p>
        </div>
      </div>
      <p className="provider-description">{provider.description}</p>
      {provider.toolCount !== undefined && (
        <span className="provider-tool-count">{provider.toolCount} tools</span>
      )}
      <div className="provider-actions">
        <label className="provider-select">
          <Checkbox
            checked={state.selected.has(provider.id)}
            disabled={!state.canContext || provider.toolCount === 0}
            aria-label={`Select ${provider.name}`}
            onChange={(checked) => store.select(provider, checked)}
          />
          <span>Select</span>
        </label>
        <Button
          variant="secondary"
          onClick={(event) => {
            dialogTrigger.current = event.currentTarget;
            void store.inspect(provider);
          }}
        >
          View tools
        </Button>
      </div>
    </article>
  );
  const provider = state.dialogProvider;
  const selection = provider && state.selected.get(provider.id);
  return (
    <section className="catalog-section" aria-label="Alexandria providers">
      <div className="catalog-toolbar">
        <div className="search-control">
          <Search size={18} aria-hidden="true" />
          <Input
            id="provider-search"
            type="search"
            aria-label="Search providers"
            placeholder="Search providers"
            autoComplete="off"
            value={state.query}
            onChange={(event) => store.query(event.target.value)}
          />
        </div>
        <div className="category-select">
          <Select
            value={state.category || 'all'}
            onValueChange={(value) =>
              store.category(value === 'all' ? '' : value)
            }
          >
            <SelectTrigger
              id="provider-category"
              aria-label="Provider category"
            >
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-category="">
                All categories
              </SelectItem>
              {state.categories.map((c) => (
                <SelectItem key={c.id} value={c.id} data-category={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p id="category-note" className="label">
        {state.categoryNote}
      </p>
      <div
        id="provider-collection-heading"
        className="provider-collection-heading"
        hidden={!state.category}
      >
        <h2 id="provider-collection-title">
          {state.categories.find((c) => c.id === state.category)?.label ??
            state.category}
        </h2>
        <Button
          variant="tertiary"
          id="all-provider-collections"
          onClick={store.allCollections}
        >
          ← All collections
        </Button>
      </div>
      <div className="catalog-heading">
        <span id="provider-count" className="label" role="status">
          {state.loading
            ? 'Loading providers…'
            : `${filtered.length} ${query ? 'matching ' : ''}${filtered.length === 1 ? 'provider' : 'providers'}`}
        </span>
        <div className="catalog-heading-actions">
          <div
            id="selection-controls"
            className="selection-controls"
            hidden={!state.selected.size}
          >
            <span id="selection-count" className="label">
              {state.selected.size} selected
            </span>
            <Button
              variant="tertiary"
              id="clear-selection"
              disabled={!state.selected.size}
              onClick={store.clear}
            >
              Clear
            </Button>
          </div>
          <span className="badge">Alexandria</span>
        </div>
      </div>
      <div
        id="catalog-error"
        className="catalog-error"
        role="status"
        hidden={!state.error}
      >
        <p id="catalog-error-message">{state.error}</p>
        <Button
          variant="secondary"
          id="catalog-retry"
          disabled={state.loading}
          onClick={store.retry}
        >
          Retry
        </Button>
      </div>
      <div className="selection-feedback">
        <p
          id="selection-status"
          className="selection-note"
          role="status"
          aria-live="polite"
        >
          {state.status}
        </p>
        <Button
          variant="tertiary"
          id="retry-selection"
          hidden={!state.retry}
          onClick={store.retrySelection}
        >
          Retry selection
        </Button>
      </div>
      <div
        id="provider-grid"
        className={`provider-grid${shelves.length ? ' provider-collections' : ''}`}
      >
        {shelves.length ? (
          <>
            {shelves.map((s) => (
              <Shelf key={s.id} {...s} renderCard={card} store={store} />
            ))}
            {remaining.length > 0 && (
              <section className="provider-unclassified">
                <h2>More providers</h2>
                <div className="provider-grid">{remaining.map(card)}</div>
              </section>
            )}
          </>
        ) : (
          filtered.map(card)
        )}
      </div>
      <p
        id="provider-empty"
        className="empty"
        hidden={state.loading || filtered.length > 0}
      >
        {query
          ? 'No providers match your search. Try a different name or category.'
          : 'No providers in this category.'}
      </p>
      <Dialog
        open={!!provider}
        onOpenChange={(open) => {
          if (!open) store.close();
        }}
      >
        <DialogContent
          id="provider-dialog"
          className="provider-dialog-content"
          hideCloseButton
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (dialogTrigger.current?.isConnected)
              dialogTrigger.current.focus();
            else document.getElementById('provider-search')?.focus();
          }}
          mobilePosition="center"
        >
          <DialogHeader className="dialog-header !flex-row !text-left !space-y-0">
            <div>
              <span className="label">Alexandria provider</span>
              <DialogTitle>
                <span id="provider-dialog-name">{provider?.name}</span>
              </DialogTitle>
            </div>
            <Button
              variant="tertiary"
              id="close-provider-dialog"
              aria-label="Close provider details"
              onClick={store.close}
            >
              ×
            </Button>
          </DialogHeader>
          <DialogDescription className="provider-dialog-description">
            <span id="provider-dialog-description">
              {provider?.description}
            </span>
          </DialogDescription>
          <div id="provider-tools" className="provider-tools">
            {state.dialogLoading ? (
              <p className="empty">Loading tools…</p>
            ) : state.dialogError ? (
              <>
                <p className="error">
                  Could not load tools. Check your Firecrawl connection and
                  retry.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (provider) void store.inspect(provider);
                  }}
                >
                  Retry
                </Button>
              </>
            ) : (
              state.dialogTools.map((tool) => (
                <article key={tool.capability} className="capability-row">
                  <div className="capability-heading">
                    <Checkbox
                      checked={
                        !!selection &&
                        (selection.tools === null ||
                          selection.tools.has(tool.capability))
                      }
                      disabled={!state.canContext}
                      aria-label={`Select tool ${tool.name}`}
                      onChange={(checked) => {
                        if (provider)
                          store.selectTool(provider, tool.capability, checked);
                      }}
                    />
                    <strong>{tool.name}</strong>
                  </div>
                  <code className="capability-id">{tool.capability}</code>
                  <p>{tool.description}</p>
                  {tool.creditsCost !== undefined && (
                    <span className="badge">
                      {tool.creditsCost} credits
                      {tool.perRecord ? ' / record' : ' / call'}
                    </span>
                  )}
                  <Contract store={store} tool={tool} />
                </article>
              ))
            )}
            {!state.dialogLoading &&
              !state.dialogError &&
              !state.dialogTools.length && (
                <p className="empty">
                  No tools are currently available for this provider.
                </p>
              )}
          </div>
          <div className="dialog-footer">
            <Button
              id="select-provider"
              disabled={!state.canContext || !state.dialogTools.length}
              onClick={() => {
                if (provider) store.select(provider, selection?.tools !== null);
              }}
            >
              {selection?.tools === null
                ? 'Remove provider'
                : 'Select provider'}
            </Button>
            <span className="label">
              Select all tools or choose individually.
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
