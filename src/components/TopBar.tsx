import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  Columns2,
  Copy,
  FileCode2,
  FileDown,
  Layers,
  ListTree,
  Loader2,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
} from 'lucide-react';
import { getRelativeSegments, stripMdExtension } from '../services/fsService';
import type { OpenNote, SaveStatus, ThemeMode } from '../types/notes';
import { ThemeToggle } from './ThemeToggle';

interface TopBarProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isOutlineOpen: boolean;
  onToggleOutline: () => void;
  isSplitView?: boolean;
  onToggleSplitView?: () => void;
  onOpenFlashcards?: () => void;
  isCopilotOpen?: boolean;
  onToggleCopilot?: () => void;
  onOpenAiSettings?: () => void;
  isZenMode?: boolean;
  onToggleZenMode?: () => void;
  onOpenSearch: () => void;
  onExportPdf: () => void;
  onExportLatex?: () => void;
  onCopyLatex?: () => void;
  latexFeedback?: string | null;
  rootPath: string;
  rootName: string;
  activeNote: OpenNote | null;
  saveStatus: SaveStatus;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') {
    return null;
  }

  if (status === 'dirty') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-stone-400 dark:text-zinc-500">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Non enregistré
      </span>
    );
  }

  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-stone-400 dark:text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Enregistrement…
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
        <AlertCircle className="h-3.5 w-3.5" />
        Erreur
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-stone-400 dark:text-zinc-500">
      <Check className="h-3.5 w-3.5 text-emerald-500" />
      Enregistré
    </span>
  );
}

