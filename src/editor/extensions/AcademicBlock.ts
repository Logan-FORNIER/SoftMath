import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { AcademicBlockView } from '../components/AcademicBlockView';

export type AcademicKind = 'definition' | 'theorem' | 'proof' | 'example' | 'exercise';

const VALID_KINDS = new Set<string>([
  'definition',
  'theorem',
  'proof',
  'example',
  'exercise',
]);

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    academicBlock: {
      insertAcademicBlock: (kind: AcademicKind, title?: string) => ReturnType;
    };
  }
}

export function insertAcademicBlockNode(
  editor: Editor,
  kind: AcademicKind,
  title = ''
) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'academicBlock',
      attrs: { kind, title, collapsed: false },
      content: [{ type: 'paragraph' }],
    })
    .run();
}

export const AcademicBlock = Node.create({
  name: 'academicBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      kind: {
        default: 'theorem',
        parseHTML: (el) => {
          const val = el.getAttribute('data-kind') ?? 'theorem';
          return VALID_KINDS.has(val) ? val : 'theorem';
        },
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') ?? '',
      },
      collapsed: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-collapsed') === 'true',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="academic-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'academic-block',
        'data-kind': HTMLAttributes.kind ?? 'theorem',
        'data-title': HTMLAttributes.title ?? '',
        'data-collapsed': String(Boolean(HTMLAttributes.collapsed)),
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AcademicBlockView);
  },

  addCommands() {
    return {
      insertAcademicBlock:
        (kind: AcademicKind, title = '') =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { kind, title, collapsed: false },
            content: [{ type: 'paragraph' }],
          }),
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => {
        const { state } = this.editor;
        const { $from } = state.selection;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type.name === this.name) {
            const afterPos = $from.after(depth);
            return this.editor
              .chain()
              .focus()
              .insertContentAt(afterPos, { type: 'paragraph' })
              .setTextSelection(afterPos + 1)
              .run();
          }
        }
        return false;
      },
    };
  },

  markdownTokenName: 'academicBlock',

  markdownTokenizer: {
    name: 'academicBlock',
    level: 'block',
    start: (src) => {
      const match = src.match(
        /^[ \t]*:::(?:definition|theorem|proof|example|exercise)/m
      );
      return match && match.index !== undefined ? match.index : -1;
    },
    tokenize: (src, _tokens, lexer) => {
      const openMatch = src.match(
        /^[ \t]*:::(definition|theorem|proof|example|exercise)(\{collapsed\})?(?:[ \t]+([^\r\n]*))?[ \t]*(?:\r?\n|$)/
      );
      if (!openMatch) {
        return undefined;
      }

      const [openFull, rawKind, collapsedFlag, rawTitle] = openMatch;
      const rest = src.slice(openFull.length);
      const lines = rest.split(/\r?\n/);

      let depth = 1;
      let closeLineIdx = -1;
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (/^[ \t]*:::(?:definition|theorem|proof|example|exercise)\b/.test(line)) {
          depth += 1;
        } else if (/^[ \t]*:::[ \t]*$/.test(line)) {
          depth -= 1;
          if (depth === 0) {
            closeLineIdx = i;
            break;
          }
        }
      }

      if (closeLineIdx === -1) {
        return undefined;
      }

      // Calcul exact de l'offset dans `src` pour inclure les retours à la ligne exacts (\n ou \r\n)
      const lineRegex = /([^\r\n]*)(\r?\n|$)/g;
      lineRegex.lastIndex = openFull.length;
      let closingEnd = openFull.length;
      let innerEnd = openFull.length;

      for (let i = 0; i <= closeLineIdx; i += 1) {
        const lineMatch = lineRegex.exec(src);
        if (!lineMatch) break;
        if (i < closeLineIdx) {
          innerEnd = lineMatch.index + lineMatch[0].length;
        } else {
          closingEnd = lineMatch.index + lineMatch[1].length;
        }
      }

      const innerBody = src.slice(openFull.length, innerEnd).trim();
      const raw = src.slice(0, closingEnd);
      const parsedTokens = innerBody ? lexer.blockTokens(innerBody) : [];

      return {
        type: 'academicBlock',
        raw,
        kind: VALID_KINDS.has(rawKind) ? rawKind : 'theorem',
        title: (rawTitle ?? '').trim(),
        collapsed: Boolean(collapsedFlag),
        tokens: parsedTokens,
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const parseBlockChildren =
      helpers.parseBlockChildren ?? helpers.parseChildren;
    const rawChildren = Array.isArray(token.tokens)
      ? parseBlockChildren(token.tokens)
      : [];
    const safeChildren =
      rawChildren.length > 0 ? rawChildren : [{ type: 'paragraph' }];

    return helpers.createNode(
      'academicBlock',
      {
        kind: typeof token.kind === 'string' && VALID_KINDS.has(token.kind) ? token.kind : 'theorem',
        title: typeof token.title === 'string' ? token.title : '',
        collapsed: Boolean(token.collapsed),
      },
      safeChildren
    );
  },

  renderMarkdown: (node, h) => {
    const kind =
      typeof node.attrs?.kind === 'string' && VALID_KINDS.has(node.attrs.kind)
        ? node.attrs.kind
        : 'theorem';
    const title =
      typeof node.attrs?.title === 'string' ? node.attrs.title.trim() : '';
    const collapsed = Boolean(node.attrs?.collapsed);
    const body = node.content
      ? h.renderChildren(node.content, '\n\n').trimEnd()
      : '';

    const header = `:::${kind}${collapsed ? '{collapsed}' : ''}${
      title ? ` ${title}` : ''
    }`;
    return body ? `${header}\n${body}\n:::` : `${header}\n:::`;
  },
});
