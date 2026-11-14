import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { FunctionPlotBlockView } from '../components/FunctionPlotBlockView';

export interface PlotCurveConfig {
  id: string;
  expression: string;
  color: string;
  visible: boolean;
  showDerivative?: boolean;
}

export interface PlotParameter {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
}

export interface PlotTangentConfig {
  enabled: boolean;
  x0: number;
  curveId?: string;
}

export interface FunctionPlotConfig {
  title: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  showGrid: boolean;
  integralFrom?: string;
  integralTo?: string;
  showSpecialPoints?: boolean;
  tangent?: PlotTangentConfig;
  parameters?: PlotParameter[];
  curves: PlotCurveConfig[];
}

export const PLOT_CURVE_COLORS = [
  '#4f46e5',
  '#059669',
  '#e11d48',
  '#d97706',
  '#0284c7',
  '#9333ea',
];

export function createDefaultPlotConfig(): FunctionPlotConfig {
  return {
    title: 'Graphe 2D',
    xMin: -6.5,
    xMax: 6.5,
    yMin: -3.5,
    yMax: 3.5,
    showGrid: true,
    integralFrom: '',
    integralTo: '',
    showSpecialPoints: false,
    tangent: { enabled: false, x0: 0 },
    parameters: [],
    curves: [
      {
        id: 'curve-1',
        expression: 'sin(x)',
        color: PLOT_CURVE_COLORS[0],
        visible: true,
        showDerivative: false,
      },
    ],
  };
}

export function parseFunctionPlotConfig(rawSpec: string): FunctionPlotConfig {
  const fallback = createDefaultPlotConfig();
  if (!rawSpec || !rawSpec.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawSpec) as Partial<FunctionPlotConfig>;
    const xMin =
      typeof parsed.xMin === 'number' && Number.isFinite(parsed.xMin)
        ? parsed.xMin
        : fallback.xMin;
    const xMax =
      typeof parsed.xMax === 'number' &&
      Number.isFinite(parsed.xMax) &&
      parsed.xMax > xMin
        ? parsed.xMax
        : xMin + 10;
    const yMin =
      typeof parsed.yMin === 'number' && Number.isFinite(parsed.yMin)
        ? parsed.yMin
        : fallback.yMin;
    const yMax =
      typeof parsed.yMax === 'number' &&
      Number.isFinite(parsed.yMax) &&
      parsed.yMax > yMin
        ? parsed.yMax
        : yMin + 6;

    const rawCurves = Array.isArray(parsed.curves) ? parsed.curves : [];
    const curves: PlotCurveConfig[] =
      rawCurves.length > 0
        ? rawCurves.map((c, idx) => ({
            id: typeof c?.id === 'string' && c.id ? c.id : `curve-${idx + 1}`,
            expression: typeof c?.expression === 'string' ? c.expression : '0',
            color:
              typeof c?.color === 'string' && c.color
                ? c.color
                : PLOT_CURVE_COLORS[idx % PLOT_CURVE_COLORS.length],
            visible: typeof c?.visible === 'boolean' ? c.visible : true,
            showDerivative: Boolean(c?.showDerivative),
          }))
        : fallback.curves;

    const parameters: PlotParameter[] = Array.isArray(parsed.parameters)
      ? parsed.parameters
          .filter(
            (p): p is PlotParameter =>
              Boolean(p) && typeof p.name === 'string' && Boolean(p.name.trim())
          )
          .map((p) => {
            const min =
              typeof p.min === 'number' && Number.isFinite(p.min) ? p.min : -5;
            const max =
              typeof p.max === 'number' && Number.isFinite(p.max) && p.max > min
                ? p.max
                : min + 10;
            const step =
              typeof p.step === 'number' && Number.isFinite(p.step) && p.step > 0
                ? p.step
                : 0.1;
            const value =
              typeof p.value === 'number' && Number.isFinite(p.value)
                ? p.value
                : 1;
            return {
              name: p.name.trim(),
              value,
              min,
              max,
              step,
            };
          })
      : [];

    const tangent: PlotTangentConfig = {
      enabled: Boolean(parsed.tangent?.enabled),
      x0:
        typeof parsed.tangent?.x0 === 'number' && Number.isFinite(parsed.tangent.x0)
          ? parsed.tangent.x0
          : 0,
      curveId:
        typeof parsed.tangent?.curveId === 'string'
          ? parsed.tangent.curveId
          : undefined,
    };

    return {
      title: typeof parsed.title === 'string' ? parsed.title : fallback.title,
      xMin,
      xMax,
      yMin,
      yMax,
      showGrid:
        typeof parsed.showGrid === 'boolean' ? parsed.showGrid : true,
      integralFrom:
        typeof parsed.integralFrom === 'string' ? parsed.integralFrom : '',
      integralTo:
        typeof parsed.integralTo === 'string' ? parsed.integralTo : '',
      showSpecialPoints: Boolean(parsed.showSpecialPoints),
      tangent,
      parameters,
      curves,
    };
  } catch {
    return fallback;
  }
}

export function serializeFunctionPlotConfig(config: FunctionPlotConfig): string {
  return JSON.stringify(config);
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    functionPlotBlock: {
      insertFunctionPlot: (config?: FunctionPlotConfig) => ReturnType;
    };
  }
}

export function insertFunctionPlotBlock(
  editor: Editor,
  config: FunctionPlotConfig = createDefaultPlotConfig()
) {
  const spec = serializeFunctionPlotConfig(config);
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'functionPlotBlock',
      attrs: { spec, autoConfigure: true },
    })
    .run();
}

export const SoftFunctionPlot = Node.create({
  name: 'functionPlotBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  priority: 120,

  addAttributes() {
    return {
      spec: {
        default: serializeFunctionPlotConfig(createDefaultPlotConfig()),
        parseHTML: (el) => el.getAttribute('data-spec') ?? '',
      },
      autoConfigure: {
        default: false,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="softmath-plot"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'softmath-plot',
        'data-spec': HTMLAttributes.spec ?? '',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FunctionPlotBlockView);
  },

  addCommands() {
    return {
      insertFunctionPlot:
        (config = createDefaultPlotConfig()) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              spec: serializeFunctionPlotConfig(config),
              autoConfigure: true,
            },
          }),
    };
  },

  markdownTokenName: 'functionPlotBlock',

  markdownTokenizer: {
    name: 'functionPlotBlock',
    level: 'block',
    start: (src) => {
      const match = src.match(/^[ \t]*```softmath-plot\b/m);
      return match && match.index !== undefined ? match.index : -1;
    },
    tokenize: (src) => {
      const match = src.match(
        /^[ \t]*```softmath-plot[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```(?=[ \t]*(?:\r?\n|$))/
      );
      if (!match) {
        return undefined;
      }
      const [raw, innerJson] = match;
      return {
        type: 'functionPlotBlock',
        raw,
        spec: innerJson.trim(),
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const normalized = serializeFunctionPlotConfig(
      parseFunctionPlotConfig(typeof token.spec === 'string' ? token.spec : '')
    );
    return helpers.createNode('functionPlotBlock', { spec: normalized });
  },

  renderMarkdown: (node) => {
    const config = parseFunctionPlotConfig(
      typeof node.attrs?.spec === 'string' ? node.attrs.spec : ''
    );
    return `\`\`\`softmath-plot\n${JSON.stringify(config, null, 2)}\n\`\`\``;
  },
});

