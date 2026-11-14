import { useId } from 'react';
import katex from 'katex';
import type {
  VariationArrowKind,
  VariationBoundaryPos,
  VariationBoundaryValue,
  VariationCurveRow,
  VariationTableConfig,
} from '../extensions/SoftVariationTable';

export function renderVariationKatex(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    return katex.renderToString(trimmed, {
      displayMode: false,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return trimmed;
  }
}

type ResolvedPos = 'top' | 'mid' | 'bottom';

const POS_PERCENT: Record<ResolvedPos, string> = {
  top: '20%',
  mid: '50%',
  bottom: '80%',
};

const POS_FLEX_CLASS: Record<ResolvedPos, string> = {
  top: 'items-start pt-2',
  mid: 'items-center',
  bottom: 'items-end pb-2',
};

function resolveSinglePos(
  arrows: VariationArrowKind[],
  idx: number,
  explicit?: VariationBoundaryPos
): ResolvedPos {
  if (explicit === 'top' || explicit === 'mid' || explicit === 'bottom') {
    return explicit;
  }
  const leftArrow = idx > 0 ? arrows[idx - 1] : undefined;
  const rightArrow = idx < arrows.length ? arrows[idx] : undefined;
  const leftActive = leftArrow && leftArrow !== 'forbidden' ? leftArrow : undefined;
  const rightActive = rightArrow && rightArrow !== 'forbidden' ? rightArrow : undefined;

  if (leftActive === 'up' && rightActive === 'down') return 'top';
  if (leftActive === 'down' && rightActive === 'up') return 'bottom';
  if (leftActive === 'up' && rightActive === 'up') return 'mid';
  if (leftActive === 'down' && rightActive === 'down') return 'mid';

  if (!rightActive) {
    if (leftActive === 'up') return 'top';
    if (leftActive === 'down') return 'bottom';
    return 'mid';
  }
  if (!leftActive) {
    if (rightActive === 'up') return 'bottom';
    if (rightActive === 'down') return 'top';
    return 'mid';
  }
  if (leftActive === 'up' || rightActive === 'down') return 'top';
  if (leftActive === 'down' || rightActive === 'up') return 'bottom';
  return 'mid';
}

function resolveSidePos(
  arrow: VariationArrowKind | undefined,
  side: 'left' | 'right',
  explicit?: VariationBoundaryPos
): ResolvedPos {
  if (explicit === 'top' || explicit === 'mid' || explicit === 'bottom') {
    return explicit;
  }
  if (!arrow || arrow === 'forbidden' || arrow === 'flat') {
    return 'mid';
  }
  if (side === 'left') {
    return arrow === 'up' ? 'top' : 'bottom';
  }
  return arrow === 'up' ? 'bottom' : 'top';
}

function computeEndpointPositions(
  row: VariationCurveRow,
  idx: number
): { startPos: ResolvedPos; endPos: ResolvedPos } {
  const val = row.values[idx] ?? { value: '' };
  if (val.doubleBar) {
    return {
      startPos: resolveSidePos(row.arrows[idx - 1], 'left', val.leftPosition),
      endPos: resolveSidePos(row.arrows[idx], 'right', val.rightPosition),
    };
  }
  const single = resolveSinglePos(row.arrows, idx, val.position);
  return { startPos: single, endPos: single };
}

interface VariationTableCanvasProps {
  config: VariationTableConfig;
  interactive?: boolean;
  onSelectX?: (idx: number) => void;
  onSelectRowLabel?: (rowId: string) => void;
  onCycleSignCell?: (rowId: string, intervalIdx: number) => void;
  onCycleSignMarker?: (rowId: string, boundaryIdx: number) => void;
  onCycleArrow?: (rowId: string, intervalIdx: number) => void;
  onSelectBoundaryValue?: (rowId: string, boundaryIdx: number) => void;
}

function KatexCellText({
  value,
  placeholder = '·',
  className = '',
}: {
  value: string;
  placeholder?: string;
  className?: string;
}) {
  const html = renderVariationKatex(value);
  if (!html) {
    return (
      <span className={`text-[11px] text-stone-300 dark:text-zinc-600 ${className}`}>
        {placeholder}
      </span>
    );
  }
  return (
    <span
      className={`inline-block leading-none [&_.katex]:text-[0.95em] ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function VariationTableCanvas({
  config,
  interactive = false,
  onSelectX,
  onSelectRowLabel,
  onCycleSignCell,
  onCycleSignMarker,
  onCycleArrow,
  onSelectBoundaryValue,
}: VariationTableCanvasProps) {
  const rawUid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const arrowMarkerId = `var-arrow-${rawUid}`;
  const hatchPatternId = `var-hatch-${rawUid}`;

  const xCount = config.xValues.length;
  // Colonnes CSS Grid : [Etiquette] + x0 + interval0 + x1 + ... + x_{n-1}
  const trackParts: string[] = ['minmax(78px, auto)'];
  for (let i = 0; i < xCount; i += 1) {
    trackParts.push('minmax(54px, auto)');
    if (i < xCount - 1) {
      trackParts.push('minmax(64px, 1fr)');
    }
  }
  const gridTemplateColumns = trackParts.join(' ');

  return (
    <div className="w-full overflow-x-auto">
      <div
        className="grid min-w-fit border border-stone-300 bg-white text-stone-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 print:border-stone-500 print:bg-white print:text-stone-900"
        style={{ gridTemplateColumns }}
      >
        {/* Ligne d'en-tête x */}
        <div
          onClick={interactive ? () => onSelectRowLabel?.('__var__') : undefined}
          title={interactive ? 'Cliquer pour modifier la variable' : undefined}
          className={`flex items-center justify-center border-b border-r border-stone-300 bg-stone-50/80 px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900/60 print:border-stone-500 print:bg-stone-50 ${
            interactive ? 'cursor-pointer hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30' : ''
          }`}
        >
          <KatexCellText value={config.variable || 'x'} />
        </div>

        {config.xValues.map((xVal, idx) => (
          <div key={`xh-${idx}`} className="contents">
            <div
              onClick={interactive ? () => onSelectX?.(idx) : undefined}
              title={interactive ? 'Cliquer pour modifier cette borne x' : undefined}
              className={`flex items-center justify-center border-b border-stone-300 bg-stone-50/80 px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/60 print:border-stone-500 print:bg-stone-50 ${
                interactive
                  ? 'cursor-pointer transition-colors hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40'
                  : ''
              }`}
            >
              <KatexCellText value={xVal} placeholder="x" />
            </div>
            {idx < xCount - 1 && (
              <div className="border-b border-stone-300 bg-stone-50/80 dark:border-zinc-700 dark:bg-zinc-900/60 print:border-stone-500 print:bg-stone-50" />
            )}
          </div>
        ))}

        {/* Lignes de signes et de variations */}
        {config.rows.map((row, rowIdx) => {
          const isLastRow = rowIdx === config.rows.length - 1;
          const borderBottom = isLastRow ? '' : 'border-b border-stone-300 dark:border-zinc-700 print:border-stone-500';

          if (row.kind === 'sign') {
            return (
              <div key={row.id} className="contents">
                <div
                  onClick={interactive ? () => onSelectRowLabel?.(row.id) : undefined}
                  title={interactive ? 'Cliquer pour renommer cette ligne de signe' : undefined}
                  className={`flex items-center justify-center border-r border-stone-300 px-3 py-2.5 text-sm dark:border-zinc-700 print:border-stone-500 ${borderBottom} ${
                    interactive
                      ? 'cursor-pointer hover:bg-stone-100/80 dark:hover:bg-zinc-900/80'
                      : ''
                  }`}
                >
                  <KatexCellText value={row.label} placeholder="signe" />
                </div>

                {config.xValues.map((_, colIdx) => {
                  const marker = row.markers[colIdx] ?? '';
                  const sign = colIdx < xCount - 1 ? row.signs[colIdx] ?? '' : '';
                  const isEdge = colIdx === 0 || colIdx === xCount - 1;

                  return (
                    <div key={`${row.id}-c-${colIdx}`} className="contents">
                      {/* Borne : barre pointillée, 0, ou || */}
                      <div
                        onClick={
                          interactive
                            ? () => onCycleSignMarker?.(row.id, colIdx)
                            : undefined
                        }
                        title={
                          interactive
                            ? 'Cliquer pour alterner : vide / 0 / ||'
                            : undefined
                        }
                        className={`relative flex min-h-[38px] items-center justify-center ${borderBottom} ${
                          interactive
                            ? 'cursor-pointer select-none hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30'
                            : ''
                        }`}
                      >
                        {marker === '0' ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 border-l border-dashed border-stone-300 dark:border-zinc-700 print:border-stone-400"
                            />
                            <span className="relative z-10 rounded bg-white px-1 text-xs font-semibold text-stone-800 dark:bg-zinc-950 dark:text-zinc-100 print:bg-white print:text-stone-900">
                              0
                            </span>
                          </>
                        ) : marker === '||' ? (
                          <span
                            aria-label="Valeur interdite"
                            className="h-full w-1.5 border-x border-stone-600 dark:border-zinc-300 print:border-stone-800"
                          />
                        ) : !isEdge ? (
                          <span
                            aria-hidden="true"
                            className="h-full border-l border-dashed border-stone-300 dark:border-zinc-700 print:border-stone-400"
                          />
                        ) : null}
                      </div>

                      {/* Intervalle : signe +, -, ou vide */}
                      {colIdx < xCount - 1 && (
                        <div
                          onClick={
                            interactive
                              ? () => onCycleSignCell?.(row.id, colIdx)
                              : undefined
                          }
                          title={
                            interactive
                              ? 'Cliquer pour alterner : + / − / vide'
                              : undefined
                          }
                          className={`flex min-h-[38px] items-center justify-center text-sm font-medium ${borderBottom} ${
                            interactive
                              ? 'cursor-pointer select-none hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30'
                              : ''
                          }`}
                        >
                          {sign === '+' ? (
                            <span className="text-emerald-700 dark:text-emerald-400 print:text-stone-900">
                              +
                            </span>
                          ) : sign === '-' ? (
                            <span className="text-rose-700 dark:text-rose-400 print:text-stone-900">
                              −
                            </span>
                          ) : sign === '0' ? (
                            <span>0</span>
                          ) : (
                            <span className="text-[10px] text-stone-300 print:hidden dark:text-zinc-700">
                              ·
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }

          // Ligne de variations (flèches diagonales + bornes haut/milieu/bas)
          const endpoints = config.xValues.map((_, i) =>
            computeEndpointPositions(row, i)
          );

          return (
            <div key={row.id} className="contents">
              <div
                onClick={interactive ? () => onSelectRowLabel?.(row.id) : undefined}
                title={
                  interactive
                    ? 'Cliquer pour renommer cette ligne de variations'
                    : undefined
                }
                className={`flex items-center justify-center border-r border-stone-300 px-3 py-3 text-sm dark:border-zinc-700 print:border-stone-500 ${borderBottom} ${
                  interactive
                    ? 'cursor-pointer hover:bg-stone-100/80 dark:hover:bg-zinc-900/80'
                    : ''
                }`}
              >
                <KatexCellText value={row.label} placeholder="f(x)" />
              </div>

              {config.xValues.map((_, colIdx) => {
                const val: VariationBoundaryValue = row.values[colIdx] ?? {
                  value: '',
                };
                const { startPos, endPos } = endpoints[colIdx];
                const arrow =
                  colIdx < xCount - 1 ? row.arrows[colIdx] ?? 'up' : null;
                const nextStartPos =
                  colIdx < xCount - 1
                    ? endpoints[colIdx + 1]?.startPos ?? 'mid'
                    : 'mid';

                const y1 =
                  arrow === 'flat' ? POS_PERCENT.mid : POS_PERCENT[endPos];
                const y2 =
                  arrow === 'flat' ? POS_PERCENT.mid : POS_PERCENT[nextStartPos];

                return (
                  <div key={`${row.id}-v-${colIdx}`} className="contents">
                    {/* Valeur à la borne x_i (simple ou double barre || avec limites G/D) */}
                    <div
                      onClick={
                        interactive
                          ? () => onSelectBoundaryValue?.(row.id, colIdx)
                          : undefined
                      }
                      title={
                        interactive
                          ? 'Cliquer pour éditer cette valeur (ou activer ||)'
                          : undefined
                      }
                      className={`relative flex h-[104px] justify-center px-1.5 ${borderBottom} ${
                        interactive
                          ? 'cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30'
                          : ''
                      }`}
                    >
                      {val.doubleBar ? (
                        <div className="flex h-full w-full items-stretch justify-center gap-1">
                          <div
                            className={`flex flex-1 justify-end text-xs ${POS_FLEX_CLASS[startPos]}`}
                          >
                            <KatexCellText value={val.leftValue ?? ''} placeholder="" />
                          </div>
                          <span className="h-full w-1.5 shrink-0 border-x border-stone-600 dark:border-zinc-300 print:border-stone-800" />
                          <div
                            className={`flex flex-1 justify-start text-xs ${POS_FLEX_CLASS[endPos]}`}
                          >
                            <KatexCellText value={val.rightValue ?? ''} placeholder="" />
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`flex h-full justify-center text-xs ${POS_FLEX_CLASS[startPos]}`}
                        >
                          <KatexCellText value={val.value} />
                        </div>
                      )}
                    </div>

                    {/* Flèche de variation dans l'intervalle (x_i, x_{i+1}) */}
                    {colIdx < xCount - 1 && arrow && (
                      <div
                        onClick={
                          interactive
                            ? () => onCycleArrow?.(row.id, colIdx)
                            : undefined
                        }
                        title={
                          interactive
                            ? 'Cliquer pour alterner : ↗ Croissant / ↘ Décroissant / → Constant / ▒ Hors domaine'
                            : undefined
                        }
                        className={`relative h-[104px] ${borderBottom} ${
                          interactive
                            ? 'cursor-pointer hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20'
                            : ''
                        }`}
                      >
                        {arrow === 'forbidden' ? (
                          <svg className="h-full w-full text-stone-300 dark:text-zinc-700 print:text-stone-400">
                            <defs>
                              <pattern
                                id={`${hatchPatternId}-${rowIdx}-${colIdx}`}
                                width="8"
                                height="8"
                                patternTransform="rotate(45 0 0)"
                                patternUnits="userSpaceOnUse"
                              >
                                <line
                                  x1="0"
                                  y1="0"
                                  x2="0"
                                  y2="8"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                />
                              </pattern>
                            </defs>
                            <rect
                              width="100%"
                              height="100%"
                              fill={`url(#${hatchPatternId}-${rowIdx}-${colIdx})`}
                            />
                          </svg>
                        ) : (
                          <svg className="h-full w-full overflow-visible text-stone-700 dark:text-zinc-200 print:text-stone-900">
                            <defs>
                              <marker
                                id={`${arrowMarkerId}-${rowIdx}-${colIdx}`}
                                markerWidth="9"
                                markerHeight="9"
                                refX="7"
                                refY="4.5"
                                orient="auto"
                                markerUnits="userSpaceOnUse"
                              >
                                <path
                                  d="M 1 1 L 8 4.5 L 1 8 Z"
                                  fill="currentColor"
                                />
                              </marker>
                            </defs>
                            <line
                              x1="8%"
                              y1={y1}
                              x2="92%"
                              y2={y2}
                              stroke="currentColor"
                              strokeWidth="1.7"
                              strokeLinecap="round"
                              markerEnd={`url(#${arrowMarkerId}-${rowIdx}-${colIdx})`}
                            />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

