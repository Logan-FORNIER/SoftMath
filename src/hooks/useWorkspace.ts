import { useCallback, useEffect, useRef, useState } from 'react';
import {
  confirmAndDeleteEntry,
  createMarkdownNote,
  createSubfolder,
  formatFsError,
  getFolderDisplayName,
  isSameOrChildPath,
  pathExists,
  pickNotesFolder,
  readNoteContent,
  readWorkspaceTree,
  renameFsEntry,
  replacePathPrefix,
  writeNoteContent,
} from '../services/fsService';
import type { FileTreeNode, OpenNote, SaveStatus } from '../types/notes';

const ROOT_PATH_STORAGE_KEY = 'softmath:rootPath';
const AUTOSAVE_DEBOUNCE_MS = 500;

export function useWorkspace() {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [rootName, setRootName] = useState<string>('');
  const [tree, setTree] = useState<FileTreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [activeNote, setActiveNote] = useState<OpenNote | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs keep pending autosave state independent of React render timing so
  // switching/renaming/closing never writes content to the wrong note path.
  const activeNoteRef = useRef<OpenNote | null>(null);
  activeNoteRef.current = activeNote;

  const rootPathRef = useRef<string | null>(null);
  rootPathRef.current = rootPath;

  const pendingSaveRef = useRef<{ path: string; content: string } | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const nextSessionIdRef = useRef(1);

  const clearPendingTimer = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const enqueueWrite = useCallback(
    (task: () => Promise<void>): Promise<void> => {
      const next = writeQueueRef.current.then(task, task);
      writeQueueRef.current = next;
      return next;
    },
    []
  );

  const persistWrite = useCallback(
    (path: string, content: string): Promise<void> => {
      const run = async () => {
        if (activeNoteRef.current?.path === path) {
          setSaveStatus('saving');
        }

        try {
          await writeNoteContent(path, content);

          if (activeNoteRef.current?.path === path) {
            setActiveNote((current) =>
              current && current.path === path
                ? { ...current, lastSavedContent: content }
                : current
            );
            const hasNewerEdits =
              activeNoteRef.current.content !== content ||
              pendingSaveRef.current?.path === path;
            setSaveStatus(hasNewerEdits ? 'dirty' : 'saved');
          }
        } catch (err) {
          if (activeNoteRef.current?.path === path) {
            setSaveStatus('error');
          }
          setErrorMessage(
            formatFsError(err, 'Erreur lors de la sauvegarde automatique de la note.')
          );
          if (rootPathRef.current && (await pathExists(rootPathRef.current))) {
            try {
              const refreshed = await readWorkspaceTree(rootPathRef.current);
              setTree(refreshed);
            } catch {
              // Keep existing error banner focused on save failure.
            }
          }
        }
      };

      return enqueueWrite(run);
    },
    [enqueueWrite]
  );

  const flushPendingSave = useCallback(async () => {
    clearPendingTimer();
    const pending = pendingSaveRef.current;
    if (!pending) {
      return;
    }
    pendingSaveRef.current = null;
    await persistWrite(pending.path, pending.content);
  }, [clearPendingTimer, persistWrite]);

  const loadWorkspace = useCallback(
    async (folderPath: string, clearActiveNote = true) => {
      const [nextTree, displayName] = await Promise.all([
        readWorkspaceTree(folderPath),
        getFolderDisplayName(folderPath),
      ]);

      setRootPath(folderPath);
      setRootName(displayName);
      setTree(nextTree);
      setExpandedFolders(new Set());
      setErrorMessage(null);

      if (clearActiveNote) {
        setActiveNote(null);
        setSaveStatus('idle');
      }

      try {
        localStorage.setItem(ROOT_PATH_STORAGE_KEY, folderPath);
      } catch {
        // Ignore storage errors.
      }
    },
    []
  );

  // Restore last opened workspace on startup (enabled by tauri-plugin-persisted-scope).
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const savedPath = localStorage.getItem(ROOT_PATH_STORAGE_KEY);
        if (!savedPath) {
          return;
        }
        const [restoredTree, displayName] = await Promise.all([
          readWorkspaceTree(savedPath),
          getFolderDisplayName(savedPath),
        ]);
        if (!cancelled) {
          setRootPath(savedPath);
          setRootName(displayName);
          setTree(restoredTree);
        }
      } catch {
        try {
          localStorage.removeItem(ROOT_PATH_STORAGE_KEY);
        } catch {
          // Ignore storage errors.
        }
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // Flush any pending edits when the window loses focus or is about to unload.
  useEffect(() => {
    const handleFlush = () => {
      void flushPendingSave();
    };
    window.addEventListener('blur', handleFlush);
    window.addEventListener('beforeunload', handleFlush);
    return () => {
      window.removeEventListener('blur', handleFlush);
      window.removeEventListener('beforeunload', handleFlush);
    };
  }, [flushPendingSave]);

  const openRootFolder = useCallback(async () => {
    setErrorMessage(null);
    try {
      const selected = await pickNotesFolder();
      if (!selected) {
        return;
      }
      await flushPendingSave();
      await loadWorkspace(selected, true);
    } catch (err) {
      setErrorMessage(
        formatFsError(err, "Impossible d'ouvrir ce dossier de notes.")
      );
    }
  }, [flushPendingSave, loadWorkspace]);

  const closeWorkspace = useCallback(async () => {
    await flushPendingSave();
    setRootPath(null);
    setRootName('');
    setTree([]);
    setExpandedFolders(new Set());
    setActiveNote(null);
    setSaveStatus('idle');
    setErrorMessage(null);
    try {
      localStorage.removeItem(ROOT_PATH_STORAGE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }, [flushPendingSave]);

  const refreshTree = useCallback(async () => {
    if (!rootPath) {
      return;
    }
    setIsRefreshing(true);
    try {
      if (!(await pathExists(rootPath))) {
        setTree([]);
        setErrorMessage(
          'Le dossier racine est introuvable sur le disque (supprimé ou déplacé).'
        );
        return;
      }

      const nextTree = await readWorkspaceTree(rootPath);
      setTree(nextTree);

      const currentNote = activeNoteRef.current;
      if (currentNote && !(await pathExists(currentNote.path))) {
        setSaveStatus('dirty');
        setErrorMessage(
          `La note « ${currentNote.displayName} » a été supprimée ou déplacée en externe. Vous pouvez la ré-enregistrer (Ctrl+S) ou en choisir une autre.`
        );
      } else {
        setErrorMessage(null);
      }
    } catch (err) {
      setErrorMessage(
        formatFsError(err, "Impossible d'actualiser l'arborescence des notes.")
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [rootPath]);

  const toggleFolder = useCallback((folderPath: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);

  const selectNote = useCallback(
    async (node: FileTreeNode) => {
      if (node.kind !== 'note') {
        return;
      }
      if (activeNoteRef.current?.path === node.path) {
        return;
      }

      setErrorMessage(null);
      await flushPendingSave();

      try {
        if (!(await pathExists(node.path))) {
          if (rootPathRef.current && (await pathExists(rootPathRef.current))) {
            const nextTree = await readWorkspaceTree(rootPathRef.current);
            setTree(nextTree);
          }
          setErrorMessage(
            `La note « ${node.displayName} » est introuvable (supprimée ou déplacée en externe). L'arborescence a été actualisée.`
          );
          return;
        }

        const content = await readNoteContent(node.path);
        const sessionId = nextSessionIdRef.current++;
        setActiveNote({
          sessionId,
          path: node.path,
          name: node.name,
          displayName: node.displayName,
          content,
          lastSavedContent: content,
        });
        setSaveStatus('saved');
      } catch (err) {
        if (rootPathRef.current && (await pathExists(rootPathRef.current))) {
          try {
            const nextTree = await readWorkspaceTree(rootPathRef.current);
            setTree(nextTree);
          } catch {
            // Ignore secondary tree refresh error.
          }
        }
        setErrorMessage(
          formatFsError(err, `Impossible de lire la note « ${node.displayName} ».`)
        );
      }
    },
    [flushPendingSave]
  );

  const updateNoteContent = useCallback(
    (nextContent: string) => {
      const current = activeNoteRef.current;
      if (!current) {
        return;
      }

      const targetPath = current.path;
      setActiveNote((prev) =>
        prev && prev.path === targetPath ? { ...prev, content: nextContent } : prev
      );

      clearPendingTimer();

      if (nextContent === current.lastSavedContent && pendingSaveRef.current === null) {
        setSaveStatus('saved');
        return;
      }

      pendingSaveRef.current = { path: targetPath, content: nextContent };
      setSaveStatus('dirty');

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void flushPendingSave();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [clearPendingTimer, flushPendingSave]
  );

  const createNewNote = useCallback(
    async (parentDir?: string, initialContent = '') => {
      const targetDir = parentDir ?? rootPath;
      if (!targetDir) {
        return null;
      }

      setErrorMessage(null);
      await flushPendingSave();

      try {
        const created = await createMarkdownNote(targetDir);
        if (initialContent) {
          await writeNoteContent(created.path, initialContent);
        }
        if (parentDir) {
          setExpandedFolders((prev) => new Set(prev).add(parentDir));
        }

        if (rootPath) {
          const nextTree = await readWorkspaceTree(rootPath);
          setTree(nextTree);
        }

        const sessionId = nextSessionIdRef.current++;
        setActiveNote({
          sessionId,
          path: created.path,
          name: created.name,
          displayName: created.displayName,
          content: initialContent,
          lastSavedContent: initialContent,
        });
        setSaveStatus('saved');
        return created.path;
      } catch (err) {
        setErrorMessage(
          formatFsError(err, 'Impossible de créer une nouvelle note.')
        );
        return null;
      }
    },
    [flushPendingSave, rootPath]
  );

  const createNewFolder = useCallback(
    async (parentDir?: string) => {
      const targetDir = parentDir ?? rootPath;
      if (!targetDir) {
        return null;
      }

      setErrorMessage(null);
      try {
        const created = await createSubfolder(targetDir);
        setExpandedFolders((prev) => {
          const next = new Set(prev);
          if (parentDir) {
            next.add(parentDir);
          }
          next.add(created.path);
          return next;
        });

        if (rootPath) {
          const nextTree = await readWorkspaceTree(rootPath);
          setTree(nextTree);
        }
        return created.path;
      } catch (err) {
        setErrorMessage(
          formatFsError(err, 'Impossible de créer un nouveau dossier.')
        );
        return null;
      }
    },
    [rootPath]
  );

  const renameNode = useCallback(
    async (node: Pick<FileTreeNode, 'path' | 'kind'>, newName: string): Promise<boolean> => {
      setErrorMessage(null);

      if (
        activeNoteRef.current &&
        isSameOrChildPath(activeNoteRef.current.path, node.path)
      ) {
        await flushPendingSave();
      }

      try {
        if (!(await pathExists(node.path))) {
          if (rootPath && (await pathExists(rootPath))) {
            const nextTree = await readWorkspaceTree(rootPath);
            setTree(nextTree);
          }
          setErrorMessage(
            "Cet élément est introuvable sur le disque (supprimé ou déplacé en externe). L'arborescence a été actualisée."
          );
          return false;
        }

        const result = await renameFsEntry(node.path, newName, node.kind);
        if (result.oldPath === result.newPath) {
          return true;
        }

        if (node.kind === 'folder') {
          setExpandedFolders((prev) => {
            const next = new Set<string>();
            for (const folder of prev) {
              next.add(replacePathPrefix(folder, result.oldPath, result.newPath));
            }
            return next;
          });
        }

        setActiveNote((current) => {
          if (!current || !isSameOrChildPath(current.path, result.oldPath)) {
            return current;
          }
          if (node.kind === 'note' && current.path === result.oldPath) {
            return {
              ...current,
              path: result.newPath,
              name: result.newName,
              displayName: result.displayName,
            };
          }
          return {
            ...current,
            path: replacePathPrefix(current.path, result.oldPath, result.newPath),
          };
        });

        if (rootPath) {
          const nextTree = await readWorkspaceTree(rootPath);
          setTree(nextTree);
        }
        return true;
      } catch (err) {
        setErrorMessage(formatFsError(err, 'Impossible de renommer cet élément.'));
        return false;
      }
    },
    [flushPendingSave, rootPath]
  );

  const deleteNode = useCallback(
    async (node: FileTreeNode): Promise<boolean> => {
      setErrorMessage(null);
      try {
        if (!(await pathExists(node.path))) {
          if (rootPath && (await pathExists(rootPath))) {
            const nextTree = await readWorkspaceTree(rootPath);
            setTree(nextTree);
          }
          if (
            activeNoteRef.current &&
            isSameOrChildPath(activeNoteRef.current.path, node.path) &&
            activeNoteRef.current.content === activeNoteRef.current.lastSavedContent
          ) {
            setActiveNote(null);
            setSaveStatus('idle');
          }
          setErrorMessage(
            "Cet élément avait déjà été supprimé ou déplacé en externe. L'arborescence a été actualisée."
          );
          return false;
        }

        const deleted = await confirmAndDeleteEntry(
          node.path,
          node.displayName,
          node.kind
        );
        if (!deleted) {
          return false;
        }

        if (
          activeNoteRef.current &&
          isSameOrChildPath(activeNoteRef.current.path, node.path)
        ) {
          clearPendingTimer();
          if (
            pendingSaveRef.current &&
            isSameOrChildPath(pendingSaveRef.current.path, node.path)
          ) {
            pendingSaveRef.current = null;
          }
          setActiveNote(null);
          setSaveStatus('idle');
        }

        if (node.kind === 'folder') {
          setExpandedFolders((prev) => {
            const next = new Set<string>();
            for (const folder of prev) {
              if (!isSameOrChildPath(folder, node.path)) {
                next.add(folder);
              }
            }
            return next;
          });
        }

        if (rootPath) {
          const nextTree = await readWorkspaceTree(rootPath);
          setTree(nextTree);
        }
        return true;
      } catch (err) {
        setErrorMessage(formatFsError(err, 'Impossible de supprimer cet élément.'));
        return false;
      }
    },
    [clearPendingTimer, rootPath]
  );

  const dismissError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const reportError = useCallback((message: string) => {
    setErrorMessage(message);
  }, []);

  const clearActiveNote = useCallback(async () => {
    await flushPendingSave();
    setActiveNote(null);
    setSaveStatus('idle');
  }, [flushPendingSave]);

  return {
    rootPath,
    rootName,
    tree,
    expandedFolders,
    activeNote,
    saveStatus,
    isInitializing,
    isRefreshing,
    errorMessage,
    openRootFolder,
    closeWorkspace,
    refreshTree,
    toggleFolder,
    selectNote,
    updateNoteContent,
    flushPendingSave,
    enqueueWrite,
    clearActiveNote,
    createNewNote,
    createNewFolder,
    renameNode,
    deleteNode,
    dismissError,
    reportError,
  };
}

