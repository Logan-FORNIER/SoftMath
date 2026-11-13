import { useMemo, useState } from 'react';
import { FilePlus, FolderOpen, FolderPlus, RefreshCw } from 'lucide-react';
import { countNotesInTree } from '../services/fsService';
import type { FileTreeNode } from '../types/notes';
import { FileTreeItem } from './FileTreeItem';

interface SidebarProps {
  isOpen: boolean;
  rootPath: string;
  rootName: string;
  tree: FileTreeNode[];
  expandedFolders: Set<string>;
  activeNotePath: string | null;
  isRefreshing: boolean;
  onOpenFolder: () => void;
  onRefresh: () => void;
  onCreateNote: (parentDir?: string) => void;
  onCreateFolder: (parentDir?: string) => void;
  onToggleFolder: (folderPath: string) => void;
  onSelectNote: (node: FileTreeNode) => void;
  onRenameNode: (node: FileTreeNode, newName: string) => Promise<boolean>;
  onDeleteNode: (node: FileTreeNode) => void;
}

export function Sidebar({
  isOpen,
  rootPath,
  rootName,
  tree,
  expandedFolders,
  activeNotePath,
  isRefreshing,
  onOpenFolder,
  onRefresh,
  onCreateNote,
  onCreateFolder,
  onToggleFolder,
  onSelectNote,
  onRenameNode,
  onDeleteNode,
}: SidebarProps) {
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const noteCount = useMemo(() => countNotesInTree(tree), [tree]);

  return (
    <aside
      aria-label="Explorateur de notes"
      className={`flex h-full shrink-0 flex-col overflow-hidden bg-[#FAF9F7] transition-[width,border-color] duration-200 ease-out print:hidden dark:bg-[#18181B] ${
        isOpen
          ? 'w-64 border-r border-stone-200/80 dark:border-zinc-800/90'
          : 'w-0 border-r-0'
      }`}
    >
      <div className="flex h-full w-64 flex-col">
        {/* Workspace header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-stone-200/70 px-3 dark:border-zinc-800/80">
          <button
            type="button"
            onClick={onOpenFolder}
            title={`Dossier actif : ${rootPath}\nCliquer pour changer de dossier`}
            className="flex min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs font-semibold tracking-wide text-stone-700 transition-colors hover:bg-stone-200/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-zinc-400" />
            <span className="truncate">{rootName}</span>
          </button>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => onCreateNote()}
              title="Nouvelle note (Ctrl+N)"
              aria-label="Nouvelle note"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <FilePlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onCreateFolder()}
              title="Nouveau dossier"
              aria-label="Nouveau dossier"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onRefresh}
              title="Actualiser l'arborescence"
              aria-label="Actualiser l'arborescence"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {tree.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-3 py-10 text-center">
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                Aucune note <code className="font-mono text-[11px]">.md</code> dans ce
                dossier.
              </p>
              <button
                type="button"
                onClick={() => onCreateNote()}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 shadow-2xs transition-colors hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                <FilePlus className="h-3.5 w-3.5" />
                Créer une note
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {tree.map((node) => (
                <FileTreeItem
                  key={node.id}
                  node={node}
                  depth={0}
                  activeNotePath={activeNotePath}
                  expandedFolders={expandedFolders}
                  renamingPath={renamingPath}
                  onStartRename={setRenamingPath}
                  onCancelRename={() => setRenamingPath(null)}
                  onConfirmRename={onRenameNode}
                  onToggleFolder={onToggleFolder}
                  onSelectNote={onSelectNote}
                  onCreateNoteInFolder={(folderPath) => onCreateNote(folderPath)}
                  onDeleteNode={onDeleteNode}
                />
              ))}
            </div>
          )}
        </div>

        {/* Subtle footer */}
        <div className="flex h-8 shrink-0 items-center justify-between border-t border-stone-200/70 px-3 text-[11px] text-stone-400 dark:border-zinc-800/80 dark:text-zinc-500">
          <span>
            {noteCount} {noteCount > 1 ? 'notes' : 'note'}
          </span>
          <button
            type="button"
            onClick={onOpenFolder}
            className="transition-colors hover:text-stone-700 dark:hover:text-zinc-300"
          >
            Changer de dossier
          </button>
        </div>
      </div>
    </aside>
  );
}

