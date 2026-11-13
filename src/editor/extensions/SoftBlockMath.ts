import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { BlockMathView } from '../components/BlockMathView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    softBlockMath: {
      insertBlockMath: (options: { latex: string; pos?: number }) => ReturnType;
    };
  }
}

export const SoftBlockMath = Node.create({
  name: 'blockMath',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') ?? '',
        renderHTML: (attributes) => ({
          'data-latex': attributes.latex as string,
        }),
      },
    };
  },

  addCommands() {
    return {
      insertBlockMath:
        (options) =>
        ({ commands, editor }) => {
          const pos = options.pos ?? editor.state.selection.from;
          return commands.insertContentAt(pos, {
            type: this.name,
            attrs: { latex: options.latex },
          });
        },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="block-math"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'block-math' })];
  },

  parseMarkdown: (token) => ({
    type: 'blockMath',
    attrs: { latex: (token.latex as string) ?? '' },
  }),

  renderMarkdown: (node) => {
    const latex = ((node.attrs?.latex as string) ?? '').trim();
    return ['$$', latex, '$$'].join('\n');
  },

  markdownTokenizer: {
    name: 'blockMath',
    level: 'block',
    start: (src) => {
      const match = src.match(/^[ \t]*\$\$/m);
      return match && match.index !== undefined ? match.index : -1;
    },
    tokenize: (src) => {
      const match = src.match(
        /^[ \t]*\$\$(?:[ \t]*\r?\n)?([\s\S]*?)(?:\r?\n[ \t]*)?\$\$(?=[ \t]*(?:\r?\n|$))/
      );
      if (!match) {
        return undefined;
      }
      const [fullMatch, rawLatex] = match;
      return {
        type: 'blockMath',
        raw: fullMatch,
        latex: rawLatex.trim(),
      };
    },
  },

  addKeyboardShortcuts() {
    return {
      // Typing `$$` on a paragraph and pressing Enter opens the dedicated block math editor.
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        if (!selection.empty) {
          return false;
        }
        const { $from } = selection;
        if ($from.parent.type.name !== 'paragraph') {
          return false;
        }
        if ($from.parent.textContent.trim() !== '$$') {
          return false;
        }

        const from = $from.before($from.depth);
        const to = $from.after($from.depth);
        return editor
          .chain()
          .focus()
          .insertContentAt({ from, to }, { type: this.name, attrs: { latex: '' } })
          .run();
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockMathView, {
      as: 'div',
      className: 'block-math-nodeview',
      stopEvent: ({ event }) => {
        const target = event.target;
        return (
          target instanceof HTMLElement &&
          Boolean(target.closest('input, textarea, button'))
        );
      },
      ignoreMutation: () => true,
    });
  },
});

