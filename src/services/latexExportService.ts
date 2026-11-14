import { parseBlockMathMeta } from '../editor/utils/equationMeta';
import {
  parseFunctionPlotConfig,
  type FunctionPlotConfig,
} from '../editor/extensions/SoftFunctionPlot';
import {
  analyzeGeometry2D,
  parseGeometry2DConfig,
  type Geometry2DConfig,
} from '../editor/extensions/SoftGeometry2D';
import { parseMatrixBlockConfig } from '../editor/extensions/SoftMatrixBlock';
import {
  analyzeProbabilityTree,
  parseProbabilityTreeConfig,
  type ProbabilityTreeConfig,
} from '../editor/extensions/SoftProbabilityTree';
import {
  parseSurface3DConfig,
  type Surface3DConfig,
} from '../editor/extensions/SoftSurface3D';
import {
  parseVariationTableConfig,
  type VariationBoundaryValue,
  type VariationTableConfig,
} from '../editor/extensions/SoftVariationTable';
import { stripExamSolutionsFromMarkdown } from './examModeService';
import {
  exportLatexMacrosPreamble,
  type KatexMacroEntry,
} from './katexMacrosService';
import { matrixBlockConfigToLatex } from './matrixService';

export interface LatexExportOptions {
  title: string;
  content: string;
  author?: string;
  excludeSolutions?: boolean;
  macros?: KatexMacroEntry[];
}

const ACADEMIC_ENV_MAP = {
  definition: 'softdef',
  theorem: 'softtheo',
  example: 'softex',
  exercise: 'softexo',
  proof: 'proof',
} as const;

const UNICODE_MATH_REPLACEMENTS: Record<string, string> = {
  '→': '$\\rightarrow$',
  '←': '$\\leftarrow$',
  '↔': '$\\leftrightarrow$',
  '⇒': '$\\Rightarrow$',
  '⇐': '$\\Leftarrow$',
  '⇔': '$\\Leftrightarrow$',
  '↗': '$\\nearrow$',
  '↘': '$\\searrow$',
  '≤': '$\\le$',
  '≥': '$\\ge$',
  '≠': '$\\neq$',
  '≈': '$\\approx$',
  '≡': '$\\equiv$',
  '×': '$\\times$',
  '÷': '$\\div$',
  '±': '$\\pm$',
  '·': '$\\cdot$',
  '∞': '$\\infty$',
  '∈': '$\\in$',
  '∉': '$\\notin$',
  '⊂': '$\\subset$',
  '⊆': '$\\subseteq$',
  '∪': '$\\cup$',
  '∩': '$\\cap$',
  '∅': '$\\emptyset$',
  '∀': '$\\forall$',
  '∃': '$\\exists$',
  'ℝ': '$\\mathbb{R}$',
  'ℕ': '$\\mathbb{N}$',
  'ℤ': '$\\mathbb{Z}$',
  'ℚ': '$\\mathbb{Q}$',
  'ℂ': '$\\mathbb{C}$',
  '∑': '$\\sum$',
  '∏': '$\\prod$',
  '∫': '$\\int$',
  '√': '$\\sqrt{}$',
  '°': '$^\\circ$',
};

/**
 * Escapes plain prose for pdflatex in a single pass so emitted commands
 * (such as `\textbackslash{}`) are never re-escaped.
 */
export function escapeLatexText(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch in UNICODE_MATH_REPLACEMENTS) {
      out += UNICODE_MATH_REPLACEMENTS[ch];
      continue;
    }
    switch (ch) {
      case '\\':
        out += '\\textbackslash{}';
        break;
      case '{':
        out += '\\{';
        break;
      case '}':
        out += '\\}';
        break;
      case '&':
        out += '\\&';
        break;
      case '%':
        out += '\\%';
        break;
      case '$':
        out += '\\$';
        break;
      case '#':
        out += '\\#';
        break;
      case '_':
        out += '\\_';
        break;
      case '~':
        out += '\\textasciitilde{}';
        break;
      case '^':
        out += '\\textasciicircum{}';
        break;
      default:
        out += ch;
        break;
    }
  }
  return out;
}

