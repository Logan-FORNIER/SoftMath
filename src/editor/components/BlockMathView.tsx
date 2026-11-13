import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import katex from 'katex';
import { Check, Pencil, Trash2 } from 'lucide-react';
import { LatexActionButtons } from './LatexActionButtons';
import { useLatexEditorControl } from './useLatexEditorControl';

interface PreviewRender {
  html: string;
  error: string | null;
}

function renderBlockKatex(source: string): PreviewRender {
  const trimmed = source.trim();
  if (!trimmed) {
    return { html: '', error: null };
  }

  try {
    const html = katex.renderToString(trimmed, {
      displayMode: true,
      throwOnError: true,
      strict: false,
    });
    return { html, error: null };
  } catch (err) {
    const fallbackHtml = katex.renderToString(trimmed, {
      displayMode: true,
      throwOnError: false,
      strict: false,
    });
    const message =
      err instanceof Error ? err.message.replace(/^KaTeX parse error:\s*/i, '') : null;
    return { html: fallbackHtml, error: message };
  }
}

export function BlockMathView({
  node,
  selected,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const latex = (node.attrs.latex as string) ?? '';
  const [isEditing, setIsEditing] = useState(latex === '');
  const [draft, setDraft] = useState(latex);

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialLatexRef = useRef(latex);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelEscapeRef = useRef(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(latex);
    }
  }, [latex, isEditing]);

  useEffect(() => {
    return () => {
      if (syncTimerRef.current !== null) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isEditing) {
      cancelEscapeRef.current = false;
      initialLatexRef.current = latex;
      setDraft(latex);
      const immediateEl = textareaRef.current;
      if (immediateEl && document.activeElement !== immediateEl) {
        immediateEl.focus();
      }
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          if (document.activeElement !== el) {
            el.focus();
          }
          if (latex.length > 0 && el.value === latex) {
            el.setSelectionRange(el.value.length, el.value.length);
          }
          el.style.height = 'auto';
          el.style.height = `${Math.max(el.scrollHeight, 64)}px`;
        }
      });
    }
  }, [isEditing]);

  const handleDraftChange = useCallback(
    (nextValue: string) => {
      setDraft(nextValue);

      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 64)}px`;
      }

      // Keep ProseMirror attributes gently synced so 500ms autosave persists active edits.
      if (syncTimerRef.current !== null) {
        clearTimeout(syncTimerRef.current);
      }
      syncTimerRef.current = setTimeout(() => {
        syncTimerRef.current = null;
        const trimmed = nextValue.trim();
        if (trimmed !== latex) {
          updateAttributes({ latex: trimmed });
        }
      }, 180);
    },
    [latex, updateAttributes]
  );

  const {
    isPaletteOpen,
    setIsPaletteOpen,
    isStructureOpen,
    setIsStructureOpen,
    calcError,
    closeAllPopovers,
    handleSmartKeyDown,
    handleInsertSymbol,
    handleInsertStructure,
    handleEvaluateMath,
  } = useLatexEditorControl({
    fieldRef: textareaRef,
    value: draft,
    onChangeValue: handleDraftChange,
    multiline: true,
  });

  const focusAfterBlock = () => {
    const pos = getPos();
    if (typeof pos !== 'number') {
      editor.commands.focus();
      return;
    }

    const afterPos = pos + node.nodeSize;
    const { doc } = editor.state;
    const nextNode = doc.nodeAt(afterPos);
    if (!nextNode) {
      editor
        .chain()
        .focus()
        .insertContentAt(afterPos, { type: 'paragraph' })
        .setTextSelection(afterPos + 1)
        .run();
      return;
    }

    if (nextNode.isTextblock) {
      editor.chain().focus().setTextSelection(afterPos + 1).run();
      return;
    }

    const $pos = doc.resolve(Math.min(afterPos, doc.content.size));
    const selection = TextSelection.near($pos, 1);
    editor.view.dispatch(editor.state.tr.setSelection(selection));
    editor.commands.focus();
  };

  const commitEdit = (moveFocusToEditor: boolean) => {
    if (cancelEscapeRef.current) {
      cancelEscapeRef.current = false;
      return;
    }

    if (syncTimerRef.current !== null) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    const trimmed = draft.trim();
    closeAllPopovers();
    cancelEscapeRef.current = true;
    setIsEditing(false);

    if (!trimmed) {
      deleteNode();
      if (moveFocusToEditor) {
        editor.commands.focus();
      }
      return;
    }

    if (trimmed !== latex) {
      updateAttributes({ latex: trimmed });
    }
    if (moveFocusToEditor) {
      focusAfterBlock();
    }
  };

  const cancelEdit = () => {
    cancelEscapeRef.current = true;
    closeAllPopovers();
    if (syncTimerRef.current !== null) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }

    const initial = initialLatexRef.current.trim();
    setIsEditing(false);
    if (!initial) {
      deleteNode();
      editor.commands.focus();
    } else {
      updateAttributes({ latex: initial });
      setDraft(initialLatexRef.current);
      focusAfterBlock();
    }
  };

  const preview = useMemo(
    () => renderBlockKatex(isEditing ? draft : latex),
    [isEditing, draft, latex]
  );

  if (isEditing) {
    return (
      <NodeViewWrapper
        as="div"
        className="my-4"
        contentEditable={false}
      >
        <div
          ref={containerRef}
          onBlur={(e) => {
            const related = e.relatedTarget as globalThis.Node | null;
            if (!related || !containerRef.current?.contains(related)) {
              commitEdit(false);
            }
          }}
          className="relative"
        >
          <div className="rounded-xl border border-indigo-300/80 bg-stone-50/70 shadow-xs dark:border-indigo-500/40 dark:bg-zinc-900/80">
            {/* Compact editor header */}
            <div className="flex items-center justify-between rounded-t-xl border-b border-stone-200/80 px-3 py-1.5 text-[11px] dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 font-mono font-medium text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-400">
                  $$ LaTeX
                </span>
                <span className="hidden text-stone-400 sm:inline dark:text-zinc-500">
                  Ctrl+Entrée · Ctrl+M symboles · Échap
                </span>
              </div>

              <div className="relative flex items-center gap-1">
                <LatexActionButtons
                  align="right"
                  isPaletteOpen={isPaletteOpen}
                  isStructureOpen={isStructureOpen}
                  calcError={calcError}
                  onTogglePalette={() => {
                    setIsStructureOpen(false);
                    setIsPaletteOpen((prev) => !prev);
                  }}
                  onToggleStructure={() => {
                    setIsPaletteOpen(false);
                    setIsStructureOpen((prev) => !prev);
                  }}
                  onClosePalette={() => setIsPaletteOpen(false)}
                  onCloseStructure={() => setIsStructureOpen(false)}
                  onSelectSymbol={handleInsertSymbol}
                  onInsertStructure={handleInsertStructure}
                  onEvaluateMath={handleEvaluateMath}
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (syncTimerRef.current !== null) {
                      clearTimeout(syncTimerRef.current);
                    }
                    closeAllPopovers();
                    setIsEditing(false);
                    deleteNode();
                    requestAnimationFrame(() => editor.commands.focus());
                  }}
                  title="Supprimer le bloc"
                  aria-label="Supprimer le bloc mathématique"
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:text-zinc-500 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitEdit(true)}
                  className="inline-flex items-center gap-1 rounded-md bg-stone-900 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-stone-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  <Check className="h-3 w-3" />
                  Terminer
                </button>


              </div>
            </div>

            {/* Raw LaTeX textarea */}
            <div className="px-3.5 py-2.5">
              <textarea
                ref={textareaRef}
                autoFocus
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (handleSmartKeyDown(e)) {
                    return;
                  }
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    commitEdit(true);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                  } else if (e.key === 'Tab') {
                    e.preventDefault();
                    const target = e.currentTarget;
                    const start = target.selectionStart;
                    const end = target.selectionEnd;
                    const updated =
                      draft.slice(0, start) + '  ' + draft.slice(end);
                    handleDraftChange(updated);
                    requestAnimationFrame(() => {
                      if (textareaRef.current) {
                        textareaRef.current.selectionStart = start + 2;
                        textareaRef.current.selectionEnd = start + 2;
                      }
                    });
                  }
                }}
                placeholder={'\\int_0^1 x^2 \\, dx = \\frac{1}{3}'}
                aria-label="Code LaTeX du bloc mathématique"
                rows={2}
                spellCheck={false}
                className="w-full resize-none bg-transparent font-mono text-[13.5px] leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-600"
              />
            </div>

            {/* Live KaTeX preview right underneath */}
            <div className="rounded-b-xl border-t border-stone-200/80 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-[#111113]">
              {preview.html ? (
                <div
                  className="katex-block-preview flex justify-center overflow-x-auto text-stone-900 dark:text-zinc-100"
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              ) : (
                <p className="text-center text-xs italic text-stone-400 dark:text-zinc-600">
                  Aperçu KaTeX en direct…
                </p>
              )}
              {preview.error && (
                <p className="mt-2 text-center font-mono text-[11px] text-amber-600 dark:text-amber-400">
                  {preview.error}
                </p>
              )}
            </div>
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="div" className="my-4" contentEditable={false}>
      <div
        role="button"
        tabIndex={0}
        title="Cliquer pour modifier le bloc LaTeX"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsEditing(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsEditing(true);
          }
        }}
        className={`group relative flex min-h-[3.25rem] cursor-pointer items-center justify-center rounded-xl px-4 py-3.5 transition-colors ${
          selected
            ? 'bg-indigo-50/50 ring-1 ring-indigo-500/60 dark:bg-indigo-950/25 dark:ring-indigo-400/50'
            : 'hover:bg-stone-50 dark:hover:bg-zinc-900/60'
        }`}
      >
        <span className="pointer-events-none absolute right-2.5 top-2 inline-flex items-center gap-1 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-zinc-800 dark:text-zinc-400">
          <Pencil className="h-2.5 w-2.5" />
          LaTeX
        </span>

        {preview.html ? (
          <div
            className="katex-block-preview w-full overflow-x-auto text-center text-stone-900 dark:text-zinc-100"
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        ) : (
          <span className="text-xs italic text-stone-400 dark:text-zinc-500">
            Bloc mathématique vide (cliquer pour éditer)
          </span>
        )}
      </div>
    </NodeViewWrapper>
  );
}
