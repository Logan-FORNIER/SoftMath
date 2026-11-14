import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Geometry2DBlockView } from '../components/Geometry2DBlockView';

export interface GeoPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  color: string;
}

export type GeoShapeKind = 'segment' | 'line' | 'vector';

export interface GeoShape {
  id: string;
  kind: GeoShapeKind;
  fromId: string;
  toId: string;
  color: string;
  label?: string;
}

export interface GeoCircle {
  id: string;
  centerId: string;
  radius: number;
  throughPointId?: string;
  color: string;
}

export interface Geometry2DConfig {
  title: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  showGrid: boolean;
  points: GeoPoint[];
  shapes: GeoShape[];
  circles: GeoCircle[];
}

export type Geometry2DPresetId = 'triangle' | 'vectors' | 'circle';

export interface GeoShapeAnalysis {
  id: string;
  kind: GeoShapeKind;
  fromName: string;
  toName: string;
  dx: number;
  dy: number;
  length: number;
  midpoint: { x: number; y: number };
  cartesianEquation: string;
  reducedEquation: string;
}

export interface GeoVectorPairAnalysis {
  firstLabel: string;
  secondLabel: string;
  dotProduct: number;
  determinant: number;
  angleDeg: number | null;
  orthogonal: boolean;
  collinear: boolean;
}

export interface GeoCircleAnalysis {
  id: string;
  centerName: string;
  radius: number;
  equation: string;
  perimeter: number;
  area: number;
}

export interface Geometry2DAnalysis {
  shapes: GeoShapeAnalysis[];
  vectorPairs: GeoVectorPairAnalysis[];
  circles: GeoCircleAnalysis[];
}

export function createPresetGeometry2DConfig(
  preset: Geometry2DPresetId = 'triangle'
): Geometry2DConfig {
  switch (preset) {
    case 'vectors':
      return {
        title: 'Vecteurs et produit scalaire',
        xMin: -5,
        xMax: 7,
        yMin: -4,
        yMax: 6,
        showGrid: true,
        points: [
          { id: 'O', name: 'O', x: 0, y: 0, color: '#4f46e5' },
          { id: 'A', name: 'A', x: 4, y: 2, color: '#ef4444' },
          { id: 'B', name: 'B', x: -1, y: 2, color: '#10b981' },
        ],
        shapes: [
          { id: 'v1', kind: 'vector', fromId: 'O', toId: 'A', color: '#ef4444', label: 'u' },
          { id: 'v2', kind: 'vector', fromId: 'O', toId: 'B', color: '#10b981', label: 'v' },
        ],
        circles: [],
      };

    case 'circle':
      return {
        title: 'Cercle et corde dans le plan',
        xMin: -6,
        xMax: 6,
        yMin: -5,
        yMax: 5,
        showGrid: true,
        points: [
          { id: 'O', name: 'Ω', x: 1, y: 0, color: '#4f46e5' },
          { id: 'A', name: 'A', x: 4, y: 0, color: '#ef4444' },
          { id: 'B', name: 'B', x: 1, y: 3, color: '#0ea5e9' },
        ],
        shapes: [
          { id: 's1', kind: 'segment', fromId: 'O', toId: 'A', color: '#ef4444' },
          { id: 's2', kind: 'segment', fromId: 'A', toId: 'B', color: '#0ea5e9' },
        ],
        circles: [
          { id: 'c1', centerId: 'O', radius: 3, throughPointId: 'A', color: '#6366f1' },
        ],
      };

    case 'triangle':
    default:
      return {
        title: 'Triangle ABC et droite (AB)',
        xMin: -5,
        xMax: 6,
        yMin: -4,
        yMax: 6,
        showGrid: true,
        points: [
          { id: 'A', name: 'A', x: -2, y: -1, color: '#4f46e5' },
          { id: 'B', name: 'B', x: 4, y: 1, color: '#ef4444' },
          { id: 'C', name: 'C', x: 1, y: 4, color: '#10b981' },
        ],
        shapes: [
          { id: 'l1', kind: 'line', fromId: 'A', toId: 'B', color: '#6366f1' },
          { id: 's2', kind: 'segment', fromId: 'B', toId: 'C', color: '#0ea5e9' },
          { id: 'v3', kind: 'vector', fromId: 'A', toId: 'C', color: '#10b981', label: 'AC' },
        ],
        circles: [],
      };
  }
}

