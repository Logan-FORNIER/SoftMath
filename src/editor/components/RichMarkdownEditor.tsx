import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Placeholder } from '@tiptap/extensions';
import type { OutlineHeading, ThemeMode } from '../../types/notes';
import { AcademicBlock } from '../extensions/AcademicBlock';
import { SlashCommand } from '../extensions/SlashCommand';
import { SoftBlockMath } from '../extensions/SoftBlockMath';
import { SoftFunctionPlot } from '../extensions/SoftFunctionPlot';
import { SoftMathEval } from '../extensions/SoftMathEval';
import { SoftVariationTable } from '../extensions/SoftVariationTable';
import {
  getExcalidrawStorage,
  SoftExcalidraw,
} from '../extensions/SoftExcalidraw';
import {
  insertInlineMathAtSelection,
  SoftInlineMath,
} from '../extensions/SoftInlineMath';
import { MarginInsertButton } from './MarginInsertButton';
import { MathBubbleMenu } from './MathBubbleMenu';

import {
  useCallback as useAiCallback,
  useState as useAiState,
} from 'react';
import { Extension as TiptapExtension, type Editor as TiptapCoreEditor } from '@tiptap/core';
import {
  AiContextMenu,
  extractEditorContextForAi,
  type AiMenuPosition,
} from './AiContextMenu';
import type { EditorAiBridge } from '../../hooks/useAiWorkspace';
import { fileToAiImageAttachment } from '../../services/aiService';
import type {
  AiContextSelectionPayload,
  AiImageAttachment,
  AiInlineActionKind,
} from '../../types/ai';

function insertParsedMarkdownSmart(
  editor: TiptapCoreEditor,
  markdown: string,
  target:
    | { mode: 'cursor' }
    | { mode: 'replace'; from: number; to: number }
    | { mode: 'after'; pos: number },
) {
  const parsedDoc = editor.markdown?.parse(markdown);
  const blocks =
    parsedDoc && Array.isArray(parsedDoc.content) && parsedDoc.content.length > 0
      ? parsedDoc.content
      : null;

  if (!blocks) {
    if (target.mode === 'replace') {
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: target.from, to: target.to },
          markdown,
          { contentType: 'markdown' },
        )
        .run();
    } else if (target.mode === 'after') {
      editor
        .chain()
        .focus()
        .insertContentAt(target.pos, markdown, { contentType: 'markdown' })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .insertContent(markdown, { contentType: 'markdown' })
        .run();
    }
    return;
  }

  const docSize = editor.state.doc.content.size;

  if (target.mode === 'after') {
    const safePos = Math.max(0, Math.min(target.pos, docSize));
    editor.chain().focus().insertContentAt(safePos, blocks).run();
    return;
  }

  if (target.mode === 'replace') {
    const safeFrom = Math.max(0, Math.min(target.from, docSize));
    const safeTo = Math.max(safeFrom, Math.min(target.to, docSize));
    const $from = editor.state.doc.resolve(safeFrom);
    const $to = editor.state.doc.resolve(safeTo);
    const isSameTextblock = $from.sameParent($to) && $from.parent.isTextblock;
    const payload =
      isSameTextblock &&
      blocks.length === 1 &&
      blocks[0].type === 'paragraph' &&
      Array.isArray(blocks[0].content)
        ? blocks[0].content
        : blocks;
    editor
      .chain()
      .focus()
      .insertContentAt({ from: safeFrom, to: safeTo }, payload)
      .run();
    return;
  }

  const { from, to } = editor.state.selection;
  const $from = editor.state.doc.resolve(from);
  const insideNonEmptyTextblock =
    $from.parent.isTextblock && $from.parent.content.size > 0;
  const payload =
    insideNonEmptyTextblock &&
    blocks.length === 1 &&
    blocks[0].type === 'paragraph' &&
    Array.isArray(blocks[0].content)
      ? blocks[0].content
      : blocks;
  editor.chain().focus().insertContentAt({ from, to }, payload).run();
}

export interface RichMarkdownEditorHandle {
  focusStart: () => void;
  focusEnd: () => void;
  scrollToHeading: (pos: number) => void;
  insertMarkdownAtCursor: (markdown: string) => void;
  replaceRangeWithMarkdown: (from: number, to: number, markdown: string) => void;
  insertMarkdownAfter: (pos: number, markdown: string) => void;
  triggerOcrFilePicker: () => void;
}

