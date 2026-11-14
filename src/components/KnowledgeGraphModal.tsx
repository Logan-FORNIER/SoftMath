import { Network, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { KnowledgeGraphData, KnowledgeGraphNode } from '../services/backlinkService';

export interface KnowledgeGraphModalProps {
  open: boolean;
  graph: KnowledgeGraphData;
  currentNotePath?: string | null;
  onSelectNote: (path: string, inSplit?: boolean) => void;
  onClose: () => void;
}

interface PositionedNode extends KnowledgeGraphNode {
  x: number;
  y: number;
}

function layoutKnowledgeGraph(
  graph: KnowledgeGraphData,
  width = 760,
  height = 460
): PositionedNode[] {
  const count = graph.nodes.length;
  if (count === 0) return [];

  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.min(width, height) * 0.36;

  // Deterministic circular initialization sorted by connection degree
  const sorted = [...graph.nodes].sort(
    (a, b) => b.inDegree + b.outDegree - (a.inDegree + a.outDegree)
  );
  const posMap = new Map<string, { x: number; y: number }>();

  sorted.forEach((n, idx) => {
    if (count === 1) {
      posMap.set(n.id, { x: cx, y: cy });
      return;
    }
    const angle = (2 * Math.PI * idx) / count - Math.PI / 2;
    const radiusScale = idx === 0 && (n.inDegree + n.outDegree) > 0 ? 0.25 : 1;
    posMap.set(n.id, {
      x: cx + Math.cos(angle) * rx * radiusScale,
      y: cy + Math.sin(angle) * rx * radiusScale,
    });
  });

  // Deterministic force relaxation (fast, stable)
  const kRepel = 3800;
  const kSpring = 0.035;
  const targetLen = 135;

  for (let iter = 0; iter < 90; iter += 1) {
    const disp = new Map<string, { dx: number; dy: number }>();
    for (const n of sorted) disp.set(n.id, { dx: 0, dy: 0 });

    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const u = sorted[i];
        const v = sorted[j];
        const pu = posMap.get(u.id)!;
        const pv = posMap.get(v.id)!;
        let dx = pu.x - pv.x;
        let dy = pu.y - pv.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 1) {
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const force = kRepel / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        disp.get(u.id)!.dx += fx;
        disp.get(u.id)!.dy += fy;
        disp.get(v.id)!.dx -= fx;
        disp.get(v.id)!.dy -= fy;
      }
    }

    for (const e of graph.edges) {
      const pu = posMap.get(e.sourceId);
      const pv = posMap.get(e.targetId);
      if (!pu || !pv) continue;
      const dx = pv.x - pu.x;
      const dy = pv.y - pu.y;
      const dist = Math.hypot(dx, dy) || 1;
      const f = (dist - targetLen) * kSpring;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      disp.get(e.sourceId)!.dx += fx;
      disp.get(e.sourceId)!.dy += fy;
      disp.get(e.targetId)!.dx -= fx;
      disp.get(e.targetId)!.dy -= fy;
    }

    for (const n of sorted) {
      const p = posMap.get(n.id)!;
      const d = disp.get(n.id)!;
      // gentle gravity toward center
      const gx = (cx - p.x) * 0.018;
      const gy = (cy - p.y) * 0.018;
      p.x = Math.max(58, Math.min(width - 58, p.x + Math.max(-18, Math.min(18, d.dx + gx))));
      p.y = Math.max(42, Math.min(height - 42, p.y + Math.max(-18, Math.min(18, d.dy + gy))));
    }
  }

  return sorted.map((n) => {
    const p = posMap.get(n.id)!;
    return { ...n, x: p.x, y: p.y };
  });
}

