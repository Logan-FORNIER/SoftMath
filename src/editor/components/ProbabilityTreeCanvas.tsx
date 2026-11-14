import { useMemo } from 'react';
import { useSoftMathUi } from '../../contexts/SoftMathUiContext';
import { renderKatexWithMacros } from '../../services/katexMacrosService';
import {
  analyzeProbabilityTree,
  type ProbabilityTreeConfig,
  type ProbTreeNode,
} from '../extensions/SoftProbabilityTree';

interface LayoutNode {
  id: string;
  label: string;
  probability: string;
  depth: number;
  x: number;
  y: number;
  parentX?: number;
  parentY?: number;
  isRoot?: boolean;
  isLeaf: boolean;
  pathProbabilityStr?: string;
  highlighted?: boolean;
}

interface ProbabilityTreeCanvasProps {
  config: ProbabilityTreeConfig;
  selectedNodeId?: string | null;
  interactive?: boolean;
  onSelectNode?: (nodeId: string) => void;
}

function countLeaves(node: ProbTreeNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((acc, c) => acc + countLeaves(c), 0);
}

function maxTreeDepth(nodes: ProbTreeNode[], current = 1): number {
  let maxD = current;
  for (const node of nodes) {
    if (node.children.length > 0) {
      maxD = Math.max(maxD, maxTreeDepth(node.children, current + 1));
    }
  }
  return maxD;
}

