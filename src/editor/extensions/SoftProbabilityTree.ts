import { Node, mergeAttributes, type Editor } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ProbabilityTreeBlockView } from '../components/ProbabilityTreeBlockView';
import {
  addRat,
  mulRat,
  parseCellToRational,
  rat,
  rationalToString,
  subRat,
  type Rational,
} from '../../services/matrixService';

export interface ProbTreeNode {
  id: string;
  label: string;
  probability: string;
  children: ProbTreeNode[];
}

export interface ProbabilityTreeConfig {
  title: string;
  rootLabel: string;
  showPathProbabilities: boolean;
  targetEvent: string;
  children: ProbTreeNode[];
}

export type ProbabilityPresetId = 'bayes-2' | 'bernoulli-2' | 'symmetric-3';

export interface ProbabilityBranchWarning {
  parentId: string;
  parentLabel: string;
  sumNumeric: number;
  sumString: string;
  missingString: string | null;
}

export interface ProbabilityLeafSummary {
  nodeId: string;
  pathLabels: string[];
  leafLabel: string;
  rootLabel: string;
  probabilityString: string;
  probabilityNumeric: number | null;
}

export interface ProbabilityBayesEntry {
  rootLabel: string;
  intersectionProb: number;
  posteriorProb: number;
}

export interface ProbabilityAnalysis {
  warnings: ProbabilityBranchWarning[];
  leaves: ProbabilityLeafSummary[];
  targetEvent: string;
  targetTotalProb: number | null;
  bayesEntries: ProbabilityBayesEntry[];
}

export function createPresetProbabilityConfig(
  preset: ProbabilityPresetId = 'bayes-2'
): ProbabilityTreeConfig {
  switch (preset) {
    case 'bernoulli-2':
      return {
        title: 'Schéma de Bernoulli (n = 2)',
        rootLabel: 'Ω',
        showPathProbabilities: true,
        targetEvent: 'S',
        children: [
          {
            id: 'b-s',
            label: 'S',
            probability: '0.4',
            children: [
              { id: 'b-ss', label: 'S', probability: '0.4', children: [] },
              { id: 'b-se', label: '\\overline{S}', probability: '0.6', children: [] },
            ],
          },
          {
            id: 'b-e',
            label: '\\overline{S}',
            probability: '0.6',
            children: [
              { id: 'b-es', label: 'S', probability: '0.4', children: [] },
              { id: 'b-ee', label: '\\overline{S}', probability: '0.6', children: [] },
            ],
          },
        ],
      };

    case 'symmetric-3':
      return {
        title: 'Partition à 3 issues équiprobables',
        rootLabel: 'Ω',
        showPathProbabilities: true,
        targetEvent: 'G',
        children: [
          {
            id: 's-1',
            label: 'U_1',
            probability: '1/3',
            children: [
              { id: 's-1g', label: 'G', probability: '1/2', children: [] },
              { id: 's-1p', label: '\\overline{G}', probability: '1/2', children: [] },
            ],
          },
          {
            id: 's-2',
            label: 'U_2',
            probability: '1/3',
            children: [
              { id: 's-2g', label: 'G', probability: '1/4', children: [] },
              { id: 's-2p', label: '\\overline{G}', probability: '3/4', children: [] },
            ],
          },
          {
            id: 's-3',
            label: 'U_3',
            probability: '1/3',
            children: [
              { id: 's-3g', label: 'G', probability: '3/5', children: [] },
              { id: 's-3p', label: '\\overline{G}', probability: '2/5', children: [] },
            ],
          },
        ],
      };

    case 'bayes-2':
    default:
      return {
        title: 'Arbre pondéré — Probabilités totales & Bayes',
        rootLabel: 'Ω',
        showPathProbabilities: true,
        targetEvent: 'B',
        children: [
          {
            id: 'n-a',
            label: 'A',
            probability: '0.3',
            children: [
              { id: 'n-ab', label: 'B', probability: '0.8', children: [] },
              { id: 'n-anb', label: '\\overline{B}', probability: '0.2', children: [] },
            ],
          },
          {
            id: 'n-na',
            label: '\\overline{A}',
            probability: '0.7',
            children: [
              { id: 'n-nab', label: 'B', probability: '0.1', children: [] },
              { id: 'n-nanb', label: '\\overline{B}', probability: '0.9', children: [] },
            ],
          },
        ],
      };
  }
}

function normalizeProbNode(raw: unknown, fallbackId: string): ProbTreeNode {
  const item = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : fallbackId;
  const label = typeof item.label === 'string' ? item.label : 'E';
  const probability = typeof item.probability === 'string' ? item.probability : '0.5';
  const rawChildren = Array.isArray(item.children) ? item.children : [];
  const children = rawChildren.map((child, idx) =>
    normalizeProbNode(child, `${id}-${idx + 1}`)
  );
  return { id, label, probability, children };
}

