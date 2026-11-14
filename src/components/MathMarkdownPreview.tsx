import React, { useMemo } from 'react';
import { Geometry2DCanvas } from '../editor/components/Geometry2DCanvas';
import { ProbabilityTreeCanvas } from '../editor/components/ProbabilityTreeCanvas';
import { Surface3DCanvas } from '../editor/components/Surface3DCanvas';
import { VariationTableCanvas } from '../editor/components/VariationTableCanvas';
import { parseBlockMathMeta } from '../editor/utils/equationMeta';
import { parseGeometry2DConfig } from '../editor/extensions/SoftGeometry2D';
import { parseMatrixBlockConfig } from '../editor/extensions/SoftMatrixBlock';
import { parseProbabilityTreeConfig } from '../editor/extensions/SoftProbabilityTree';
import { parseSurface3DConfig } from '../editor/extensions/SoftSurface3D';
import { parseVariationTableConfig } from '../editor/extensions/SoftVariationTable';
import { useSoftMathUi } from '../contexts/SoftMathUiContext';
import { stripExamSolutionsFromMarkdown } from '../services/examModeService';
import { renderKatexWithMacros } from '../services/katexMacrosService';
import { matrixBlockConfigToLatex } from '../services/matrixService';

interface MathMarkdownPreviewProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
  respectExamMode?: boolean;
}

type BlockNode =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'mathBlock'; latex: string; pending?: boolean }
  | { type: 'codeBlock'; lang: string; code: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'blockquote'; text: string }
  | {
      type: 'academicBlock';
      kind: 'definition' | 'theorem' | 'proof' | 'example' | 'exercise';
      title: string;
      body: string;
    };

const ACADEMIC_LABELS: Record<
  'definition' | 'theorem' | 'proof' | 'example' | 'exercise',
  { label: string; border: string; bg: string; badge: string }
> = {
  definition: {
    label: 'Définition',
    border: 'border-sky-400/70 dark:border-sky-500/60',
    bg: 'bg-sky-50/70 dark:bg-sky-950/25',
    badge: 'text-sky-700 dark:text-sky-300',
  },
  theorem: {
    label: 'Théorème',
    border: 'border-indigo-400/70 dark:border-indigo-500/60',
    bg: 'bg-indigo-50/70 dark:bg-indigo-950/25',
    badge: 'text-indigo-700 dark:text-indigo-300',
  },
  proof: {
    label: 'Démonstration',
    border: 'border-stone-400/70 dark:border-zinc-500/60',
    bg: 'bg-stone-100/70 dark:bg-zinc-900/50',
    badge: 'text-stone-700 dark:text-zinc-300',
  },
  example: {
    label: 'Exemple',
    border: 'border-emerald-400/70 dark:border-emerald-500/60',
    bg: 'bg-emerald-50/70 dark:bg-emerald-950/25',
    badge: 'text-emerald-700 dark:text-emerald-300',
  },
  exercise: {
    label: 'Exercice',
    border: 'border-teal-400/70 dark:border-teal-500/60',
    bg: 'bg-teal-50/70 dark:bg-teal-950/25',
    badge: 'text-teal-700 dark:text-teal-300',
  },
};

function renderKatexHtml(latex: string, displayMode: boolean): string {
  try {
    return renderKatexWithMacros(latex.trim(), {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return '';
  }
}

function normalizeInlineMathDelimiters(text: string): string {
  return text
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => `$${inner}$`)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => `\n$$\n${inner.trim()}\n$$\n`);
}