interface RichMarkdownEditorProps {
  sessionId: number;
  notePath: string;
  theme: ThemeMode;
  markdown: string;
  onChangeMarkdown: (nextMarkdown: string) => void;
  onHeadingsChange?: (headings: OutlineHeading[]) => void;
  onNotifyError?: (message: string) => void;
  onAiInlineAction?: (
    payload: AiContextSelectionPayload,
    bridge: EditorAiBridge,
  ) => void;
  onOcrImage?: (image: AiImageAttachment, bridge: EditorAiBridge) => void;
}

function extractHeadingsFromDoc(doc: ProseMirrorNode): OutlineHeading[] {
  const result: OutlineHeading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = Number(node.attrs.level);
      if (level === 1 || level === 2 || level === 3) {
        const text = node.textContent.trim();
        if (text.length > 0) {
          result.push({
            id: `${pos}`,
            level,
            text,
            pos,
          });
        }
      }
      return false;
    }
    return true;
  });
  return result;
}

function headingsAreEqual(a: OutlineHeading[], b: OutlineHeading[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (
      a[i].id !== b[i].id ||
      a[i].level !== b[i].level ||
      a[i].text !== b[i].text
    ) {
      return false;
    }
  }
  return true;
}

export const RichMarkdownEditor = forwardRef<
  RichMarkdownEditorHandle,
  RichMarkdownEditorProps