function escapeHrefUrl(url: string): string {
  return url.replace(/([#%{}])/g, '\\$1');
}

function stripOuterDollarMath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
    return trimmed.slice(2, -2).trim();
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length > 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function formatOptionalBracketArg(text: string): string {
  return inlineMarkdownToLatex(text)
    .replace(/\[/g, '{[}')
    .replace(/\]/g, '{]}');
}

/**
 * Splits text into protected math/code tokens and plain Markdown segments,
 * then converts formatting in non-math segments only.
 */
export function inlineMarkdownToLatex(text: string): string {
  if (!text) {
    return '';
  }

  const tokens: string[] = [];
  const pushToken = (latex: string): string => {
    const idx = tokens.length;
    tokens.push(latex);
    return `\uE000SOFTMATHTOK${idx}\uE001`;
  };

  // 1. Protect display/inline math & inline code spans before Markdown formatting
  let scanned = '';
  let i = 0;
  while (i < text.length) {
    // Escaped dollar stays literal
    if (text[i] === '\\' && text[i + 1] === '$') {
      scanned += pushToken('\\$');
      i += 2;
      continue;
    }

    // Inline \( ... \) math
    if (text[i] === '\\' && text[i + 1] === '(') {
      const closeIdx = text.indexOf('\\)', i + 2);
      if (closeIdx !== -1) {
        const inner = text.slice(i + 2, closeIdx).trim();
        scanned += pushToken(`$${inner}$`);
        i = closeIdx + 2;
        continue;
      }
    }

    // Inline $$ ... $$ or $ ... $
    if (text[i] === '$') {
      if (text[i + 1] === '$') {
        const closeIdx = text.indexOf('$$', i + 2);
        if (closeIdx !== -1) {
          const inner = text.slice(i + 2, closeIdx).trim();
          scanned += pushToken(`$$${inner}$$`);
          i = closeIdx + 2;
          continue;
        }
      } else {
        let j = i + 1;
        let found = -1;
        while (j < text.length) {
          if (text[j] === '\\') {
            j += 2;
            continue;
          }
          if (text[j] === '$') {
            found = j;
            break;
          }
          j += 1;
        }
        if (found > i + 1) {
          const inner = text.slice(i + 1, found).trim();
          if (inner.length > 0) {
            scanned += pushToken(`$${inner}$`);
            i = found + 1;
            continue;
          }
        }
      }
    }

    // Inline code `...`
    if (text[i] === '`') {
      const closeIdx = text.indexOf('`', i + 1);
      if (closeIdx !== -1) {
        const codeText = text.slice(i + 1, closeIdx);
        scanned += pushToken(`\\texttt{${escapeLatexText(codeText)}}`);
        i = closeIdx + 1;
        continue;
      }
    }

    scanned += text[i];
    i += 1;
  }

  // 2. Recursively apply inline links/images/styles sharing the same token table
  const formatSegmented = (segment: string): string => {
    let work = segment;

    work = work.replace(
      /\\(eq)?ref\{([^}]+)\}/g,
      (_m, eqPrefix: string | undefined, lbl: string) =>
        pushToken(`\\${eqPrefix ? 'eqref' : 'ref'}{${lbl.trim()}}`)
    );

    work = work.replace(
      /(^|[^!])\[\[([^[\]]+?)\]\]/g,
      (_m, prefix: string, inner: string) => {
        const pipeIdx = inner.indexOf('|');
        const display = (pipeIdx !== -1 ? inner.slice(pipeIdx + 1) : inner).trim();
        return `${prefix}${pushToken(`\\textit{${escapeLatexText(display)}}`)}`;
      }
    );

    work = work.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_m, alt: string, url: string) =>
        pushToken(
          `\\textit{[Image : ${escapeLatexText(alt.trim() || url.trim())}]}`
        )
    );

    work = work.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_m, label: string, url: string) =>
        pushToken(
          `\\href{${escapeHrefUrl(url.trim())}}{${formatSegmented(label)}}`
        )
    );

    work = work.replace(
      /\*\*((?:[^*\n]|\*(?!\*))+?)\*\*/g,
      (_m, inner: string) => pushToken(`\\textbf{${formatSegmented(inner)}}`)
    );
    work = work.replace(
      /__((?:[^_\n]|_(?!_))+?)__/g,
      (_m, inner: string) => pushToken(`\\textbf{${formatSegmented(inner)}}`)
    );
    work = work.replace(
      /~~([^~]+?)~~/g,
      (_m, inner: string) => pushToken(`\\sout{${formatSegmented(inner)}}`)
    );
    work = work.replace(
      /(^|[^\\*])\*([^*\n]+?)\*(?!\*)/g,
      (_m, prefix: string, inner: string) =>
        `${prefix}${pushToken(`\\textit{${formatSegmented(inner)}}`)}`
    );

    return work
      .split(/(\uE000SOFTMATHTOK\d+\uE001)/g)
      .map((part) => {
        if (/^\uE000SOFTMATHTOK\d+\uE001$/.test(part)) {
          return part;
        }
        return escapeLatexText(part);
      })
      .join('');
  };

  // 3. Resolve all sealed tokens recursively (fixed-point for nested tokens)
  let result = formatSegmented(scanned);
  while (/\uE000SOFTMATHTOK\d+\uE001/.test(result)) {
    result = result.replace(
      /\uE000SOFTMATHTOK(\d+)\uE001/g,
      (_m, idx: string) => tokens[Number(idx)] ?? ''
    );
  }
  return result;
}

