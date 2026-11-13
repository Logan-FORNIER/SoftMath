import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import {
  DEFAULT_DRAWING_HEIGHT,
  clampDrawingHeight,
  createEmptyDrawingAsset,
  formatFsError,
  sanitizeDrawingAssetName,
} from '../../services/fsService';
import type { ThemeMode } from '../../types/notes';
import { ExcalidrawBlockView } from '../components/ExcalidrawBlockView';

export interface SoftExcalidrawStorage {
  notePath: string;
  theme: ThemeMode;
  autoEditSrc: string | null;
  listeners: Set<() => void>;
  onNotifyError?: (message: string) => void;
}

export function getExcalidrawStorage(
  editor: Editor
): SoftExcalidrawStorage | undefined {
  return (editor.storage as unknown as {
    excalidrawBlock?: SoftExcalidrawStorage;
  }).excalidrawBlock;
}

export async function insertNewDrawingBlock(
  editor: Editor,
  range?: { from: number; to: number }
): Promise<boolean> {
  const storage = getExcalidrawStorage(editor);
  if (!storage) {
    return false;
  }

  const notePath = storage.notePath;
  if (!notePath) {
    storage.onNotifyError?.(
      "Impossible d'insérer un schéma sans note active."
    );
    return false;
  }

  let fileName: string;
  try {
    fileName = await createEmptyDrawingAsset(notePath, DEFAULT_DRAWING_HEIGHT);
  } catch (err) {
    storage.onNotifyError?.(
      formatFsError(err, 'Impossible de créer le fichier de schéma.')
    );
    return false;
  }

  if (editor.isDestroyed) {
    return false;
  }

  storage.autoEditSrc = fileName;

  const drawingNodes = [
    {
      type: 'excalidrawBlock',
      attrs: {
        src: fileName,
        height: DEFAULT_DRAWING_HEIGHT,
      },
    },
    { type: 'paragraph' },
  ];

  const docSize = editor.state.doc.content.size;
  const chain = editor.chain().focus();

  if (range) {
    const safeFrom = Math.max(0, Math.min(range.from, docSize));
    const safeTo = Math.max(safeFrom, Math.min(range.to, docSize));
    return chain
      .insertContentAt({ from: safeFrom, to: safeTo }, drawingNodes)
      .run();
  }

  const { $from } = editor.state.selection;
  if ($from.depth === 0) {
    return chain.insertContentAt($from.pos, drawingNodes).run();
  }

  const isEmptyParagraph =
    $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0;

  if (isEmptyParagraph) {
    const blockStart = $from.before($from.depth);
    const blockEnd = $from.after($from.depth);
    return chain.insertContentAt({ from: blockStart, to: blockEnd }, drawingNodes).run();
  }

  const insertPos = $from.after($from.depth);
  return chain.insertContentAt(insertPos, drawingNodes).run();
}

export const SoftExcalidraw = Node.create<Record<string, never>, SoftExcalidrawStorage>({
  name: 'excalidrawBlock',
  group: 'block',
  atom: true,

  addStorage() {
    return {
      notePath: '',
      theme: 'light',
      autoEditSrc: null,
      listeners: new Set(),
      onNotifyError: undefined,
    };
  },

  addAttributes() {
    return {
      src: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-src') ?? '',
        renderHTML: (attributes) => ({
          'data-src': attributes.src as string,
        }),
      },
      height: {
        default: DEFAULT_DRAWING_HEIGHT,
        parseHTML: (element) => {
          const raw = Number(element.getAttribute('data-height'));
          return clampDrawingHeight(Number.isFinite(raw) ? raw : undefined);
        },
        renderHTML: (attributes) => ({
          'data-height': String(attributes.height ?? DEFAULT_DRAWING_HEIGHT),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="excalidraw-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'excalidraw-block' }),
    ];
  },

  parseMarkdown: (token) => {
    const rawSrc = String(token.src ?? '');
    let safeSrc = rawSrc;
    try {
      safeSrc = sanitizeDrawingAssetName(rawSrc);
    } catch {
      safeSrc = rawSrc.trim();
    }
    return {
      type: 'excalidrawBlock',
      attrs: {
        src: safeSrc,
        height: DEFAULT_DRAWING_HEIGHT,
      },
    };
  },

  renderMarkdown: (node) => {
    const rawSrc = String(node.attrs?.src ?? '').trim();
    if (!rawSrc) {
      return '';
    }
    try {
      const cleanName = sanitizeDrawingAssetName(rawSrc);
      return `![[${cleanName}]]`;
    } catch {
      return `![[${rawSrc}]]`;
    }
  },

  markdownTokenizer: {
    name: 'excalidrawBlock',
    level: 'block',
    start: (src) => {
      const match = src.match(
        /^[ \t]*(?:!\[\[[^\]]+?\.excalidraw\.json\]\]|!?\[[^\]]*\]\((?:\.\/)?\.assets\/[^)\s]+\.excalidraw\.json\))/m
      );
      return match && match.index !== undefined ? match.index : -1;
    },
    tokenize: (src) => {
      const wikiMatch = src.match(
        /^[ \t]*!\[\[([^\]]+?\.excalidraw\.json)\]\][ \t]*(?=\r?\n|$)/
      );
      if (wikiMatch) {
        return {
          type: 'excalidrawBlock',
          raw: wikiMatch[0],
          src: wikiMatch[1].trim(),
        };
      }

      const mdLinkMatch = src.match(
        /^[ \t]*!?\[[^\]]*\]\(((?:\.\/)?\.assets\/[^)\s]+\.excalidraw\.json)\)[ \t]*(?=\r?\n|$)/
      );
      if (mdLinkMatch) {
        return {
          type: 'excalidrawBlock',
          raw: mdLinkMatch[0],
          src: mdLinkMatch[1].trim(),
        };
      }

      return undefined;
    },
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExcalidrawBlockView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        if (!target) {
          return false;
        }
        return Boolean(
          target.closest(
            '[data-excalidraw-interactive="true"], .excalidraw, button, input, textarea, select'
          )
        );
      },
      ignoreMutation: () => true,
    });
  },
});