export function TopBar({
  isSidebarOpen,
  onToggleSidebar,
  isOutlineOpen,
  onToggleOutline,
  isSplitView = false,
  onToggleSplitView,
  onOpenFlashcards,
  isCopilotOpen = false,
  onToggleCopilot,
  onOpenAiSettings,
  isZenMode = false,
  onToggleZenMode,
  onOpenSearch,
  onExportPdf,
  onExportLatex,
  onCopyLatex,
  latexFeedback = null,
  rootPath,
  rootName,
  activeNote,
  saveStatus,
  theme,
  onToggleTheme,
}: TopBarProps) {
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isExportMenuOpen) {
      return;
    }
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setIsExportMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExportMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isExportMenuOpen]);

  const segments = activeNote
    ? getRelativeSegments(rootPath, activeNote.path).map((seg, idx, arr) =>
        idx === arr.length - 1 ? stripMdExtension(seg) : seg
      )
    : [];

  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-stone-200/70 bg-white px-3 print:hidden dark:border-zinc-800/80 dark:bg-[#111113]">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={
            isSidebarOpen
              ? 'Masquer la barre latérale (Ctrl+Maj+B)'
              : 'Afficher la barre latérale (Ctrl+Maj+B)'
          }
          aria-label={
            isSidebarOpen ? 'Masquer la barre latérale' : 'Afficher la barre latérale'
          }
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          {isSidebarOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </button>

        {activeNote ? (
          <nav
            aria-label="Chemin de la note"
            className="flex min-w-0 items-center gap-1.5 text-xs text-stone-400 dark:text-zinc-500"
          >
            <span className="truncate">{rootName}</span>
            {segments.map((segment, index) => {
              const isLast = index === segments.length - 1;
              return (
                <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-stone-300 dark:text-zinc-700">/</span>
                  <span
                    className={`truncate ${
                      isLast
                        ? 'font-medium text-stone-700 dark:text-zinc-200'
                        : 'text-stone-400 dark:text-zinc-500'
                    }`}
                  >
                    {segment}
                  </span>
                </span>
              );
            })}
          </nav>
        ) : (
          <span className="truncate text-xs text-stone-400 dark:text-zinc-500">
            {rootName}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {activeNote && <SaveStatusIndicator status={saveStatus} />}

        <button
          type="button"
          onClick={onOpenSearch}
          title="Rechercher dans les notes (Ctrl+K ou Ctrl+P)"
          aria-label="Recherche rapide"
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Rechercher</span>
          <kbd className="hidden rounded border border-stone-200 px-1 py-0.2 font-sans text-[10px] text-stone-400 lg:inline dark:border-zinc-700 dark:text-zinc-500">
            Ctrl+K
          </kbd>
        </button>

        {onOpenFlashcards && (
          <button
            type="button"
            data-testid="topbar-open-flashcards"
            onClick={onOpenFlashcards}
            title="Mode Révision — Flashcards (Ctrl+Maj+R)"
            aria-label="Ouvrir le mode Révision"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-stone-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:text-zinc-300 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300"
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Réviser</span>
          </button>
        )}

        {activeNote && (
          <>
            {onToggleSplitView && (
              <button
                type="button"
                data-testid="topbar-toggle-split"
                onClick={onToggleSplitView}
                aria-pressed={isSplitView}
                title={
                  isSplitView
                    ? 'Fermer la vue scindée'
                    : 'Vue scindée (2 notes côte à côte)'
                }
                aria-label="Basculer la vue scindée"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                  isSplitView
                    ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400'
                    : 'text-stone-500 hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                }`}
              >
                <Columns2 className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onToggleOutline}
              aria-pressed={isOutlineOpen}
              title={
                isOutlineOpen
                  ? 'Masquer la table des matières'
                  : 'Afficher la table des matières'
              }
              aria-label="Basculer la table des matières"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                isOutlineOpen
                  ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400'
                  : 'text-stone-500 hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
              }`}
            >
              <ListTree className="h-4 w-4" />
            </button>

            {onToggleCopilot && (
              <button
                type="button"
                data-testid="topbar-toggle-copilot"
                onClick={onToggleCopilot}
                aria-pressed={isCopilotOpen}
                title={
                  isCopilotOpen
                    ? 'Masquer le Copilote IA'
                    : 'Afficher le Copilote IA'
                }
                aria-label="Basculer le Copilote IA"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                  isCopilotOpen
                    ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400'
                    : 'text-stone-500 hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                }`}
              >
                <Bot className="h-4 w-4" />
              </button>
            )}

            {onOpenAiSettings && (
              <button
                type="button"
                data-testid="topbar-open-ai-settings"
                onClick={onOpenAiSettings}
                title="Paramètres IA (Clés API & Ollama)"
                aria-label="Ouvrir les paramètres IA"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            )}

            <div ref={exportMenuRef} className="relative">
              <button
                type="button"
                data-testid="topbar-export-menu"
                onClick={() => setIsExportMenuOpen((prev) => !prev)}
                aria-expanded={isExportMenuOpen}
                aria-haspopup="menu"
                title="Exporter la note (PDF ou LaTeX .tex)"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-stone-200/90 bg-white px-2.5 text-xs font-medium text-stone-700 shadow-2xs transition-colors hover:bg-stone-50 hover:text-stone-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {latexFeedback ? latexFeedback : 'Exporter'}
                </span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>

              {isExportMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-1.5 w-52 overflow-hidden rounded-lg border border-stone-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsExportMenuOpen(false);
                      onExportPdf();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-stone-700 transition-colors hover:bg-stone-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <FileDown className="h-3.5 w-3.5 text-stone-400" />
                    <span>Exporter en PDF…</span>
                  </button>

                  {onExportLatex && (
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="export-latex-file"
                      onClick={() => {
                        setIsExportMenuOpen(false);
                        onExportLatex();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-stone-700 transition-colors hover:bg-stone-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <FileCode2 className="h-3.5 w-3.5 text-indigo-500" />
                      <span>Exporter en LaTeX (.tex)…</span>
                    </button>
                  )}

                  {onCopyLatex && (
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="copy-latex-code"
                      onClick={() => {
                        setIsExportMenuOpen(false);
                        onCopyLatex();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-stone-700 transition-colors hover:bg-stone-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <Copy className="h-3.5 w-3.5 text-stone-400" />
                      <span>Copier le code LaTeX</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {onToggleZenMode && (
              <button
                type="button"
                onClick={onToggleZenMode}
                aria-pressed={isZenMode}
                title={
                  isZenMode
                    ? 'Quitter le mode sans distraction (F11)'
                    : 'Mode sans distraction (F11 / Ctrl+Alt+Z)'
                }
                aria-label="Basculer le mode sans distraction"
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                  isZenMode
                    ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400'
                    : 'text-stone-500 hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                }`}
              >
                {isZenMode ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
            )}
          </>
        )}

        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  );
}

