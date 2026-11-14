import { useEffect, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { LatexActionButtons } from './LatexActionButtons';
import { useLatexEditorControl } from './useLatexEditorControl';
import { useSoftMathUi } from '../../contexts/SoftMathUiContext';
import { renderKatexWithMacros } from '../../services/katexMacrosService';

export function InlineMathView({
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

  const containerRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialLatexRef = useRef(latex);
  const cancelEscapeRef = useRef(false);
  const { katexMacroVersion } = useSoftMathUi();

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
    fieldRef: inputRef,
    value: draft,
    onChangeValue: setDraft,
  });

  useEffect(() => {
    if (!isEditing) {
      setDraft(latex);
    }
  }, [latex, isEditing]);

  useEffect(() => {
    if (isEditing) {
      cancelEscapeRef.current = false;
      initialLatexRef.current = latex;
      setDraft(latex);
      const inputEl = inputRef.current;
      if (inputEl && document.activeElement !== inputEl) {
        inputEl.focus();
      }
      requestAnimationFrame(() => {
        const currentEl = inputRef.current;
        if (!currentEl) {
          return;
        }
        if (document.activeElement !== currentEl) {
          currentEl.focus();
        }
        if (latex.length > 0 && currentEl.value === latex) {
          currentEl.select();
        }
      });
    }
  }, [isEditing]);

  const renderedHtml = useMemo(() => {
    const source = latex.trim() || '\\square';
    return renderKatexWithMacros(source, {
      displayMode: false,
      throwOnError: false,
      strict: false,
    });
  }, [latex, katexMacroVersion]);

  const focusAfterNode = () => {
    const pos = getPos();
    if (typeof pos === 'number') {
      const nextPos = Math.min(pos + node.nodeSize, editor.state.doc.content.size);
      editor.chain().focus().setTextSelection(nextPos).run();
    } else {
      editor.commands.focus();
    }
  };

  const commitEdit = (returnFocusToEditor: boolean) => {
    if (cancelEscapeRef.current) {
      cancelEscapeRef.current = false;
      return;
    }

    const trimmed = draft.trim();
    closeAllPopovers();
    cancelEscapeRef.current = true;
    setIsEditing(false);

    if (!trimmed) {
      deleteNode();
      if (returnFocusToEditor) {
        editor.commands.focus();
      }
      return;
    }

    if (trimmed !== latex) {
      updateAttributes({ latex: trimmed });
    }
    if (returnFocusToEditor) {
      focusAfterNode();
    }
  };

  const cancelEdit = () => {
    cancelEscapeRef.current = true;
    closeAllPopovers();
    const initial = initialLatexRef.current.trim();
    setIsEditing(false);
    if (!initial) {
      deleteNode();
      editor.commands.focus();
    } else {
      setDraft(initialLatexRef.current);
      focusAfterNode();
    }
  };

  if (isEditing) {
    const inputWidthCh = Math.max(draft.length + 2, 6);

    return (
      <NodeViewWrapper
        as="span"
        className="relative mx-0.5 inline-flex items-center align-baseline"
        contentEditable={false}
      >
        <span
          ref={containerRef}
          onBlur={(e) => {
            const related = e.relatedTarget as globalThis.Node | null;
            if (!related || !containerRef.current?.contains(related)) {
              commitEdit(false);
            }
          }}
          className="relative inline-flex items-center rounded-md border border-indigo-400/80 bg-indigo-50/70 px-1.5 py-0.5 shadow-2xs dark:border-indigo-500/60 dark:bg-indigo-950/40"
        >
          <span className="select-none font-mono text-xs text-indigo-500 dark:text-indigo-400">
            $
          </span>
          <input
            ref={inputRef}
            autoFocus
            type="text"
            value={draft}
            style={{ width: `${inputWidthCh}ch`, maxWidth: 'min(520px, 60vw)' }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (handleSmartKeyDown(e)) {
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit(true);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
            aria-label="Code LaTeX en ligne"
            placeholder="x^2"
            className="mx-0.5 min-w-[3ch] bg-transparent font-mono text-[13px] text-stone-900 outline-none placeholder:text-stone-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <span className="select-none font-mono text-xs text-indigo-500 dark:text-indigo-400">
            $
          </span>
          <LatexActionButtons
            compact
            align="left"
            isPaletteOpen={isPaletteOpen}
            isStructureOpen={isStructureOpen}
            calcError={calcError}
            onTogglePalette={() => {
              setIsStructureOpen(false);
              setIsPaletteOpen((prev) => !prev);
            }}
            onToggleStructure={() => {
              closeAllPopovers();
              setIsStructureOpen((prev) => !prev);
            }}
            onClosePalette={() => setIsPaletteOpen(false)}
            onCloseStructure={() => setIsStructureOpen(false)}
            onSelectSymbol={handleInsertSymbol}
            onInsertStructure={handleInsertStructure}
            onEvaluateMath={handleEvaluateMath}
          />
        </span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      className="inline-block align-baseline"
      contentEditable={false}
    >
      <span
        role="button"
        tabIndex={0}
        title={`Cliquer pour modifier : $${latex}$`}
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
        className={`inline-flex cursor-pointer items-baseline rounded px-1 py-0.5 transition-colors ${
          selected
            ? 'bg-indigo-500/15 ring-1 ring-indigo-500/60 dark:bg-indigo-400/15 dark:ring-indigo-400/60'
            : 'hover:bg-stone-100 dark:hover:bg-zinc-800/80'
        }`}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </NodeViewWrapper>
  );
}

