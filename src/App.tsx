import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileDown, Minimize2, X } from 'lucide-react';
import { AiSettingsModal } from './components/AiSettingsModal';
import { EditorArea, type EditorAreaHandle } from './components/EditorArea';
import { FlashcardReviewModal } from './components/FlashcardReviewModal';
import { QuickSearchModal } from './components/QuickSearchModal';
import { Sidebar } from './components/Sidebar';
import { StatusBar } from './components/StatusBar';
import { TabBar } from './components/TabBar';
import { TopBar } from './components/TopBar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useAiWorkspace } from './hooks/useAiWorkspace';
import { useAppUpdater } from './hooks/useAppUpdater';
import { useTheme } from './hooks/useTheme';
import { useTabWorkspace } from './hooks/useTabWorkspace';
import { exportLatexDocumentFile, formatFsError } from './services/fsService';
import { exportNoteToLatex } from './services/latexExportService';
import { flattenWorkspaceNotes } from './services/searchService';

const OUTLINE_STORAGE_KEY = 'softmath:outlineOpen';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const {
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
    refreshTree,
    toggleFolder,
    selectNote,
    updateNoteContent,
    flushPendingSave,
    createNewNote,
    createNewFolder,
    renameNode,
    deleteNode,
    dismissError,
    reportError,
    openTabs,
    activeTabPath,
    dirtyTabPaths,
    switchTab,
    closeTab,
    closeOtherTabs,
    cycleTab,
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
  } = useTabWorkspace();

  const editorAreaRef = useRef<EditorAreaHandle>(null);

  const focusedNote =
    isSplitView && focusedPane === 'secondary' && secondaryNote
      ? secondaryNote
      : activeNote;
  const effectiveSaveStatus =
    isSplitView && focusedPane === 'secondary' && secondaryNote
      ? secondarySaveStatus
      : saveStatus;

  const ai = useAiWorkspace({
    activeNoteTitle: focusedNote?.displayName ?? null,
    activeNoteMarkdown: focusedNote?.content ?? null,
  });

  const updater = useAppUpdater({
    onBeforeInstall: flushPendingSave,
    onNotifyError: reportError,
  });

  const updaterProps = {
    status: updater.status,
    currentVersion: updater.currentVersion,
    availableVersion: updater.availableVersion,
    downloadProgress: updater.downloadProgress,
    errorMessage: updater.errorMessage,
    onCheckUpdates: () => {
      void updater.checkForUpdates({ silent: false, autoDownload: true });
    },
    onInstallUpdate: () => {
      void updater.installAndRestart();
    },
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isZenMode, setIsZenMode] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(OUTLINE_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isFlashcardsOpen, setIsFlashcardsOpen] = useState(false);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [focusTitleSignal, setFocusTitleSignal] = useState(0);
  const [latexFeedback, setLatexFeedback] = useState<string | null>(null);
  const latexFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (latexFeedbackTimerRef.current !== null) {
        clearTimeout(latexFeedbackTimerRef.current);
      }
    };
  }, []);

  const showLatexFeedback = useCallback((label: string) => {
    setLatexFeedback(label);
    if (latexFeedbackTimerRef.current !== null) {
      clearTimeout(latexFeedbackTimerRef.current);
    }
    latexFeedbackTimerRef.current = setTimeout(() => {
      latexFeedbackTimerRef.current = null;
      setLatexFeedback(null);
    }, 2500);
  }, []);

  const workspaceNotes = useMemo(() => {
    if (!rootPath) return [];
    return flattenWorkspaceNotes(tree, rootPath).map((entry) => ({
      path: entry.path,
      label: entry.relativeFolder
        ? `${entry.relativeFolder} / ${entry.displayName}`
        : entry.displayName,
    }));
  }, [tree, rootPath]);

  const toggleOutline = useCallback(() => {
    setIsOutlineOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(OUTLINE_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage failures.
      }
      return next;
    });
  }, []);

  const handleExportPdf = useCallback(async () => {
    const targetNote = focusedNote;
    if (!targetNote) {
      return;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.dispatchEvent(new CustomEvent('softmath:lock-drawings-for-print'));
    await flushPendingSave();

    const prevTitle = document.title;
    const wasDark = theme === 'dark';

    document.title = targetNote.displayName || 'SoftMath';

    if (wasDark) {
      setIsPreparingPrint(true);
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            window.setTimeout(resolve, 120);
          });
        });
      });
    } else {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    }

    let restored = false;
    const restoreAfterPrint = () => {
      if (restored) {
        return;
      }
      restored = true;
      document.title = prevTitle;
      if (wasDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.style.colorScheme = 'dark';
        setIsPreparingPrint(false);
      }
    };

    window.addEventListener('afterprint', restoreAfterPrint, { once: true });
    window.print();
    window.addEventListener('focus', restoreAfterPrint, { once: true });
    window.setTimeout(restoreAfterPrint, 1200);
  }, [focusedNote, theme, flushPendingSave]);

  const handleExportLatex = useCallback(async () => {
    if (!focusedNote) {
      return;
    }
    await flushPendingSave();
    const tex = exportNoteToLatex({
      title: focusedNote.displayName,
      content: focusedNote.content,
    });
    try {
      const savedPath = await exportLatexDocumentFile(focusedNote.displayName, tex);
      if (savedPath) {
        showLatexFeedback('Export .tex OK');
      }
    } catch (err) {
      reportError(
        formatFsError(err, "Impossible d'exporter le document en LaTeX (.tex).")
      );
    }
  }, [focusedNote, flushPendingSave, reportError, showLatexFeedback]);

  const handleCopyLatex = useCallback(async () => {
    if (!focusedNote) {
      return;
    }
    const tex = exportNoteToLatex({
      title: focusedNote.displayName,
      content: focusedNote.content,
    });
    try {
      await navigator.clipboard.writeText(tex);
      showLatexFeedback('LaTeX copié');
    } catch {
      reportError('Impossible de copier le code LaTeX dans le presse-papiers.');
    }
  }, [focusedNote, reportError, showLatexFeedback]);

  const handleCreateNote = useCallback(
    async (parentDir?: string) => {
      const createdPath = await createNewNote(parentDir);
      if (createdPath) {
        setFocusTitleSignal((prev) => prev + 1);
      }
    },
    [createNewNote]
  );

  // Global keyboard shortcuts (Ctrl/Cmd+B, Ctrl/Cmd+N, Ctrl/Cmd+S)
  useEffect(() => {
    if (!rootPath && isZenMode) {
      setIsZenMode(false);
    }
  }, [rootPath, isZenMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11' && rootPath) {
        e.preventDefault();
        setIsZenMode((prev) => !prev);
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && e.altKey && !e.shiftKey && key === 'z' && rootPath) {
        e.preventDefault();
        setIsZenMode((prev) => !prev);
        return;
      }

      if (!mod || e.altKey) {
        return;
      }

      if ((key === 'p' || key === 'k') && !e.shiftKey && rootPath) {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (key === 'r' && e.shiftKey && rootPath) {
        e.preventDefault();
        setIsFlashcardsOpen((prev) => !prev);
      } else if (
        ((key === 'b' && e.shiftKey) || (e.key === '\\' && !e.shiftKey)) &&
        rootPath
      ) {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      } else if (key === 'n' && !e.shiftKey && rootPath) {
        e.preventDefault();
        void handleCreateNote();
      } else if (key === 'w' && !e.shiftKey && activeTabPath) {
        e.preventDefault();
        void closeTab(activeTabPath);
      } else if (e.key === 'Tab' && rootPath && openTabs.length > 1) {
        e.preventDefault();
        void cycleTab(e.shiftKey ? -1 : 1);
      } else if (key === 's' && !e.shiftKey && (activeNote || secondaryNote)) {
        e.preventDefault();
        void flushPendingSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    rootPath,
    activeNote,
    secondaryNote,
    activeTabPath,
    openTabs.length,
    handleCreateNote,
    flushPendingSave,
    closeTab,
    cycleTab,
  ]);

  if (isInitializing) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white dark:bg-[#111113]" />
    );
  }

  if (!rootPath) {
    return (
      <WelcomeScreen
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenFolder={() => {
          void openRootFolder();
        }}
        errorMessage={errorMessage}
        onDismissError={dismissError}
        updaterProps={updaterProps}
      />
    );
  }

  const effectiveEditorTheme = isPreparingPrint ? 'light' : theme;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-white text-stone-900 print:block print:h-auto print:overflow-visible print:bg-white print:text-stone-900 dark:bg-[#111113] dark:text-zinc-100">
      <div className="flex min-h-0 flex-1 overflow-hidden print:block print:h-auto print:overflow-visible">
        <Sidebar
          isOpen={isSidebarOpen && !isZenMode}
          rootPath={rootPath}
          rootName={rootName}
          tree={tree}
          expandedFolders={expandedFolders}
          activeNotePath={activeNote?.path ?? null}
          isRefreshing={isRefreshing}
          onOpenFolder={() => {
            void openRootFolder();
          }}
          onRefresh={() => {
            void refreshTree();
          }}
          onCreateNote={(parentDir) => {
            void handleCreateNote(parentDir);
          }}
          onCreateFolder={(parentDir) => {
            void createNewFolder(parentDir);
          }}
          onToggleFolder={toggleFolder}
          onSelectNote={(node) => {
            void selectNote(node);
          }}
          onRenameNode={renameNode}
          onDeleteNode={(node) => {
            void deleteNode(node);
          }}
        />

        <div className="relative flex min-w-0 flex-1 flex-col print:block print:h-auto print:overflow-visible">
          {!isZenMode && (
            <>
              <TopBar
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
                isOutlineOpen={isOutlineOpen}
                onToggleOutline={toggleOutline}
                isSplitView={isSplitView}
                onToggleSplitView={() => {
                  void toggleSplitView();
                }}
                onOpenFlashcards={() => setIsFlashcardsOpen(true)}
                isCopilotOpen={ai.copilotOpen}
                onToggleCopilot={() => ai.setCopilotOpen((prev) => !prev)}
                onOpenAiSettings={() => ai.setSettingsOpen(true)}
                isZenMode={isZenMode}
                onToggleZenMode={() => setIsZenMode((prev) => !prev)}
              onOpenSearch={() => setIsSearchOpen(true)}
              onExportPdf={() => {
                void handleExportPdf();
              }}
              onExportLatex={() => {
                void handleExportLatex();
              }}
              onCopyLatex={() => {
                void handleCopyLatex();
              }}
              latexFeedback={latexFeedback}
              rootPath={rootPath}
              rootName={rootName}
              activeNote={focusedNote}
              saveStatus={effectiveSaveStatus}
              theme={theme}
              onToggleTheme={toggleTheme}
            />

            <TabBar
              tabs={openTabs}
              activeTabPath={activeTabPath}
              secondaryTabPath={isSplitView ? (secondaryNote?.path ?? null) : null}
              dirtyPaths={dirtyTabPaths}
              rootPath={rootPath}
              onSelectTab={(path) => {
                void switchTab(path);
              }}
              onOpenSplitTab={(path) => {
                void openSecondaryNoteByPath(path);
              }}
              onCloseTab={(path) => {
                void closeTab(path);
              }}
              onCloseOtherTabs={(path) => {
                void closeOtherTabs(path);
              }}
              onCreateNote={() => {
                void handleCreateNote();
              }}
            />
          </>
        )}

        {isZenMode && (
          <div className="fixed right-4 top-3 z-30 flex items-center gap-1.5 rounded-full border border-stone-200/80 bg-white/85 px-2.5 py-1 text-xs text-stone-600 opacity-50 shadow-sm backdrop-blur-md transition-opacity hover:opacity-100 print:hidden dark:border-zinc-700/80 dark:bg-zinc-900/85 dark:text-zinc-300">
            {focusedNote && (
              <button
                type="button"
                onClick={() => {
                  void handleExportPdf();
                }}
                title="Exporter la note en PDF"
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>PDF</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsZenMode(false)}
              title="Quitter le mode sans distraction (F11)"
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <Minimize2 className="h-3.5 w-3.5" />
              <span>Quitter Zen</span>
            </button>
          </div>
        )}

        <EditorArea
          ref={editorAreaRef}
          activeNote={activeNote}
          theme={effectiveEditorTheme}
          isOutlineOpen={isOutlineOpen && !isZenMode}
          onCloseOutline={toggleOutline}
          focusTitleSignal={focusTitleSignal}
          onChangeContent={updateNoteContent}
          onRenameActiveNote={(newName) => {
            if (!activeNote) {
              return Promise.resolve(false);
            }
            return renameNode({ path: activeNote.path, kind: 'note' }, newName);
          }}
          onCreateNote={() => {
            void handleCreateNote();
          }}
          onNotifyError={reportError}
          isSplitView={isSplitView}
          secondaryNote={secondaryNote}
          focusedPane={focusedPane}
          onFocusPane={setFocusedPane}
          onChangeSecondaryContent={updateSecondaryNoteContent}
          onRenameSecondaryNote={(newName) => {
            if (!secondaryNote) {
              return Promise.resolve(false);
            }
            return renameNode({ path: secondaryNote.path, kind: 'note' }, newName);
          }}
          workspaceNotes={workspaceNotes}
          onSelectSecondaryPath={(path) => {
            void openSecondaryNoteByPath(path);
          }}
          onSwapSplitPanes={() => {
            void swapSplitPanes();
          }}
          onCloseSplitView={() => {
            void closeSplitView();
          }}
          copilotOpen={ai.copilotOpen && !isZenMode}
          onCloseCopilot={() => ai.setCopilotOpen(false)}
          onOpenAiSettings={() => ai.setSettingsOpen(true)}
          copilotMessages={ai.messages}
          isCopilotStreaming={ai.isCopilotStreaming}
          onSendCopilotMessage={ai.sendCopilotMessage}
          onStopCopilotStreaming={ai.stopCopilotGeneration}
          onClearCopilotMessages={ai.clearCopilotMessages}
          inlineTask={ai.inlineTask}
          onAiInlineAction={(payload, bridge) => {
            void ai.runInlineAction(payload, bridge);
          }}
          onOcrImage={(image, bridge) => {
            void ai.runOcrFromImage(image, bridge);
          }}
          onAbortInlineTask={ai.abortInlineTask}
          onDismissInlineError={ai.dismissInlineError}
        />
        </div>
      </div>

      {!isZenMode && (
        <StatusBar
          settings={ai.settings}
          ollamaStatus={ai.ollamaStatus}
          ollamaHealth={ai.ollamaHealth}
          activeRoute={ai.activeRoute}
          isStreaming={ai.isCopilotStreaming || ai.inlineTask?.status === 'streaming'}
          copilotOpen={ai.copilotOpen}
          hasActiveNote={Boolean(focusedNote)}
          onSelectProfile={ai.setProfileMode}
          onRefreshOllama={() => {
            void ai.refreshOllamaHealth();
          }}
          onOpenSettings={() => ai.setSettingsOpen(true)}
          onToggleCopilot={() => ai.setCopilotOpen((prev) => !prev)}
          onScanOcrImage={(image) => {
            const bridge = editorAreaRef.current?.getAiBridge();
            if (bridge) {
              void ai.runOcrFromImage(image, bridge);
            }
          }}
          onNotifyError={reportError}
          updaterProps={updaterProps}
        />
      )}

      <AiSettingsModal
        isOpen={ai.settingsOpen}
        settings={ai.settings}
        secrets={ai.secrets}
        ollamaStatus={ai.ollamaStatus}
        ollamaHealth={ai.ollamaHealth}
        onRefreshOllama={ai.refreshOllamaHealth}
        onSave={ai.updateSettingsAndSecrets}
        onClose={() => ai.setSettingsOpen(false)}
      />

      <QuickSearchModal
        isOpen={isSearchOpen}
        rootPath={rootPath}
        tree={tree}
        activeNote={activeNote}
        onClose={() => setIsSearchOpen(false)}
        onSelectNote={selectNote}
      />

      <FlashcardReviewModal
        isOpen={isFlashcardsOpen}
        onClose={() => setIsFlashcardsOpen(false)}
        rootPath={rootPath}
        tree={tree}
        openTabs={openTabs}
        activeNote={focusedNote}
        secondaryNote={secondaryNote}
        onOpenSourceNote={(notePath) => {
          void switchTab(notePath);
        }}
      />

      {errorMessage && (
        <div
          role="alert"
          className="fixed bottom-9 right-4 z-50 flex max-w-sm items-start gap-2.5 rounded-lg border border-red-200 bg-white px-3.5 py-2.5 text-xs text-red-700 shadow-lg print:hidden dark:border-red-900/60 dark:bg-zinc-900 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1 leading-relaxed">{errorMessage}</span>
          <button
            type="button"
            onClick={dismissError}
            aria-label="Fermer l'alerte"
            className="rounded p-0.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-950/60"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;