function formatVariationBoundaryCell(val: VariationBoundaryValue | undefined): string {
  if (!val) {
    return '';
  }
  if (val.doubleBar) {
    const left = stripOuterDollarMath(val.leftValue ?? '');
    const right = stripOuterDollarMath(val.rightValue ?? '');
    if (left && right) {
      return `$${left} \\,\\parallel\\, ${right}$`;
    }
    if (left) {
      return `$${left} \\parallel$`;
    }
    if (right) {
      return `$\\parallel ${right}$`;
    }
    return '$\\parallel$';
  }
  const math = stripOuterDollarMath(val.value ?? '');
  return math ? `$${math}$` : '';
}

function formatRowLabelMathOrProse(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.includes('$')) {
    return inlineMarkdownToLatex(trimmed);
  }
  return `$${trimmed}$`;
}

export function variationTableToLatex(config: VariationTableConfig): string {
  const colCount = Math.max(2, config.xValues.length);
  const intervalCount = colCount - 1;
  const specCols = Array.from({ length: 2 * colCount - 1 }, () => 'c').join('');

  const lines: string[] = [];
  lines.push('\\begin{center}');
  if (config.title.trim()) {
    lines.push(`\\textbf{${inlineMarkdownToLatex(config.title.trim())}}\\par\\medskip`);
  }
  lines.push('{\\renewcommand{\\arraystretch}{1.4}');
  lines.push(`\\begin{tabular}{l|${specCols}}`);
  lines.push('\\toprule');

  // x values header row
  const xCells: string[] = [`$${stripOuterDollarMath(config.variable || 'x')}$`];
  for (let i = 0; i < colCount; i += 1) {
    const xVal = stripOuterDollarMath(config.xValues[i] ?? '');
    xCells.push(xVal ? `$${xVal}$` : '');
    if (i < intervalCount) {
      xCells.push('');
    }
  }
  lines.push(`${xCells.join(' & ')} \\\\`);
  lines.push('\\midrule');

  for (let rowIdx = 0; rowIdx < config.rows.length; rowIdx += 1) {
    const row = config.rows[rowIdx];
    const rowCells: string[] = [formatRowLabelMathOrProse(row.label)];

    if (row.kind === 'sign') {
      for (let i = 0; i < colCount; i += 1) {
        const marker = row.markers[i] ?? '';
        rowCells.push(
          marker === '0' ? '$0$' : marker === '||' ? '$\\parallel$' : ''
        );
        if (i < intervalCount) {
          const sign = row.signs[i] ?? '';
          rowCells.push(
            sign === '+'
              ? '$+$'
              : sign === '-'
                ? '$-$'
                : sign === '0'
                  ? '$0$'
                  : ''
          );
        }
      }
    } else {
      for (let i = 0; i < colCount; i += 1) {
        rowCells.push(formatVariationBoundaryCell(row.values[i]));
        if (i < intervalCount) {
          const arrow = row.arrows[i] ?? 'up';
          if (arrow === 'up') {
            rowCells.push('$\\nearrow$');
          } else if (arrow === 'down') {
            rowCells.push('$\\searrow$');
          } else if (arrow === 'flat') {
            rowCells.push('$\\rightarrow$');
          } else {
            rowCells.push('\\text{///}');
          }
        }
      }
    }

    lines.push(`${rowCells.join(' & ')} \\\\`);
    lines.push(rowIdx === config.rows.length - 1 ? '\\bottomrule' : '\\midrule');
  }

  lines.push('\\end{tabular}}');
  lines.push('\\end{center}');
  return lines.join('\n');
}

