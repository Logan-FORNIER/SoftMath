import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  Crosshair,
  Eye,
  EyeOff,
  Grid,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { evaluate } from 'mathjs';
import {
  PLOT_CURVE_COLORS,
  parseFunctionPlotConfig,
  serializeFunctionPlotConfig,
  type FunctionPlotConfig,
  type PlotCurveConfig,
  type PlotParameter,
} from '../extensions/SoftFunctionPlot';
import {
  compilePlotDerivative,
  compilePlotFunction,
  estimatePlotDerivativeAt,
  extractPlotCandidateParams,
  findSpecialPlotPoints,
  integrateSimpson,
  normalizeMathExpression,
} from '../utils/mathEval';

const SVG_WIDTH = 720;
const SVG_HEIGHT = 380;
const SAMPLE_COUNT = 520;

function computeNiceStep(span: number, maxTicks = 8): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const rawStep = span / maxTicks;
  const exp = Math.floor(Math.log10(rawStep));
  const base = 10 ** exp;
  const normalized = rawStep / base;
  if (normalized <= 1) return 1 * base;
  if (normalized <= 2) return 2 * base;
  if (normalized <= 5) return 5 * base;
  return 10 * base;
}

function formatTickLabel(value: number, step: number): string {
  if (Math.abs(value) < step * 1e-4) return '0';
  const abs = Math.abs(value);
  if (abs >= 10000 || (abs > 0 && abs < 0.001)) {
    return value.toExponential(1);
  }
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(value.toFixed(Math.min(4, decimals))).toString();
}

function buildCurvePath(
  fn: (x: number) => number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): string {
  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;
  const dx = xSpan / SAMPLE_COUNT;

  const toSvgX = (x: number) => ((x - xMin) / xSpan) * SVG_WIDTH;
  const toSvgY = (y: number) => SVG_HEIGHT - ((y - yMin) / ySpan) * SVG_HEIGHT;

  let path = '';
  let penDown = false;
  let prevY = 0;
  let prevSvgY = 0;

  for (let i = 0; i <= SAMPLE_COUNT; i += 1) {
    const x = xMin + i * dx;
    const y = fn(x);
    if (!Number.isFinite(y)) {
      penDown = false;
      continue;
    }

    const svgX = toSvgX(x);
    const svgY = toSvgY(y);

    // Couper le tracé sur les asymptotes verticales (changement de signe + saut massif hors cadre)
    const verticalJump = Math.abs(svgY - prevSvgY);
    const outOfMargin = svgY < -SVG_HEIGHT * 1.5 || svgY > SVG_HEIGHT * 2.5;
    const prevOutOfMargin =
      prevSvgY < -SVG_HEIGHT * 1.5 || prevSvgY > SVG_HEIGHT * 2.5;

    if (
      penDown &&
      verticalJump > SVG_HEIGHT * 1.25 &&
      (outOfMargin || prevOutOfMargin || Math.sign(y) !== Math.sign(prevY))
    ) {
      penDown = false;
    }

    if (outOfMargin && prevOutOfMargin && penDown) {
      penDown = false;
    }

    const xRounded = svgX.toFixed(2);
    const yRounded = Math.max(-2000, Math.min(2400, svgY)).toFixed(2);

    if (!penDown) {
      path += `M ${xRounded} ${yRounded} `;
      penDown = true;
    } else {
      path += `L ${xRounded} ${yRounded} `;
    }
    prevY = y;
    prevSvgY = svgY;
  }

  return path.trim();
}

