import { ListTree, X } from 'lucide-react';
import type { OutlineHeading } from '../types/notes';

interface OutlinePanelProps {
  isOpen: boolean;
  headings: OutlineHeading[];
  activeHeadingId: string | null;
  onSelectHeading: (heading: OutlineHeading) => void;
  onClose: () => void;
}

export function OutlinePanel({
  isOpen,
  headings,
  activeHeadingId,
  onSelectHeading,
  onClose,
}: OutlinePanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <aside
      aria-label="Table des matières"
      className="flex w-48 shrink-0 flex-col border-l border-stone-200/70 bg-[#FAF9F7]/75 sm:w-56 print:hidden dark:border-zinc-800/80 dark:bg-[#141417]/80"
    >
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-zinc-500">
          <ListTree className="h-3.5 w-3.5" />
          <span>Plan</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Masquer la table des matières"
          aria-label="Masquer la table des matières"
          className="rounded p-1 text-stone-400 transition-colors hover:bg-stone-200/70 hover:text-stone-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        {headings.length === 0 ? (
          <p className="px-2 py-2 text-xs leading-relaxed text-stone-400 dark:text-zinc-600">
            Aucun titre dans cette note. Ajoutez{' '}
            <code className="rounded bg-stone-200/60 px-1 py-0.5 font-mono text-[11px] dark:bg-zinc-800">
              #
            </code>
            ,{' '}
            <code className="rounded bg-stone-200/60 px-1 py-0.5 font-mono text-[11px] dark:bg-zinc-800">
              ##
            </code>{' '}
            ou{' '}
            <code className="rounded bg-stone-200/60 px-1 py-0.5 font-mono text-[11px] dark:bg-zinc-800">
              ###
            </code>
            .
          </p>
        ) : (
          <ul className="space-y-0.5">
            {headings.map((heading) => {
              const isActive = activeHeadingId === heading.id;
              const indentClass =
                heading.level === 1
                  ? 'pl-2 font-medium'
                  : heading.level === 2
                    ? 'pl-4'
                    : 'pl-6 text-[11.5px]';

              return (
                <li key={heading.id}>
                  <button
                    type="button"
                    onClick={() => onSelectHeading(heading)}
                    title={heading.text}
                    className={`group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs transition-colors ${indentClass} ${
                      isActive
                        ? 'bg-indigo-500/10 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300'
                        : 'text-stone-500 hover:bg-stone-200/50 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
                    }`}
                  >
                    <span className="truncate">{heading.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </aside>
  );
}