function parseMarkdownBlocks(raw: string): BlockNode[] {
  const source = normalizeInlineMathDelimiters(raw).replace(/\r\n/g, '\n');
  const lines = source.split('\n');
  const blocks: BlockNode[] = [];

  let i = 0;
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join('\n').trim();
    paragraphLines = [];
    if (text) {
      blocks.push({ type: 'paragraph', text });
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      i += 1;
      continue;
    }

    // Fenced code block ```
    if (trimmed.startsWith('```')) {
      flushParagraph();
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: 'codeBlock', lang, code: codeLines.join('\n') });
      continue;
    }

    // Academic block :::definition{collapsed} Titre optionnel
    const academicMatch = trimmed.match(
      /^:::(definition|theorem|proof|example|exercise)(\{collapsed\})?(?:\s+(.+))?\s*$/,
    );
    if (academicMatch) {
      flushParagraph();
      const kind = academicMatch[1] as
        | 'definition'
        | 'theorem'
        | 'proof'
        | 'example'
        | 'exercise';
      const rawTitle = (academicMatch[3] ?? '').trim();
      const title = rawTitle || ACADEMIC_LABELS[kind].label;
      const bodyLines: string[] = [];
      let depth = 1;
      i += 1;
      while (i < lines.length) {
        const cur = lines[i].trim();
        if (/^:::(?:definition|theorem|proof|example|exercise)\b/.test(cur)) {
          depth += 1;
        } else if (cur === ':::') {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            break;
          }
        }
        bodyLines.push(lines[i]);
        i += 1;
      }
      blocks.push({
        type: 'academicBlock',
        kind,
        title,
        body: bodyLines.join('\n').trim(),
      });
      continue;
    }

    // Display math block single-line $$...$$ or multiline $$ ... $$
    if (trimmed.startsWith('$$')) {
      flushParagraph();
      const afterOpen = trimmed.slice(2);
      const singleLineEnd = afterOpen.indexOf('$$');
      if (singleLineEnd !== -1 && afterOpen.slice(singleLineEnd + 2).trim() === '') {
        blocks.push({
          type: 'mathBlock',
          latex: afterOpen.slice(0, singleLineEnd).trim(),
        });
        i += 1;
        continue;
      }

      const mathLines: string[] = [];
      if (afterOpen.trim()) {
        mathLines.push(afterOpen);
      }
      i += 1;
      let closed = false;
      while (i < lines.length) {
        const current = lines[i];
        const endIdx = current.indexOf('$$');
        if (endIdx !== -1) {
          const beforeEnd = current.slice(0, endIdx);
          if (beforeEnd.trim()) mathLines.push(beforeEnd);
          closed = true;
          i += 1;
          break;
        }
        mathLines.push(current);
        i += 1;
      }
      blocks.push({
        type: 'mathBlock',
        latex: mathLines.join('\n').trim(),
        pending: !closed,
      });
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      i += 1;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    // Unordered or ordered list
    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (bulletMatch || orderedMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];
      while (i < lines.length) {
        const curTrimmed = lines[i].trim();
        const m = ordered
          ? curTrimmed.match(/^\d+[.)]\s+(.+)$/)
          : curTrimmed.match(/^[-*+]\s+(.+)$/);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    paragraphLines.push(line);
    i += 1;
  }

  flushParagraph();
  return blocks;
}

function renderInlineSegments(text: string, keyPrefix: string): React.ReactNode[] {
  // Tokenize $$inline-or-display$$, $inline$, `code`, **bold**, *italic* cleanly
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let tokenIdx = 0;

  while (cursor < text.length) {
    // Check wiki-link [[target]] or [[target|label]]
    if (text.startsWith('[[', cursor) && (cursor === 0 || text[cursor - 1] !== '!')) {
      const end = text.indexOf(']]', cursor + 2);
      if (end !== -1 && end > cursor + 2) {
        const inner = text.slice(cursor + 2, end).trim();
        const pipeIdx = inner.indexOf('|');
        const target = (pipeIdx !== -1 ? inner.slice(0, pipeIdx) : inner).trim();
        const label = (pipeIdx !== -1 ? inner.slice(pipeIdx + 1) : target).trim();
        nodes.push(
          <span
            key={`${keyPrefix}-wl-${tokenIdx++}`}
            className="mx-0.5 inline-flex items-center rounded bg-indigo-500/12 px-1.5 py-0.5 text-[0.88em] font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
          >
            {label}
          </span>
        );
        cursor = end + 2;
        continue;
      }
    }

    // Check inline code `...`
    if (text[cursor] === '`') {
      const end = text.indexOf('`', cursor + 1);
      if (end !== -1) {
        const code = text.slice(cursor + 1, end);
        nodes.push(
          <code
            key={`${keyPrefix}-c-${tokenIdx++}`}
            className="rounded bg-stone-200/80 px-1 py-0.5 font-mono text-[0.85em] text-stone-800 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {code}
          </code>,
        );
        cursor = end + 1;
        continue;
      }
    }

    // Check inline math $...$ (ignoring escaped \$ and $$)
    if (
      text[cursor] === '$' &&
      text[cursor + 1] !== '$' &&
      (cursor === 0 || text[cursor - 1] !== '\\')
    ) {
      let end = cursor + 1;
      let found = -1;
      while (end < text.length) {
        if (text[end] === '$' && text[end - 1] !== '\\') {
          found = end;
          break;
        }
        end += 1;
      }
      if (found !== -1 && found > cursor + 1) {
        const latex = text.slice(cursor + 1, found);
        const html = renderKatexHtml(latex, false);
        nodes.push(
          <span
            key={`${keyPrefix}-m-${tokenIdx++}`}
            className="mx-0.5 inline-block align-baseline"
            dangerouslySetInnerHTML={{ __html: html }}
          />,
        );
        cursor = found + 1;
        continue;
      }
    }

    // Check **bold**
    if (text.startsWith('**', cursor)) {
      const end = text.indexOf('**', cursor + 2);
      if (end !== -1 && end > cursor + 2) {
        const inner = text.slice(cursor + 2, end);
        nodes.push(
          <strong key={`${keyPrefix}-b-${tokenIdx++}`} className="font-semibold">
            {renderInlineSegments(inner, `${keyPrefix}-b${tokenIdx}`)}
          </strong>,
        );
        cursor = end + 2;
        continue;
      }
    }

    // Check *italic* (single *)
    if (
      text[cursor] === '*' &&
      text[cursor + 1] !== '*' &&
      text[cursor + 1] !== ' '
    ) {
      const end = text.indexOf('*', cursor + 1);
      if (end !== -1 && end > cursor + 1 && text[end - 1] !== ' ') {
        const inner = text.slice(cursor + 1, end);
        nodes.push(
          <em key={`${keyPrefix}-i-${tokenIdx++}`} className="italic">
            {renderInlineSegments(inner, `${keyPrefix}-i${tokenIdx}`)}
          </em>,
        );
        cursor = end + 1;
        continue;
      }
    }

    // Consume plain text until next special token start
    let nextSpecial = cursor + 1;
    while (
      nextSpecial < text.length &&
      text[nextSpecial] !== '`' &&
      text[nextSpecial] !== '$' &&
      text[nextSpecial] !== '*' &&
      text[nextSpecial] !== '['
    ) {
      nextSpecial += 1;
    }

    const plain = text.slice(cursor, nextSpecial).replace(/\\\$/g, '$');
    nodes.push(<React.Fragment key={`${keyPrefix}-t-${tokenIdx++}`}>{plain}</React.Fragment>);
    cursor = nextSpecial;
  }

  return nodes;
}

