import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { FilePlus, Sigma, Sparkles, Square, X } from 'lucide-react';
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
  const [titleDraft, setTitleDraft] = useState(activeNote?.displayName ?? '');
  const [headings, setHeadings] = useState<OutlineHeading[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichMarkdownEditorHandle>(null);

  const buildAiBridge = useCallback((): EditorAiBridge | null => {
    if (!editorRef.current) return null;
    return {
      insertMarkdownAtCursor: (md) => editorRef.current?.insertMarkdownAtCursor(md),
      replaceRangeWithMarkdown: (from, to, md) =>
        editorRef.current?.replaceRangeWithMarkdown(from, to, md),
      insertMarkdownAfter: (pos, md) => editorRef.current?.insertMarkdownAfter(pos, md),
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getAiBridge: buildAiBridge,
      triggerOcrFilePicker: () => {
        editorRef.current?.triggerOcrFilePicker();
      },
    }),
    [buildAiBridge],
  );
  const scrollContainerRef = useRef<HTMLElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const escapeCancelledRef = useRef(false);

  const headingsRef = useRef(headings);
  headingsRef.current = headings;

  useEffect(() => {
    setTitleDraft(activeNote?.displayName ?? '');
    escapeCancelledRef.current = false;
  }, [activeNote?.path, activeNote?.displayName]);

  useEffect(() => {
    if (!activeNote) {
      setHeadings([]);
      setActiveHeadingId(null);
    }
  }, [activeNote]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  const syncActiveHeadingOnScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    const currentHeadings = headingsRef.current;
    if (!container || currentHeadings.length === 0) {
      setActiveHeadingId(null);
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
      setActiveHeadingId(currentHeadings[0]?.id ?? null);
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

    setActiveHeadingId(currentHeadings[activeIdx]?.id ?? null);
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current !== null) {
      return;
    }
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null;
      syncActiveHeadingOnScroll();
    });
  }, [syncActiveHeadingOnScroll]);

  const handleHeadingsChange = useCallback((nextHeadings: OutlineHeading[]) => {
    setHeadings(nextHeadings);
    setActiveHeadingId((prev) => {
      if (prev && nextHeadings.some((h) => h.id === prev)) {
        return prev;
      }
      return nextHeadings[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    if (focusTitleSignal > 0 && activeNote) {
      requestAnimationFrame(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      });
    }
  }, [focusTitleSignal, activeNote?.path]);

  const commitTitleRename = async () => {
    if (!activeNote) return;
    if (escapeCancelledRef.current) {
      escapeCancelledRef.current = false;
      return;
    }
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === activeNote.displayName) {
      setTitleDraft(activeNote.displayName);
      return;
    }
    const ok = await onRenameActiveNote(trimmed);
    if (!ok) {
      setTitleDraft(activeNote.displayName);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden print:block print:h-auto print:overflow-visible">
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden print:block print:overflow-visible">
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
          <main
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex flex-1 flex-col overflow-y-auto bg-white print:block print:h-auto print:overflow-visible print:bg-white dark:bg-[#111113]"
          >
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-8 pb-20 pt-10 sm:px-14 sm:pt-14 print:max-w-none print:px-0 print:pb-0 print:pt-0">
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
                setTitleDraft(activeNote.displayName);
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
            sessionId={activeNote.sessionId}
            notePath={activeNote.path}
            theme={theme}
            markdown={activeNote.content}
            onChangeMarkdown={onChangeContent}
            onHeadingsChange={handleHeadingsChange}
            onNotifyError={onNotifyError}
            onAiInlineAction={onAiInlineAction}
            onOcrImage={onOcrImage}
          />
        </div>
      </main>
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
        isOpen={isOutlineOpen && Boolean(activeNote)}
        headings={headings}
        activeHeadingId={activeHeadingId}
        onSelectHeading={(heading) => {
          setActiveHeadingId(heading.id);
          editorRef.current?.scrollToHeading(heading.pos);
        }}
        onClose={onCloseOutline}
      />

      <AiCopilotPanel
        isOpen={copilotOpen}
        noteTitle={activeNote?.displayName ?? null}
        hasActiveNote={Boolean(activeNote)}
        messages={copilotMessages}
        isStreaming={isCopilotStreaming}
        onSendMessage={onSendCopilotMessage}
        onStopStreaming={onStopCopilotStreaming}
        onClearMessages={onClearCopilotMessages}
        onInsertIntoNote={(md) => editorRef.current?.insertMarkdownAtCursor(md)}
        onOpenSettings={onOpenAiSettings}
        onClose={onCloseCopilot}
        onNotifyError={onNotifyError}
      />
    </div>
  );
});
