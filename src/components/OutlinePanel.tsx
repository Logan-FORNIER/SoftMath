import { Link2, ListTree, Network, X } from 'lucide-react';
import type { BacklinkEntry } from '../services/backlinkService';
import type { OutlineHeading } from '../types/notes';

interface OutlinePanelProps {
  isOpen: boolean;
  headings: OutlineHeading[];
  activeHeadingId: string | null;
  onSelectHeading: (heading: OutlineHeading) => void;
  onClose: () => void;
  backlinks?: BacklinkEntry[];
  onSelectBacklink?: (path: string, inSplit?: boolean) => void;
  onOpenKnowledgeGraph?: () => void;
}

export function OutlinePanel({
  isOpen,
  headings,
  activeHeadingId,
  onSelectHeading,
  onClose,
  backlinks = [],
  onSelectBacklink,
  onOpenKnowledgeGraph,
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

        {/* Section Rétroliens & Graphe */}
        <div className="mt-5 border-t border-stone-200/70 pt-3 dark:border-zinc-800/80">
          <div className="mb-1.5 flex items-center justify-between px-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-zinc-500">
              <Link2 className="h-3 w-3" />
              <span>Rétroliens ({backlinks.length})</span>
            </div>
            {onOpenKnowledgeGraph && (
              <button
                type="button"
                onClick={onOpenKnowledgeGraph}
                title="Ouvrir le graphe de connaissances"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-500/10 dark:text-indigo-400"
              >
                <Network className="h-3 w-3" />
                Graphe
              </button>
            )}
          </div>

          {backlinks.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-stone-400 dark:text-zinc-600">
              Aucune note ne cite celle-ci avec{' '}
              <code className="font-mono">[[…]]</code>.
            </p>
          ) : (
            <ul className="space-y-1">
              {backlinks.map((bl) => (
                <li key={`${bl.sourcePath}:${bl.line}`}>
                  <button
                    type="button"
                    onClick={(e) =>
                      onSelectBacklink?.(
                        bl.sourcePath,
                        e.altKey || e.ctrlKey || e.metaKey
                      )
                    }
                    title={`Clic : ouvrir • Alt+Clic : vue scindée\n${bl.snippet}`}
                    className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-stone-200/60 dark:hover:bg-zinc-800/70"
                  >
                    <div className="truncate text-xs font-medium text-indigo-700 dark:text-indigo-300">
                      {bl.sourceTitle}
                    </div>
                    <div className="line-clamp-2 text-[10.5px] leading-snug text-stone-500 dark:text-zinc-400">
                      {bl.snippet}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>
    </aside>
  );
}
