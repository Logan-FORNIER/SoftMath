import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { FileText } from 'lucide-react';

export interface WikiLinkSuggestionItem {
  path: string;
  displayName: string;
  relativePath: string;
}

export interface WikiLinkListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface WikiLinkListProps {
  items: WikiLinkSuggestionItem[];
  command: (item: WikiLinkSuggestionItem) => void;
}

export const WikiLinkList = forwardRef<WikiLinkListHandle, WikiLinkListProps>(
  function WikiLinkList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          const chosen = items[selectedIndex] ?? items[0];
          if (chosen) command(chosen);
          return true;
        }
        return false;
      },
    }));

    return (
      <div className="z-50 w-72 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="border-b border-stone-100 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:border-zinc-800 dark:text-zinc-500">
          Lier vers une note ([[…]])
        </div>
        {items.length === 0 ? (
          <div className="px-3 py-2.5 text-xs text-stone-400 dark:text-zinc-500">
            Aucune note correspondante.
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto p-1">
            {items.map((item, idx) => {
              const active = idx === selectedIndex;
              return (
                <button
                  key={item.path}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    command(item);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    active
                      ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                      : 'text-stone-700 hover:bg-stone-100 dark:text-zinc-200 dark:hover:bg-zinc-800'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{item.displayName}</div>
                    <div className="truncate text-[10px] text-stone-400 dark:text-zinc-500">
                      {item.relativePath}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);