export function normalizeProbabilityTreeConfig(
  raw: Partial<ProbabilityTreeConfig>
): ProbabilityTreeConfig {
  const rawChildren = Array.isArray(raw.children) ? raw.children : [];
  const children =
    rawChildren.length > 0
      ? rawChildren.map((c, idx) => normalizeProbNode(c, `root-${idx + 1}`))
      : createPresetProbabilityConfig('bayes-2').children;

  return {
    title:
      typeof raw.title === 'string' ? raw.title : 'Arbre de probabilités',
    rootLabel: typeof raw.rootLabel === 'string' && raw.rootLabel.trim() ? raw.rootLabel : 'Ω',
    showPathProbabilities: raw.showPathProbabilities !== false,
    targetEvent: typeof raw.targetEvent === 'string' ? raw.targetEvent : '',
    children,
  };
}

export function parseProbabilityTreeConfig(rawSpec: string): ProbabilityTreeConfig {
  const fallback = createPresetProbabilityConfig('bayes-2');
  if (!rawSpec || !rawSpec.trim()) return fallback;
  try {
    const parsed = JSON.parse(rawSpec) as Partial<ProbabilityTreeConfig>;
    return normalizeProbabilityTreeConfig(parsed);
  } catch {
    return fallback;
  }
}

export function serializeProbabilityTreeConfig(config: ProbabilityTreeConfig): string {
  return JSON.stringify(normalizeProbabilityTreeConfig(config));
}

export function parseProbabilityNumber(raw: string): {
  numeric: number | null;
  rational: Rational | null;
} {
  const trimmed = raw.trim().replace(/\s+/g, '');
  if (!trimmed) return { numeric: null, rational: null };

  if (trimmed.endsWith('%')) {
    const inner = parseCellToRational(trimmed.slice(0, -1));
    if (inner) {
      const scaled = rat(inner.n, inner.d * 100n);
      return {
        numeric: Number(scaled.n) / Number(scaled.d),
        rational: scaled,
      };
    }
  }

  const r = parseCellToRational(trimmed);
  if (r) {
    return {
      numeric: Number(r.n) / Number(r.d),
      rational: r,
    };
  }

  return { numeric: null, rational: null };
}

export function formatNumberCompact(value: number): string {
  if (!Number.isFinite(value)) return '?';
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return String(rounded);
}

function multiplyPathProbStrings(
  weights: string[],
  rationals: (Rational | null)[]
): { str: string; numeric: number | null } {
  if (weights.length === 0) return { str: '1', numeric: 1 };
  const allRational = rationals.every((r): r is Rational => r !== null);
  if (allRational) {
    let acc = rat(1n, 1n);
    let numeric = 1;
    for (const r of rationals as Rational[]) {
      acc = mulRat(acc, r);
      numeric *= Number(r.n) / Number(r.d);
    }
    const usesFrac = weights.some((w) => w.includes('/'));
    if (usesFrac) {
      return { str: rationalToString(acc), numeric };
    }
    return { str: formatNumberCompact(numeric), numeric };
  }
  return { str: weights.map((w) => w.trim() || '?').join(' × '), numeric: null };
}

