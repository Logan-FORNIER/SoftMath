import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { VariationTableBlockView } from '../components/VariationTableBlockView';

export type VariationSignKind = '+' | '-' | '0' | '';
export type VariationMarkerKind = '' | '0' | '||';
export type VariationArrowKind = 'up' | 'down' | 'flat' | 'forbidden';
export type VariationBoundaryPos = 'auto' | 'top' | 'mid' | 'bottom';

export interface VariationBoundaryValue {
  value: string;
  doubleBar?: boolean;
  leftValue?: string;
  rightValue?: string;
  position?: VariationBoundaryPos;
  leftPosition?: VariationBoundaryPos;
  rightPosition?: VariationBoundaryPos;
}

export interface VariationSignRow {
  id: string;
  kind: 'sign';
  label: string;
  signs: VariationSignKind[];
  markers: VariationMarkerKind[];
}

export interface VariationCurveRow {
  id: string;
  kind: 'variation';
  label: string;
  values: VariationBoundaryValue[];
  arrows: VariationArrowKind[];
}

export type VariationRow = VariationSignRow | VariationCurveRow;

export interface VariationTableConfig {
  title: string;
  variable: string;
  xValues: string[];
  rows: VariationRow[];
}

export type VariationPresetId = 'quadratic' | 'inverse' | 'cubic' | 'affine';

function cloneBoundaryValue(
  raw: Partial<VariationBoundaryValue> | undefined
): VariationBoundaryValue {
  const validPos = (p: unknown): VariationBoundaryPos =>
    p === 'top' || p === 'mid' || p === 'bottom' ? p : 'auto';

  return {
    value: typeof raw?.value === 'string' ? raw.value : '',
    doubleBar: Boolean(raw?.doubleBar),
    leftValue: typeof raw?.leftValue === 'string' ? raw.leftValue : '',
    rightValue: typeof raw?.rightValue === 'string' ? raw.rightValue : '',
    position: validPos(raw?.position),
    leftPosition: validPos(raw?.leftPosition),
    rightPosition: validPos(raw?.rightPosition),
  };
}

export function createPresetVariationConfig(
  preset: VariationPresetId = 'quadratic'
): VariationTableConfig {
  switch (preset) {
    case 'affine':
      return {
        title: 'Signe et variations (fonction affine)',
        variable: 'x',
        xValues: ['-\\infty', '2', '+\\infty'],
        rows: [
          {
            id: 'row-sign-1',
            kind: 'sign',
            label: 'x - 2',
            signs: ['-', '+'],
            markers: ['', '0', ''],
          },
          {
            id: 'row-var-1',
            kind: 'variation',
            label: 'f(x)',
            values: [
              { value: '-\\infty' },
              { value: '0' },
              { value: '+\\infty' },
            ],
            arrows: ['up', 'up'],
          },
        ],
      };

    case 'inverse':
      return {
        title: 'Variations de f(x) = 1/x',
        variable: 'x',
        xValues: ['-\\infty', '0', '+\\infty'],
        rows: [
          {
            id: 'row-sign-1',
            kind: 'sign',
            label: "f'(x)",
            signs: ['-', '-'],
            markers: ['', '||', ''],
          },
          {
            id: 'row-var-1',
            kind: 'variation',
            label: 'f(x)',
            values: [
              { value: '0' },
              {
                value: '',
                doubleBar: true,
                leftValue: '-\\infty',
                rightValue: '+\\infty',
              },
              { value: '0' },
            ],
            arrows: ['down', 'down'],
          },
        ],
      };

    case 'cubic':
      return {
        title: 'Variations (polynôme de degré 3)',
        variable: 'x',
        xValues: ['-\\infty', '-1', '1', '+\\infty'],
        rows: [
          {
            id: 'row-sign-1',
            kind: 'sign',
            label: "f'(x)",
            signs: ['+', '-', '+'],
            markers: ['', '0', '0', ''],
          },
          {
            id: 'row-var-1',
            kind: 'variation',
            label: 'f(x)',
            values: [
              { value: '-\\infty' },
              { value: '2' },
              { value: '-2' },
              { value: '+\\infty' },
            ],
            arrows: ['up', 'down', 'up'],
          },
        ],
      };

    case 'quadratic':
    default:
      return {
        title: 'Signe et variations de f',
        variable: 'x',
        xValues: ['-\\infty', '1', '+\\infty'],
        rows: [
          {
            id: 'row-sign-1',
            kind: 'sign',
            label: "f'(x)",
            signs: ['-', '+'],
            markers: ['', '0', ''],
          },
          {
            id: 'row-var-1',
            kind: 'variation',
            label: 'f(x)',
            values: [
              { value: '+\\infty' },
              { value: '-4' },
              { value: '+\\infty' },
            ],
            arrows: ['down', 'up'],
          },
        ],
      };
  }
}