export function normalizeGeometry2DConfig(
  raw: Partial<Geometry2DConfig>
): Geometry2DConfig {
  const xMin = Number.isFinite(Number(raw.xMin)) ? Number(raw.xMin) : -6;
  const xMaxRaw = Number.isFinite(Number(raw.xMax)) ? Number(raw.xMax) : 6;
  const xMax = xMaxRaw > xMin ? xMaxRaw : xMin + 8;
  const yMin = Number.isFinite(Number(raw.yMin)) ? Number(raw.yMin) : -5;
  const yMaxRaw = Number.isFinite(Number(raw.yMax)) ? Number(raw.yMax) : 5;
  const yMax = yMaxRaw > yMin ? yMaxRaw : yMin + 8;

  const points: GeoPoint[] = Array.isArray(raw.points)
    ? raw.points.map((p, idx) => ({
        id: typeof p?.id === 'string' && p.id ? p.id : `P${idx + 1}`,
        name: typeof p?.name === 'string' && p.name ? p.name : `P${idx + 1}`,
        x: Number.isFinite(Number(p?.x)) ? Number(p.x) : 0,
        y: Number.isFinite(Number(p?.y)) ? Number(p.y) : 0,
        color: typeof p?.color === 'string' && p.color ? p.color : '#4f46e5',
      }))
    : createPresetGeometry2DConfig('triangle').points;

  const validIds = new Set(points.map((p) => p.id));

  const shapes: GeoShape[] = Array.isArray(raw.shapes)
    ? raw.shapes
        .filter((s) => validIds.has(s?.fromId) && validIds.has(s?.toId))
        .map((s, idx) => ({
          id: typeof s?.id === 'string' && s.id ? s.id : `S${idx + 1}`,
          kind:
            s?.kind === 'line' || s?.kind === 'vector' ? s.kind : 'segment',
          fromId: s.fromId,
          toId: s.toId,
          color: typeof s?.color === 'string' && s.color ? s.color : '#0ea5e9',
          label: typeof s?.label === 'string' ? s.label : undefined,
        }))
    : [];

  const circles: GeoCircle[] = Array.isArray(raw.circles)
    ? raw.circles
        .filter((c) => validIds.has(c?.centerId))
        .map((c, idx) => ({
          id: typeof c?.id === 'string' && c.id ? c.id : `C${idx + 1}`,
          centerId: c.centerId,
          radius: Math.max(0.1, Number(c?.radius) || 2),
          throughPointId:
            c?.throughPointId && validIds.has(c.throughPointId)
              ? c.throughPointId
              : undefined,
          color: typeof c?.color === 'string' && c.color ? c.color : '#6366f1',
        }))
    : [];

  return {
    title: typeof raw.title === 'string' ? raw.title : 'Figure de géométrie 2D',
    xMin,
    xMax,
    yMin,
    yMax,
    showGrid: raw.showGrid !== false,
    points,
    shapes,
    circles,
  };
}

export function parseGeometry2DConfig(rawSpec: string): Geometry2DConfig {
  const fallback = createPresetGeometry2DConfig('triangle');
  if (!rawSpec || !rawSpec.trim()) return fallback;
  try {
    return normalizeGeometry2DConfig(JSON.parse(rawSpec) as Partial<Geometry2DConfig>);
  } catch {
    return fallback;
  }
}

export function serializeGeometry2DConfig(config: Geometry2DConfig): string {
  return JSON.stringify(normalizeGeometry2DConfig(config));
}

function fmtNum(n: number): string {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

function formatLineEquations(p1: GeoPoint, p2: GeoPoint): {
  cartesian: string;
  reduced: string;
} {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return { cartesian: 'Points confondus', reduced: 'Points confondus' };
  }
  if (Math.abs(dx) < 1e-9) {
    return {
      cartesian: `x - (${fmtNum(p1.x)}) = 0`,
      reduced: `x = ${fmtNum(p1.x)}`,
    };
  }
  const m = dy / dx;
  const b = p1.y - m * p1.x;
  const aCart = dy;
  const bCart = -dx;
  const cCart = -(aCart * p1.x + bCart * p1.y);
  const cartesian = `${fmtNum(aCart)}x ${bCart >= 0 ? '+' : '-'} ${fmtNum(Math.abs(bCart))}y ${cCart >= 0 ? '+' : '-'} ${fmtNum(Math.abs(cCart))} = 0`;
  const slopeStr = Math.abs(m) < 1e-9 ? '' : `${fmtNum(m)}x`;
  const interceptStr =
    Math.abs(b) < 1e-9
      ? slopeStr
        ? ''
        : '0'
      : slopeStr
        ? b > 0
          ? ` + ${fmtNum(b)}`
          : ` - ${fmtNum(Math.abs(b))}`
        : fmtNum(b);
  return {
    cartesian,
    reduced: `y = ${slopeStr}${interceptStr}`.trim(),
  };
}

