import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Compass, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Geometry2DCanvas } from './Geometry2DCanvas';
import {
  analyzeGeometry2D,
  createPresetGeometry2DConfig,
  parseGeometry2DConfig,
  serializeGeometry2DConfig,
  type GeoCircle,
  type Geometry2DConfig,
  type Geometry2DPresetId,
  type GeoPoint,
  type GeoShape,
  type GeoShapeKind,
} from '../extensions/SoftGeometry2D';

const POINT_COLORS = ['#4f46e5', '#ef4444', '#10b981', '#0ea5e9', '#f59e0b', '#ec4899'];

export function Geometry2DBlockView({
  node,
  selected,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const config = useMemo(
    () => parseGeometry2DConfig(String(node.attrs.spec ?? '')),
    [node.attrs.spec]
  );

  const [newShapeKind, setNewShapeKind] = useState<GeoShapeKind>('segment');
  const [fromId, setFromId] = useState(config.points[0]?.id ?? '');
  const [toId, setToId] = useState(config.points[1]?.id ?? config.points[0]?.id ?? '');

  const commitConfig = (next: Geometry2DConfig) => {
    updateAttributes({ spec: serializeGeometry2DConfig(next) });
  };

  const analysis = useMemo(() => analyzeGeometry2D(config), [config]);

  const handleMovePoint = (id: string, x: number, y: number) => {
    commitConfig({
      ...config,
      points: config.points.map((p) => (p.id === id ? { ...p, x, y } : p)),
    });
  };

  const handleAddPoint = () => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nextChar = alphabet[config.points.length % alphabet.length];
    const used = new Set(config.points.map((p) => p.name));
    const name = used.has(nextChar) ? `P${config.points.length + 1}` : nextChar;
    const newPt: GeoPoint = {
      id: `pt-${Date.now().toString(36)}`,
      name,
      x: 1,
      y: 2,
      color: POINT_COLORS[config.points.length % POINT_COLORS.length],
    };
    commitConfig({ ...config, points: [...config.points, newPt] });
    if (!fromId) setFromId(newPt.id);
    setToId(newPt.id);
  };

  const handleAddShape = () => {
    const a = config.points.some((p) => p.id === fromId)
      ? fromId
      : config.points[0]?.id;
    const b = config.points.some((p) => p.id === toId)
      ? toId
      : config.points[1]?.id;
    if (!a || !b || a === b) return;
    const shape: GeoShape = {
      id: `sh-${Date.now().toString(36)}`,
      kind: newShapeKind,
      fromId: a,
      toId: b,
      color: newShapeKind === 'vector' ? '#10b981' : '#0ea5e9',
    };
    commitConfig({ ...config, shapes: [...config.shapes, shape] });
  };

  const handleAddCircle = () => {
    const center = config.points[0];
    if (!center) return;
    const circle: GeoCircle = {
      id: `c-${Date.now().toString(36)}`,
      centerId: center.id,
      radius: 2,
      color: '#6366f1',
    };
    commitConfig({ ...config, circles: [...config.circles, circle] });
  };

  const handleInsertMetricsBelow = () => {
    if (!editor) return;
    const lines: string[] = [];
    for (const s of analysis.shapes) {
      if (s.kind === 'vector') {
        lines.push(
          `\\overrightarrow{${s.fromName}${s.toName}}\\begin{pmatrix} ${s.dx.toFixed(2).replace(/\.00$/, '')} \\\\ ${s.dy.toFixed(2).replace(/\.00$/, '')} \\end{pmatrix},\\quad \\|\\overrightarrow{${s.fromName}${s.toName}}\\| = ${s.length.toFixed(2)}`
        );
      } else {
        lines.push(
          `${s.fromName}${s.toName} = ${s.length.toFixed(2)},\\quad (${s.fromName}${s.toName}):\\; ${s.reducedEquation}`
        );
      }
    }
    for (const vp of analysis.vectorPairs) {
      lines.push(
        `\\overrightarrow{${vp.firstLabel}} \\cdot \\overrightarrow{${vp.secondLabel}} = ${vp.dotProduct.toFixed(2).replace(/\.00$/, '')}`
      );
    }
    for (const c of analysis.circles) {
      lines.push(`\\mathcal{C}(${c.centerName}, ${c.radius.toFixed(2)}):\\; ${c.equation}`);
    }
    if (lines.length === 0) return;

    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos === 'number') {
      editor
        .chain()
        .focus()
        .insertContentAt(pos + node.nodeSize, {
          type: 'blockMath',
          attrs: { latex: lines.join(' \\\\ ') },
        })
        .run();
    }
  };

  return (
    <NodeViewWrapper
      as="div"
      className={`my-4 rounded-xl border transition-shadow ${
        selected
          ? 'border-indigo-400 ring-2 ring-indigo-500/20 dark:border-indigo-500'
          : 'border-stone-200 dark:border-zinc-800'
      } bg-white shadow-xs dark:bg-zinc-900/80 print:border-stone-400 print:bg-white`}
      contentEditable={false}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b border-stone-200/80 bg-stone-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60 print:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-300">
            <Compass className="h-3.5 w-3.5" />
          </span>
          <input
            type="text"
            value={config.title}
            onChange={(e) => commitConfig({ ...config, title: e.target.value })}
            placeholder="Titre de la figure..."
            className="w-52 bg-transparent text-xs font-semibold text-stone-800 focus:outline-none dark:text-zinc-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              const next = createPresetGeometry2DConfig(
                e.target.value as Geometry2DPresetId
              );
              commitConfig(next);
              setFromId(next.points[0]?.id ?? '');
              setToId(next.points[1]?.id ?? '');
              e.target.value = '';
            }}
            className="rounded border border-stone-200 bg-white px-2 py-0.5 text-[11px] text-stone-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="">Modèle…</option>
            <option value="triangle">Triangle ABC</option>
            <option value="vectors">Vecteurs &amp; produit scalaire</option>
            <option value="circle">Cercle &amp; corde</option>
          </select>

          <button
            type="button"
            onClick={handleAddPoint}
            className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-2 py-0.5 text-[11px] text-stone-700 hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <Plus className="h-3 w-3" />
            Point
          </button>

          <button
            type="button"
            onClick={handleAddCircle}
            className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-2 py-0.5 text-[11px] text-stone-700 hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            + Cercle
          </button>

          <button
            type="button"
            onClick={deleteNode}
            className="rounded p-1 text-stone-400 hover:bg-rose-500/10 hover:text-rose-500"
            title="Supprimer cette figure"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Print title */}
      {config.title && (
        <div className="px-4 pt-2 text-xs font-semibold text-stone-700 dark:text-zinc-300">
          {config.title}
        </div>
      )}

      {/* Main grid: Canvas + points/shapes editor */}
      <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-[1.25fr_0.95fr]">
        <div>
          <Geometry2DCanvas
            config={config}
            interactive
            onMovePoint={handleMovePoint}
          />
          <p className="mt-1 text-[10px] text-stone-400 dark:text-zinc-500 print:hidden">
            Déplacez un point à la souris (Shift = pas 0.1).
          </p>
        </div>

        <div className="space-y-2.5 text-xs print:hidden">
          {/* Points list */}
          <div className="rounded-lg border border-stone-200 bg-stone-50/70 p-2 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="mb-1.5 text-[11px] font-semibold text-stone-600 dark:text-zinc-300">
              Points du repère
            </div>
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {config.points.map((pt) => (
                <div key={pt.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={pt.name}
                    onChange={(e) =>
                      commitConfig({
                        ...config,
                        points: config.points.map((p) =>
                          p.id === pt.id ? { ...p, name: e.target.value } : p
                        ),
                      })
                    }
                    className="w-10 rounded border border-stone-200 bg-white px-1.5 py-0.5 text-center font-semibold dark:border-zinc-700 dark:bg-zinc-900"
                    style={{ color: pt.color }}
                  />
                  <span className="text-stone-400">(</span>
                  <input
                    type="number"
                    step="0.5"
                    value={pt.x}
                    onChange={(e) =>
                      handleMovePoint(pt.id, Number(e.target.value), pt.y)
                    }
                    className="w-14 rounded border border-stone-200 bg-white px-1 py-0.5 text-center font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <span className="text-stone-400">,</span>
                  <input
                    type="number"
                    step="0.5"
                    value={pt.y}
                    onChange={(e) =>
                      handleMovePoint(pt.id, pt.x, Number(e.target.value))
                    }
                    className="w-14 rounded border border-stone-200 bg-white px-1 py-0.5 text-center font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <span className="text-stone-400">)</span>
                  {config.points.length > 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        commitConfig({
                          ...config,
                          points: config.points.filter((p) => p.id !== pt.id),
                          shapes: config.shapes.filter(
                            (s) => s.fromId !== pt.id && s.toId !== pt.id
                          ),
                          circles: config.circles.filter((c) => c.centerId !== pt.id),
                        })
                      }
                      className="ml-auto text-stone-400 hover:text-rose-500"
                      title="Supprimer point"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add segment / line / vector */}
          {config.points.length >= 2 && (
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-stone-200 bg-stone-50/70 p-2 dark:border-zinc-800 dark:bg-zinc-950/60">
              <select
                value={newShapeKind}
                onChange={(e) => setNewShapeKind(e.target.value as GeoShapeKind)}
                className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="segment">Segment</option>
                <option value="line">Droite</option>
                <option value="vector">Vecteur</option>
              </select>
              <select
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
              >
                {config.points.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span>→</span>
              <select
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
              >
                {config.points.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddShape}
                className="ml-auto rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-500"
              >
                Tracer
              </button>
            </div>
          )}

          {/* Circles */}
          {config.circles.length > 0 && (
            <div className="space-y-1 rounded-lg border border-stone-200 bg-stone-50/70 p-2 dark:border-zinc-800 dark:bg-zinc-950/60">
              {config.circles.map((c, idx) => (
                <div key={c.id} className="flex items-center gap-1.5 text-[11px]">
                  <span className="font-medium">Cercle #{idx + 1}</span>
                  <span>r =</span>
                  <input
                    type="number"
                    min="0.2"
                    step="0.5"
                    value={c.radius}
                    onChange={(e) =>
                      commitConfig({
                        ...config,
                        circles: config.circles.map((item) =>
                          item.id === c.id
                            ? {
                                ...item,
                                radius: Math.max(0.2, Number(e.target.value)),
                                throughPointId: undefined,
                              }
                            : item
                        ),
                      })
                    }
                    className="w-14 rounded border border-stone-200 bg-white px-1 py-0.5 font-mono dark:border-zinc-700 dark:bg-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      commitConfig({
                        ...config,
                        circles: config.circles.filter((item) => item.id !== c.id),
                      })
                    }
                    className="ml-auto text-stone-400 hover:text-rose-500"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Live geometric properties */}
          <div className="space-y-1 rounded-lg border border-stone-200 bg-white p-2 text-[11px] dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between font-semibold text-stone-700 dark:text-zinc-200">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-indigo-500" />
                Mesures analytiques
              </span>
              <button
                type="button"
                onClick={handleInsertMetricsBelow}
                className="rounded border border-indigo-300/70 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-500/20 dark:text-indigo-300"
              >
                Insérer en $$
              </button>
            </div>
            {analysis.shapes.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 border-t border-stone-100 pt-1 text-stone-600 dark:border-zinc-800 dark:text-zinc-300"
              >
                <span className="font-mono">
                  {s.kind === 'vector'
                    ? `→${s.fromName}${s.toName}(${s.dx.toFixed(1)}, ${s.dy.toFixed(1)})`
                    : `${s.fromName}${s.toName}`}
                </span>
                <span className="truncate font-mono text-[10px] text-stone-500">
                  L={s.length.toFixed(2)} • {s.reducedEquation}
                </span>
              </div>
            ))}
            {analysis.vectorPairs.map((vp, idx) => (
              <div
                key={`vp-${idx}`}
                className="flex items-center justify-between gap-2 border-t border-stone-100 pt-1 text-emerald-700 dark:border-zinc-800 dark:text-emerald-300"
              >
                <span className="font-mono">
                  {vp.firstLabel} · {vp.secondLabel} = {vp.dotProduct.toFixed(2)}
                </span>
                <span>
                  {vp.orthogonal
                    ? 'Orthogonaux (90°)'
                    : vp.angleDeg !== null
                      ? `${vp.angleDeg.toFixed(1)}°`
                      : ''}
                </span>
              </div>
            ))}
            {analysis.circles.map((c) => (
              <div
                key={c.id}
                className="border-t border-stone-100 pt-1 font-mono text-[10px] text-indigo-600 dark:border-zinc-800 dark:text-indigo-300"
              >
                {c.equation} (Aire ≈ {c.area.toFixed(2)})
              </div>
            ))}
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
}

