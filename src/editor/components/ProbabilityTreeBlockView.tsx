import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ProbabilityTreeCanvas } from './ProbabilityTreeCanvas';
import {
  analyzeProbabilityTree,
  createPresetProbabilityConfig,
  formatNumberCompact,
  parseProbabilityTreeConfig,
  serializeProbabilityTreeConfig,
  type ProbabilityPresetId,
  type ProbabilityTreeConfig,
  type ProbTreeNode,
} from '../extensions/SoftProbabilityTree';

function updateNodeInTree(
  nodes: ProbTreeNode[],
  targetId: string,
  updater: (node: ProbTreeNode) => ProbTreeNode | null
): ProbTreeNode[] {
  const result: ProbTreeNode[] = [];
  for (const node of nodes) {
    if (node.id === targetId) {
      const updated = updater(node);
      if (updated) result.push(updated);
    } else {
      result.push({
        ...node,
        children: updateNodeInTree(node.children, targetId, updater),
      });
    }
  }
  return result;
}

function findNodeInTree(nodes: ProbTreeNode[], targetId: string): ProbTreeNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    const nested = findNodeInTree(node.children, targetId);
    if (nested) return nested;
  }
  return null;
}

export function ProbabilityTreeBlockView({
  node,
  selected,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const config = useMemo(
    () => parseProbabilityTreeConfig(String(node.attrs.spec ?? '')),
    [node.attrs.spec]
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    () => config.children[0]?.id ?? null
  );

  const commitConfig = (next: ProbabilityTreeConfig) => {
    updateAttributes({ spec: serializeProbabilityTreeConfig(next) });
  };

  const analysis = useMemo(() => analyzeProbabilityTree(config), [config]);
  const selectedTreeNode = selectedNodeId
    ? findNodeInTree(config.children, selectedNodeId)
    : null;

  const handleAddRootBranch = () => {
    const newId = `branch-${Date.now().toString(36)}`;
    const nextChildren: ProbTreeNode[] = [
      ...config.children,
      {
        id: newId,
        label: `E_${config.children.length + 1}`,
        probability: '0',
        children: [],
      },
    ];
    commitConfig({ ...config, children: nextChildren });
    setSelectedNodeId(newId);
  };

  const handleAddChild = (parentId: string) => {
    const newId = `child-${Date.now().toString(36)}`;
    const nextChildren = updateNodeInTree(config.children, parentId, (n) => ({
      ...n,
      children: [
        ...n.children,
        {
          id: newId,
          label: n.children.length === 0 ? 'B' : '\\overline{B}',
          probability: n.children.length === 0 ? '0.5' : '0.5',
          children: [],
        },
      ],
    }));
    commitConfig({ ...config, children: nextChildren });
    setSelectedNodeId(newId);
  };

  const handleDeleteBranch = (targetId: string) => {
    const nextChildren = updateNodeInTree(config.children, targetId, () => null);
    if (nextChildren.length === 0) return;
    commitConfig({ ...config, children: nextChildren });
    setSelectedNodeId(nextChildren[0]?.id ?? null);
  };

  const handleInsertFormulaBelow = () => {
    if (!editor || analysis.targetTotalProb === null || !analysis.targetEvent) return;
    const totalTerms = analysis.bayesEntries
      .map((b) => formatNumberCompact(b.intersectionProb))
      .join(' + ');
    const lines = [
      `P(${analysis.targetEvent}) = ${totalTerms} = ${formatNumberCompact(analysis.targetTotalProb)}`,
    ];
    for (const entry of analysis.bayesEntries) {
      lines.push(
        `P_{${analysis.targetEvent}}(${entry.rootLabel}) = \\frac{${formatNumberCompact(entry.intersectionProb)}}{${formatNumberCompact(analysis.targetTotalProb)}} \\approx ${formatNumberCompact(entry.posteriorProb)}`
      );
    }

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

  const handleCompleteMissingBranch = (parentId: string, missingValue: string) => {
    if (parentId === '__root__') {
      const last = config.children[config.children.length - 1];
      if (!last) return;
      const next = updateNodeInTree(config.children, last.id, (n) => ({
        ...n,
        probability: missingValue,
      }));
      commitConfig({ ...config, children: next });
      return;
    }
    const parent = findNodeInTree(config.children, parentId);
    const last = parent?.children[parent.children.length - 1];
    if (!last) return;
    const next = updateNodeInTree(config.children, last.id, (n) => ({
      ...n,
      probability: missingValue,
    }));
    commitConfig({ ...config, children: next });
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
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
            <GitBranch className="h-3.5 w-3.5" />
          </span>
          <input
            type="text"
            value={config.title}
            onChange={(e) => commitConfig({ ...config, title: e.target.value })}
            placeholder="Titre de l'arbre..."
            className="w-56 bg-transparent text-xs font-semibold text-stone-800 focus:outline-none dark:text-zinc-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              const next = createPresetProbabilityConfig(
                e.target.value as ProbabilityPresetId
              );
              commitConfig(next);
              setSelectedNodeId(next.children[0]?.id ?? null);
              e.target.value = '';
            }}
            className="rounded border border-stone-200 bg-white px-2 py-0.5 text-[11px] text-stone-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="">Modèle…</option>
            <option value="bayes-2">Bayes (2×2)</option>
            <option value="bernoulli-2">Bernoulli (n=2)</option>
            <option value="symmetric-3">3 branches (1/3)</option>
          </select>

          <button
            type="button"
            onClick={handleAddRootBranch}
            className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-2 py-0.5 text-[11px] text-stone-700 hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <Plus className="h-3 w-3" />
            Branche racine
          </button>

          <label className="inline-flex items-center gap-1 text-[11px] text-stone-600 dark:text-zinc-300">
            <span>Cible Bayes:</span>
            <input
              type="text"
              value={config.targetEvent}
              onChange={(e) =>
                commitConfig({ ...config, targetEvent: e.target.value })
              }
              placeholder="B"
              className="w-12 rounded border border-stone-200 bg-white px-1.5 py-0.5 text-center font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="inline-flex items-center gap-1 text-[11px] text-stone-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={config.showPathProbabilities}
              onChange={(e) =>
                commitConfig({
                  ...config,
                  showPathProbabilities: e.target.checked,
                })
              }
              className="h-3 w-3 rounded border-stone-300"
            />
            P(chemin)
          </label>

          <button
            type="button"
            onClick={deleteNode}
            className="rounded p-1 text-stone-400 hover:bg-rose-500/10 hover:text-rose-500"
            title="Supprimer cet arbre"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Print title */}
      {config.title && (
        <div className="px-4 pt-2.5 text-xs font-semibold text-stone-700 dark:text-zinc-300">
          {config.title}
        </div>
      )}

      {/* Interactive tree canvas */}
      <div className="p-3">
        <ProbabilityTreeCanvas
          config={config}
          selectedNodeId={selectedNodeId}
          interactive
          onSelectNode={setSelectedNodeId}
        />
      </div>

      {/* Branch inspector */}
      {selectedTreeNode && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200/80 bg-stone-50/70 px-3.5 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950/50 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-stone-500 dark:text-zinc-400">
              Nœud sélectionné :
            </span>
            <label className="inline-flex items-center gap-1 text-[11px]">
              <span className="text-stone-500">Événement</span>
              <input
                type="text"
                value={selectedTreeNode.label}
                onChange={(e) => {
                  const next = updateNodeInTree(
                    config.children,
                    selectedTreeNode.id,
                    (n) => ({ ...n, label: e.target.value })
                  );
                  commitConfig({ ...config, children: next });
                }}
                className="w-24 rounded border border-stone-200 bg-white px-2 py-0.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>

            <label className="inline-flex items-center gap-1 text-[11px]">
              <span className="text-stone-500">Proba</span>
              <input
                type="text"
                value={selectedTreeNode.probability}
                onChange={(e) => {
                  const next = updateNodeInTree(
                    config.children,
                    selectedTreeNode.id,
                    (n) => ({ ...n, probability: e.target.value })
                  );
                  commitConfig({ ...config, children: next });
                }}
                className="w-20 rounded border border-stone-200 bg-white px-2 py-0.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleAddChild(selectedTreeNode.id)}
              className="inline-flex items-center gap-1 rounded border border-indigo-300/70 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-300"
            >
              <Plus className="h-3 w-3" />
              Sous-branche
            </button>
            <button
              type="button"
              onClick={() => handleDeleteBranch(selectedTreeNode.id)}
              className="inline-flex items-center gap-1 rounded border border-rose-300/60 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-600 hover:bg-rose-500/20 dark:text-rose-300"
            >
              Retirer
            </button>
          </div>
        </div>
      )}

      {/* Warnings & Bayes summary */}
      <div className="space-y-1.5 border-t border-stone-200/70 px-3.5 py-2 text-xs dark:border-zinc-800 print:hidden">
        {analysis.warnings.length === 0 ? (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Toutes les sommets vérifient Σ p = 1</span>
          </div>
        ) : (
          analysis.warnings.map((w) => (
            <div
              key={w.parentId}
              className="flex flex-wrap items-center justify-between gap-2 rounded bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-800 dark:text-amber-200"
            >
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Nœud « {w.parentLabel} » : Σ = {w.sumString} (≠ 1)
              </span>
              {w.missingString && (
                <button
                  type="button"
                  onClick={() =>
                    handleCompleteMissingBranch(w.parentId, w.missingString!)
                  }
                  className="rounded border border-amber-400/60 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-white dark:bg-zinc-900 dark:text-amber-200"
                >
                  Compléter dernière branche ({w.missingString})
                </button>
              )}
            </div>
          ))
        )}

        {analysis.targetTotalProb !== null && analysis.targetEvent && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-200/70 bg-emerald-50/50 px-2.5 py-1.5 text-[11px] dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <div className="flex flex-wrap items-center gap-3 text-stone-800 dark:text-zinc-200">
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300">
                <Sparkles className="h-3.5 w-3.5" />
                P({analysis.targetEvent}) = {formatNumberCompact(analysis.targetTotalProb)}
              </span>
              {analysis.bayesEntries.map((entry) => (
                <span key={entry.rootLabel} className="font-mono text-[11px]">
                  P_{analysis.targetEvent}({entry.rootLabel}) ≈{' '}
                  {formatNumberCompact(entry.posteriorProb)}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={handleInsertFormulaBelow}
              className="rounded border border-emerald-400/60 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 dark:bg-zinc-900 dark:text-emerald-300"
            >
              Insérer en $$
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