export function analyzeGeometry2D(config: Geometry2DConfig): Geometry2DAnalysis {
  const pointMap = new Map(config.points.map((p) => [p.id, p]));

  const shapes: GeoShapeAnalysis[] = [];
  for (const s of config.shapes) {
    const p1 = pointMap.get(s.fromId);
    const p2 = pointMap.get(s.toId);
    if (!p1 || !p2) continue;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.hypot(dx, dy);
    const eq = formatLineEquations(p1, p2);
    shapes.push({
      id: s.id,
      kind: s.kind,
      fromName: p1.name,
      toName: p2.name,
      dx,
      dy,
      length,
      midpoint: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
      cartesianEquation: eq.cartesian,
      reducedEquation: eq.reduced,
    });
  }

  const vectors = shapes.filter((s) => s.kind === 'vector');
  const vectorPairs: GeoVectorPairAnalysis[] = [];
  for (let i = 0; i < vectors.length; i += 1) {
    for (let j = i + 1; j < vectors.length; j += 1) {
      const u = vectors[i];
      const v = vectors[j];
      const dot = u.dx * v.dx + u.dy * v.dy;
      const det = u.dx * v.dy - u.dy * v.dx;
      const denom = u.length * v.length;
      const angleDeg =
        denom > 1e-9
          ? (Math.acos(Math.max(-1, Math.min(1, dot / denom))) * 180) / Math.PI
          : null;
      vectorPairs.push({
        firstLabel: `${u.fromName}${u.toName}`,
        secondLabel: `${v.fromName}${v.toName}`,
        dotProduct: dot,
        determinant: det,
        angleDeg,
        orthogonal: Math.abs(dot) < 1e-6 && denom > 1e-9,
        collinear: Math.abs(det) < 1e-6 && denom > 1e-9,
      });
    }
  }

  const circles: GeoCircleAnalysis[] = [];
  for (const c of config.circles) {
    const center = pointMap.get(c.centerId);
    if (!center) continue;
    const through = c.throughPointId ? pointMap.get(c.throughPointId) : undefined;
    const radius = through
      ? Math.hypot(through.x - center.x, through.y - center.y)
      : c.radius;
    const r2 = radius * radius;
    const xTerm =
      Math.abs(center.x) < 1e-9
        ? 'x^2'
        : `(x ${center.x > 0 ? '-' : '+'} ${fmtNum(Math.abs(center.x))})^2`;
    const yTerm =
      Math.abs(center.y) < 1e-9
        ? 'y^2'
        : `(y ${center.y > 0 ? '-' : '+'} ${fmtNum(Math.abs(center.y))})^2`;
    circles.push({
      id: c.id,
      centerName: center.name,
      radius,
      equation: `${xTerm} + ${yTerm} = ${fmtNum(r2)}`,
      perimeter: 2 * Math.PI * radius,
      area: Math.PI * r2,
    });
  }

  return { shapes, vectorPairs, circles };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    geometry2dBlock: {
      insertGeometry2D: (config?: Geometry2DConfig) => ReturnType;
    };
  }
}

export function insertGeometry2DBlock(
  editor: Editor,
  config: Geometry2DConfig = createPresetGeometry2DConfig('triangle')
) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'geometry2dBlock',
      attrs: { spec: serializeGeometry2DConfig(config) },
    })
    .run();
}

export const SoftGeometry2D = Node.create({
  name: 'geometry2dBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  priority: 120,

  addAttributes() {
    return {
      spec: {
        default: serializeGeometry2DConfig(createPresetGeometry2DConfig('triangle')),
        parseHTML: (el) => el.getAttribute('data-spec') ?? '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="softmath-geometry"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'softmath-geometry',
        'data-spec': HTMLAttributes.spec ?? '',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(Geometry2DBlockView);
  },

  addCommands() {
    return {
      insertGeometry2D:
        (config = createPresetGeometry2DConfig('triangle')) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { spec: serializeGeometry2DConfig(config) },
          }),
    };
  },

  markdownTokenName: 'geometry2dBlock',

  markdownTokenizer: {
    name: 'geometry2dBlock',
    level: 'block',
    start: (src) => {
      const match = src.match(/^[ \t]*```softmath-geometry\b/m);
      return match && match.index !== undefined ? match.index : -1;
    },
    tokenize: (src) => {
      const match = src.match(
        /^[ \t]*```softmath-geometry[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```(?=[ \t]*(?:\r?\n|$))/
      );
      if (!match) return undefined;
      const [raw, innerJson] = match;
      return {
        type: 'geometry2dBlock',
        raw,
        spec: innerJson.trim(),
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const normalized = serializeGeometry2DConfig(
      parseGeometry2DConfig(typeof token.spec === 'string' ? token.spec : '')
    );
    return helpers.createNode('geometry2dBlock', { spec: normalized });
  },

  renderMarkdown: (node) => {
    const config = parseGeometry2DConfig(
      typeof node.attrs?.spec === 'string' ? node.attrs.spec : ''
    );
    return `\`\`\`softmath-geometry\n${JSON.stringify(config, null, 2)}\n\`\`\``;
  },
});

