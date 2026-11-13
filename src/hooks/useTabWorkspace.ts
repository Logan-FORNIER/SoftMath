import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FileTreeNode, OpenNote } from '../types/notes';
import { useWorkspace } from './useWorkspace';

function collectFileNodesByPath(
  nodes: FileTreeNode[],
  out = new Map<string, FileTreeNode>()
): Map<string, FileTreeNode> {
  for (const node of nodes) {
    if (node.kind === 'note') {
      out.set(node.path, node);
    } else if (node.children) {
      collectFileNodesByPath(node.children, out);
    }
  }
  return out;
}

function collectAllNodesByPath(
  nodes: FileTreeNode[],
  parentPath = '',
  out = new Map<string, { node: FileTreeNode; parentPath: string }>()
): Map<string, { node: FileTreeNode; parentPath: string }> {
  for (const node of nodes) {
    out.set(node.path, { node, parentPath });
    if (node.children) {
      collectAllNodesByPath(node.children, node.path, out);
    }
  }
  return out;
}

function getSiblingsAtParent(
  tree: FileTreeNode[],
  parentPath: string
): FileTreeNode[] {
  if (!parentPath) {
    return tree;
  }
  const map = collectAllNodesByPath(tree);
  return map.get(parentPath)?.node.children ?? [];
}

function isSameOrChildPath(candidate: string, target: string): boolean {
  if (candidate === target) {
    return true;
  }
  const prefix = target.endsWith('\\') || target.endsWith('/') ? target : `${target}`;
  return (
    candidate.startsWith(`${prefix}\\`) || candidate.startsWith(`${prefix}/`)
  );
}

function remapPathPrefix(
  filePath: string,
  oldFolderPath: string,
  newFolderPath: string
): string | null {
  if (filePath === oldFolderPath) {
    return newFolderPath;
  }
  if (filePath.startsWith(`${oldFolderPath}\\`) || filePath.startsWith(`${oldFolderPath}/`)) {
    return newFolderPath + filePath.slice(oldFolderPath.length);
  }
  return null;
}

interface PendingRenameSnapshot {
  oldPath: string;
  isFolder: boolean;
  parentPath: string;
  siblingPathsBefore: Set<string>;
}

/**
 * Enrichit `useWorkspace` avec la gestion multi-onglets persistants et synchronisés
 * avec l'arborescence locale (ouverture, bascule, fermeture, renommage et suppression).
 */