export function KnowledgeGraphModal({
  open,
  graph,
  currentNotePath,
  onSelectNote,
  onClose,
}: KnowledgeGraphModalProps) {
  const [search, setSearch] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const width = 760;
  const height = 460;

  const positioned = useMemo(
    () => layoutKnowledgeGraph(graph, width, height),
    [graph]
  );

  const posById = useMemo(
    () => new Map(positioned.map((n) => [n.id, n])),
    [positioned]
  );

  if (!open) {
    return null;
  }

  const normalizedQuery = search.trim().toLowerCase();
  const connectedToHover = new Set<string>();
  if (hoveredId) {
    connectedToHover.add(hoveredId);
    for (const e of graph.edges) {
      if (e.sourceId === hoveredId) connectedToHover.add(e.targetId);
      if (e.targetId === hoveredId) connectedToHover.add(e.sourceId);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Graphe de connaissances"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
              <Network className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Graphe de connaissances ({graph.nodes.length} notes, {graph.edges.length} liens)
              </h2>
              <p className="text-xs text-slate-400">
                Clic : ouvrir une note • Alt+Clic : ouvrir en vue scindée
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer un nœud…"
                className="w-48 rounded-md border border-slate-700 bg-slate-950 py-1 pl-8 pr-2.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              title="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative flex-1 overflow-auto bg-slate-950/70 p-4">
          {positioned.length === 0 ? (
            <div className="flex h-64 items-center justify-center text-xs text-slate-400">
              Ouvrez un dossier de notes et utilisez{' '}
              <code className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 text-indigo-300">
                [[Nom de note]]
              </code>{' '}
              pour tisser votre graphe mathématique.
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="mx-auto block h-auto w-full max-w-[780px] select-none"
              role="img"
              aria-label="Graphe des liens entre notes"
            >
              <defs>
                <marker
                  id="kg-arrow"
                  viewBox="0 0 10 10"
                  refX="18"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#6366f1" />
                </marker>
              </defs>

              {graph.edges.map((edge) => {
                const src = posById.get(edge.sourceId);
                const dst = posById.get(edge.targetId);
                if (!src || !dst) return null;
                const active =
                  !hoveredId ||
                  edge.sourceId === hoveredId ||
                  edge.targetId === hoveredId;

                return (
                  <line
                    key={edge.id}
                    x1={src.x}
                    y1={src.y}
                    x2={dst.x}
                    y2={dst.y}
                    stroke={active ? '#6366f1' : '#334155'}
                    strokeWidth={active && hoveredId ? 2 : 1.2}
                    strokeOpacity={hoveredId ? (active ? 0.85 : 0.18) : 0.45}
                    markerEnd="url(#kg-arrow)"
                  />
                );
              })}

              {positioned.map((node) => {
                const isCurrent = node.path === currentNotePath;
                const deg = node.inDegree + node.outDegree;
                const radius = Math.min(16, 7 + deg * 1.6);
                const matchesSearch =
                  !normalizedQuery ||
                  node.label.toLowerCase().includes(normalizedQuery);
                const dimmedByHover =
                  Boolean(hoveredId) && !connectedToHover.has(node.id);
                const opacity = !matchesSearch || dimmedByHover ? 0.25 : 1;

                return (
                  <g
                    key={node.id}
                    opacity={opacity}
                    onMouseEnter={() => setHoveredId(node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={(e) => {
                      if (!node.exists || !node.path) return;
                      onSelectNote(node.path, e.altKey || e.ctrlKey || e.metaKey);
                      onClose();
                    }}
                    style={{ cursor: node.exists ? 'pointer' : 'default' }}
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={radius}
                      fill={
                        isCurrent
                          ? '#f59e0b'
                          : node.exists
                            ? '#6366f1'
                            : '#475569'
                      }
                      stroke={isCurrent ? '#fef3c7' : '#e2e8f0'}
                      strokeWidth={isCurrent ? 2.4 : 1.4}
                      strokeDasharray={node.exists ? undefined : '2 2'}
                    />
                    <text
                      x={node.x}
                      y={node.y + radius + 13}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={isCurrent ? 700 : 500}
                      fill={isCurrent ? '#fde68a' : '#e2e8f0'}
                    >
                      {node.label.length > 26
                        ? `${node.label.slice(0, 24)}…`
                        : node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