export const MathMarkdownPreview: React.FC<MathMarkdownPreviewProps> = React.memo(
  ({ content, isStreaming = false, className = '', respectExamMode = false }) => {
    const { isExamMode, katexMacroVersion, autoNumbering } = useSoftMathUi();
    const effectiveContent = useMemo(
      () =>
        respectExamMode && isExamMode
          ? stripExamSolutionsFromMarkdown(content, {
              proofPlaceholder: '> *Démonstration masquée (Mode Examen).*',
            })
          : content,
      [content, respectExamMode, isExamMode]
    );
    const blocks = useMemo(() => parseMarkdownBlocks(effectiveContent), [effectiveContent]);
    void katexMacroVersion;

    if (!content.trim() && isStreaming) {
      return (
        <div className={`flex items-center gap-1.5 text-xs text-stone-400 dark:text-zinc-500 ${className}`}>
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
          <span>Réflexion en cours…</span>
        </div>
      );
    }

    return (
      <div
        data-auto-numbering={autoNumbering ? 'true' : 'false'}
        className={`space-y-2 text-[13px] leading-relaxed text-stone-800 dark:text-zinc-200 ${className}`}
      >
        {blocks.map((block, index) => {
          const key = `blk-${index}`;
          switch (block.type) {
            case 'heading': {
              const sizeClass =
                block.level === 1
                  ? 'text-base font-semibold mt-2'
                  : block.level === 2
                    ? 'text-sm font-semibold mt-1.5'
                    : 'text-[13px] font-semibold mt-1';
              return (
                <div key={key} className={`${sizeClass} text-stone-900 dark:text-zinc-100`}>
                  {renderInlineSegments(block.text, key)}
                </div>
              );
            }

            case 'mathBlock': {
              if (block.pending && isStreaming && !block.latex) {
                return (
                  <div
                    key={key}
                    className="rounded-lg bg-stone-100 px-2.5 py-2 font-mono text-xs text-stone-500 dark:bg-zinc-900 dark:text-zinc-400"
                  >
                    $$ …
                  </div>
                );
              }
              const eqMeta = parseBlockMathMeta(block.latex);
              const html = renderKatexHtml(eqMeta.body, true);
              return (
                <div
                  key={key}
                  data-math-numbered={eqMeta.numbered ? 'true' : undefined}
                  className="flex items-center justify-between gap-2 overflow-x-auto rounded-lg bg-stone-50/90 px-2.5 py-1.5 text-stone-900 dark:bg-zinc-900/70 dark:text-zinc-100"
                >
                  <div
                    className="min-w-0 flex-1"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                  {eqMeta.numbered && (
                    <span className="softmath-eq-num shrink-0 font-serif text-xs text-stone-500 dark:text-zinc-400" />
                  )}
                </div>
              );
            }

            case 'codeBlock':
              if (block.lang === 'softmath-variation') {
                const parsedTable = parseVariationTableConfig(block.code);
                return (
                  <div
                    key={key}
                    className="overflow-hidden rounded-lg border border-stone-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    {parsedTable.title && (
                      <div className="mb-1.5 text-[11px] font-semibold text-stone-700 dark:text-zinc-200">
                        {parsedTable.title}
                      </div>
                    )}
                    <VariationTableCanvas config={parsedTable} />
                  </div>
                );
              }
              if (block.lang === 'softmath-matrix') {
                const parsedMatrix = parseMatrixBlockConfig(block.code);
                const html = renderKatexHtml(matrixBlockConfigToLatex(parsedMatrix), true);
                return (
                  <div
                    key={key}
                    className="overflow-x-auto rounded-lg border border-stone-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    {parsedMatrix.title && (
                      <div className="mb-1 text-[11px] font-semibold text-stone-700 dark:text-zinc-200">
                        {parsedMatrix.title}
                      </div>
                    )}
                    <div dangerouslySetInnerHTML={{ __html: html }} />
                  </div>
                );
              }
              if (block.lang === 'softmath-proba') {
                const parsedTree = parseProbabilityTreeConfig(block.code);
                return (
                  <div
                    key={key}
                    className="overflow-hidden rounded-lg border border-stone-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    {parsedTree.title && (
                      <div className="mb-1.5 text-[11px] font-semibold text-stone-700 dark:text-zinc-200">
                        {parsedTree.title}
                      </div>
                    )}
                    <ProbabilityTreeCanvas config={parsedTree} />
                  </div>
                );
              }
              if (block.lang === 'softmath-3d') {
                const parsed3d = parseSurface3DConfig(block.code);
                return (
                  <div
                    key={key}
                    className="overflow-hidden rounded-lg border border-stone-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    {parsed3d.title && (
                      <div className="mb-1 text-[11px] font-semibold text-stone-700 dark:text-zinc-200">
                        {parsed3d.title}
                      </div>
                    )}
                    <Surface3DCanvas config={parsed3d} />
                  </div>
                );
              }
              if (block.lang === 'softmath-geometry') {
                const parsedGeo = parseGeometry2DConfig(block.code);
                return (
                  <div
                    key={key}
                    className="overflow-hidden rounded-lg border border-stone-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    {parsedGeo.title && (
                      <div className="mb-1 text-[11px] font-semibold text-stone-700 dark:text-zinc-200">
                        {parsedGeo.title}
                      </div>
                    )}
                    <Geometry2DCanvas config={parsedGeo} />
                  </div>
                );
              }
              return (
                <pre
                  key={key}
                  className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-900 px-3 py-2 font-mono text-xs text-stone-100 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <code>{block.code}</code>
                </pre>
              );

            case 'blockquote':
              return (
                <blockquote
                  key={key}
                  className="border-l-2 border-indigo-400/70 pl-2.5 text-stone-600 italic dark:border-indigo-500/60 dark:text-zinc-400"
                >
                  {renderInlineSegments(block.text, key)}
                </blockquote>
              );

            case 'list': {
              const ListTag = block.ordered ? 'ol' : 'ul';
              return (
                <ListTag
                  key={key}
                  className={`space-y-1 pl-4 ${block.ordered ? 'list-decimal' : 'list-disc'}`}
                >
                  {block.items.map((item, itemIdx) => (
                    <li key={`${key}-li-${itemIdx}`}>
                      {renderInlineSegments(item, `${key}-li-${itemIdx}`)}
                    </li>
                  ))}
                </ListTag>
              );
            }

            case 'academicBlock': {
              const style = ACADEMIC_LABELS[block.kind];
              return (
                <div
                  key={key}
                  className={`rounded-lg border-l-2 px-3 py-2 ${style.border} ${style.bg}`}
                >
                  <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${style.badge}`}>
                    {block.title}
                  </div>
                  <MathMarkdownPreview content={block.body} isStreaming={isStreaming} />
                </div>
              );
            }

            case 'paragraph':
            default:
              return (
                <p key={key} className="whitespace-pre-wrap">
                  {renderInlineSegments(block.text, key)}
                </p>
              );
          }
        })}

        {isStreaming && (
          <span
            aria-hidden="true"
            className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-xs bg-indigo-500 align-middle"
          />
        )}
      </div>
    );
  },
);

MathMarkdownPreview.displayName = 'MathMarkdownPreview';
