import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type { FileTreeNode } from '../types/notes';

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
  activeNotePath: string | null;
  expandedFolders: Set<string>;
  renamingPath: string | null;
  onStartRename: (path: string) => void;
  onCancelRename: () => void;
  onConfirmRename: (node: FileTreeNode, newName: string) => Promise<boolean>;
  onToggleFolder: (folderPath: string) => void;
  onSelectNote: (node: FileTreeNode) => void;
  onCreateNoteInFolder: (folderPath: string) => void;
  onDeleteNode: (node: FileTreeNode) => void;
}

export function FileTreeItem({
  node,
  depth,
  activeNotePath,
  expandedFolders,
  renamingPath,
  onStartRename,
  onCancelRename,
  onConfirmRename,
  onToggleFolder,
  onSelectNote,
  onCreateNoteInFolder,
  onDeleteNode,
}: FileTreeItemProps) {
  const isFolder = node.kind === 'folder';
  const isExpanded = isFolder && expandedFolders.has(node.path);
  const isActive = !isFolder && activeNotePath === node.path;
  const isRenaming = renamingPath === node.path;

  const [draftName, setDraftName] = useState(node.displayName);
  const inputRef = useRef<HTMLInputElement>(null);
  const escapeCancelledRef = useRef(false);

  useEffect(() => {
    if (isRenaming) {
      escapeCancelledRef.current = false;
      setDraftName(node.displayName);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isRenaming, node.displayName]);

  const commitRename = async () => {
    if (escapeCancelledRef.current) {
      escapeCancelledRef.current = false;
      return;
    }
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === node.displayName) {
      onCancelRename();
      return;
    }
    const ok = await onConfirmRename(node, trimmed);
    if (ok) {
      onCancelRename();
    } else {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  };

  const handleRowClick = () => {
    if (isRenaming) {
      return;
    }
    if (isFolder) {
      onToggleFolder(node.path);
    } else {
      onSelectNote(node);
    }
  };

  const paddingLeft = depth * 14 + 8;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        title={node.path}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (isRenaming) {
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRowClick();
          } else if (e.key === 'F2') {
            e.preventDefault();
            onStartRename(node.path);
          }
        }}
        style={{ paddingLeft: `${paddingLeft}px` }}
        className={`group flex h-7.5 cursor-pointer items-center gap-1.5 rounded-md pr-1.5 text-[13px] transition-colors select-none ${
          isActive
            ? 'bg-stone-200/80 font-medium text-stone-900 dark:bg-zinc-800 dark:text-zinc-100'
            : 'text-stone-600 hover:bg-stone-200/50 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
        }`}
      >
        {isFolder ? (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-stone-400 dark:text-zinc-500">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        ) : (
          <span className="w-2 shrink-0" />
        )}

        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {isFolder ? (
            isExpanded ? (
              <FolderOpen className="h-3.5 w-3.5 text-stone-500 dark:text-zinc-400" />
            ) : (
              <Folder className="h-3.5 w-3.5 text-stone-500 dark:text-zinc-400" />
            )
          ) : (
            <FileText
              className={`h-3.5 w-3.5 ${
                isActive
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-stone-400 dark:text-zinc-500'
              }`}
            />
          )}
        </span>

        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={draftName}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => {
              void commitRename();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                escapeCancelledRef.current = true;
                onCancelRename();
              }
            }}
            aria-label="Renommer"
            className="min-w-0 flex-1 rounded border border-indigo-500 bg-white px-1.5 py-0.5 text-[13px] font-normal text-stone-900 outline-none dark:bg-zinc-900 dark:text-zinc-100"
          />
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate">{node.displayName}</span>

            <div
              className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              {isFolder && (
                <button
                  type="button"
                  title="Nouvelle note dans ce dossier"
                  aria-label="Nouvelle note dans ce dossier"
                  onClick={() => onCreateNoteInFolder(node.path)}
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-stone-500 hover:bg-stone-300/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                title="Renommer"
                aria-label="Renommer"
                onClick={() => onStartRename(node.path)}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-stone-500 hover:bg-stone-300/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                title="Supprimer"
                aria-label="Supprimer"
                onClick={() => onDeleteNode(node)}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-stone-500 hover:bg-red-100 hover:text-red-600 dark:text-zinc-400 dark:hover:bg-red-950/60 dark:hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </>
        )}
      </div>

      {isFolder && isExpanded && node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <FileTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              activeNotePath={activeNotePath}
              expandedFolders={expandedFolders}
              renamingPath={renamingPath}
              onStartRename={onStartRename}
              onCancelRename={onCancelRename}
              onConfirmRename={onConfirmRename}
              onToggleFolder={onToggleFolder}
              onSelectNote={onSelectNote}
              onCreateNoteInFolder={onCreateNoteInFolder}
              onDeleteNode={onDeleteNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