export function functionPlotToLatex(config: FunctionPlotConfig): string {
  const lines: string[] = [];
  lines.push('\\begin{center}');
  lines.push('\\fbox{\\parbox{0.92\\linewidth}{');
  lines.push(
    `\\textbf{Graphe 2D : ${inlineMarkdownToLatex(config.title || 'Courbes')}}`
  );
  lines.push('\\\\[4pt]');
  lines.push(
    `Fenêtre : $[${config.xMin}, ${config.xMax}] \\times [${config.yMin}, ${config.yMax}]$`
  );

  const visibleCurves = config.curves.filter((c) => c.visible && c.expression.trim());
  if (visibleCurves.length > 0) {
    lines.push('\\begin{itemize}');
    visibleCurves.forEach((curve, idx) => {
      const expr = curve.expression.trim();
      const derivNote = curve.showDerivative ? ' \\textit{(dérivée affichée)}' : '';
      lines.push(
        `  \\item $f_{${idx + 1}}(x) = \\text{\\texttt{${escapeLatexText(expr)}}}$${derivNote}`
      );
    });
    lines.push('\\end{itemize}');
  }

  if ((config.parameters ?? []).length > 0) {
    const paramItems = (config.parameters ?? []).map(
      (p) => `$${escapeLatexText(p.name)} = ${p.value}$`
    );
    lines.push(`Paramètres : ${paramItems.join(', ')}.`);
  }

  if (config.tangent?.enabled) {
    lines.push(`\\\\Tangente tracée en $x_0 = ${config.tangent.x0}$.`);
  }

  if (config.integralFrom?.trim() && config.integralTo?.trim()) {
    lines.push(
      `\\\\Intégrale sur $[${escapeLatexText(config.integralFrom.trim())}, ${escapeLatexText(config.integralTo.trim())}]$.`
    );
  }

  lines.push('}}');
  lines.push('\\end{center}');
  return lines.join('\n');
}

