import { cn } from './cn';

// The segmented control used by firecrawl-web's billing settings.
export function Tabs({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string; id: string; panel: string }[];
  label: string;
}) {
  return (
    <div
      className="inline-flex items-center rounded-10 p-2 bg-black-alpha-4 shadow-inset-control"
      role="tablist"
      aria-label={label}
    >
      {items.map((item, index) => (
        <button
          key={item.value}
          id={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          aria-controls={item.panel}
          tabIndex={value === item.value ? 0 : -1}
          onClick={() => onChange(item.value)}
          onKeyDown={(event) => {
            const direction =
              event.key === 'ArrowRight'
                ? 1
                : event.key === 'ArrowLeft'
                  ? -1
                  : 0;
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : direction
                    ? (index + direction + items.length) % items.length
                    : undefined;
            if (next === undefined) return;
            event.preventDefault();
            onChange(items[next].value);
            document.getElementById(items[next].id)?.focus();
          }}
          className={cn(
            'px-12 py-6 text-label-small rounded-8 transition-all',
            value === item.value
              ? 'bg-surface text-accent-black border border-border-faint shadow-sm'
              : 'text-black-alpha-56 hover:text-black-alpha-72 border border-transparent'
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