export function normalizeVariationTableConfig(
  config: VariationTableConfig
): VariationTableConfig {
  const xValues =
    Array.isArray(config.xValues) && config.xValues.length >= 2
      ? config.xValues.map((v) => (typeof v === 'string' ? v : ''))
      : ['-\\infty', '+\\infty'];
  const colCount = xValues.length;
  const intervalCount = colCount - 1;

  const validSign = (s: unknown): VariationSignKind =>
    s === '+' || s === '-' || s === '0' ? s : '';
  const validMarker = (m: unknown): VariationMarkerKind =>
    m === '0' || m === '||' ? m : '';
  const validArrow = (a: unknown): VariationArrowKind =>
    a === 'up' || a === 'down' || a === 'flat' || a === 'forbidden'
      ? a
      : 'up';

  const rows: VariationRow[] = (Array.isArray(config.rows) ? config.rows : []).map(
    (row, idx): VariationRow => {
      const id =
        typeof row?.id === 'string' && row.id ? row.id : `row-${idx + 1}`;
      const label = typeof row?.label === 'string' ? row.label : '';

      if (row?.kind === 'sign') {
        const signs = Array.from({ length: intervalCount }, (_, i) =>
          validSign(row.signs?.[i])
        );
        const markers = Array.from({ length: colCount }, (_, i) =>
          validMarker(row.markers?.[i])
        );
        return { id, kind: 'sign', label, signs, markers };
      }

      const values = Array.from({ length: colCount }, (_, i) =>
        cloneBoundaryValue(row?.kind === 'variation' ? row.values?.[i] : undefined)
      );
      const arrows = Array.from({ length: intervalCount }, (_, i) =>
        validArrow(row?.kind === 'variation' ? row.arrows?.[i] : undefined)
      );
      return { id, kind: 'variation', label, values, arrows };
    }
  );

  return {
    title: typeof config.title === 'string' ? config.title : 'Tableau de variations',
    variable:
      typeof config.variable === 'string' && config.variable.trim()
        ? config.variable.trim()
        : 'x',
    xValues,
    rows:
      rows.length > 0 ? rows : createPresetVariationConfig('quadratic').rows,
  };
}

export function parseVariationTableConfig(rawSpec: string): VariationTableConfig {
  const fallback = createPresetVariationConfig('quadratic');
  if (!rawSpec || !rawSpec.trim()) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(rawSpec) as Partial<VariationTableConfig>;
    return normalizeVariationTableConfig({
      title: typeof parsed.title === 'string' ? parsed.title : fallback.title,
      variable:
        typeof parsed.variable === 'string' ? parsed.variable : fallback.variable,
      xValues: Array.isArray(parsed.xValues) ? parsed.xValues : fallback.xValues,
      rows: Array.isArray(parsed.rows) ? parsed.rows : fallback.rows,
    });
  } catch {
    return fallback;
  }
}

export function serializeVariationTableConfig(
  config: VariationTableConfig
): string {
  return JSON.stringify(normalizeVariationTableConfig(config));
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    variationTableBlock: {
      insertVariationTable: (config?: VariationTableConfig) => ReturnType;
    };
  }
}

export function insertVariationTableBlock(
  editor: Editor,
  config: VariationTableConfig = createPresetVariationConfig('quadratic')
) {
  const spec = serializeVariationTableConfig(config);
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'variationTableBlock',
      attrs: { spec, autoConfigure: true },
    })
    .run();
}

export const SoftVariationTable = Node.create({
  name: 'variationTableBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  priority: 120,

  addAttributes() {
    return {
      spec: {
        default: serializeVariationTableConfig(
          createPresetVariationConfig('quadratic')
        ),
        parseHTML: (el) => el.getAttribute('data-spec') ?? '',
      },
      autoConfigure: {
        default: false,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="softmath-variation"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'softmath-variation',
        'data-spec': HTMLAttributes.spec ?? '',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariationTableBlockView);
  },

  addCommands() {
    return {
      insertVariationTable:
        (config = createPresetVariationConfig('quadratic')) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              spec: serializeVariationTableConfig(config),
              autoConfigure: true,
            },
          }),
    };
  },

  markdownTokenName: 'variationTableBlock',

  markdownTokenizer: {
    name: 'variationTableBlock',
    level: 'block',
    start: (src) => {
      const match = src.match(/^[ \t]*```softmath-variation\b/m);
      return match && match.index !== undefined ? match.index : -1;
    },
    tokenize: (src) => {
      const match = src.match(
        /^[ \t]*```softmath-variation[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```(?=[ \t]*(?:\r?\n|$))/
      );
      if (!match) {
        return undefined;
      }
      const [raw, innerJson] = match;
      return {
        type: 'variationTableBlock',
        raw,
        spec: innerJson.trim(),
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const normalized = serializeVariationTableConfig(
      parseVariationTableConfig(typeof token.spec === 'string' ? token.spec : '')
    );
    return helpers.createNode('variationTableBlock', { spec: normalized });
  },

  renderMarkdown: (node) => {
    const config = parseVariationTableConfig(
      typeof node.attrs?.spec === 'string' ? node.attrs.spec : ''
    );
    return `\`\`\`softmath-variation\n${JSON.stringify(config, null, 2)}\n\`\`\``;
  },
});