export function probabilityTreeToLatex(config: ProbabilityTreeConfig): string {
  const analysis = analyzeProbabilityTree(config);
  const lines: string[] = [];
  lines.push('\\begin{center}');
  lines.push('\\fbox{\\parbox{0.92\\linewidth}{');
  lines.push(
    `\\textbf{Arbre de probabilités : ${inlineMarkdownToLatex(config.title || 'Arbre pondéré')}}`
  );
  lines.push('\\\\[4pt]');
  if (analysis.leaves.length > 0) {
    lines.push('\\begin{itemize}');
    for (const leaf of analysis.leaves) {
      const pathMath = leaf.pathLabels.map((l) => stripOuterDollarMath(l)).join(' \\cap ');
      lines.push(
        `  \\item $P(${pathMath}) = ${escapeLatexText(leaf.probabilityString)}$`
      );
    }
    lines.push('\\end{itemize}');
  }
  if (analysis.targetTotalProb !== null && analysis.targetEvent) {
    lines.push(
      `Probabilités totales : $P(${stripOuterDollarMath(analysis.targetEvent)}) = ${analysis.targetTotalProb.toFixed(4).replace(/\.?0+$/, '')}$.`
    );
  }
  lines.push('}}');
  lines.push('\\end{center}');
  return lines.join('\n');
}

export function surface3dToLatex(config: Surface3DConfig): string {
  const lines: string[] = [];
  lines.push('\\begin{center}');
  lines.push('\\fbox{\\parbox{0.92\\linewidth}{');
  lines.push(
    `\\textbf{Surface 3D : ${inlineMarkdownToLatex(config.title || 'Surface')}}`
  );
  lines.push('\\\\[4pt]');
  lines.push(
    `Équation : $z = \\text{\\texttt{${escapeLatexText(config.expression)}}}$ sur $[${config.xMin}, ${config.xMax}] \\times [${config.yMin}, ${config.yMax}]$.`
  );
  lines.push('}}');
  lines.push('\\end{center}');
  return lines.join('\n');
}

export function geometry2dToLatex(config: Geometry2DConfig): string {
  const analysis = analyzeGeometry2D(config);
  const lines: string[] = [];
  lines.push('\\begin{center}');
  lines.push('\\fbox{\\parbox{0.92\\linewidth}{');
  lines.push(
    `\\textbf{Géométrie 2D : ${inlineMarkdownToLatex(config.title || 'Figure du plan')}}`
  );
  lines.push('\\\\[4pt]');
  if (config.points.length > 0) {
    const pts = config.points
      .map((p) => `$${escapeLatexText(p.name)}(${p.x}, ${p.y})$`)
      .join(', ');
    lines.push(`Points : ${pts}.`);
  }
  if (analysis.shapes.length > 0 || analysis.circles.length > 0) {
    lines.push('\\begin{itemize}');
    for (const s of analysis.shapes) {
      if (s.kind === 'vector') {
        lines.push(
          `  \\item $\\overrightarrow{${escapeLatexText(s.fromName + s.toName)}}(${s.dx.toFixed(2).replace(/\.00$/, '')};\\, ${s.dy.toFixed(2).replace(/\.00$/, '')})$, norme $${s.length.toFixed(2)}$`
        );
      } else {
        lines.push(
          `  \\item $[${escapeLatexText(s.fromName + s.toName)}]$ : longueur $${s.length.toFixed(2)}$, droite $${escapeLatexText(s.reducedEquation)}$`
        );
      }
    }
    for (const c of analysis.circles) {
      lines.push(
        `  \\item Cercle de centre $${escapeLatexText(c.centerName)}$ et rayon $${c.radius.toFixed(2)}$ : $${c.equation}$`
      );
    }
    lines.push('\\end{itemize}');
  }
  lines.push('}}');
  lines.push('\\end{center}');
  return lines.join('\n');
}

interface ListEntry {
  indent: number;
  ordered: boolean;
  text: string;
}