export function ProbabilityTreeCanvas({
  config,
  selectedNodeId = null,
  interactive = false,
  onSelectNode,
}: ProbabilityTreeCanvasProps) {
  const { katexMacroVersion } = useSoftMathUi();
  const analysis = useMemo(() => analyzeProbabilityTree(config), [config]);

  const layout = useMemo(() => {
    const totalLeaves = Math.max(
      1,
      config.children.reduce((acc, c) => acc + countLeaves(c), 0)
    );
    const depth = Math.max(1, maxTreeDepth(config.children, 1));
    const colGap = 155;
    const rowGap = 54;
    const leftPad = 56;
    const rightPad = config.showPathProbabilities ? 150 : 54;
    const topPad = 32;
    const bottomPad = 32;

    const width = leftPad + depth * colGap + rightPad;
    const height = Math.max(170, topPad + (totalLeaves - 1) * rowGap + bottomPad);

    const leafMap = new Map(analysis.leaves.map((l) => [l.nodeId, l]));
    const target = config.targetEvent.trim();

    const nodes: LayoutNode[] = [];
    const rootX = leftPad;
    const rootY = height / 2;
    nodes.push({
      id: '__root__',
      label: config.rootLabel || 'Ω',
      probability: '',
      depth: 0,
      x: rootX,
      y: rootY,
      isRoot: true,
      isLeaf: config.children.length === 0,
    });

    let nextLeafIdx = 0;
    const placeNodes = (
      children: ProbTreeNode[],
      level: number,
      parentX: number,
      parentY: number
    ): number[] => {
      const ys: number[] = [];
      for (const child of children) {
        const x = leftPad + level * colGap;
        let y: number;
        if (child.children.length === 0) {
          y =
            totalLeaves === 1
              ? height / 2
              : topPad + nextLeafIdx * rowGap;
          nextLeafIdx += 1;
        } else {
          const childYs = placeNodes(child.children, level + 1, x, 0);
          y = (childYs[0] + childYs[childYs.length - 1]) / 2;
        }
        ys.push(y);

        const leafSummary = leafMap.get(child.id);
        nodes.push({
          id: child.id,
          label: child.label,
          probability: child.probability,
          depth: level,
          x,
          y,
          parentX,
          parentY,
          isLeaf: child.children.length === 0,
          pathProbabilityStr: leafSummary?.probabilityString,
          highlighted:
            Boolean(target) &&
            child.children.length === 0 &&
            child.label.trim() === target,
        });
      }
      return ys;
    };

    placeNodes(config.children, 1, rootX, rootY);

    // Fix parentY after children y positions are finalized
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const fixParent = (children: ProbTreeNode[], parentId: string) => {
      const parent = byId.get(parentId);
      if (!parent) return;
      for (const child of children) {
        const node = byId.get(child.id);
        if (node) {
          node.parentX = parent.x;
          node.parentY = parent.y;
        }
        if (child.children.length > 0) {
          fixParent(child.children, child.id);
        }
      }
    };
    fixParent(config.children, '__root__');

    return { width, height, nodes };
  }, [config, analysis.leaves]);

  void katexMacroVersion;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="mx-auto block h-auto min-w-[420px] max-w-full select-none"
        role="img"
        aria-label={config.title || 'Arbre de probabilités'}
      >
        {/* Edges first */}
        {layout.nodes
          .filter((n) => !n.isRoot && n.parentX !== undefined && n.parentY !== undefined)
          .map((n) => {
            const x1 = (n.parentX ?? 0) + 16;
            const y1 = n.parentY ?? 0;
            const x2 = n.x - 18;
            const y2 = n.y;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const isSelected = selectedNodeId === n.id;

            return (
              <g key={`edge-${n.id}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isSelected ? '#6366f1' : '#94a3b8'}
                  strokeWidth={isSelected ? 2.2 : 1.5}
                />
                <foreignObject
                  x={midX - 36}
                  y={midY - 14}
                  width={72}
                  height={24}
                  className="overflow-visible"
                >
                  <div className="flex items-center justify-center">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none shadow-2xs ${
                        isSelected
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-200'
                          : 'border-stone-200 bg-white/95 text-stone-700 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200'
                      }`}
                    >
                      {n.probability || '?'}
                    </span>
                  </div>
                </foreignObject>
              </g>
            );
          })}

        {/* Nodes */}
        {layout.nodes.map((n) => {
          const isSelected = selectedNodeId === n.id;
          const labelHtml = renderKatexWithMacros(n.label || '\\square', {
            displayMode: false,
            throwOnError: false,
          });

          return (
            <g
              key={`node-${n.id}`}
              onClick={
                interactive && !n.isRoot ? () => onSelectNode?.(n.id) : undefined
              }
              style={{ cursor: interactive && !n.isRoot ? 'pointer' : 'default' }}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={n.isRoot ? 15 : 17}
                fill={
                  n.isRoot
                    ? '#4f46e5'
                    : n.highlighted
                      ? '#ecfdf5'
                      : isSelected
                        ? '#eef2ff'
                        : '#ffffff'
                }
                stroke={
                  n.isRoot
                    ? '#4338ca'
                    : isSelected
                      ? '#4f46e5'
                      : n.highlighted
                        ? '#10b981'
                        : '#cbd5e1'
                }
                strokeWidth={isSelected ? 2.4 : 1.5}
              />

              <foreignObject
                x={n.x - 24}
                y={n.y - 14}
                width={48}
                height={28}
                className="overflow-visible"
              >
                <div
                  className={`flex h-full w-full items-center justify-center text-xs font-semibold ${
                    n.isRoot
                      ? 'text-white'
                      : n.highlighted
                        ? 'text-emerald-800'
                        : 'text-stone-900'
                  }`}
                  dangerouslySetInnerHTML={{ __html: labelHtml }}
                />
              </foreignObject>

              {/* Path probability at leaf */}
              {config.showPathProbabilities && n.isLeaf && n.pathProbabilityStr && (
                <foreignObject
                  x={n.x + 26}
                  y={n.y - 12}
                  width={120}
                  height={24}
                  className="overflow-visible"
                >
                  <div className="flex h-full items-center">
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-700 dark:bg-zinc-800 dark:text-zinc-300">
                      P = {n.pathProbabilityStr}
                    </span>
                  </div>
                </foreignObject>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