export function analyzeProbabilityTree(config: ProbabilityTreeConfig): ProbabilityAnalysis {
  const warnings: ProbabilityBranchWarning[] = [];
  const leaves: ProbabilityLeafSummary[] = [];

  const checkSiblings = (parentId: string, parentLabel: string, nodes: ProbTreeNode[]) => {
    if (nodes.length === 0) return;
    let sumRat: Rational | null = rat(0n, 1n);
    let sumNum = 0;
    let allValid = true;
    const usesFrac = nodes.some((n) => n.probability.includes('/'));

    for (const child of nodes) {
      const parsed = parseProbabilityNumber(child.probability);
      if (parsed.numeric === null || parsed.numeric < 0 || parsed.numeric > 1) {
        allValid = false;
      } else {
        sumNum += parsed.numeric;
      }
      if (parsed.rational && sumRat) {
        sumRat = addRat(sumRat, parsed.rational);
      } else {
        sumRat = null;
      }
    }

    if (allValid && Math.abs(sumNum - 1) > 1e-4) {
      let missingString: string | null = null;
      if (sumNum < 1) {
        if (sumRat && usesFrac) {
          missingString = rationalToString(subRat(rat(1n, 1n), sumRat));
        } else {
          missingString = formatNumberCompact(1 - sumNum);
        }
      }
      warnings.push({
        parentId,
        parentLabel,
        sumNumeric: sumNum,
        sumString: sumRat && usesFrac ? rationalToString(sumRat) : formatNumberCompact(sumNum),
        missingString,
      });
    }

    for (const child of nodes) {
      if (child.children.length > 0) {
        checkSiblings(child.id, child.label, child.children);
      }
    }
  };

  checkSiblings('__root__', config.rootLabel, config.children);

  const walk = (
    nodes: ProbTreeNode[],
    pathLabels: string[],
    weights: string[],
    rationals: (Rational | null)[],
    rootBranchLabel: string | null
  ) => {
    for (const node of nodes) {
      const parsed = parseProbabilityNumber(node.probability);
      const nextLabels = [...pathLabels, node.label];
      const nextWeights = [...weights, node.probability];
      const nextRationals = [...rationals, parsed.rational];
      const topLabel = rootBranchLabel ?? node.label;

      if (node.children.length === 0) {
        const prod = multiplyPathProbStrings(nextWeights, nextRationals);
        leaves.push({
          nodeId: node.id,
          pathLabels: nextLabels,
          leafLabel: node.label,
          rootLabel: topLabel,
          probabilityString: prod.str,
          probabilityNumeric: prod.numeric,
        });
      } else {
        walk(node.children, nextLabels, nextWeights, nextRationals, topLabel);
      }
    }
  };

  walk(config.children, [], [], [], null);

  const target = config.targetEvent.trim();
  let targetTotalProb: number | null = null;
  const bayesEntries: ProbabilityBayesEntry[] = [];

  if (target) {
    const matchingLeaves = leaves.filter((l) => l.leafLabel.trim() === target);
    if (
      matchingLeaves.length > 0 &&
      matchingLeaves.every((l) => l.probabilityNumeric !== null)
    ) {
      const byRoot = new Map<string, number>();
      let total = 0;
      for (const leaf of matchingLeaves) {
        const p = leaf.probabilityNumeric ?? 0;
        total += p;
        byRoot.set(leaf.rootLabel, (byRoot.get(leaf.rootLabel) ?? 0) + p);
      }
      targetTotalProb = total;
      if (total > 0) {
        for (const [rootLabel, inter] of byRoot.entries()) {
          bayesEntries.push({
            rootLabel,
            intersectionProb: inter,
            posteriorProb: inter / total,
          });
        }
      }
    }
  }

  return {
    warnings,
    leaves,
    targetEvent: target,
    targetTotalProb,
    bayesEntries,
  };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    probabilityTreeBlock: {
      insertProbabilityTree: (config?: ProbabilityTreeConfig) => ReturnType;
    };
  }
}

export function insertProbabilityTreeBlock(
  editor: Editor,
  config: ProbabilityTreeConfig = createPresetProbabilityConfig('bayes-2')
) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'probabilityTreeBlock',
      attrs: { spec: serializeProbabilityTreeConfig(config) },
    })
    .run();
}

export const SoftProbabilityTree = Node.create({
  name: 'probabilityTreeBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  priority: 120,

  addAttributes() {
    return {
      spec: {
        default: serializeProbabilityTreeConfig(
          createPresetProbabilityConfig('bayes-2')
        ),
        parseHTML: (el) => el.getAttribute('data-spec') ?? '',
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="softmath-proba"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'softmath-proba',
        'data-spec': HTMLAttributes.spec ?? '',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ProbabilityTreeBlockView);
  },

  addCommands() {
    return {
      insertProbabilityTree:
        (config = createPresetProbabilityConfig('bayes-2')) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              spec: serializeProbabilityTreeConfig(config),
            },
          }),
    };
  },

  markdownTokenName: 'probabilityTreeBlock',

  markdownTokenizer: {
    name: 'probabilityTreeBlock',
    level: 'block',
    start: (src) => {
      const match = src.match(/^[ \t]*```softmath-proba\b/m);
      return match && match.index !== undefined ? match.index : -1;
    },
    tokenize: (src) => {
      const match = src.match(
        /^[ \t]*```softmath-proba[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```(?=[ \t]*(?:\r?\n|$))/
      );
      if (!match) return undefined;
      const [raw, innerJson] = match;
      return {
        type: 'probabilityTreeBlock',
        raw,
        spec: innerJson.trim(),
      };
    },
  },

  parseMarkdown: (token, helpers) => {
    const normalized = serializeProbabilityTreeConfig(
      parseProbabilityTreeConfig(typeof token.spec === 'string' ? token.spec : '')
    );
    return helpers.createNode('probabilityTreeBlock', { spec: normalized });
  },

  renderMarkdown: (node) => {
    const config = parseProbabilityTreeConfig(
      typeof node.attrs?.spec === 'string' ? node.attrs.spec : ''
    );
    return `\`\`\`softmath-proba\n${JSON.stringify(config, null, 2)}\n\`\`\``;
  },
});