function renderListBlock(entries: ListEntry[], startIdx = 0): { latex: string; nextIdx: number } {
  if (startIdx >= entries.length) {
    return { latex: '', nextIdx: startIdx };
  }
  const baseIndent = entries[startIdx].indent;
  const ordered = entries[startIdx].ordered;
  const env = ordered ? 'enumerate' : 'itemize';
  const out: string[] = [`\\begin{${env}}`];
  let idx = startIdx;

  while (idx < entries.length) {
    const item = entries[idx];
    if (item.indent < baseIndent) {
      break;
    }
    if (item.indent > baseIndent) {
      const nested = renderListBlock(entries, idx);
      out.push(nested.latex);
      idx = nested.nextIdx;
      continue;
    }
    if (item.ordered !== ordered) {
      break;
    }
    out.push(`  \\item ${inlineMarkdownToLatex(item.text)}`);
    idx += 1;
    // Consume deeper nested sublists directly inside the current \item
    while (idx < entries.length && entries[idx].indent > baseIndent) {
      const nested = renderListBlock(entries, idx);
      out.push(nested.latex);
      idx = nested.nextIdx;
    }
  }

  out.push(`\\end{${env}}`);
  return { latex: out.join('\n'), nextIdx: idx };
}

function isTableSeparatorRow(line: string): boolean {
  const stripped = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = stripped.split('|').map((c) => c.trim());
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell))
  );
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * Converts SoftMath Markdown (math blocks, academic blocks, variation tables,
 * function plots, Excalidraw placeholders, tables, lists, headings) into a
 * LaTeX body string without preamble.
 */
