import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { compile, type EvalFunction } from 'mathjs';
import { Surface3DBlockView } from '../components/Surface3DBlockView';

export type Surface3DPalette = 'indigo' | 'heat' | 'emerald';
export type Surface3DPresetId = 'wave' | 'saddle' | 'paraboloid' | 'gaussian';

export interface Surface3DConfig {
  title: string;
  expression: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  resolution: number;
  azimuthDeg: number;
  elevationDeg: number;
  zoom: number;
  palette: Surface3DPalette;
}

export interface Surface3DQuad {
  points: string;
  depth: number;
  fill: string;
  stroke: string;
}

export interface Surface3DAxisLine {
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface Surface3DMeshResult {
  error: string | null;
  quads: Surface3DQuad[];
  axes: Surface3DAxisLine[];
  zMin: number;
  zMax: number;
}

export function createPresetSurface3DConfig(
  preset: Surface3DPresetId = 'wave'
): Surface3DConfig {
  switch (preset) {
    case 'saddle':
      return {
        title: 'Paraboloïde hyperbolique (selle de cheval)',
        expression: '(x^2 - y^2) / 4',
        xMin: -3,
        xMax: 3,
        yMin: -3,
        yMax: 3,
        resolution: 20,
        azimuthDeg: 38,
        elevationDeg: 28,
        zoom: 1,
        palette: 'heat',
      };
    case 'paraboloid':
      return {
        title: 'Paraboloïde elliptique',
        expression: '(x^2 + y^2) / 4',
        xMin: -3,
        xMax: 3,
        yMin: -3,
        yMax: 3,
        resolution: 20,
        azimuthDeg: 35,
        elevationDeg: 26,
        zoom: 1,
        palette: 'indigo',
      };
    case 'gaussian':
      return {
        title: 'Onde amortie e^{-(x²+y²)/4} cos(2x)',
        expression: '2 * exp(-(x^2 + y^2) / 5) * cos(1.6 * x)',
        xMin: -3.5,
        xMax: 3.5,
        yMin: -3.5,
        yMax: 3.5,
        resolution: 22,
        azimuthDeg: 42,
        elevationDeg: 30,
        zoom: 1,
        palette: 'emerald',
      };
    case 'wave':
    default:
      return {
        title: 'Surface z = sin(√(x² + y²))',
        expression: 'sin(sqrt(x^2 + y^2))',
        xMin: -6,
        xMax: 6,
        yMin: -6,
        yMax: 6,
        resolution: 22,
        azimuthDeg: 40,
        elevationDeg: 28,
        zoom: 1,
        palette: 'indigo',
      };
  }
}

export function normalizeSurface3DConfig(
  raw: Partial<Surface3DConfig>
): Surface3DConfig {
  const palette: Surface3DPalette =
    raw.palette === 'heat' || raw.palette === 'emerald' ? raw.palette : 'indigo';
  const xMin = Number.isFinite(Number(raw.xMin)) ? Number(raw.xMin) : -5;
  const xMaxRaw = Number.isFinite(Number(raw.xMax)) ? Number(raw.xMax) : 5;
  const xMax = xMaxRaw > xMin ? xMaxRaw : xMin + 4;
  const yMin = Number.isFinite(Number(raw.yMin)) ? Number(raw.yMin) : -5;
  const yMaxRaw = Number.isFinite(Number(raw.yMax)) ? Number(raw.yMax) : 5;
  const yMax = yMaxRaw > yMin ? yMaxRaw : yMin + 4;

  return {
    title: typeof raw.title === 'string' ? raw.title : 'Surface 3D',
    expression:
      typeof raw.expression === 'string' && raw.expression.trim()
        ? raw.expression.trim()
        : 'sin(sqrt(x^2 + y^2))',
    xMin,
    xMax,
    yMin,
    yMax,
    resolution: Math.max(8, Math.min(34, Math.round(Number(raw.resolution) || 20))),
    azimuthDeg: Number.isFinite(Number(raw.azimuthDeg)) ? Number(raw.azimuthDeg) : 40,
    elevationDeg: Math.max(
      -85,
      Math.min(85, Number.isFinite(Number(raw.elevationDeg)) ? Number(raw.elevationDeg) : 28)
    ),
    zoom: Math.max(0.5, Math.min(2.2, Number(raw.zoom) || 1)),
    palette,
  };
}

export function parseSurface3DConfig(rawSpec: string): Surface3DConfig {
  const fallback = createPresetSurface3DConfig('wave');
  if (!rawSpec || !rawSpec.trim()) return fallback;
  try {
    return normalizeSurface3DConfig(JSON.parse(rawSpec) as Partial<Surface3DConfig>);
  } catch {
    return fallback;
  }
}

export function serializeSurface3DConfig(config: Surface3DConfig): string {
  return JSON.stringify(normalizeSurface3DConfig(config));
}

function interpolateSurfaceColor(t: number, palette: Surface3DPalette): string {
  const u = Math.max(0, Math.min(1, t));
  if (palette === 'heat') {
    const hue = Math.round(230 - u * 215);
    const light = Math.round(42 + u * 18);
    return `hsl(${hue}, 82%, ${light}%)`;
  }
  if (palette === 'emerald') {
    const hue = Math.round(200 - u * 60);
    const light = Math.round(34 + u * 26);
    return `hsl(${hue}, 68%, ${light}%)`;
  }
  const hue = Math.round(255 - u * 65);
  const light = Math.round(36 + u * 26);
  return `hsl(${hue}, 78%, ${light}%)`;
}

export function computeSurface3DMesh(
  config: Surface3DConfig,
  width = 480,
  height = 310
): Surface3DMeshResult {
  let compiled: EvalFunction;
  try {
    compiled = compile(config.expression);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Expression invalide',
      quads: [],
      axes: [],
      zMin: 0,
      zMax: 0,
    };
  }

