import { InputRule, mergeAttributes, Node, type Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { InlineMathView } from '../components/InlineMathView';

export function insertInlineMathAtSelection(editor: Editor): boolean {
  const { state } = editor;
  const { selection } = state;

  if (selection.$from.parent.type.spec.code) {
    return false;
  }

  if (!selection.empty && selection instanceof TextSelection) {
    const selectedText = state.doc
      .textBetween(selection.from, selection.to, ' ')
      .trim()
      .replace(/^\$(.+)\$$/, '$1')
      .trim();

    if (selectedText) {
      return editor
        .chain()
        .focus()
        .insertContentAt(
          { from: selection.from, to: selection.to },
          { type: 'inlineMath', attrs: { latex: selectedText } }
        )
        .run();
    }
  }

  return editor
    .chain()
    .focus()
    .insertContent({ type: 'inlineMath', attrs: { latex: '' } })
    .run();
}

/**
 * Matches single-dollar inline math `$formula$` as soon as the closing `$` is typed.
 * Rejects `$$` (block math trigger), escaped `\$`, and empty/whitespace-only formulas.
 */
function findSingleDollarInlineMath(text: string) {
  const len = text.length;
  if (len < 3 || text[len - 1] !== '$') {
    return null;
  }

  // Closing `$` must not be escaped (`\$`) or part of `$$`.
  if (text[len - 2] === '\\' || text[len - 2] === '$') {
    return null;
  }

  // Search backwards on the same line for the matching opening `$`.
  for (let i = len - 2; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      return null;
    }
    if (ch !== '$') {
      continue;
    }

    const prev = i > 0 ? text[i - 1] : '';
    if (prev === '\\' || prev === '$') {
      continue;
    }

    const latex = text.slice(i + 1, len - 1);
    if (!latex.trim()) {
      return null;
    }

    // Avoid false positives when a digit precedes `$` followed by space (e.g. `10$ et $20`).
    if (i > 0 && /\d/.test(prev) && /^\s/.test(latex)) {
      return null;
    }

    return {
      index: i,
      text: text.slice(i),
      data: { latex: latex.trim() },
    };
  }

  return null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    softInlineMath: {
      insertInlineMath: (options: { latex: string; pos?: number }) => ReturnType;
    };
  }
}

export const SoftInlineMath = Node.create({
  name: 'inlineMath',
  priority: 200,
  group: 'inline',
  inline: true,
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
      insertInlineMath:
        (options) =>
        ({ editor, tr }) => {
          const latex = options.latex.trim();
          if (!latex) {
            return false;
          }
          const from = options.pos ?? editor.state.selection.from;
          tr.replaceWith(from, from, this.type.create({ latex }));
          return true;
        },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-math' })];
  },

  parseMarkdown: (token) => ({
    type: 'inlineMath',
    attrs: { latex: (token.latex as string) ?? '' },
  }),

  renderMarkdown: (node) => {
    const latex = ((node.attrs?.latex as string) ?? '').trim();
    return `$${latex}$`;
  },

  markdownTokenizer: {
    name: 'inlineMath',
    level: 'inline',
    start: (src) => {
      for (let i = 0; i < src.length; i += 1) {
        if (
          src[i] === '$' &&
          src[i - 1] !== '\\' &&
          src[i + 1] !== '$' &&
          src[i - 1] !== '$'
        ) {
          return i;
        }
      }
      return -1;
    },
    tokenize: (src) => {
      const match = src.match(/^\$([^$\n]+?)\$(?!\$)/);
      if (!match) {
        return undefined;
      }
      const [fullMatch, rawLatex] = match;
      if (rawLatex.endsWith('\\') || !rawLatex.trim()) {
        return undefined;
      }
      return {
        type: 'inlineMath',
        raw: fullMatch,
        latex: rawLatex.trim(),
      };
    },
  },

  addInputRules() {
    return [
      new InputRule({
        find: findSingleDollarInlineMath,
        handler: ({ state, range, match }) => {
          const data = (match as RegExpExecArray & { data?: { latex?: string } }).data;
          const latex = data?.latex;
          if (!latex) {
            return null;
          }
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex }));
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      'Mod-e': ({ editor }) => insertInlineMathAtSelection(editor),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView, {
      as: 'span',
      className: 'inline-math-nodeview',
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

