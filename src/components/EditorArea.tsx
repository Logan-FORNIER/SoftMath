import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ArrowLeftRight,
  FilePlus,
  Sigma,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import {
  RichMarkdownEditor,
  type RichMarkdownEditorHandle,
} from '../editor/components/RichMarkdownEditor';
import type { EditorAiBridge, InlineAiTaskState } from '../hooks/useAiWorkspace';
import type {
  AiChatMessage,
  AiContextSelectionPayload,
  AiImageAttachment,
} from '../types/ai';
import type { OpenNote, OutlineHeading, ThemeMode } from '../types/notes';
import { AiCopilotPanel } from './AiCopilotPanel';
import { MathMarkdownPreview } from './MathMarkdownPreview';
import { OutlinePanel } from './OutlinePanel';

export interface EditorAreaHandle {
  getAiBridge: () => EditorAiBridge | null;
  triggerOcrFilePicker: () => void;
}

interface WorkspaceNoteOption {
  path: string;
  label: string;
}

interface EditorAreaProps {
  activeNote: OpenNote | null;
  theme: ThemeMode;
  isOutlineOpen: boolean;
  onCloseOutline: () => void;
  focusTitleSignal: number;
  onChangeContent: (content: string) => void;
  onRenameActiveNote: (newName: string) => Promise<boolean>;
  onCreateNote: () => void;
  onNotifyError?: (message: string) => void;
  // Vue scindée (2 notes côte à côte)
  isSplitView?: boolean;
  secondaryNote?: OpenNote | null;
  focusedPane?: 'primary' | 'secondary';
  onFocusPane?: (pane: 'primary' | 'secondary') => void;
  onChangeSecondaryContent?: (content: string) => void;
  onRenameSecondaryNote?: (newName: string) => Promise<boolean>;
  workspaceNotes?: WorkspaceNoteOption[];
  onSelectSecondaryPath?: (path: string) => void;
  onSwapSplitPanes?: () => void;
  onCloseSplitView?: () => void;
  // Intégration IA Hybride
  copilotOpen: boolean;
  onCloseCopilot: () => void;
  onOpenAiSettings: () => void;
  copilotMessages: AiChatMessage[];
  isCopilotStreaming: boolean;
  onSendCopilotMessage: (
    text: string,
    image?: AiImageAttachment | null,
  ) => Promise<void>;
  onStopCopilotStreaming: () => void;
  onClearCopilotMessages: () => void;
  inlineTask: InlineAiTaskState | null;
  onAiInlineAction: (
    payload: AiContextSelectionPayload,
    bridge: EditorAiBridge,
  ) => void;
  onOcrImage: (image: AiImageAttachment, bridge: EditorAiBridge) => void;
  onAbortInlineTask: () => void;
  onDismissInlineError: () => void;
}

interface NotePaneHandle {
  getAiBridge: () => EditorAiBridge | null;
  triggerOcrFilePicker: () => void;
  insertMarkdownAtCursor: (md: string) => void;
  scrollToHeading: (pos: number) => void;
}

interface NoteEditorPaneProps {
  note: OpenNote;
  theme: ThemeMode;
  focusTitleSignal?: number;
  onChangeContent: (content: string) => void;
  onRenameNote: (newName: string) => Promise<boolean>;
  onHeadingsChange: (headings: OutlineHeading[]) => void;
  onActiveHeadingChange: (headingId: string | null) => void;
  onNotifyError?: (message: string) => void;
  onAiInlineAction: (
    payload: AiContextSelectionPayload,
    bridge: EditorAiBridge,
  ) => void;
  onOcrImage: (image: AiImageAttachment, bridge: EditorAiBridge) => void;
}

