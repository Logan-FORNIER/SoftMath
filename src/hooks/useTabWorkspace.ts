import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatFsError,
  pathExists,
  readNoteContent,
  writeNoteContent,
} from '../services/fsService';
import type { FileTreeNode, OpenNote, SaveStatus } from '../types/notes';
import { useWorkspace } from './useWorkspace';

const SECONDARY_AUTOSAVE_MS = 500;

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
  const [isSplitView, setIsSplitView] = useState<boolean>(false);
  const [secondaryNote, setSecondaryNote] = useState<OpenNote | null>(null);
  const [secondarySaveStatus, setSecondarySaveStatus] =
    useState<SaveStatus>('idle');
  const [focusedPane, setFocusedPane] = useState<'primary' | 'secondary'>(
    'primary'
  );

  const openTabsRef = useRef(openTabs);
  openTabsRef.current = openTabs;
  const activeTabPathRef = useRef(activeTabPath);
  activeTabPathRef.current = activeTabPath;
  const secondaryNoteRef = useRef(secondaryNote);
  secondaryNoteRef.current = secondaryNote;
  const isSplitViewRef = useRef(isSplitView);
  isSplitViewRef.current = isSplitView;

  const prevRootPathRef = useRef<string | null>(workspace.rootPath);
  const pendingRenameRef = useRef<PendingRenameSnapshot | null>(null);
  const closingPathRef = useRef<string | null>(null);
  const secondaryPendingSaveRef = useRef<{ path: string; content: string } | null>(
    null
  );
  const secondaryDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const secondarySessionIdRef = useRef(-1);

  const clearSecondaryTimer = useCallback(() => {
    if (secondaryDebounceTimerRef.current !== null) {
      clearTimeout(secondaryDebounceTimerRef.current);
      secondaryDebounceTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearSecondaryTimer, [clearSecondaryTimer]);

  // Réinitialiser les onglets et la vue scindée lors du changement ou fermeture de dossier racine
  useEffect(() => {
    if (prevRootPathRef.current !== workspace.rootPath) {
      prevRootPathRef.current = workspace.rootPath;
      clearSecondaryTimer();
      secondaryPendingSaveRef.current = null;
      setOpenTabs([]);
      setActiveTabPath(null);
      setIsSplitView(false);
      setSecondaryNote(null);
      setSecondarySaveStatus('idle');
      setFocusedPane('primary');
      pendingRenameRef.current = null;
      closingPathRef.current = null;
    }
  }, [workspace.rootPath, clearSecondaryTimer]);

  const persistSecondaryWrite = useCallback(
    (path: string, content: string): Promise<void> => {
      return workspace.enqueueWrite(async () => {
        if (secondaryNoteRef.current?.path === path) {
          setSecondarySaveStatus('saving');
        }
        try {
          await writeNoteContent(path, content);

          if (secondaryNoteRef.current?.path === path) {
            setSecondaryNote((current) =>
              current && current.path === path
                ? { ...current, lastSavedContent: content }
                : current
            );
            const hasNewer =
              secondaryNoteRef.current.content !== content ||
              secondaryPendingSaveRef.current?.path === path;
            setSecondarySaveStatus(hasNewer ? 'dirty' : 'saved');
          }

          setOpenTabs((prev) =>
            prev.some((tab) => tab.path === path)
              ? prev.map((tab) =>
                  tab.path === path ? { ...tab, lastSavedContent: content } : tab
                )
              : prev
          );
        } catch (err) {
          if (secondaryNoteRef.current?.path === path) {
            setSecondarySaveStatus('error');
          }
          workspace.reportError(
            formatFsError(
              err,
              'Erreur lors de la sauvegarde automatique du panneau secondaire.'
            )
          );
        }
      });
    },
    [workspace]
  );

  const flushSecondaryPendingSave = useCallback(async () => {
    clearSecondaryTimer();
    const pending = secondaryPendingSaveRef.current;
    if (!pending) {
      return;
    }
    secondaryPendingSaveRef.current = null;
    await persistSecondaryWrite(pending.path, pending.content);
  }, [clearSecondaryTimer, persistSecondaryWrite]);

  const flushAllSaves = useCallback(async () => {
    await Promise.all([
      workspace.flushPendingSave(),
      flushSecondaryPendingSave(),
    ]);
  }, [workspace, flushSecondaryPendingSave]);

  const selectNote = useCallback(
    async (node: FileTreeNode) => {
      if (secondaryNoteRef.current?.path === node.path) {
        await flushSecondaryPendingSave();
      }
      await workspace.selectNote(node);
    },
    [workspace, flushSecondaryPendingSave]
  );

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

        setSecondaryNote((prevSec) => {
          if (!prevSec) return null;
          if (!pendingRename.isFolder && prevSec.path === pendingRename.oldPath) {
            if (secondaryPendingSaveRef.current?.path === prevSec.path) {
              secondaryPendingSaveRef.current.path = renamedNode.path;
            }
            return {
              ...prevSec,
              path: renamedNode.path,
              name: renamedNode.name,
              displayName: renamedNode.displayName,
            };
          }
          if (pendingRename.isFolder) {
            const remapped = remapPathPrefix(
              prevSec.path,
              pendingRename.oldPath,
              renamedNode.path
            );
            if (remapped) {
              if (secondaryPendingSaveRef.current?.path === prevSec.path) {
                secondaryPendingSaveRef.current.path = remapped;
              }
              const foundFile = fileMap.get(remapped);
              return {
                ...prevSec,
                path: remapped,
                name: foundFile?.name ?? prevSec.name,
                displayName: foundFile?.displayName ?? prevSec.displayName,
              };
            }
          }
          return prevSec;
        });
      }
    }

    // Élague les onglets et le panneau secondaire dont les fichiers ont été supprimés
    if (secondaryNoteRef.current && !fileMap.has(secondaryNoteRef.current.path)) {
      if (
        secondaryPendingSaveRef.current?.path === secondaryNoteRef.current.path
      ) {
        clearSecondaryTimer();
        secondaryPendingSaveRef.current = null;
      }
      setSecondaryNote(null);
      setSecondarySaveStatus('idle');
    }

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
            void selectNote(targetNode);
          } else {
            setActiveTabPath(null);
          }
        } else {
          setActiveTabPath(null);
        }
      }
    }
  }, [workspace.tree, workspace.rootPath, workspace.isInitializing, selectNote, clearSecondaryTimer]);

  const dirtyTabPaths = useMemo(() => {
    const dirty = new Set<string>();
    for (const tab of openTabs) {
      if (tab.content !== tab.lastSavedContent) {
        dirty.add(tab.path);
      }
    }
    if (secondaryNote && secondaryNote.content !== secondaryNote.lastSavedContent) {
      dirty.add(secondaryNote.path);
    }
    return dirty;
  }, [openTabs, secondaryNote]);

  const openSecondaryNoteByPath = useCallback(
    async (path: string) => {
      await flushSecondaryPendingSave();
      const fileMap = collectFileNodesByPath(workspace.tree);
      const node = fileMap.get(path);
      if (!node) {
        workspace.reportError('Cette note est introuvable sur le disque.');
        return;
      }

      setIsSplitView(true);
      setFocusedPane('secondary');

      // Prefer unsaved in-memory content if open in primary/tabs
      const inTab =
        workspace.activeNote?.path === path
          ? workspace.activeNote
          : openTabsRef.current.find((t) => t.path === path);

      if (inTab) {
        const sessionId = secondarySessionIdRef.current--;
        setSecondaryNote({
          ...inTab,
          sessionId,
        });
        setSecondarySaveStatus(
          inTab.content === inTab.lastSavedContent ? 'saved' : 'dirty'
        );
        return;
      }

      try {
        if (!(await pathExists(node.path))) {
          workspace.reportError(
            `La note « ${node.displayName} » est introuvable sur le disque.`
          );
          return;
        }
        const content = await readNoteContent(node.path);
        const sessionId = secondarySessionIdRef.current--;
        setSecondaryNote({
          sessionId,
          path: node.path,
          name: node.name,
          displayName: node.displayName,
          content,
          lastSavedContent: content,
        });
        setSecondarySaveStatus('saved');
      } catch (err) {
        workspace.reportError(
          formatFsError(
            err,
            `Impossible de lire la note « ${node.displayName} ».`
          )
        );
      }
    },
    [flushSecondaryPendingSave, workspace]
  );

  const closeSplitView = useCallback(async () => {
    await flushSecondaryPendingSave();
    setIsSplitView(false);
    setSecondaryNote(null);
    setSecondarySaveStatus('idle');
    setFocusedPane('primary');
  }, [flushSecondaryPendingSave]);

  const toggleSplitView = useCallback(async () => {
    if (isSplitViewRef.current) {
      await closeSplitView();
      return;
    }

    const activePath = activeTabPathRef.current;
    const otherTab = openTabsRef.current.find((t) => t.path !== activePath);
    if (otherTab) {
      await openSecondaryNoteByPath(otherTab.path);
      return;
    }

    const fileMap = collectFileNodesByPath(workspace.tree);
    const otherTreeNode = Array.from(fileMap.values()).find(
      (n) => n.path !== activePath
    );
    if (otherTreeNode) {
      await openSecondaryNoteByPath(otherTreeNode.path);
      return;
    }

    setIsSplitView(true);
    setSecondaryNote(null);
    setSecondarySaveStatus('idle');
    setFocusedPane('secondary');
  }, [closeSplitView, openSecondaryNoteByPath, workspace.tree]);

  const swapSplitPanes = useCallback(async () => {
    const primary = workspace.activeNote;
    const secondary = secondaryNoteRef.current;
    if (!isSplitViewRef.current || !primary || !secondary || primary.path === secondary.path) {
      return;
    }

    await flushAllSaves();

    const fileMap = collectFileNodesByPath(workspace.tree);
    const secondaryTreeNode = fileMap.get(secondary.path);
    if (!secondaryTreeNode) {
      return;
    }

    const prevPrimaryPath = primary.path;
    await selectNote(secondaryTreeNode);
    await openSecondaryNoteByPath(prevPrimaryPath);
  }, [workspace.activeNote, workspace.tree, flushAllSaves, selectNote, openSecondaryNoteByPath]);

  const updateSecondaryNoteContent = useCallback(
    (nextContent: string) => {
      const current = secondaryNoteRef.current;
      if (!current) {
        return;
      }
      const targetPath = current.path;
      setSecondaryNote((prev) =>
        prev && prev.path === targetPath ? { ...prev, content: nextContent } : prev
      );
      setOpenTabs((prev) =>
        prev.some((tab) => tab.path === targetPath)
          ? prev.map((tab) =>
              tab.path === targetPath ? { ...tab, content: nextContent } : tab
            )
          : prev
      );

      clearSecondaryTimer();

      if (
        nextContent === current.lastSavedContent &&
        secondaryPendingSaveRef.current === null
      ) {
        setSecondarySaveStatus('saved');
        return;
      }

      secondaryPendingSaveRef.current = { path: targetPath, content: nextContent };
      setSecondarySaveStatus('dirty');

      secondaryDebounceTimerRef.current = setTimeout(() => {
        secondaryDebounceTimerRef.current = null;
        void flushSecondaryPendingSave();
      }, SECONDARY_AUTOSAVE_MS);
    },
    [clearSecondaryTimer, flushSecondaryPendingSave]
  );

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
      await selectNote(node);
    },
    [workspace, selectNote]
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
              await selectNote(node);
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
    [workspace, selectNote]
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

      if (
        secondaryNoteRef.current &&
        isSameOrChildPath(secondaryNoteRef.current.path, node.path)
      ) {
        await flushSecondaryPendingSave();
      }

      const ok = await workspace.renameNode(node as FileTreeNode, newName);
      if (!ok) {
        pendingRenameRef.current = null;
      }
      return ok;
    },
    [workspace, flushSecondaryPendingSave]
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
      const wasSecondaryDeleted = Boolean(
        secondaryNoteRef.current &&
          isSameOrChildPath(secondaryNoteRef.current.path, node.path)
      );
      if (wasSecondaryDeleted) {
        clearSecondaryTimer();
        secondaryPendingSaveRef.current = null;
      }

      const ok = await workspace.deleteNode(node as FileTreeNode);
      if (!ok) {
        return false;
      }

      if (wasSecondaryDeleted) {
        setSecondaryNote(null);
        setSecondarySaveStatus('idle');
      }

      setOpenTabs(remainingBefore);
      if (wasActiveDeleted) {
        const nextTab = remainingBefore[remainingBefore.length - 1] ?? null;
        if (nextTab) {
          const fileMap = collectFileNodesByPath(workspace.tree);
          const nextNode = fileMap.get(nextTab.path);
          if (nextNode) {
            await selectNote(nextNode);
            return true;
          }
        }
        setActiveTabPath(null);
      }
      return true;
    },
    [workspace, selectNote, clearSecondaryTimer]
  );

  return {
    ...workspace,
    selectNote,
    flushPendingSave: flushAllSaves,
    flushPrimarySave: workspace.flushPendingSave,
    openTabs,
    activeTabPath,
    dirtyTabPaths,
    switchTab,
    closeTab,
    closeOtherTabs,
    cycleTab,
    renameNode,
    deleteNode,
    // Vue scindée
    isSplitView,
    secondaryNote,
    secondarySaveStatus,
    focusedPane,
    setFocusedPane,
    openSecondaryNoteByPath,
    closeSplitView,
    toggleSplitView,
    swapSplitPanes,
    updateSecondaryNoteContent,
  };
}