export function markdownToLatexBody(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // 1. Academic block :::kind{collapsed} Title ... :::
    const academicMatch = trimmed.match(
      /^:::(definition|theorem|proof|example|exercise)(?:\{(collapsed)\})?(?:\s+(.*))?$/
    );
    if (academicMatch) {
      const kind = academicMatch[1] as keyof typeof ACADEMIC_ENV_MAP;
      const title = (academicMatch[3] ?? '').trim();
      const envName = ACADEMIC_ENV_MAP[kind];

      let depth = 1;
      const innerLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && depth > 0) {
        const innerTrimmed = lines[j].trim();
        if (
          /^:::(definition|theorem|proof|example|exercise)(?:\{collapsed\})?(?:\s+.*)?$/.test(
            innerTrimmed
          )
        ) {
          depth += 1;
        } else if (innerTrimmed === ':::') {
          depth -= 1;
          if (depth === 0) {
            break;
          }
        }
        innerLines.push(lines[j]);
        j += 1;
      }

      const bodyLatex = markdownToLatexBody(innerLines.join('\n')).trim();
      const optArg = title ? `[${formatOptionalBracketArg(title)}]` : '';
      blocks.push(
        `\\begin{${envName}}${optArg}\n${bodyLatex || '~'}\n\\end{${envName}}`
      );
      i = j + 1;
      continue;
    }

    // 2. Display math $$ ... $$
    if (trimmed.startsWith('$$')) {
      const formatDisplayMath = (rawInner: string): string => {
        const eqMeta = parseBlockMathMeta(rawInner);
        const body = eqMeta.body.trim();
        if (eqMeta.numbered) {
          const labelCmd = eqMeta.label ? `\n\\label{${eqMeta.label}}` : '';
          return `\\begin{equation}${labelCmd}\n${body}\n\\end{equation}`;
        }
        return `\\[\n${body}\n\\]`;
      };

      if (trimmed.length > 4 && trimmed.endsWith('$$')) {
        const expr = trimmed.slice(2, -2).trim();
        blocks.push(formatDisplayMath(expr));
        i += 1;
        continue;
      }
      const mathLines: string[] = [];
      const firstRest = trimmed.slice(2).trim();
      if (firstRest) {
        mathLines.push(firstRest);
      }
      let j = i + 1;
      while (j < lines.length) {
        const t = lines[j].trim();
        if (t.endsWith('$$')) {
          const beforeEnd = t.slice(0, -2).trim();
          if (beforeEnd) {
            mathLines.push(beforeEnd);
          }
          break;
        }
        mathLines.push(lines[j]);
        j += 1;
      }
      blocks.push(formatDisplayMath(mathLines.join('\n').trim()));
      i = j + 1;
      continue;
    }

    // 3. Fenced code block ```lang
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim().toLowerCase();
      const codeLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== '```') {
        codeLines.push(lines[j]);
        j += 1;
      }
      const rawBody = codeLines.join('\n');

      if (lang === 'softmath-variation') {
        blocks.push(variationTableToLatex(parseVariationTableConfig(rawBody)));
      } else if (lang === 'softmath-plot') {
        blocks.push(functionPlotToLatex(parseFunctionPlotConfig(rawBody)));
      } else if (lang === 'softmath-matrix') {
        const cfg = parseMatrixBlockConfig(rawBody);
        const titlePrefix = cfg.title.trim()
          ? `\\textbf{${inlineMarkdownToLatex(cfg.title.trim())}}\\\\[0.4em]\n`
          : '';
        blocks.push(
          `\\begin{center}\n${titlePrefix}\\[\n${matrixBlockConfigToLatex(cfg)}\n\\]\n\\end{center}`
        );
      } else if (lang === 'softmath-proba') {
        blocks.push(probabilityTreeToLatex(parseProbabilityTreeConfig(rawBody)));
      } else if (lang === 'softmath-3d') {
        blocks.push(surface3dToLatex(parseSurface3DConfig(rawBody)));
      } else if (lang === 'softmath-geometry') {
        blocks.push(geometry2dToLatex(parseGeometry2DConfig(rawBody)));
      } else {
        blocks.push(`\\begin{verbatim}\n${rawBody}\n\\end{verbatim}`);
      }
      i = j + 1;
      continue;
    }

    // 4. Excalidraw embed ![[asset.excalidraw]]
    const excalidrawMatch = trimmed.match(/^!\[\[([^\]]+)\]\]$/);
    if (excalidrawMatch) {
      const assetName = excalidrawMatch[1].trim();
      blocks.push(
        `\\begin{center}\n\\fbox{\\parbox{0.85\\linewidth}{\\centering\\textit{Schéma Excalidraw : \\texttt{${escapeLatexText(assetName)}}}}}\n\\end{center}`
      );
      i += 1;
      continue;
    }

    // 5. Horizontal rule
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push('\\par\\bigskip\\hrule\\bigskip\\par');
      i += 1;
      continue;
    }

    // 6. Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingLatex = inlineMarkdownToLatex(headingMatch[2].trim());
      if (level === 1) {
        blocks.push(`\\section{${headingLatex}}`);
      } else if (level === 2) {
        blocks.push(`\\subsection{${headingLatex}}`);
      } else if (level === 3) {
        blocks.push(`\\subsubsection{${headingLatex}}`);
      } else {
        blocks.push(`\\paragraph{${headingLatex}}`);
      }
      i += 1;
      continue;
    }

    // 7. Blockquote > ...
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      const innerQuote = markdownToLatexBody(quoteLines.join('\n')).trim();
      blocks.push(`\\begin{quote}\n${innerQuote}\n\\end{quote}`);
      continue;
    }

    // 8. Markdown GFM table
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparatorRow(lines[i + 1])
    ) {
      const headers = splitTableCells(line);
      const colSpec = Array.from({ length: headers.length }, () => 'l').join(' ');
      const tableLines: string[] = [
        '\\begin{center}',
        `\\begin{tabular}{${colSpec}}`,
        '\\toprule',
        `${headers.map((h) => `\\textbf{${inlineMarkdownToLatex(h)}}`).join(' & ')} \\\\`,
        '\\midrule',
      ];
      i += 2;
      while (i < lines.length && lines[i].trim().includes('|') && lines[i].trim()) {
        const rowCells = splitTableCells(lines[i]);
        const padded = Array.from({ length: headers.length }, (_, idx) =>
          inlineMarkdownToLatex(rowCells[idx] ?? '')
        );
        tableLines.push(`${padded.join(' & ')} \\\\`);
        i += 1;
      }
      tableLines.push('\\bottomrule');
      tableLines.push('\\end{tabular}');
      tableLines.push('\\end{center}');
      blocks.push(tableLines.join('\n'));
      continue;
    }

    // 9. Bullet / numbered list
    const listMatch = line.match(/^(\s*)(?:([-*+])|(\d+[.)]))\s+(.*)$/);
    if (listMatch) {
      const entries: ListEntry[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)(?:([-*+])|(\d+[.)]))\s+(.*)$/);
        if (!m) {
          break;
        }
        entries.push({
          indent: m[1].replace(/\t/g, '  ').length,
          ordered: Boolean(m[3]),
          text: m[4].trim(),
        });
        i += 1;
      }
      blocks.push(renderListBlock(entries).latex);
      continue;
    }

    // 10. Regular paragraph (merge consecutive plain text lines until blank/block token)
    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i];
      const curTrim = cur.trim();
      if (
        !curTrim ||
        curTrim.startsWith('$$') ||
        curTrim.startsWith('```') ||
        curTrim.startsWith('>') ||
        /^!\[\[[^\]]+\]\]$/.test(curTrim) ||
        /^#{1,6}\s+/.test(curTrim) ||
        /^(?:-{3,}|\*{3,}|_{3,})$/.test(curTrim) ||
        /^:::/.test(curTrim) ||
        /^(\s*)(?:[-*+]|\d+[.)])\s+/.test(cur)
      ) {
        break;
      }
      paraLines.push(curTrim);
      i += 1;
    }

    if (paraLines.length > 0) {
      blocks.push(inlineMarkdownToLatex(paraLines.join('\n')));
    } else {
      blocks.push(inlineMarkdownToLatex(trimmed));
      i += 1;
    }
  }

  return blocks.join('\n\n');
}

