import { FileText, Plus, X } from 'lucide-react';
import type { OpenNote } from '../types/notes';

interface TabBarProps {
  tabs: OpenNote[];
  activeTabPath: string | null;
  dirtyPaths: Set<string>;
  rootPath: string;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCloseOtherTabs: (path: string) => void;
  onCreateNote: () => void;
}

function getRelativeTooltip(fullPath: string, rootPath: string): string {
  if (!rootPath) return fullPath;
  const trimmedRoot = rootPath.replace(/[\\/]+$/, '');
  if (fullPath.startsWith(trimmedRoot)) {
    const rel = fullPath.slice(trimmedRoot.length).replace(/^[\\/]+/, '');
    return rel || fullPath;
  }
  return fullPath;
}

export function TabBar({
  tabs,
  activeTabPath,
  dirtyPaths,
  rootPath,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onCreateNote,
}: TabBarProps) {
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div
      role="tablist"
      aria-label="Notes ouvertes"
      className="flex h-9 shrink-0 items-end gap-0.5 overflow-x-auto border-b border-stone-200/80 bg-[#FAF9F7] px-2 pt-1 print:hidden dark:border-zinc-800/90 dark:bg-[#141417]"
    >
      {tabs.map((tab) => {
        const isActive = tab.path === activeTabPath;
        const isDirty = dirtyPaths.has(tab.path);
        const tooltip = getRelativeTooltip(tab.path, rootPath);

        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={isActive}
            title={`${tooltip}\nClic milieu pour fermer • Double-clic pour garder uniquement cet onglet`}
            onClick={() => onSelectTab(tab.path)}
            onDoubleClick={() => onCloseOtherTabs(tab.path)}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                onCloseTab(tab.path);
              }
            }}
            className={`group relative flex h-8 max-w-[190px] min-w-[96px] shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md border px-2.5 text-xs transition-colors select-none ${
              isActive
                ? 'border-stone-200/90 border-b-white bg-white font-medium text-stone-900 shadow-2xs dark:border-zinc-800 dark:border-b-[#1E1E22] dark:bg-[#1E1E22] dark:text-zinc-100'
                : 'border-transparent bg-transparent text-stone-500 hover:bg-stone-200/50 hover:text-stone-800 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200'
            }`}
          >
            <FileText
              className={`h-3.5 w-3.5 shrink-0 ${
                isActive
                  ? 'text-indigo-500 dark:text-indigo-400'
                  : 'text-stone-400 dark:text-zinc-500'
              }`}
            />
            <span className="min-w-0 flex-1 truncate">{tab.displayName}</span>

            {isDirty && (
              <span
                title="Modifications en attente de sauvegarde"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 group-hover:hidden"
              />
            )}

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCloseTab(tab.path);
              }}
              title="Fermer l'onglet (Ctrl+W)"
              aria-label={`Fermer ${tab.displayName}`}
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors hover:bg-stone-200/80 hover:text-stone-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 ${
                isActive
                  ? 'text-stone-400 opacity-80 hover:opacity-100 dark:text-zinc-400'
                  : 'text-stone-400 opacity-0 group-hover:opacity-100 dark:text-zinc-500'
              } ${isDirty ? 'hidden group-hover:inline-flex' : ''}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={onCreateNote}
        title="Nouvelle note dans un onglet (Ctrl+N)"
        aria-label="Nouvelle note"
        className="mb-1 ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-400 transition-colors hover:bg-stone-200/70 hover:text-stone-800 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