const NoteEditorPane = forwardRef<NotePaneHandle, NoteEditorPaneProps>(
  function NoteEditorPane(
    {
      note,
      theme,
      focusTitleSignal = 0,
      onChangeContent,
      onRenameNote,
      onHeadingsChange,
      onActiveHeadingChange,
      onNotifyError,
      onAiInlineAction,
      onOcrImage,
    },
    ref,
  ) {
    const [titleDraft, setTitleDraft] = useState(note.displayName);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const editorRef = useRef<RichMarkdownEditorHandle>(null);
    const scrollContainerRef = useRef<HTMLElement>(null);
    const scrollRafRef = useRef<number | null>(null);
    const escapeCancelledRef = useRef(false);
    const headingsRef = useRef<OutlineHeading[]>([]);

    const buildAiBridge = useCallback((): EditorAiBridge | null => {
      if (!editorRef.current) return null;
      return {
        insertMarkdownAtCursor: (md) =>
          editorRef.current?.insertMarkdownAtCursor(md),
        replaceRangeWithMarkdown: (from, to, md) =>
          editorRef.current?.replaceRangeWithMarkdown(from, to, md),
        insertMarkdownAfter: (pos, md) =>
          editorRef.current?.insertMarkdownAfter(pos, md),
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        getAiBridge: buildAiBridge,
        triggerOcrFilePicker: () => {
          editorRef.current?.triggerOcrFilePicker();
        },
        insertMarkdownAtCursor: (md) => {
          editorRef.current?.insertMarkdownAtCursor(md);
        },
        scrollToHeading: (pos) => {
          editorRef.current?.scrollToHeading(pos);
        },
      }),
      [buildAiBridge],
    );

    useEffect(() => {
      setTitleDraft(note.displayName);
      escapeCancelledRef.current = false;
    }, [note.path, note.displayName]);

    useEffect(() => {
      return () => {
        if (scrollRafRef.current !== null) {
          window.cancelAnimationFrame(scrollRafRef.current);
        }
      };
    }, []);

    useEffect(() => {
      if (focusTitleSignal > 0) {
        requestAnimationFrame(() => {
          titleInputRef.current?.focus();
          titleInputRef.current?.select();
        });
      }
    }, [focusTitleSignal, note.path]);

    const syncActiveHeadingOnScroll = useCallback(() => {
      const container = scrollContainerRef.current;
      const currentHeadings = headingsRef.current;
      if (!container || currentHeadings.length === 0) {
        onActiveHeadingChange(null);
        return;
      }

      const domHeadings = container.querySelectorAll(
        '.softmath-prose h1, .softmath-prose h2, .softmath-prose h3'
      );
      const nonEmptyDom: HTMLElement[] = [];
      for (const el of domHeadings) {
        if (el instanceof HTMLElement && el.textContent?.trim()) {
          nonEmptyDom.push(el);
        }
      }

      if (nonEmptyDom.length === 0) {
        onActiveHeadingChange(currentHeadings[0]?.id ?? null);
        return;
      }

      const thresholdTop = container.getBoundingClientRect().top + 88;
      let activeIdx = 0;
      const count = Math.min(nonEmptyDom.length, currentHeadings.length);
      for (let i = 0; i < count; i += 1) {
        if (nonEmptyDom[i].getBoundingClientRect().top <= thresholdTop) {
          activeIdx = i;
        } else {
          break;
        }
      }

      onActiveHeadingChange(currentHeadings[activeIdx]?.id ?? null);
    }, [onActiveHeadingChange]);

    const handleScroll = useCallback(() => {
      if (scrollRafRef.current !== null) {
        return;
      }
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        syncActiveHeadingOnScroll();
      });
    }, [syncActiveHeadingOnScroll]);

    const handleLocalHeadingsChange = useCallback(
      (nextHeadings: OutlineHeading[]) => {
        headingsRef.current = nextHeadings;
        onHeadingsChange(nextHeadings);
      },
      [onHeadingsChange],
    );

    const commitTitleRename = async () => {
      if (escapeCancelledRef.current) {
        escapeCancelledRef.current = false;
        return;
      }
      const trimmed = titleDraft.trim();
      if (!trimmed || trimmed === note.displayName) {
        setTitleDraft(note.displayName);
        return;
      }
      const ok = await onRenameNote(trimmed);
      if (!ok) {
        setTitleDraft(note.displayName);
      }
    };

    return (
      <main
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex flex-1 flex-col overflow-y-auto bg-white print:block print:h-auto print:overflow-visible print:bg-white dark:bg-[#111113]"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-8 pb-20 pt-10 sm:px-12 sm:pt-12 print:max-w-none print:px-0 print:pb-0 print:pt-0">
          <input
            ref={titleInputRef}
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              void commitTitleRename();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitTitleRename().then(() => {
                  editorRef.current?.focusStart();
                });
              } else if (e.key === 'Escape') {
                e.preventDefault();
                escapeCancelledRef.current = true;
                setTitleDraft(note.displayName);
                titleInputRef.current?.blur();
              }
            }}
            placeholder="Titre de la note"
            aria-label="Titre de la note"
            className="w-full border-none bg-transparent text-3xl font-semibold tracking-tight text-stone-900 placeholder:text-stone-300 focus:outline-none print:text-stone-900 dark:text-zinc-100 dark:placeholder:text-zinc-700"
          />

          <div className="my-5 h-px w-full bg-stone-100 print:bg-stone-200 dark:bg-zinc-800/70" />

          <RichMarkdownEditor
            ref={editorRef}
            sessionId={note.sessionId}
            notePath={note.path}
            theme={theme}
            markdown={note.content}
            onChangeMarkdown={onChangeContent}
            onHeadingsChange={handleLocalHeadingsChange}
            onNotifyError={onNotifyError}
            onAiInlineAction={onAiInlineAction}
            onOcrImage={onOcrImage}
          />
        </div>
      </main>
    );
  }
);

