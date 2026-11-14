import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Grid,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSoftMathUi } from '../../contexts/SoftMathUiContext';
import { renderKatexWithMacros } from '../../services/katexMacrosService';
import {
  matrixBlockConfigToLatex,
  matrixDeterminant,
  matrixInverse,
  matrixRref,
  matrixTrace,
  matrixTranspose,
  parseCellToRational,
  parseEntriesMatrix,
  rationalMatrixToLatex,
  rationalToLatex,
  solveLinearSystem,
  solutionToLatex,
  type MatrixBlockConfig,
  type MatrixDelimiter,
} from '../../services/matrixService';
import {
  createPresetMatrixConfig,
  normalizeMatrixBlockConfig,
  parseMatrixBlockConfig,
  serializeMatrixBlockConfig,
  type MatrixPresetId,
} from '../extensions/SoftMatrixBlock';

export function MatrixBlockView({
  node,
  selected,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const { katexMacroVersion } = useSoftMathUi();
  const [copiedLatex, setCopiedLatex] = useState(false);

  const config = useMemo(
    () => parseMatrixBlockConfig(String(node.attrs.spec ?? '')),
    [node.attrs.spec]
  );

  const commitConfig = (next: MatrixBlockConfig) => {
    updateAttributes({ spec: serializeMatrixBlockConfig(next) });
  };

  const parsedMatrix = useMemo(
    () => parseEntriesMatrix(config.entries, config.rows, config.cols),
    [config.entries, config.rows, config.cols]
  );

  const parsedRhs = useMemo(() => {
    if (config.mode !== 'system') return null;
    const out = [];
    for (let r = 0; r < config.rows; r += 1) {
      const parsed = parseCellToRational(config.rhs[r] ?? '0');
      if (!parsed) return null;
      out.push(parsed);
    }
    return out;
  }, [config.mode, config.rows, config.rhs]);

  const analysis = useMemo(() => {
    if (!parsedMatrix) return null;
    const isSquare = config.rows === config.cols;
    const rrefInfo = matrixRref(parsedMatrix);
    const det = isSquare ? matrixDeterminant(parsedMatrix) : null;
    const trace = isSquare ? matrixTrace(parsedMatrix) : null;
    const transpose = matrixTranspose(parsedMatrix);
    const inverse =
      config.mode === 'matrix' && isSquare ? matrixInverse(parsedMatrix) : null;
    const linearSystem =
      config.mode === 'system' && parsedRhs
        ? solveLinearSystem(parsedMatrix, parsedRhs)
        : null;

    return {
      isSquare,
      rrefInfo,
      det,
      trace,
      transpose,
      inverse,
      linearSystem,
    };
  }, [parsedMatrix, parsedRhs, config.rows, config.cols, config.mode]);

  const mainLatex = useMemo(() => matrixBlockConfigToLatex(config), [config]);
  const mainKatexHtml = useMemo(
    () =>
      renderKatexWithMacros(mainLatex, {
        displayMode: true,
        throwOnError: false,
      }),
    [mainLatex, katexMacroVersion]
  );

  const stepsToRender =
    config.mode === 'system' && analysis?.linearSystem
      ? analysis.linearSystem.steps
      : analysis?.inverse && config.mode === 'matrix'
        ? analysis.inverse.steps
        : analysis?.rrefInfo.steps ?? [];

  const updateCell = (r: number, c: number, val: string) => {
    const nextEntries = config.entries.map((row, rIdx) =>
      rIdx === r ? row.map((cell, cIdx) => (cIdx === c ? val : cell)) : row
    );
    commitConfig({ ...config, entries: nextEntries });
  };

  const updateRhs = (r: number, val: string) => {
    const nextRhs = config.rhs.map((cell, rIdx) => (rIdx === r ? val : cell));
    commitConfig({ ...config, rhs: nextRhs });
  };

  const resizeMatrix = (rows: number, cols: number) => {
    commitConfig(normalizeMatrixBlockConfig({ ...config, rows, cols }));
  };

  const handleCopyLatex = async () => {
    try {
      await navigator.clipboard.writeText(mainLatex);
      setCopiedLatex(true);
      setTimeout(() => setCopiedLatex(false), 1600);
    } catch {
      // clipboard blocked
    }
  };

  const handleInsertResultBelow = () => {
    if (!analysis || !editor) return;
    const parts: string[] = [];
    if (config.mode === 'system' && analysis.linearSystem) {
      parts.push(solutionToLatex(analysis.linearSystem));
    } else if (analysis.inverse?.invertible && analysis.inverse.inverse) {
      parts.push(
        `A^{-1} = ${rationalMatrixToLatex(analysis.inverse.inverse, config.delimiter)}`
      );
    } else if (analysis.det !== null) {
      parts.push(`\\det(A) = ${rationalToLatex(analysis.det)}`);
    }
    if (parts.length === 0) return;

    const pos = typeof getPos === 'function' ? getPos() : undefined;
    if (typeof pos === 'number') {
      const insertAt = pos + node.nodeSize;
      editor
        .chain()
        .focus()
        .insertContentAt(insertAt, {
          type: 'blockMath',
          attrs: { latex: parts.join(' \\\\ ') },
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
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b border-stone-200/80 bg-stone-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60 print:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-500/15 text-violet-600 dark:text-violet-300">
            <Grid className="h-3.5 w-3.5" />
          </span>
          <input
            type="text"
            value={config.title}
            onChange={(e) => commitConfig({ ...config, title: e.target.value })}
            placeholder="Titre de la matrice..."
            className="w-44 bg-transparent text-xs font-semibold text-stone-800 focus:outline-none dark:text-zinc-100"
          />
          <select
            value={config.mode}
            onChange={(e) =>
              commitConfig({
                ...config,
                mode: e.target.value as MatrixBlockConfig['mode'],
              })
            }
            className="rounded border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value="matrix">Matrice A</option>
            <option value="system">Système AX = B</option>
          </select>

          <select
            value={config.delimiter}
            onChange={(e) =>
              commitConfig({
                ...config,
                delimiter: e.target.value as MatrixDelimiter,
              })
            }
            title="Délimiteurs LaTeX"
            className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] text-stone-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="pmatrix">( … )</option>
            <option value="bmatrix">[ … ]</option>
            <option value="vmatrix">| … |</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Dimensions */}
          <label className="flex items-center gap-1 text-[11px] text-stone-500 dark:text-zinc-400">
            <span>L:</span>
            <select
              value={config.rows}
              onChange={(e) => resizeMatrix(Number(e.target.value), config.cols)}
              className="rounded border border-stone-200 bg-white px-1 py-0.5 text-[11px] text-stone-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-[11px] text-stone-500 dark:text-zinc-400">
            <span>C:</span>
            <select
              value={config.cols}
              onChange={(e) => resizeMatrix(config.rows, Number(e.target.value))}
              className="rounded border border-stone-200 bg-white px-1 py-0.5 text-[11px] text-stone-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          {/* Presets */}
          <select
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              commitConfig(createPresetMatrixConfig(e.target.value as MatrixPresetId));
              e.target.value = '';
            }}
            className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] text-stone-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="">Modèle…</option>
            <option value="system-3x3">Système 3×3</option>
            <option value="invertible-2x2">Carrée 2×2</option>
            <option value="identity-3x3">Identité I₃</option>
            <option value="singular-3x3">Singulière 3×3</option>
          </select>

          <button
            type="button"
            onClick={handleCopyLatex}
            className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-2 py-0.5 text-[11px] text-stone-600 hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            title="Copier le code LaTeX"
          >
            {copiedLatex ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            LaTeX
          </button>

          <button
            type="button"
            onClick={deleteNode}
            className="rounded p-1 text-stone-400 hover:bg-rose-500/10 hover:text-rose-500"
            title="Supprimer cette matrice"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main grid + live preview */}
      <div className="grid grid-cols-1 gap-4 p-3.5 md:grid-cols-[auto_1fr]">
        {/* Interactive cells */}
        <div className="overflow-x-auto print:hidden">
          <div className="inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50/70 p-2 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex flex-col gap-1.5">
              {Array.from({ length: config.rows }, (_, r) => (
                <div key={`mr-${r}`} className="flex items-center gap-1.5">
                  {Array.from({ length: config.cols }, (__, c) => (
                    <input
                      key={`mc-${r}-${c}`}
                      type="text"
                      value={config.entries[r]?.[c] ?? '0'}
                      onChange={(e) => updateCell(r, c, e.target.value)}
                      aria-label={`Coefficient ligne ${r + 1} colonne ${c + 1}`}
                      className="h-8 w-14 rounded border border-stone-200 bg-white px-1.5 text-center font-mono text-xs text-stone-800 focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  ))}
                  {config.mode === 'system' && (
                    <>
                      <span className="mx-0.5 text-xs font-bold text-stone-400">|</span>
                      <input
                        type="text"
                        value={config.rhs[r] ?? '0'}
                        onChange={(e) => updateRhs(r, e.target.value)}
                        aria-label={`Second membre ligne ${r + 1}`}
                        className="h-8 w-14 rounded border border-indigo-200 bg-indigo-50/40 px-1.5 text-center font-mono text-xs text-indigo-800 focus:border-indigo-500 focus:outline-none dark:border-indigo-800/70 dark:bg-indigo-950/30 dark:text-indigo-200"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-stone-400 dark:text-zinc-500">
            Fractions exactes supportées (ex : <code>-3/4</code>, <code>1.5</code>)
          </p>
        </div>

        {/* Rendered KaTeX matrix */}
        <div className="flex flex-col justify-center overflow-x-auto rounded-lg border border-stone-100 bg-stone-50/40 px-4 py-2 dark:border-zinc-800/70 dark:bg-zinc-950/30 print:border-0 print:bg-transparent">
          {config.title && (
            <div className="mb-1 text-center text-[11px] font-medium text-stone-500 dark:text-zinc-400">
              {config.title}
            </div>
          )}
          <div
            className="text-stone-900 dark:text-zinc-100"
            dangerouslySetInnerHTML={{ __html: mainKatexHtml }}
          />
        </div>
      </div>

      {/* Exact algebraic computation summary */}
      {analysis && (
        <div className="border-t border-stone-200/80 bg-stone-50/50 px-3.5 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-950/40 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded bg-stone-200/70 px-2 py-0.5 text-[11px] font-medium text-stone-700 dark:bg-zinc-800 dark:text-zinc-300">
                Rang : {analysis.rrefInfo.rank}
              </span>
              {analysis.det !== null && (
                <span className="inline-flex items-center gap-1 rounded bg-stone-200/70 px-2 py-0.5 text-[11px] text-stone-700 dark:bg-zinc-800 dark:text-zinc-200">
                  <span>det =</span>
                  <span
                    dangerouslySetInnerHTML={{
                      __html: renderKatexWithMacros(rationalToLatex(analysis.det), {
                        displayMode: false,
                      }),
                    }}
                  />
                </span>
              )}
              {analysis.trace !== null && (
                <span className="inline-flex items-center gap-1 rounded bg-stone-200/70 px-2 py-0.5 text-[11px] text-stone-700 dark:bg-zinc-800 dark:text-zinc-200">
                  <span>tr =</span>
                  <span
                    dangerouslySetInnerHTML={{
                      __html: renderKatexWithMacros(rationalToLatex(analysis.trace), {
                        displayMode: false,
                      }),
                    }}
                  />
                </span>
              )}
              {config.mode === 'matrix' && analysis.isSquare && analysis.inverse && (
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                    analysis.inverse.invertible
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {analysis.inverse.invertible ? 'Inversible' : 'Non inversible (det = 0)'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleInsertResultBelow}
                className="inline-flex items-center gap-1 rounded border border-indigo-300/70 bg-indigo-500/10 px-2 py-0.5 text-[11px] font-medium text-indigo-600 hover:bg-indigo-500/20 dark:border-indigo-500/40 dark:text-indigo-300"
              >
                <Plus className="h-3 w-3" />
                Insérer résultat en $$
              </button>
              <button
                type="button"
                onClick={() =>
                  commitConfig({ ...config, showSteps: !config.showSteps })
                }
                className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {config.showSteps ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                Pivot de Gauss ({Math.max(0, stepsToRender.length - 1)} étapes)
              </button>
            </div>
          </div>

          {/* Solution / Inverse display */}
          {config.mode === 'system' && analysis.linearSystem && (
            <div className="mt-2 flex items-center gap-2 overflow-x-auto rounded border border-indigo-200/70 bg-white px-3 py-1.5 dark:border-indigo-900/50 dark:bg-zinc-900">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
              <div
                dangerouslySetInnerHTML={{
                  __html: renderKatexWithMacros(solutionToLatex(analysis.linearSystem), {
                    displayMode: false,
                  }),
                }}
              />
            </div>
          )}

          {config.mode === 'matrix' &&
            analysis.inverse?.invertible &&
            analysis.inverse.inverse && (
              <div className="mt-2 flex items-center gap-3 overflow-x-auto rounded border border-emerald-200/70 bg-white px-3 py-1.5 dark:border-emerald-900/50 dark:bg-zinc-900">
                <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                  Inverse A⁻¹ :
                </span>
                <div
                  dangerouslySetInnerHTML={{
                    __html: renderKatexWithMacros(
                      rationalMatrixToLatex(analysis.inverse.inverse, config.delimiter),
                      { displayMode: false }
                    ),
                  }}
                />
              </div>
            )}

          {config.mode === 'matrix' && !analysis.isSquare && (
            <div className="mt-2 flex items-center gap-3 overflow-x-auto rounded border border-stone-200 bg-white px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-[11px] font-medium text-stone-600 dark:text-zinc-300">
                Transposée Aᵀ :
              </span>
              <div
                dangerouslySetInnerHTML={{
                  __html: renderKatexWithMacros(
                    rationalMatrixToLatex(analysis.transpose, config.delimiter),
                    { displayMode: false }
                  ),
                }}
              />
            </div>
          )}

          {/* Expandable Gauss-Jordan steps */}
          {config.showSteps && stepsToRender.length > 0 && (
            <div className="mt-2.5 space-y-2 rounded-lg border border-stone-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900">
              {stepsToRender.map((step, idx) => (
                <div
                  key={`step-${idx}`}
                  className="flex flex-wrap items-center gap-3 border-b border-stone-100 pb-2 last:border-b-0 last:pb-0 dark:border-zinc-800"
                >
                  <span className="min-w-[140px] rounded bg-stone-100 px-2 py-0.5 text-[11px] text-stone-700 dark:bg-zinc-800 dark:text-zinc-200">
                    <span className="mr-1 font-semibold text-indigo-500">
                      #{idx}
                    </span>
                    <span
                      dangerouslySetInnerHTML={{
                        __html: renderKatexWithMacros(step.operationLatex, {
                          displayMode: false,
                        }),
                      }}
                    />
                  </span>
                  <div
                    className="overflow-x-auto text-xs"
                    dangerouslySetInnerHTML={{
                      __html: renderKatexWithMacros(
                        rationalMatrixToLatex(
                          step.matrix,
                          config.delimiter,
                          config.mode === 'system' ||
                            (config.mode === 'matrix' && analysis.isSquare)
                            ? config.cols
                            : undefined
                        ),
                        { displayMode: false }
                      ),
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