function parseNumericExpr(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  try {
    const normalized = normalizeMathExpression(raw);
    const value = evaluate(normalized);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function FunctionPlotBlockView({
  node,
  selected,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const config = useMemo(
    () => parseFunctionPlotConfig(String(node.attrs.spec ?? '')),
    [node.attrs.spec]
  );

  const [isConfigOpen, setIsConfigOpen] = useState(
    Boolean(node.attrs.autoConfigure)
  );
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoveredSpecialLabel, setHoveredSpecialLabel] = useState<string | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  } | null>(null);

  const commitConfig = useCallback(
    (next: FunctionPlotConfig) => {
      updateAttributes({
        spec: serializeFunctionPlotConfig(next),
        autoConfigure: false,
      });
    },
    [updateAttributes]
  );

  const xSpan = config.xMax - config.xMin;
  const ySpan = config.yMax - config.yMin;

  const toSvgX = (x: number) => ((x - config.xMin) / xSpan) * SVG_WIDTH;
  const toSvgY = (y: number) =>
    SVG_HEIGHT - ((y - config.yMin) / ySpan) * SVG_HEIGHT;

  const paramScope = useMemo(() => {
    const scope: Record<string, number> = {};
    for (const param of config.parameters ?? []) {
      scope[param.name] = param.value;
    }
    return scope;
  }, [config.parameters]);

  const missingCandidateParams = useMemo(() => {
    const existing = new Set((config.parameters ?? []).map((p) => p.name));
    return extractPlotCandidateParams(
      config.curves.map((c) => c.expression)
    ).filter((name) => !existing.has(name));
  }, [config.curves, config.parameters]);

  const compiledCurves = useMemo(() => {
    return config.curves.map((curve) => {
      const main = compilePlotFunction(curve.expression, paramScope);
      const path = main.evaluateAt
        ? buildCurvePath(
            main.evaluateAt,
            config.xMin,
            config.xMax,
            config.yMin,
            config.yMax
          )
        : '';
      const deriv =
        curve.showDerivative && curve.visible && main.evaluateAt
          ? compilePlotDerivative(curve.expression, paramScope)
          : null;
      const derivPath = deriv
        ? buildCurvePath(
            deriv.evaluateAt,
            config.xMin,
            config.xMax,
            config.yMin,
            config.yMax
          )
        : '';
      return {
        curve,
        evaluateAt: main.evaluateAt,
        error: main.error,
        path,
        deriv,
        derivPath,
      };
    });
  }, [config, paramScope]);

  // Tangente au point x0 sur la courbe sélectionnée (ou première courbe visible)
  const tangentInfo = useMemo(() => {
    if (!config.tangent?.enabled) return null;
    const visibleCurves = compiledCurves.filter(
      (c) => c.curve.visible && c.evaluateAt
    );
    if (visibleCurves.length === 0) return null;
    const target =
      visibleCurves.find((c) => c.curve.id === config.tangent?.curveId) ??
      visibleCurves[0];
    if (!target.evaluateAt) return null;

    const x0 = config.tangent.x0;
    const y0 = target.evaluateAt(x0);
    if (!Number.isFinite(y0)) return null;

    const slope =
      target.deriv?.evaluateAt(x0) ??
      estimatePlotDerivativeAt(target.evaluateAt, x0);
    if (slope === null || !Number.isFinite(slope)) return null;

    const intercept = y0 - slope * x0;
    const yLeft = slope * config.xMin + intercept;
    const yRight = slope * config.xMax + intercept;

    const absP = Math.abs(intercept);
    const equation =
      Math.abs(slope) < 1e-4
        ? `y = ${y0.toFixed(2)}`
        : Math.abs(intercept) < 1e-4
          ? `y = ${slope.toFixed(2)}x`
          : `y = ${slope.toFixed(2)}x ${intercept >= 0 ? '+' : '−'} ${absP.toFixed(2)}`;

    return {
      x0,
      y0,
      slope,
      equation,
      color: target.curve.color,
      curveId: target.curve.id,
      x1Px: toSvgX(config.xMin),
      y1Px: toSvgY(yLeft),
      x2Px: toSvgX(config.xMax),
      y2Px: toSvgY(yRight),
      ptX: toSvgX(x0),
      ptY: toSvgY(y0),
    };
  }, [
    config.tangent,
    config.xMin,
    config.xMax,
    config.yMin,
    config.yMax,
    compiledCurves,
  ]);

  // Points remarquables : racines, extrema et intersections
  const specialPoints = useMemo(() => {
    if (!config.showSpecialPoints) return [];
    const active = compiledCurves
      .filter((c) => c.curve.visible && c.evaluateAt)
      .map((c) => ({
        id: c.curve.id,
        color: c.curve.color,
        evaluateAt: c.evaluateAt!,
      }));
    return findSpecialPlotPoints(
      active,
      config.xMin,
      config.xMax,
      config.yMin,
      config.yMax
    );
  }, [
    config.showSpecialPoints,
    config.xMin,
    config.xMax,
    config.yMin,
    config.yMax,
    compiledCurves,
  ]);

  // Intégrale définie sur la première courbe visible avec fonction valide
  const integralInfo = useMemo(() => {
    const a = parseNumericExpr(config.integralFrom);
    const b = parseNumericExpr(config.integralTo);
    if (a === null || b === null) return null;
    const primary = compiledCurves.find(
      (item) => item.curve.visible && item.evaluateAt
    );
    if (!primary || !primary.evaluateAt) return null;

    const minX = Math.min(a, b);
    const maxX = Math.max(a, b);
    const value = integrateSimpson(primary.evaluateAt, a, b, 240);
    if (value === null) return null;

    const areaSteps = 120;
    const dx = (maxX - minX) / areaSteps;
    const pts: string[] = [];
    if (dx > 0) {
      pts.push(
        `M ${toSvgX(minX).toFixed(2)} ${toSvgY(0).toFixed(2)}`
      );
      for (let i = 0; i <= areaSteps; i += 1) {
        const px = minX + i * dx;
        const py = primary.evaluateAt(px);
        if (Number.isFinite(py)) {
          const clampedY = Math.max(-2000, Math.min(2400, toSvgY(py)));
          pts.push(`L ${toSvgX(px).toFixed(2)} ${clampedY.toFixed(2)}`);
        }
      }
      pts.push(
        `L ${toSvgX(maxX).toFixed(2)} ${toSvgY(0).toFixed(2)} Z`
      );
    }

    return {
      a,
      b,
      value,
      color: primary.curve.color,
      areaPath: pts.join(' '),
    };
  }, [
    config.integralFrom,
    config.integralTo,
    compiledCurves,
    config.xMin,
    config.xMax,
    config.yMin,
    config.yMax,
  ]);

  // Calcul des graduations X / Y
  const { xTicks, yTicks, xStep, yStep } = useMemo(() => {
    const xSt = computeNiceStep(xSpan, 9);
    const ySt = computeNiceStep(ySpan, 6);
    const xt: number[] = [];
    const yt: number[] = [];

    const firstX = Math.ceil(config.xMin / xSt) * xSt;
    for (let x = firstX; x <= config.xMax + xSt * 0.001; x += xSt) {
      xt.push(x);
    }

    const firstY = Math.ceil(config.yMin / ySt) * ySt;
    for (let y = firstY; y <= config.yMax + ySt * 0.001; y += ySt) {
      yt.push(y);
    }

    return { xTicks: xt, yTicks: yt, xStep: xSt, yStep: ySt };
  }, [config.xMin, config.xMax, config.yMin, config.yMax, xSpan, ySpan]);

  const zoomBy = (factor: number, centerRatioX = 0.5, centerRatioY = 0.5) => {
    const cx = config.xMin + centerRatioX * xSpan;
    const cy = config.yMax - centerRatioY * ySpan;
    const nextXSpan = Math.max(0.05, Math.min(20000, xSpan * factor));
    const nextYSpan = Math.max(0.05, Math.min(20000, ySpan * factor));

    commitConfig({
      ...config,
      xMin: cx - centerRatioX * nextXSpan,
      xMax: cx + (1 - centerRatioX) * nextXSpan,
      yMin: cy - (1 - centerRatioY) * nextYSpan,
      yMax: cy + centerRatioY * nextYSpan,
    });
  };

  const resetViewport = () => {
    commitConfig({
      ...config,
      xMin: -6.5,
      xMax: 6.5,
      yMin: -3.5,
      yMax: 3.5,
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      xMin: config.xMin,
      xMax: config.xMax,
      yMin: config.yMin,
      yMax: config.yMax,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const drag = dragStartRef.current;
    if (drag) {
      const dxPx = event.clientX - drag.clientX;
      const dyPx = event.clientY - drag.clientY;
      const dragXSpan = drag.xMax - drag.xMin;
      const dragYSpan = drag.yMax - drag.yMin;
      const shiftX = -(dxPx / rect.width) * dragXSpan;
      const shiftY = (dyPx / rect.height) * dragYSpan;
      commitConfig({
        ...config,
        xMin: drag.xMin + shiftX,
        xMax: drag.xMax + shiftX,
        yMin: drag.yMin + shiftY,
        yMax: drag.yMax + shiftY,
      });
      return;
    }

    const relX = (event.clientX - rect.left) / rect.width;
    if (relX >= 0 && relX <= 1) {
      setHoverX(config.xMin + relX * xSpan);
    }
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const updateCurve = (id: string, patch: Partial<PlotCurveConfig>) => {
    commitConfig({
      ...config,
      curves: config.curves.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const addCurve = () => {
    const idx = config.curves.length;
    const color = PLOT_CURVE_COLORS[idx % PLOT_CURVE_COLORS.length];
    commitConfig({
      ...config,
      curves: [
        ...config.curves,
        {
          id: `curve-${Date.now().toString(36)}`,
          expression: 'cos(x)',
          color,
          visible: true,
          showDerivative: false,
        },
      ],
    });
  };

  const removeCurve = (id: string) => {
    if (config.curves.length <= 1) return;
    commitConfig({
      ...config,
      curves: config.curves.filter((c) => c.id !== id),
    });
  };

  const addParameter = (name = 'a') => {
    const clean = name.trim();
    if (!clean) return;
    const existing = config.parameters ?? [];
    if (existing.some((p) => p.name === clean)) return;
    commitConfig({
      ...config,
      parameters: [
        ...existing,
        { name: clean, value: 1, min: -5, max: 5, step: 0.1 },
      ],
    });
  };

  const updateParameter = (name: string, patch: Partial<PlotParameter>) => {
    commitConfig({
      ...config,
      parameters: (config.parameters ?? []).map((p) =>
        p.name === name ? { ...p, ...patch } : p
      ),
    });
  };

  const removeParameter = (name: string) => {
    commitConfig({
      ...config,
      parameters: (config.parameters ?? []).filter((p) => p.name !== name),
    });
  };

  const toggleTangent = () => {
    const currentlyEnabled = Boolean(config.tangent?.enabled);
    commitConfig({
      ...config,
      tangent: {
        enabled: !currentlyEnabled,
        x0: config.tangent?.x0 ?? 0,
        curveId: config.tangent?.curveId,
      },
    });
  };

  const axisXZeroPx = toSvgX(0);
  const axisYZeroPx = toSvgY(0);

  return (
    <NodeViewWrapper
      as="figure"
      className={`softmath-plot-block my-5 overflow-hidden rounded-xl border bg-white transition-all dark:bg-[#161619] ${
        selected
          ? 'border-indigo-400 ring-2 ring-indigo-500/20 dark:border-indigo-500'
          : 'border-stone-200/90 dark:border-zinc-800'
      }`}
    >
      {/* En-tête du graphe */}
      <div
        contentEditable={false}
        className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/70 bg-stone-50/70 px-3.5 py-2 dark:border-zinc-800 dark:bg-zinc-900/60"
      >
        <div className="flex min-w-0 items-center gap-2">
          <TrendingUp className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <input
            type="text"
            value={config.title}
            onChange={(e) => commitConfig({ ...config, title: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Titre du graphe..."
            aria-label="Titre du graphe 2D"
            className="min-w-0 bg-transparent text-xs font-semibold text-stone-800 placeholder:text-stone-400 focus:outline-none dark:text-zinc-100"
          />
          {integralInfo && (
            <span className="rounded bg-indigo-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300">
              ∫[{integralInfo.a.toFixed(2)}, {integralInfo.b.toFixed(2)}] ≈{' '}
              {Number(integralInfo.value.toPrecision(6))}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 print:hidden">
          <button
            type="button"
            onClick={() => zoomBy(0.75)}
            title="Zoom avant"
            aria-label="Zoom avant"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(1.33)}
            title="Zoom arrière"
            aria-label="Zoom arrière"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={resetViewport}
            title="Réinitialiser la vue"
            aria-label="Réinitialiser le repère"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              commitConfig({ ...config, showGrid: !config.showGrid })
            }
            title={config.showGrid ? 'Masquer la grille' : 'Afficher la grille'}
            aria-label="Basculer la grille"
            className={`inline-flex h-6 w-6 items-center justify-center rounded transition-colors ${
              config.showGrid
                ? 'bg-stone-200/80 text-stone-900 dark:bg-zinc-800 dark:text-zinc-100'
                : 'text-stone-400 hover:bg-stone-200/60 dark:text-zinc-500 dark:hover:bg-zinc-800'
            }`}
          >
            <Grid className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleTangent}
            title="Afficher la tangente en un point x₀"
            aria-label="Basculer la tangente"
            aria-pressed={Boolean(config.tangent?.enabled)}
            className={`inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors ${
              config.tangent?.enabled
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
            }`}
          >
            <Crosshair className="h-3 w-3" />
            <span className="hidden sm:inline">Tangente</span>
          </button>
          <button
            type="button"
            onClick={() =>
              commitConfig({
                ...config,
                showSpecialPoints: !config.showSpecialPoints,
              })
            }
            title="Détecter racines, extrema et intersections"
            aria-label="Points remarquables"
            aria-pressed={Boolean(config.showSpecialPoints)}
            className={`inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors ${
              config.showSpecialPoints
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
            }`}
          >
            <Sparkles className="h-3 w-3" />
            <span className="hidden sm:inline">Points</span>
          </button>
          <button
            type="button"
            onClick={() => setIsConfigOpen((v) => !v)}
            title="Configurer les courbes et le repère"
            aria-label="Configurer le graphe"
            aria-expanded={isConfigOpen}
            className={`inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors ${
              isConfigOpen
                ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
            }`}
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span>Courbes</span>
          </button>
          <button
            type="button"
            onClick={deleteNode}
            title="Supprimer le graphe"
            aria-label="Supprimer le graphe"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:text-zinc-500 dark:hover:bg-red-950/60 dark:hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Zone SVG vectorielle */}
      <div
        contentEditable={false}
        className="relative bg-white dark:bg-[#111114] print:bg-white"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={() => {
            setHoverX(null);
            handlePointerUp();
          }}
          onWheel={(e) => {
            if (!e.ctrlKey && !e.metaKey) {
              return;
            }
            e.preventDefault();
            const svg = svgRef.current;
            if (!svg) return;
            const rect = svg.getBoundingClientRect();
            const rx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const ry = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            zoomBy(e.deltaY > 0 ? 1.15 : 0.87, rx, ry);
          }}
          className={`block h-auto w-full select-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-crosshair'
          }`}
        >
          {/* Grille */}
          {config.showGrid && (
            <g className="stroke-stone-200/80 dark:stroke-zinc-800/90 print:stroke-stone-300">
              {xTicks.map((x) => {
                const px = toSvgX(x);
                return (
                  <line
                    key={`gx-${x}`}
                    x1={px}
                    y1={0}
                    x2={px}
                    y2={SVG_HEIGHT}
                    strokeWidth={1}
                  />
                );
              })}
              {yTicks.map((y) => {
                const py = toSvgY(y);
                return (
                  <line
                    key={`gy-${y}`}
                    x1={0}
                    y1={py}
                    x2={SVG_WIDTH}
                    y2={py}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          )}

          {/* Aire sous la courbe (intégrale définie) */}
          {integralInfo && integralInfo.areaPath && (
            <path
              d={integralInfo.areaPath}
              fill={integralInfo.color}
              fillOpacity={0.16}
            />
          )}

          {/* Axes X / Y */}
          {axisYZeroPx >= 0 && axisYZeroPx <= SVG_HEIGHT && (
            <line
              x1={0}
              y1={axisYZeroPx}
              x2={SVG_WIDTH}
              y2={axisYZeroPx}
              strokeWidth={1.5}
              className="stroke-stone-500 dark:stroke-zinc-500 print:stroke-stone-700"
            />
          )}
          {axisXZeroPx >= 0 && axisXZeroPx <= SVG_WIDTH && (
            <line
              x1={axisXZeroPx}
              y1={0}
              x2={axisXZeroPx}
              y2={SVG_HEIGHT}
              strokeWidth={1.5}
              className="stroke-stone-500 dark:stroke-zinc-500 print:stroke-stone-700"
            />
          )}

          {/* Graduations chiffrées */}
          <g className="fill-stone-500 font-mono text-[10px] dark:fill-zinc-400 print:fill-stone-700">
            {xTicks.map((x) => {
              if (Math.abs(x) < xStep * 1e-4) return null;
              const px = toSvgX(x);
              const labelY = Math.max(
                14,
                Math.min(SVG_HEIGHT - 6, axisYZeroPx + 14)
              );
              return (
                <text
                  key={`lx-${x}`}
                  x={px}
                  y={labelY}
                  textAnchor="middle"
                >
                  {formatTickLabel(x, xStep)}
                </text>
              );
            })}
            {yTicks.map((y) => {
              if (Math.abs(y) < yStep * 1e-4) return null;
              const py = toSvgY(y);
              const labelX = Math.max(
                28,
                Math.min(SVG_WIDTH - 8, axisXZeroPx - 6)
              );
              return (
                <text
                  key={`ly-${y}`}
                  x={labelX}
                  y={py + 3}
                  textAnchor="end"
                >
                  {formatTickLabel(y, yStep)}
                </text>
              );
            })}
          </g>

          {/* Courbes mathématiques & dérivées */}
          {compiledCurves.map((item) => {
            if (!item.curve.visible || !item.path) return null;
            return (
              <g key={item.curve.id}>
                {item.derivPath && (
                  <path
                    d={item.derivPath}
                    fill="none"
                    stroke={item.curve.color}
                    strokeWidth={1.6}
                    strokeDasharray="5 4"
                    strokeOpacity={0.75}
                  />
                )}
                <path
                  d={item.path}
                  fill="none"
                  stroke={item.curve.color}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {/* Tangente au point x0 */}
          {tangentInfo && (
            <g className="pointer-events-none">
              <line
                x1={tangentInfo.x1Px}
                y1={tangentInfo.y1Px}
                x2={tangentInfo.x2Px}
                y2={tangentInfo.y2Px}
                stroke="#f59e0b"
                strokeWidth={1.8}
                strokeDasharray="6 4"
              />
              {tangentInfo.ptY >= -20 && tangentInfo.ptY <= SVG_HEIGHT + 20 && (
                <circle
                  cx={tangentInfo.ptX}
                  cy={tangentInfo.ptY}
                  r={5}
                  fill="#f59e0b"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}
            </g>
          )}

          {/* Points remarquables (zéros, extrema, intersections) */}
          {specialPoints.map((pt, idx) => {
            const cx = toSvgX(pt.x);
            const cy = toSvgY(pt.y);
            if (cx < -10 || cx > SVG_WIDTH + 10 || cy < -10 || cy > SVG_HEIGHT + 10) {
              return null;
            }
            const markerFill =
              pt.kind === 'intersection'
                ? '#f43f5e'
                : pt.kind === 'extremum'
                  ? '#10b981'
                  : pt.color;
            return (
              <g
                key={`sp-${idx}`}
                onMouseEnter={() => setHoveredSpecialLabel(pt.label)}
                onMouseLeave={() => setHoveredSpecialLabel(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={4.5}
                  fill={markerFill}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
              </g>
            );
          })}

          {/* Réticule interactif */}
          {hoverX !== null && (
            <g className="pointer-events-none print:hidden">
              <line
                x1={toSvgX(hoverX)}
                y1={0}
                x2={toSvgX(hoverX)}
                y2={SVG_HEIGHT}
                strokeWidth={1}
                strokeDasharray="3 3"
                className="stroke-stone-400 dark:stroke-zinc-500"
              />
              {compiledCurves.map((item) => {
                if (!item.curve.visible || !item.evaluateAt) return null;
                const y = item.evaluateAt(hoverX);
                if (!Number.isFinite(y)) return null;
                const cy = toSvgY(y);
                if (cy < -10 || cy > SVG_HEIGHT + 10) return null;
                return (
                  <circle
                    key={`pt-${item.curve.id}`}
                    cx={toSvgX(hoverX)}
                    cy={cy}
                    r={4}
                    fill={item.curve.color}
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                );
              })}
            </g>
          )}
        </svg>

        {/* Infobulle coordonnées au survol */}
        {(hoverX !== null || hoveredSpecialLabel) && (
          <div className="pointer-events-none absolute left-3 top-2 flex flex-wrap items-center gap-2 rounded-md border border-stone-200/80 bg-white/90 px-2 py-1 font-mono text-[11px] text-stone-700 shadow-xs backdrop-blur-xs print:hidden dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:text-zinc-200">
            {hoveredSpecialLabel && (
              <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                {hoveredSpecialLabel}
              </span>
            )}
            {hoverX !== null && <span>x = {hoverX.toFixed(3)}</span>}
            {hoverX !== null &&
              compiledCurves.map((item) => {
                if (!item.curve.visible || !item.evaluateAt) return null;
                const y = item.evaluateAt(hoverX);
                return (
                  <span key={item.curve.id} style={{ color: item.curve.color }}>
                    y = {Number.isFinite(y) ? y.toFixed(3) : 'Indéf.'}
                  </span>
                );
              })}
          </div>
        )}

        {/* Légende compacte visible à l'impression */}
        <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 px-3.5 py-1.5 text-[11px] text-stone-600 dark:border-zinc-800/70 dark:text-zinc-400">
          {compiledCurves.map((item, idx) =>
            item.curve.visible ? (
              <span key={item.curve.id} className="inline-flex items-center gap-1.5 font-mono">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.curve.color }}
                />
                <span>
                  f{compiledCurves.length > 1 ? `_${idx + 1}` : ''}(x) = {item.curve.expression}
                </span>
                {item.curve.showDerivative && item.deriv && (
                  <span className="opacity-75">
                    | f&apos;(x) = {item.deriv.formula}
                  </span>
                )}
              </span>
            ) : null
          )}
          <span className="ml-auto text-[10px] text-stone-400 print:hidden dark:text-zinc-500">
            Glisser pour déplacer • Ctrl+Molette pour zoomer
          </span>
        </div>

        {/* Bandeau interactif : curseurs de paramètres, tangente en x₀ et points remarquables */}
        {((config.parameters?.length ?? 0) > 0 ||
          tangentInfo ||
          config.tangent?.enabled ||
          specialPoints.length > 0) && (
          <div
            contentEditable={false}
            className="space-y-2 border-t border-stone-100 bg-stone-50/40 px-3.5 py-2 text-[11px] dark:border-zinc-800/70 dark:bg-zinc-900/30"
          >
            {(config.parameters ?? []).length > 0 && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                {(config.parameters ?? []).map((param) => (
                  <div
                    key={param.name}
                    className="flex min-w-[180px] flex-1 items-center gap-2"
                  >
                    <span className="w-16 shrink-0 font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                      {param.name} = {Number(param.value.toFixed(2))}
                    </span>
                    <input
                      type="range"
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      value={param.value}
                      onChange={(e) =>
                        updateParameter(param.name, {
                          value: Number.parseFloat(e.target.value),
                        })
                      }
                      className="h-1.5 flex-1 cursor-pointer accent-indigo-600 print:hidden dark:accent-indigo-400"
                    />
                  </div>
                ))}
              </div>
            )}

            {config.tangent?.enabled && (
              <div className="flex flex-wrap items-center gap-3 font-mono">
                <span className="font-semibold text-amber-700 dark:text-amber-300">
                  Tangente :
                </span>
                <label className="inline-flex items-center gap-1.5 print:hidden">
                  <span>x₀ =</span>
                  <input
                    type="number"
                    step="0.1"
                    value={config.tangent.x0}
                    onChange={(e) => {
                      const v = Number.parseFloat(e.target.value);
                      if (Number.isFinite(v)) {
                        commitConfig({
                          ...config,
                          tangent: { ...config.tangent!, x0: v },
                        });
                      }
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-16 rounded border border-stone-200 bg-white px-1.5 py-0.5 text-stone-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </label>
                <input
                  type="range"
                  min={config.xMin}
                  max={config.xMax}
                  step={Math.max(0.05, Number(((config.xMax - config.xMin) / 100).toFixed(2)))}
                  value={Math.max(config.xMin, Math.min(config.xMax, config.tangent.x0))}
                  onChange={(e) =>
                    commitConfig({
                      ...config,
                      tangent: {
                        ...config.tangent!,
                        x0: Number.parseFloat(e.target.value),
                      },
                    })
                  }
                  className="h-1.5 w-32 cursor-pointer accent-amber-500 print:hidden"
                />
                {compiledCurves.filter((c) => c.curve.visible).length > 1 && (
                  <select
                    value={tangentInfo?.curveId ?? ''}
                    onChange={(e) =>
                      commitConfig({
                        ...config,
                        tangent: {
                          ...config.tangent!,
                          curveId: e.target.value,
                        },
                      })
                    }
                    aria-label="Courbe pour la tangente"
                    className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] print:hidden dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {compiledCurves
                      .filter((c) => c.curve.visible)
                      .map((c, idx) => (
                        <option key={c.curve.id} value={c.curve.id}>
                          f{idx + 1}(x)
                        </option>
                      ))}
                  </select>
                )}
                {tangentInfo ? (
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
                    {tangentInfo.equation} (pente {tangentInfo.slope.toFixed(2)})
                  </span>
                ) : (
                  <span className="text-stone-400">Indéfini en x₀</span>
                )}
              </div>
            )}

            {specialPoints.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-stone-500 dark:text-zinc-400">
                  Points :
                </span>
                {specialPoints.slice(0, 10).map((pt, idx) => (
                  <span
                    key={`chip-${idx}`}
                    onMouseEnter={() => setHoveredSpecialLabel(pt.label)}
                    onMouseLeave={() => setHoveredSpecialLabel(null)}
                    className="cursor-default rounded border border-stone-200/80 bg-white px-1.5 py-0.5 font-mono text-[10px] text-stone-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    {pt.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panneau de configuration courbes / domaine / intégrale */}
      {isConfigOpen && (
        <div
          contentEditable={false}
          className="space-y-3 border-t border-stone-200/80 bg-stone-50/75 px-3.5 py-3 text-xs print:hidden dark:border-zinc-800 dark:bg-zinc-900/50"
        >
          <div className="space-y-1.5">
            {compiledCurves.map((item, idx) => (
              <div
                key={item.curve.id}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  type="color"
                  value={item.curve.color}
                  onChange={(e) =>
                    updateCurve(item.curve.id, { color: e.target.value })
                  }
                  aria-label={`Couleur courbe ${idx + 1}`}
                  className="h-6 w-6 shrink-0 cursor-pointer rounded border border-stone-300 bg-transparent p-0.5 dark:border-zinc-700"
                />
                <span className="font-mono text-stone-500 dark:text-zinc-400">
                  f{config.curves.length > 1 ? idx + 1 : ''}(x) =
                </span>
                <input
                  type="text"
                  value={item.curve.expression}
                  onChange={(e) =>
                    updateCurve(item.curve.id, { expression: e.target.value })
                  }
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="ex: sin(x), x^2 - 1, \frac{1}{x}"
                  className="min-w-[160px] flex-1 rounded-md border border-stone-200 bg-white px-2.5 py-1 font-mono text-xs text-stone-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                {item.error && (
                  <span className="text-[11px] text-red-600 dark:text-red-400">
                    {item.error}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    updateCurve(item.curve.id, {
                      showDerivative: !item.curve.showDerivative,
                    })
                  }
                  title="Tracer aussi la dérivée f'(x)"
                  className={`rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
                    item.curve.showDerivative
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-500/20 dark:text-indigo-300'
                      : 'border-stone-200 text-stone-500 hover:bg-stone-200/60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'
                  }`}
                >
                  f&apos;(x)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateCurve(item.curve.id, { visible: !item.curve.visible })
                  }
                  title={item.curve.visible ? 'Masquer' : 'Afficher'}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-stone-500 hover:bg-stone-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  {item.curve.visible ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                </button>
                {config.curves.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCurve(item.curve.id)}
                    title="Retirer cette courbe"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-stone-400 hover:bg-red-100 hover:text-red-600 dark:text-zinc-500 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addCurve}
                className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Ajouter une courbe</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const candidate =
                    missingCandidateParams[0] ??
                    String.fromCharCode(
                      97 + ((config.parameters?.length ?? 0) % 26)
                    );
                  addParameter(candidate);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Paramètre</span>
              </button>

              {missingCandidateParams.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onClick={() => addParameter(sym)}
                  className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 font-mono text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                >
                  + Curseur {sym}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-stone-500 dark:text-zinc-400">
              <label className="flex items-center gap-1">
                <span>X:</span>
                <input
                  type="number"
                  step="any"
                  value={Number(config.xMin.toFixed(2))}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    if (Number.isFinite(v) && v < config.xMax) {
                      commitConfig({ ...config, xMin: v });
                    }
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-14 rounded border border-stone-200 bg-white px-1.5 py-0.5 text-stone-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <span>..</span>
                <input
                  type="number"
                  step="any"
                  value={Number(config.xMax.toFixed(2))}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    if (Number.isFinite(v) && v > config.xMin) {
                      commitConfig({ ...config, xMax: v });
                    }
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-14 rounded border border-stone-200 bg-white px-1.5 py-0.5 text-stone-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </label>

              <label className="flex items-center gap-1">
                <span>∫[</span>
                <input
                  type="text"
                  value={config.integralFrom ?? ''}
                  onChange={(e) =>
                    commitConfig({ ...config, integralFrom: e.target.value })
                  }
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="a"
                  className="w-12 rounded border border-stone-200 bg-white px-1.5 py-0.5 text-stone-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <span>,</span>
                <input
                  type="text"
                  value={config.integralTo ?? ''}
                  onChange={(e) =>
                    commitConfig({ ...config, integralTo: e.target.value })
                  }
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder="b"
                  className="w-12 rounded border border-stone-200 bg-white px-1.5 py-0.5 text-stone-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
                <span>]</span>
              </label>
            </div>
          </div>

          {(config.parameters ?? []).length > 0 && (
            <div className="space-y-1.5 border-t border-stone-200/70 pt-2 dark:border-zinc-800">
              <div className="font-medium text-stone-500 dark:text-zinc-400">
                Curseurs de paramètres :
              </div>
              {(config.parameters ?? []).map((param) => (
                <div
                  key={`cfg-${param.name}`}
                  className="flex flex-wrap items-center gap-2 font-mono text-[11px]"
                >
                  <input
                    type="text"
                    value={param.name}
                    onChange={(e) =>
                      updateParameter(param.name, { name: e.target.value })
                    }
                    onKeyDown={(e) => e.stopPropagation()}
                    aria-label="Nom du paramètre"
                    className="w-12 rounded border border-stone-200 bg-white px-1.5 py-0.5 text-center font-semibold text-indigo-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-indigo-300"
                  />
                  <span>min</span>
                  <input
                    type="number"
                    step="any"
                    value={param.min}
                    onChange={(e) => {
                      const v = Number.parseFloat(e.target.value);
                      if (Number.isFinite(v) && v < param.max) {
                        updateParameter(param.name, { min: v });
                      }
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-14 rounded border border-stone-200 bg-white px-1.5 py-0.5 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <span>max</span>
                  <input
                    type="number"
                    step="any"
                    value={param.max}
                    onChange={(e) => {
                      const v = Number.parseFloat(e.target.value);
                      if (Number.isFinite(v) && v > param.min) {
                        updateParameter(param.name, { max: v });
                      }
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-14 rounded border border-stone-200 bg-white px-1.5 py-0.5 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <span>pas</span>
                  <input
                    type="number"
                    step="any"
                    value={param.step}
                    onChange={(e) => {
                      const v = Number.parseFloat(e.target.value);
                      if (Number.isFinite(v) && v > 0) {
                        updateParameter(param.name, { step: v });
                      }
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-14 rounded border border-stone-200 bg-white px-1.5 py-0.5 dark:border-zinc-700 dark:bg-zinc-950"
                  />
                  <button
                    type="button"
                    onClick={() => removeParameter(param.name)}
                    title="Supprimer ce paramètre"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-stone-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/60 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