/**
 * Generates a complete, standalone compilable French academic LaTeX document
 * from a SoftMath note.
 */
export function exportNoteToLatex(options: LatexExportOptions): string {
  const titleLatex = inlineMarkdownToLatex(options.title.trim() || 'Sans titre');
  const effectiveMarkdown = options.excludeSolutions
    ? stripExamSolutionsFromMarkdown(options.content, {
        proofPlaceholder: ':::proof\n\\textit{(À compléter — Mode Examen)}\n:::',
      })
    : options.content;
  const bodyLatex = markdownToLatexBody(effectiveMarkdown);
  const macrosPreamble = exportLatexMacrosPreamble(options.macros);
  const authorLine = options.author?.trim()
    ? `\\author{${escapeLatexText(options.author.trim())}}\n`
    : '\\author{}\n';

  return [
    '\\documentclass[11pt,a4paper]{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[french]{babel}',
    '\\usepackage{amsmath,amssymb,amsthm}',
    '\\usepackage{booktabs,array,xcolor}',
    '\\usepackage[normalem]{ulem}',
    '\\usepackage{hyperref}',
    '\\usepackage[margin=2.2cm]{geometry}',
    '',
    '\\theoremstyle{definition}',
    '\\newtheorem{softdef}{Définition}[section]',
    '\\newtheorem{softex}{Exemple}[section]',
    '\\newtheorem{softexo}{Exercice}[section]',
    '\\theoremstyle{plain}',
    '\\newtheorem{softtheo}{Théorème}[section]',
    ...(macrosPreamble ? ['', '% Macros KaTeX / LaTeX personnalisées', macrosPreamble] : []),
    '',
    `\\title{${titleLatex}}`,
    authorLine.trimEnd(),
    '\\date{\\today}',
    '',
    '\\begin{document}',
    '\\maketitle',
    '',
    bodyLatex,
    '',
    '\\end{document}',
    '',
  ].join('\n');
}
