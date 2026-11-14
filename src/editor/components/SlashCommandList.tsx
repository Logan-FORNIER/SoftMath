import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  ArrowUpDown,
  BookOpen,
  Code2,
  GraduationCap,
  Grid3X3,
  Heading1,
  Heading2,
  Landmark,
  Lightbulb,
  List,
  ListOrdered,
  PenTool,
  Quote,
  Sigma,
  TrendingUp,
} from 'lucide-react';

export type SlashCommandIconId =
  | 'drawing'
  | 'math'
  | 'plot'
  | 'variation'
  | 'matrix'
  | 'definition'
  | 'theorem'
  | 'proof'
  | 'example'
  | 'exercise'
  | 'h1'
  | 'h2'
  | 'bulletList'
  | 'orderedList'
  | 'quote'
  | 'code';

export interface SlashCommandItem {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  badge?: string;
  icon: SlashCommandIconId;
  run: (props: { editor: any; range?: { from: number; to: number } }) => void;
}

export interface SlashCommandListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

const ICONS: Record<SlashCommandIconId, ComponentType<{ className?: string }>> = {
  drawing: PenTool,
  math: Sigma,
  plot: TrendingUp,
  variation: ArrowUpDown,
  matrix: Grid3X3,
  definition: BookOpen,
  theorem: Landmark,
  proof: PenTool,
  example: Lightbulb,
  exercise: GraduationCap,
  h1: Heading1,
  h2: Heading2,
  bulletList: List,
  orderedList: ListOrdered,
  quote: Quote,
  code: Code2,
};

export const SlashCommandList = forwardRef<
  SlashCommandListHandle,
  SlashCommandListProps
>(function SlashCommandList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) {
          return false;
        }
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          const item = items[selectedIndex];
          if (item) {
            command(item);
          }
          return true;
        }
        return false;
      },
    }),
    [items, selectedIndex, command]
  );

  if (items.length === 0) {
    return (
      <div className="w-72 rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-xs text-stone-400 shadow-lg dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
        Aucune commande correspondante
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label="Insérer un bloc"
      className="max-h-80 w-76 overflow-y-auto rounded-xl border border-stone-200/90 bg-white/95 p-1.5 shadow-xl backdrop-blur-xs dark:border-zinc-800 dark:bg-zinc-900/95"
    >
      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-stone-400 dark:text-zinc-500">
        Blocs à insérer
      </div>

      <div className="space-y-0.5">
        {items.map((item, index) => {
          const Icon = ICONS[item.icon];
          const isSelected = index === selectedIndex;

          return (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="option"
              aria-selected={isSelected}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => command(item)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                isSelected
                  ? 'bg-indigo-50 text-indigo-950 dark:bg-indigo-500/15 dark:text-indigo-100'
                  : 'text-stone-700 hover:bg-stone-100/80 dark:text-zinc-200 dark:hover:bg-zinc-800/70'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                  isSelected
                    ? 'border-indigo-200 bg-white text-indigo-600 dark:border-indigo-500/40 dark:bg-zinc-900 dark:text-indigo-400'
                    : 'border-stone-200/80 bg-stone-50 text-stone-500 dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-400'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">
                    {item.title}
                  </span>
                  {item.badge && (
                    <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-stone-400 dark:text-zinc-500">
                  {item.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