  const N = config.resolution;
  const xSpan = config.xMax - config.xMin || 1;
  const ySpan = config.yMax - config.yMin || 1;

  const rawGrid: (number | null)[][] = [];
  let zMin = Infinity;
  let zMax = -Infinity;

  for (let i = 0; i <= N; i += 1) {
    const row: (number | null)[] = [];
    const x = config.xMin + (i / N) * xSpan;
    for (let j = 0; j <= N; j += 1) {
      const y = config.yMin + (j / N) * ySpan;
      try {
        const val = Number(compiled.evaluate({ x, y }));
        if (Number.isFinite(val) && Math.abs(val) < 1e4) {
          row.push(val);
          if (val < zMin) zMin = val;
          if (val > zMax) zMax = val;
        } else {
          row.push(null);
        }
      } catch {
        row.push(null);
      }
    }
    rawGrid.push(row);
  }

  if (!Number.isFinite(zMin) || !Number.isFinite(zMax)) {
    return {
      error: 'Aucune valeur réelle finie trouvée sur ce domaine.',
      quads: [],
      axes: [],
      zMin: 0,
      zMax: 0,
    };
  }

  const zMid = (zMin + zMax) / 2;
  const zRange = zMax - zMin || 1;
  const az = (config.azimuthDeg * Math.PI) / 180;
  const el = (config.elevationDeg * Math.PI) / 180;
  const cosAz = Math.cos(az);
  const sinAz = Math.sin(az);
  const cosEl = Math.cos(el);
  const sinEl = Math.sin(el);
  const scale = Math.min(width, height) * 0.34 * config.zoom;
  const cx = width / 2;
  const cy = height / 2 + 12;

  const projectPoint = (nx: number, ny: number, nz: number) => {
    const rx = nx * cosAz - ny * sinAz;
    const ry = nx * sinAz + ny * cosAz;
    const py = nz * cosEl - ry * sinEl;
    const depth = ry * cosEl + nz * sinEl;
    const persp = 4.2 / (4.2 - depth * 0.65);
    return {
      sx: cx + rx * scale * persp,
      sy: cy - py * scale * persp,
      depth,
    };
  };

  interface ProjectedVert {
    sx: number;
    sy: number;
    depth: number;
    t: number;
  }

  const xMid = (config.xMin + config.xMax) / 2;
  const yMid = (config.yMin + config.yMax) / 2;

  const projGrid: (ProjectedVert | null)[][] = rawGrid.map((row, i) => {
    const x = config.xMin + (i / N) * xSpan;
    const nx = ((x - xMid) / xSpan) * 2;
    return row.map((z, j) => {
      if (z === null) return null;
      const y = config.yMin + (j / N) * ySpan;
      const ny = ((y - yMid) / ySpan) * 2;
      const nz = ((z - zMid) / zRange) * 1.4;
      const p = projectPoint(nx, ny, nz);
      return {
        sx: p.sx,
        sy: p.sy,
        depth: p.depth,
        t: (z - zMin) / zRange,
      };
    });
  });

