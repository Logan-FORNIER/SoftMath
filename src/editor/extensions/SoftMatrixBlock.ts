import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MatrixBlockView } from '../components/MatrixBlockView';
import type {
  MatrixBlockConfig,
  MatrixDelimiter,
  MatrixMode,
} from '../../services/matrixService';

export type MatrixPresetId =
  | 'system-3x3'
  | 'invertible-2x2'
  | 'identity-3x3'
  | 'singular-3x3';

export function createPresetMatrixConfig(
  preset: MatrixPresetId = 'system-3x3'
): MatrixBlockConfig {
  switch (preset) {
    case 'invertible-2x2':
      return {
        title: 'Matrice carrée 2×2',
        mode: 'matrix',
        delimiter: 'pmatrix',
        rows: 2,
        cols: 2,
        entries: [
          ['2', '1'],
          ['5', '3'],
        ],
        rhs: ['0', '0'],
        showSteps: false,
      };
    case 'identity-3x3':
      return {
        title: 'Matrice identité I₃',
        mode: 'matrix',
        delimiter: 'pmatrix',
        rows: 3,
        cols: 3,
        entries: [
          ['1', '0', '0'],
          ['0', '1', '0'],
          ['0', '0', '1'],
        ],
        rhs: ['0', '0', '0'],
        showSteps: false,
      };
    case 'singular-3x3':
      return {
        title: 'Matrice non inversible',
        mode: 'matrix',
        delimiter: 'bmatrix',
        rows: 3,
        cols: 3,
        entries: [
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
        ],
        rhs: ['1', '2', '3'],
        showSteps: true,
      };
    case 'system-3x3':
    default:
      return {
        title: 'Système linéaire AX = B',
        mode: 'system',
        delimiter: 'pmatrix',
        rows: 3,
        cols: 3,
        entries: [
          ['2', '1', '-1'],
          ['-3', '-1', '2'],
          ['-2', '1', '2'],
        ],
        rhs: ['8', '-11', '-3'],
        showSteps: false,
      };
  }
}

export function normalizeMatrixBlockConfig(
  raw: Partial<MatrixBlockConfig>
): MatrixBlockConfig {
  const mode: MatrixMode = raw.mode === 'system' ? 'system' : 'matrix';
  const delimiter: MatrixDelimiter =
    raw.delimiter === 'bmatrix' || raw.delimiter === 'vmatrix'
      ? raw.delimiter
      : 'pmatrix';
  const rows = Math.max(1, Math.min(6, Number(raw.rows) || 3));
  const cols = Math.max(1, Math.min(6, Number(raw.cols) || 3));

  const entries = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (__, c) => {
      const val = raw.entries?.[r]?.[c];
      return typeof val === 'string' ? val : r === c ? '1' : '0';
    })
  );

  const rhs = Array.from({ length: rows }, (_, r) => {
    const val = raw.rhs?.[r];
    return typeof val === 'string' ? val : '0';
  });

  return {
    title: typeof raw.title === 'string' ? raw.title : 'Matrice',
    mode,
    delimiter,
    rows,
    cols,
    entries,
    rhs,
    showSteps: Boolean(raw.showSteps),
  };
}

export function parseMatrixBlockConfig(rawSpec: string): MatrixBlockConfig {
  const fallback = createPresetMatrixConfig('system-3x3');
  if (!rawSpec || !rawSpec.trim()) return fallback;
  try {
    const parsed = JSON.parse(rawSpec) as Partial<MatrixBlockConfig>;
    return normalizeMatrixBlockConfig(parsed);
  } catch {
    return fallback;
  }
}

export function serializeMatrixBlockConfig(config: MatrixBlockConfig): string {
  return JSON.stringify(normalizeMatrixBlockConfig(config));
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    matrixBlock: {
      insertMatrixBlock: (config?: MatrixBlockConfig) => ReturnType;
    };
  }
}

export function insertMatrixBlock(
  editor: Editor,
  config: MatrixBlockConfig = createPresetMatrixConfig('system-3x3')
) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'matrixBlock',
      attrs: { spec: serializeMatrixBlockConfig(config) },
    })
    .run();
}

export const SoftMatrixBlock = Node.create({
  name: 'matrixBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  priority: 120,

  addAttributes() {
    return {
      spec: {
        default: serializeMatrixBlockConfig(createPresetMatrixConfig('system-3x3')),
        parseHTML: (el) => el.getAttribute('data-spec') ?? '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="softmath-matrix"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'softmath-matrix',
        'data-spec': HTMLAttributes.spec ?? '',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MatrixBlockView);
  },

  addCommands() {
    return {
      insertMatrixBlock:
        (config = createPresetMatrixConfig('system-3x3')) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              spec: serializeMatrixBlockConfig(config),
            },
          }),
    };
  },

  markdownTokenName: 'matrixBlock',

  markdownTokenizer: {
    name: 'matrixBlock',
    level: 'block',
    start: (src) => {
      const match = src.match(/^[ \t]*```softmath-matrix\b/m);
      return match && match.index !== undefined ? match.index : -1;
    },
    tokenize: (src) => {
      const match = src.match(
        /^[ \t]*```softmath-matrix[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```(?=[ \t]*(?:\r?\n|$))/
      );
      if (!match) return undefined;
      const [raw, innerJson] = match;
      return {
        type: 'matrixBlock',
        raw,
        spec: innerJson.trim(),
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const normalized = serializeMatrixBlockConfig(
      parseMatrixBlockConfig(typeof token.spec === 'string' ? token.spec : '')
    );
    return helpers.createNode('matrixBlock', { spec: normalized });
  },

  renderMarkdown: (node) => {
    const config = parseMatrixBlockConfig(
      typeof node.attrs?.spec === 'string' ? node.attrs.spec : ''
    );
    return `\`\`\`softmath-matrix\n${JSON.stringify(config, null, 2)}\n\`\`\``;
  },
});