export const EditorArea = forwardRef<EditorAreaHandle, EditorAreaProps>(
  function EditorArea(
    {
      activeNote,
      theme,
      isOutlineOpen,
      onCloseOutline,
      focusTitleSignal,
      onChangeContent,
      onRenameActiveNote,
      onCreateNote,
      onNotifyError,
      isSplitView = false,
      secondaryNote = null,
      focusedPane = 'primary',
      onFocusPane,
      onChangeSecondaryContent,
      onRenameSecondaryNote,
      workspaceNotes = [],
      onSelectSecondaryPath,
      onSwapSplitPanes,
      onCloseSplitView,
      copilotOpen,
      onCloseCopilot,
      onOpenAiSettings,
      copilotMessages,
      isCopilotStreaming,
      onSendCopilotMessage,
      onStopCopilotStreaming,
      onClearCopilotMessages,
      inlineTask,
      onAiInlineAction,
      onOcrImage,
      onAbortInlineTask,
      onDismissInlineError,
    },
    ref,
  ) {
    const primaryPaneRef = useRef<NotePaneHandle>(null);
    const secondaryPaneRef = useRef<NotePaneHandle>(null);

    const [primaryHeadings, setPrimaryHeadings] = useState<OutlineHeading[]>([]);
    const [primaryActiveHeadingId, setPrimaryActiveHeadingId] = useState<string | null>(null);
    const [secondaryHeadings, setSecondaryHeadings] = useState<OutlineHeading[]>([]);
    const [secondaryActiveHeadingId, setSecondaryActiveHeadingId] = useState<string | null>(null);

    useEffect(() => {
      if (!activeNote) {
        setPrimaryHeadings([]);
        setPrimaryActiveHeadingId(null);
      }
    }, [activeNote]);

    useEffect(() => {
      if (!secondaryNote || !isSplitView) {
        setSecondaryHeadings([]);
        setSecondaryActiveHeadingId(null);
      }
    }, [secondaryNote, isSplitView]);

    const isSecondarySameAsPrimary = Boolean(
      isSplitView &&
        activeNote &&
        secondaryNote &&
        secondaryNote.path === activeNote.path
    );

    const useSecondaryPaneTarget = Boolean(
      isSplitView &&
        focusedPane === 'secondary' &&
        secondaryNote &&
        !isSecondarySameAsPrimary
    );

    const getTargetPaneRef = useCallback(
      () => (useSecondaryPaneTarget ? secondaryPaneRef.current : primaryPaneRef.current),
      [useSecondaryPaneTarget]
    );

    useImperativeHandle(
      ref,
      () => ({
        getAiBridge: () => getTargetPaneRef()?.getAiBridge() ?? null,
        triggerOcrFilePicker: () => {
          getTargetPaneRef()?.triggerOcrFilePicker();
        },
      }),
      [getTargetPaneRef],
    );

    const handlePrimaryHeadingsChange = useCallback((next: OutlineHeading[]) => {
      setPrimaryHeadings(next);
      setPrimaryActiveHeadingId((prev) =>
        prev && next.some((h) => h.id === prev) ? prev : (next[0]?.id ?? null)
      );
    }, []);

    const handleSecondaryHeadingsChange = useCallback((next: OutlineHeading[]) => {
      setSecondaryHeadings(next);
      setSecondaryActiveHeadingId((prev) =>
        prev && next.some((h) => h.id === prev) ? prev : (next[0]?.id ?? null)
      );
    }, []);

    const outlineNote = useSecondaryPaneTarget ? secondaryNote : activeNote;
    const outlineHeadings = useSecondaryPaneTarget
      ? secondaryHeadings
      : primaryHeadings;
    const outlineActiveHeadingId = useSecondaryPaneTarget
      ? secondaryActiveHeadingId
      : primaryActiveHeadingId;
    const copilotTargetNote = outlineNote ?? activeNote;

    const printHidePrimary = isSplitView && focusedPane === 'secondary' && Boolean(secondaryNote);
    const printHideSecondary = !isSplitView || focusedPane !== 'secondary' || !secondaryNote;

    return (
      <div className="flex min-h-0 flex-1 overflow-hidden print:block print:h-auto print:overflow-visible">
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden md:flex-row print:block print:overflow-visible">
          {/* Panneau Principal */}
          <div
            onMouseDown={() => onFocusPane?.('primary')}
            onFocusCapture={() => onFocusPane?.('primary')}
            className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible ${
              printHidePrimary ? 'print:hidden' : 'print:block'
            } ${
              isSplitView
                ? focusedPane === 'primary'
                  ? 'border-t-2 border-t-indigo-500 print:border-t-0'
                  : 'border-t-2 border-t-transparent print:border-t-0'
                : ''
            }`}
          >
            {!activeNote ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200/80 bg-stone-50 text-stone-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
                  <Sigma className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-stone-700 dark:text-zinc-200">
                  Aucune note sélectionnée
                </p>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-stone-400 dark:text-zinc-500">
                  Choisissez une note dans l&apos;explorateur à gauche ou créez-en une nouvelle.
                </p>
                <button
                  type="button"
                  onClick={onCreateNote}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3.5 py-2 text-xs font-medium text-stone-700 shadow-2xs transition-colors hover:bg-stone-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <FilePlus className="h-3.5 w-3.5" />
                  Nouvelle note
                  <span className="ml-1 text-[11px] text-stone-400 dark:text-zinc-500">
                    Ctrl+N
                  </span>
                </button>
              </div>
            ) : (
              <NoteEditorPane
                ref={primaryPaneRef}
                note={activeNote}
                theme={theme}
                focusTitleSignal={focusTitleSignal}
                onChangeContent={onChangeContent}
                onRenameNote={onRenameActiveNote}
                onHeadingsChange={handlePrimaryHeadingsChange}
                onActiveHeadingChange={setPrimaryActiveHeadingId}
                onNotifyError={onNotifyError}
                onAiInlineAction={onAiInlineAction}
                onOcrImage={onOcrImage}
              />
            )}
          </div>

          {/* Panneau Secondaire (Vue scindée) */}
          {isSplitView && (
            <div
              onMouseDown={() => onFocusPane?.('secondary')}
              onFocusCapture={() => onFocusPane?.('secondary')}
              data-testid="split-secondary-pane"
              className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-stone-200 md:border-l md:border-t-0 print:border-0 print:overflow-visible dark:border-zinc-800 ${
                printHideSecondary ? 'print:hidden' : 'print:block'
              } ${
                focusedPane === 'secondary'
                  ? 'border-t-2 border-t-indigo-500 md:border-t-2 print:border-t-0'
                  : 'md:border-t-2 md:border-t-transparent print:border-t-0'
              }`}
            >
              {/* Barre d'en-tête du panneau secondaire */}
              <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-stone-200/80 bg-stone-50/80 px-3 text-xs print:hidden dark:border-zinc-800 dark:bg-zinc-900/70">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0 text-[10px] font-semibold tracking-wider text-stone-400 uppercase dark:text-zinc-500">
                    Vue scindée
                  </span>
                  <select
                    value={secondaryNote?.path ?? ''}
                    onChange={(e) => {
                      const chosen = e.target.value;
                      if (chosen) {
                        onSelectSecondaryPath?.(chosen);
                      }
                    }}
                    aria-label="Choisir la note du panneau droit"
                    className="min-w-0 flex-1 truncate rounded-md border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700 focus:border-indigo-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                  >
                    <option value="">Choisir une note…</option>
                    {workspaceNotes.map((opt) => (
                      <option key={opt.path} value={opt.path}>
                        {opt.label}
                        {activeNote?.path === opt.path ? ' (ouverte à gauche)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSwapSplitPanes?.()}
                    disabled={
                      !activeNote ||
                      !secondaryNote ||
                      activeNote.path === secondaryNote.path
                    }
                    title="Inverser les deux panneaux"
                    aria-label="Inverser les deux panneaux"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 disabled:opacity-35 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCloseSplitView?.()}
                    title="Fermer la vue scindée"
                    aria-label="Fermer la vue scindée"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {!secondaryNote ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-stone-500 dark:text-zinc-400">
                  <p className="text-sm font-medium text-stone-700 dark:text-zinc-200">
                    Aucune note dans le panneau secondaire
                  </p>
                  <p className="mt-1 max-w-xs text-xs leading-relaxed text-stone-400 dark:text-zinc-500">
                    Sélectionnez une note dans le menu ci-dessus ou faites Alt+Clic sur un onglet pour l&apos;ouvrir ici.
                  </p>
                </div>
              ) : isSecondarySameAsPrimary && activeNote ? (
                <main className="flex flex-1 flex-col overflow-y-auto bg-white print:block print:h-auto print:overflow-visible dark:bg-[#111113]">
                  <div className="border-b border-indigo-200/70 bg-indigo-50/70 px-4 py-2 text-[11px] text-indigo-800 print:hidden dark:border-indigo-900/50 dark:bg-indigo-950/35 dark:text-indigo-200">
                    Note identique au panneau gauche · Aperçu synchronisé en lecture seule.
                  </div>
                  <div className="mx-auto w-full max-w-3xl flex-1 px-8 pb-20 pt-10 sm:px-12 sm:pt-12">
                    <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-zinc-100">
                      {activeNote.displayName}
                    </h1>
                    <div className="my-5 h-px w-full bg-stone-100 dark:bg-zinc-800/70" />
                    <div className="softmath-prose">
                      <MathMarkdownPreview content={activeNote.content} />
                    </div>
                  </div>
                </main>
              ) : (
                <NoteEditorPane
                  ref={secondaryPaneRef}
                  note={secondaryNote}
                  theme={theme}
                  onChangeContent={(md) => onChangeSecondaryContent?.(md)}
                  onRenameNote={(name) =>
                    onRenameSecondaryNote
                      ? onRenameSecondaryNote(name)
                      : Promise.resolve(false)
                  }
                  onHeadingsChange={handleSecondaryHeadingsChange}
                  onActiveHeadingChange={setSecondaryActiveHeadingId}
                  onNotifyError={onNotifyError}
                  onAiInlineAction={onAiInlineAction}
                  onOcrImage={onOcrImage}
                />
              )}
            </div>
          )}

          {/* Carte flottante non-bloquante pour streaming inline / OCR / erreurs IA */}
          {inlineTask && (
            <div
              data-testid="inline-ai-task-banner"
              className="pointer-events-auto absolute right-5 bottom-4 z-30 w-96 max-w-[calc(100%-2.5rem)] rounded-xl border border-stone-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm print:hidden dark:border-zinc-700 dark:bg-zinc-900/95"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{inlineTask.label}</span>
                </div>
                {inlineTask.status === 'streaming' ? (
                  <button
                    type="button"
                    onClick={onAbortInlineTask}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-rose-700"
                  >
                    <Square className="h-2.5 w-2.5 fill-current" />
                    Arrêter
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onDismissInlineError}
                    aria-label="Fermer l’erreur IA"
                    className="rounded p-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {inlineTask.route && (
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-stone-500 dark:text-zinc-400">
                  <span className="font-mono">
                    {inlineTask.route.provider} · {inlineTask.route.model}
                  </span>
                  {inlineTask.route.fallbackReason && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      {inlineTask.route.fallbackReason}
                    </span>
                  )}
                </div>
              )}

              {inlineTask.status === 'error' ? (
                <div className="space-y-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                  <p>{inlineTask.error}</p>
                  <button
                    type="button"
                    onClick={() => {
                      onDismissInlineError();
                      onOpenAiSettings();
                    }}
                    className="text-[11px] font-semibold underline hover:no-underline"
                  >
                    Ouvrir Paramètres IA
                  </button>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-stone-100 bg-stone-50/70 p-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <MathMarkdownPreview
                    content={inlineTask.streamedText}
                    isStreaming
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <OutlinePanel
          isOpen={isOutlineOpen && Boolean(outlineNote)}
          headings={outlineHeadings}
          activeHeadingId={outlineActiveHeadingId}
          onSelectHeading={(heading) => {
            if (useSecondaryPaneTarget) {
              setSecondaryActiveHeadingId(heading.id);
              secondaryPaneRef.current?.scrollToHeading(heading.pos);
            } else {
              setPrimaryActiveHeadingId(heading.id);
              primaryPaneRef.current?.scrollToHeading(heading.pos);
            }
          }}
          onClose={onCloseOutline}
        />

        <AiCopilotPanel
          isOpen={copilotOpen}
          noteTitle={copilotTargetNote?.displayName ?? null}
          hasActiveNote={Boolean(copilotTargetNote)}
          messages={copilotMessages}
          isStreaming={isCopilotStreaming}
          onSendMessage={onSendCopilotMessage}
          onStopStreaming={onStopCopilotStreaming}
          onClearMessages={onClearCopilotMessages}
          onInsertIntoNote={(md) =>
            getTargetPaneRef()?.insertMarkdownAtCursor(md)
          }
          onOpenSettings={onOpenAiSettings}
          onClose={onCloseCopilot}
          onNotifyError={onNotifyError}
        />
      </div>
    );
  }
);