  const quads: Surface3DQuad[] = [];
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const p00 = projGrid[i][j];
      const p10 = projGrid[i + 1][j];
      const p11 = projGrid[i + 1][j + 1];
      const p01 = projGrid[i][j + 1];
      if (!p00 || !p10 || !p11 || !p01) continue;

      const avgDepth = (p00.depth + p10.depth + p11.depth + p01.depth) / 4;
      const avgT = (p00.t + p10.t + p11.t + p01.t) / 4;
      quads.push({
        points: `${p00.sx.toFixed(1)},${p00.sy.toFixed(1)} ${p10.sx.toFixed(1)},${p10.sy.toFixed(1)} ${p11.sx.toFixed(1)},${p11.sy.toFixed(1)} ${p01.sx.toFixed(1)},${p01.sy.toFixed(1)}`,
        depth: avgDepth,
        fill: interpolateSurfaceColor(avgT, config.palette),
        stroke: 'rgba(15, 23, 42, 0.25)',
      });
    }
  }

  quads.sort((a, b) => a.depth - b.depth);

  const origin = projectPoint(-1.1, -1.1, -0.75);
  const xAxis = projectPoint(1.15, -1.1, -0.75);
  const yAxis = projectPoint(-1.1, 1.15, -0.75);
  const zAxis = projectPoint(-1.1, -1.1, 0.9);

  const axes: Surface3DAxisLine[] = [
    { label: 'x', x1: origin.sx, y1: origin.sy, x2: xAxis.sx, y2: xAxis.sy, color: '#ef4444' },
    { label: 'y', x1: origin.sx, y1: origin.sy, x2: yAxis.sx, y2: yAxis.sy, color: '#10b981' },
    { label: 'z', x1: origin.sx, y1: origin.sy, x2: zAxis.sx, y2: zAxis.sy, color: '#6366f1' },
  ];

  return {
    error: null,
    quads,
    axes,
    zMin,
    zMax,
  };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    surface3dBlock: {
      insertSurface3D: (config?: Surface3DConfig) => ReturnType;
    };
  }
}

export function insertSurface3DBlock(
  editor: Editor,
  config: Surface3DConfig = createPresetSurface3DConfig('wave')
) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'surface3dBlock',
      attrs: { spec: serializeSurface3DConfig(config) },
    })
    .run();
}

export const SoftSurface3D = Node.create({
  name: 'surface3dBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  priority: 120,

  addAttributes() {
    return {
      spec: {
        default: serializeSurface3DConfig(createPresetSurface3DConfig('wave')),
        parseHTML: (el) => el.getAttribute('data-spec') ?? '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="softmath-3d"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'softmath-3d',
        'data-spec': HTMLAttributes.spec ?? '',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(Surface3DBlockView);
  },

  addCommands() {
    return {
      insertSurface3D:
        (config = createPresetSurface3DConfig('wave')) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { spec: serializeSurface3DConfig(config) },
          }),
    };
  },

  markdownTokenName: 'surface3dBlock',

  markdownTokenizer: {
    name: 'surface3dBlock',
    level: 'block',
    start: (src) => {
      const match = src.match(/^[ \t]*```softmath-3d\b/m);
      return match && match.index !== undefined ? match.index : -1;
    },
    tokenize: (src) => {
      const match = src.match(
        /^[ \t]*```softmath-3d[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```(?=[ \t]*(?:\r?\n|$))/
      );
      if (!match) return undefined;
      const [raw, innerJson] = match;
      return {
        type: 'surface3dBlock',
        raw,
        spec: innerJson.trim(),
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const normalized = serializeSurface3DConfig(
      parseSurface3DConfig(typeof token.spec === 'string' ? token.spec : '')
    );
    return helpers.createNode('surface3dBlock', { spec: normalized });
  },

  renderMarkdown: (node) => {
    const config = parseSurface3DConfig(
      typeof node.attrs?.spec === 'string' ? node.attrs.spec : ''
    );
    return `\`\`\`softmath-3d\n${JSON.stringify(config, null, 2)}\n\`\`\``;
  },
});