>(function RichMarkdownEditor(
  {
    sessionId,
    notePath,
    theme,
    markdown,
    onChangeMarkdown,
    onHeadingsChange,
    onNotifyError,
    onAiInlineAction,
    onOcrImage,
  },
  ref
) {
  const onChangeRef = useRef(onChangeMarkdown);
  onChangeRef.current = onChangeMarkdown;
  const onHeadingsChangeRef = useRef(onHeadingsChange);
  onHeadingsChangeRef.current = onHeadingsChange;
  const onNotifyErrorRef = useRef(onNotifyError);
  onNotifyErrorRef.current = onNotifyError;
  const onAiInlineActionRef = useRef(onAiInlineAction);
  onAiInlineActionRef.current = onAiInlineAction;
  const onOcrImageRef = useRef(onOcrImage);
  onOcrImageRef.current = onOcrImage;
  const lastHeadingsRef = useRef<OutlineHeading[]>([]);
  const notePathRef = useRef(notePath);
  notePathRef.current = notePath;
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const wrapperRef = useRef<HTMLDivElement>(null);
  const ocrFileInputRef = useRef<HTMLInputElement | null>(null);
  const openAiMenuRef = useRef<(() => void) | null>(null);
  const editorBridgeRef = useRef<EditorAiBridge | null>(null);
  const loadedSessionRef = useRef<number | null>(null);
  const isSyncingFromPropRef = useRef(false);

  const [aiMenuState, setAiMenuState] = useAiState<{
    open: boolean;
    position: AiMenuPosition;
    hasSelection: boolean;
  }>({
    open: false,
    position: { top: 0, left: 0 },
    hasSelection: false,
  });

  const [softAiShortcut] = useAiState(() =>
    TiptapExtension.create({
      name: 'softAiShortcut',
      priority: 220,
      addKeyboardShortcuts() {
        return {
          'Mod-i': () => {
            openAiMenuRef.current?.();
            return true;
          },
        };
      },
    }),
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4],
        },
      }),
      Placeholder.configure({
        placeholder:
          'Commencez à écrire en Markdown… ($formule$, Ctrl+E, $$, /dessin)',
      }),
      SoftInlineMath,
      SoftBlockMath,
      SoftExcalidraw,
      AcademicBlock,
      SoftFunctionPlot,
      SoftVariationTable,
      SoftMathEval,
      SlashCommand,
      softAiShortcut,
      Markdown.configure({
        indentation: {
          style: 'space',
          size: 2,
        },
      }),
    ],
    content: markdown,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: 'softmath-prose focus:outline-none',
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items || !onOcrImageRef.current) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (!blob) continue;
            event.preventDefault();
            void fileToAiImageAttachment(blob, 'Capture presse-papiers')
              .then((attachment) => {
                if (editorBridgeRef.current) {
                  onOcrImageRef.current?.(attachment, editorBridgeRef.current);
                }
              })
              .catch((err) => {
                onNotifyErrorRef.current?.(
                  err instanceof Error
                    ? err.message
                    : 'Impossible de lire l’image collée.',
                );
              });
            return true;
          }
        }
        return false;
      },
    },
    onBeforeCreate: ({ editor: creatingEditor }) => {
      const excalidrawStorage = getExcalidrawStorage(creatingEditor);
      if (excalidrawStorage) {
        excalidrawStorage.notePath = notePathRef.current;
        excalidrawStorage.theme = themeRef.current;
        excalidrawStorage.onNotifyError = (message) =>
          onNotifyErrorRef.current?.(message);
      }
    },
    onCreate: ({ editor: createdEditor }) => {
      loadedSessionRef.current = sessionId;
      const headings = extractHeadingsFromDoc(createdEditor.state.doc);
      lastHeadingsRef.current = headings;
      onHeadingsChangeRef.current?.(headings);
    },
    onUpdate: ({ editor: currentEditor }) => {
      const headings = extractHeadingsFromDoc(currentEditor.state.doc);
      if (!headingsAreEqual(lastHeadingsRef.current, headings)) {
        lastHeadingsRef.current = headings;
        onHeadingsChangeRef.current?.(headings);
      }
      if (isSyncingFromPropRef.current) {
        return;
      }
      onChangeRef.current(currentEditor.getMarkdown());
    },
  });

  // Sync live notePath (e.g. after rename) and light/dark theme to Excalidraw NodeViews
  useEffect(() => {
    if (!editor) {
      return;
    }
    const excalidrawStorage = getExcalidrawStorage(editor);
    if (!excalidrawStorage) {
      return;
    }

    excalidrawStorage.notePath = notePath;
    excalidrawStorage.theme = theme;
    excalidrawStorage.onNotifyError = (message) =>
      onNotifyErrorRef.current?.(message);
    for (const listener of excalidrawStorage.listeners) {
      listener();
    }
  }, [editor, notePath, theme]);

  // Load new note content only when switching to or creating another note session,
  // preserving cursor/undo state during autosaves and active-note renames.
  useEffect(() => {
    if (!editor || loadedSessionRef.current === sessionId) {
      return;
    }

    const excalidrawStorage = getExcalidrawStorage(editor);
    if (excalidrawStorage) {
      excalidrawStorage.notePath = notePath;
      excalidrawStorage.theme = theme;
      excalidrawStorage.onNotifyError = (message) =>
        onNotifyErrorRef.current?.(message);
    }

    loadedSessionRef.current = sessionId;
    isSyncingFromPropRef.current = true;
    try {
      editor.commands.setContent(markdown, {
        contentType: 'markdown',
        emitUpdate: false,
      });
      const headings = extractHeadingsFromDoc(editor.state.doc);
      lastHeadingsRef.current = headings;
      onHeadingsChangeRef.current?.(headings);
    } finally {
      isSyncingFromPropRef.current = false;
    }
  }, [editor, sessionId, notePath, theme, markdown]);

  const openAiMenuAtCursor = useAiCallback(() => {
    if (!editor || !wrapperRef.current) return;
    const wrapperRect = wrapperRef.current.getBoundingClientRect();
    const { from, to } = editor.state.selection;
    let top = 48;
    let left = 32;
    try {
      const coords = editor.view.coordsAtPos(from);
      const menuWidth = 320;
      const maxLeft = Math.max(8, wrapperRect.width - menuWidth - 8);
      left = Math.max(8, Math.min(coords.left - wrapperRect.left, maxLeft));
      top = Math.max(8, coords.bottom - wrapperRect.top + 8);
    } catch {
      // Fall back safely inside container
    }
    setAiMenuState({
      open: true,
      position: { top, left },
      hasSelection: from !== to,
    });
  }, [editor]);

  openAiMenuRef.current = openAiMenuAtCursor;

  const buildEditorBridge = useAiCallback(
    (): EditorAiBridge => ({
      insertMarkdownAtCursor: (md: string) => {
        if (!editor) return;
        insertParsedMarkdownSmart(editor, md, { mode: 'cursor' });
      },
      replaceRangeWithMarkdown: (from: number, to: number, md: string) => {
        if (!editor) return;
        insertParsedMarkdownSmart(editor, md, { mode: 'replace', from, to });
      },
      insertMarkdownAfter: (pos: number, md: string) => {
        if (!editor) return;
        insertParsedMarkdownSmart(editor, md, { mode: 'after', pos });
      },
    }),
    [editor],
  );

  editorBridgeRef.current = buildEditorBridge();

  const handleSelectAiAction = useAiCallback(
    (action: AiInlineActionKind) => {
      setAiMenuState((prev) => ({ ...prev, open: false }));
      if (!editor || !onAiInlineActionRef.current) return;
      const ctx = extractEditorContextForAi(editor);
      onAiInlineActionRef.current({ ...ctx, action }, buildEditorBridge());
    },
    [editor, buildEditorBridge],
  );

  useImperativeHandle(
    ref,
    () => ({
      focusStart: () => {
        editor?.commands.focus('start');
      },
      focusEnd: () => {
        editor?.commands.focus('end');
      },
      insertMarkdownAtCursor: (md: string) => {
        if (!editor) return;
        insertParsedMarkdownSmart(editor, md, { mode: 'cursor' });
      },
      replaceRangeWithMarkdown: (from: number, to: number, md: string) => {
        if (!editor) return;
        insertParsedMarkdownSmart(editor, md, { mode: 'replace', from, to });
      },
      insertMarkdownAfter: (pos: number, md: string) => {
        if (!editor) return;
        insertParsedMarkdownSmart(editor, md, { mode: 'after', pos });
      },
      triggerOcrFilePicker: () => {
        ocrFileInputRef.current?.click();
      },
      scrollToHeading: (pos: number) => {
        if (!editor || editor.isDestroyed) {
          return;
        }
        const domNode = editor.view.nodeDOM(pos);
        if (domNode instanceof HTMLElement) {
          domNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
    }),
    [editor]
  );

  // Global Ctrl+E / Cmd+E fallback when focus is outside ProseMirror (e.g. main area / toolbar)
  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleGlobalInlineMathShortcut = (e: KeyboardEvent) => {
      if (e.defaultPrevented || editor.isDestroyed) {
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) {
        return;
      }
      if (e.key.toLowerCase() !== 'e') {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.closest('.ProseMirror') ||
          target.closest('[data-excalidraw-interactive="true"]') ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      e.preventDefault();
      insertInlineMathAtSelection(editor);
    };

    window.addEventListener('keydown', handleGlobalInlineMathShortcut);
    return () => {
      window.removeEventListener('keydown', handleGlobalInlineMathShortcut);
    };
  }, [editor]);

  return (
    <div
      ref={wrapperRef}
      className="relative flex flex-1 flex-col cursor-text"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          editor?.commands.focus('end');
        }
      }}
    >
      <MarginInsertButton editor={editor} containerRef={wrapperRef} />
      {editor && (
        <MathBubbleMenu
          editor={editor}
          onOpenAiMenu={onAiInlineAction ? openAiMenuAtCursor : undefined}
        />
      )}
      <AiContextMenu
        isOpen={aiMenuState.open}
        position={aiMenuState.position}
        hasSelection={aiMenuState.hasSelection}
        onSelectAction={handleSelectAiAction}
        onTriggerOcr={() => {
          setAiMenuState((prev) => ({ ...prev, open: false }));
          ocrFileInputRef.current?.click();
        }}
        onClose={() => setAiMenuState((prev) => ({ ...prev, open: false }))}
      />
      <input
        ref={ocrFileInputRef}
        type="file"
        accept="image/*"
        aria-hidden="true"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file || !onOcrImageRef.current) return;
          void fileToAiImageAttachment(file, file.name)
            .then((attachment) => {
              onOcrImageRef.current?.(attachment, buildEditorBridge());
            })
            .catch((err) => {
              onNotifyErrorRef.current?.(
                err instanceof Error
                  ? err.message
                  : 'Lecture de l’image impossible.',
              );
            });
        }}
      />
      <EditorContent editor={editor} className="w-full flex-1" />
    </div>
  );
});