export function useTabWorkspace() {
  const workspace = useWorkspace();
  const [openTabs, setOpenTabs] = useState<OpenNote[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  const openTabsRef = useRef(openTabs);
  openTabsRef.current = openTabs;
  const activeTabPathRef = useRef(activeTabPath);
  activeTabPathRef.current = activeTabPath;

  const prevRootPathRef = useRef<string | null>(workspace.rootPath);
  const pendingRenameRef = useRef<PendingRenameSnapshot | null>(null);
  const closingPathRef = useRef<string | null>(null);

  // Réinitialiser les onglets lors du changement ou fermeture de dossier racine
  useEffect(() => {
    if (prevRootPathRef.current !== workspace.rootPath) {
      prevRootPathRef.current = workspace.rootPath;
      setOpenTabs([]);
      setActiveTabPath(null);
      pendingRenameRef.current = null;
      closingPathRef.current = null;
    }
  }, [workspace.rootPath]);

  // Synchroniser activeNote -> openTabs (création ou mise à jour de l'onglet actif)
  useEffect(() => {
    const active = workspace.activeNote;
    if (!active || closingPathRef.current === active.path) {
      return;
    }
    setOpenTabs((prev) => {
      const idx = prev.findIndex((tab) => tab.path === active.path);
      if (idx === -1) {
        return [...prev, active];
      }
      const current = prev[idx];
      if (
        current.sessionId === active.sessionId &&
        current.content === active.content &&
        current.lastSavedContent === active.lastSavedContent &&
        current.name === active.name &&
        current.displayName === active.displayName
      ) {
        return prev;
      }
      const next = [...prev];
      next[idx] = active;
      return next;
    });
    setActiveTabPath(active.path);
  }, [workspace.activeNote]);

  // Synchroniser renommages / suppressions avec les onglets ouverts
  useEffect(() => {
    if (!workspace.rootPath || workspace.isInitializing) {
      return;
    }

    const fileMap = collectFileNodesByPath(workspace.tree);
    let currentTabs = openTabsRef.current;

    const pendingRename = pendingRenameRef.current;
    if (pendingRename) {
      pendingRenameRef.current = null;
      const siblingsAfter = getSiblingsAtParent(
        workspace.tree,
        pendingRename.parentPath
      );
      const renamedNode = siblingsAfter.find(
        (item) => !pendingRename.siblingPathsBefore.has(item.path)
      );

      if (renamedNode) {
        currentTabs = currentTabs.map((tab) => {
          if (!pendingRename.isFolder && tab.path === pendingRename.oldPath) {
            return {
              ...tab,
              path: renamedNode.path,
              name: renamedNode.name,
              displayName: renamedNode.displayName,
            };
          }
          if (pendingRename.isFolder) {
            const remapped = remapPathPrefix(
              tab.path,
              pendingRename.oldPath,
              renamedNode.path
            );
            if (remapped) {
              const foundFile = fileMap.get(remapped);
              return {
                ...tab,
                path: remapped,
                name: foundFile?.name ?? tab.name,
                displayName: foundFile?.displayName ?? tab.displayName,
              };
            }
          }
          return tab;
        });

        setOpenTabs(currentTabs);
        setActiveTabPath((prevActive) => {
          if (!prevActive) return null;
          if (!pendingRename.isFolder && prevActive === pendingRename.oldPath) {
            return renamedNode.path;
          }
          if (pendingRename.isFolder) {
            return (
              remapPathPrefix(
                prevActive,
                pendingRename.oldPath,
                renamedNode.path
              ) ?? prevActive
            );
          }
          return prevActive;
        });
      }
    }

    // Élague les onglets dont les fichiers ont été supprimés
    const filteredTabs = currentTabs.filter((tab) => fileMap.has(tab.path));
    if (filteredTabs.length !== currentTabs.length) {
      setOpenTabs(filteredTabs);
      if (
        activeTabPathRef.current &&
        !filteredTabs.some((t) => t.path === activeTabPathRef.current)
      ) {
        const nextFallback = filteredTabs[filteredTabs.length - 1] ?? null;
        if (nextFallback) {
          const targetNode = fileMap.get(nextFallback.path);
          if (targetNode) {
            void workspace.selectNote(targetNode);
          } else {
            setActiveTabPath(null);
          }
        } else {
          setActiveTabPath(null);
        }
      }
    }
  }, [workspace.tree, workspace.rootPath, workspace.isInitializing, workspace.selectNote]);

  const dirtyTabPaths = useMemo(() => {
    const dirty = new Set<string>();
    for (const tab of openTabs) {
      if (tab.content !== tab.lastSavedContent) {
        dirty.add(tab.path);
      }
    }
    return dirty;
  }, [openTabs]);

  const switchTab = useCallback(
    async (path: string) => {
      if (path === activeTabPathRef.current && workspace.activeNote?.path === path) {
        return;
      }
      const fileMap = collectFileNodesByPath(workspace.tree);
      const node = fileMap.get(path);
      if (!node) {
        setOpenTabs((prev) => prev.filter((t) => t.path !== path));
        workspace.reportError('Cette note est introuvable sur le disque.');
        return;
      }
      await workspace.selectNote(node);
    },
    [workspace]
  );

  const closeTab = useCallback(
    async (path: string) => {
      if (closingPathRef.current === path) {
        return;
      }
      closingPathRef.current = path;
      try {
        const current = openTabsRef.current;
        const idx = current.findIndex((t) => t.path === path);
        if (idx === -1) {
          return;
        }
        const remaining = current.filter((t) => t.path !== path);
        const wasActive = activeTabPathRef.current === path;

        if (wasActive) {
          await workspace.flushPendingSave();
        }

        setOpenTabs(remaining);

        if (wasActive) {
          const nextTab = remaining[idx] ?? remaining[idx - 1] ?? null;
          if (nextTab) {
            const fileMap = collectFileNodesByPath(workspace.tree);
            const node = fileMap.get(nextTab.path);
            if (node) {
              await workspace.selectNote(node);
              return;
            }
          }
          setActiveTabPath(null);
          await workspace.clearActiveNote();
        }
      } finally {
        closingPathRef.current = null;
      }
    },
    [workspace]
  );

  const closeOtherTabs = useCallback(
    async (keepPath: string) => {
      const targetTab = openTabsRef.current.find((t) => t.path === keepPath);
      if (!targetTab) {
        return;
      }
      if (activeTabPathRef.current !== keepPath) {
        await switchTab(keepPath);
      }
      setOpenTabs((prev) => prev.filter((t) => t.path === keepPath));
    },
    [switchTab]
  );

  const cycleTab = useCallback(
    async (direction: 1 | -1) => {
      const current = openTabsRef.current;
      if (current.length <= 1) {
        return;
      }
      const activeIdx = current.findIndex(
        (t) => t.path === activeTabPathRef.current
      );
      const safeIdx = activeIdx === -1 ? 0 : activeIdx;
      const nextIdx = (safeIdx + direction + current.length) % current.length;
      const nextTab = current[nextIdx];
      if (nextTab) {
        await switchTab(nextTab.path);
      }
    },
    [switchTab]
  );

  const renameNode = useCallback(
    async (node: Pick<FileTreeNode, 'path' | 'kind'>, newName: string) => {
      const allMap = collectAllNodesByPath(workspace.tree);
      const entry = allMap.get(node.path);
      const parentPath = entry?.parentPath ?? '';
      const siblingsBefore = getSiblingsAtParent(workspace.tree, parentPath);
      pendingRenameRef.current = {
        oldPath: node.path,
        isFolder: node.kind === 'folder',
        parentPath,
        siblingPathsBefore: new Set(siblingsBefore.map((item) => item.path)),
      };

      const ok = await workspace.renameNode(node as FileTreeNode, newName);
      if (!ok) {
        pendingRenameRef.current = null;
      }
      return ok;
    },
    [workspace]
  );

  const deleteNode = useCallback(
    async (node: Pick<FileTreeNode, 'path' | 'kind'>) => {
      const wasActiveDeleted = Boolean(
        activeTabPathRef.current &&
          isSameOrChildPath(activeTabPathRef.current, node.path)
      );
      const remainingBefore = openTabsRef.current.filter(
        (tab) => !isSameOrChildPath(tab.path, node.path)
      );
      const ok = await workspace.deleteNode(node as FileTreeNode);
      if (!ok) {
        return false;
      }

      setOpenTabs(remainingBefore);
      if (wasActiveDeleted) {
        const nextTab = remainingBefore[remainingBefore.length - 1] ?? null;
        if (nextTab) {
          const fileMap = collectFileNodesByPath(workspace.tree);
          const nextNode = fileMap.get(nextTab.path);
          if (nextNode) {
            await workspace.selectNote(nextNode);
            return true;
          }
        }
        setActiveTabPath(null);
      }
      return true;
    },
    [workspace]
  );

  return {
    ...workspace,
    openTabs,
    activeTabPath,
    dirtyTabPaths,
    switchTab,
    closeTab,
    closeOtherTabs,
    cycleTab,
    renameNode,
    deleteNode,
  };
}
