import { useCallback, useMemo, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  ArrowUpDown,
  Columns3,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  createPresetVariationConfig,
  parseVariationTableConfig,
  serializeVariationTableConfig,
  type VariationArrowKind,
  type VariationBoundaryPos,
  type VariationBoundaryValue,
  type VariationMarkerKind,
  type VariationPresetId,
  type VariationRow,
  type VariationSignKind,
  type VariationTableConfig,
} from '../extensions/SoftVariationTable';
import { VariationTableCanvas } from './VariationTableCanvas';

type ActiveTarget =
  | { kind: 'x'; idx: number }
  | { kind: 'var' }
  | { kind: 'rowLabel'; rowId: string }
  | { kind: 'boundary'; rowId: string; idx: number }
  | null;

const SIGN_CYCLE: VariationSignKind[] = ['+', '-', ''];
const MARKER_CYCLE: VariationMarkerKind[] = ['', '0', '||'];
const ARROW_CYCLE: VariationArrowKind[] = ['up', 'down', 'flat', 'forbidden'];

function nextInCycle<T>(list: readonly T[], current: T): T {
  const idx = list.indexOf(current);
  return list[(idx + 1) % list.length];
}

export function VariationTableBlockView({
  node,
  selected,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const config = useMemo(
    () => parseVariationTableConfig(String(node.attrs.spec ?? '')),
    [node.attrs.spec]
  );

  const [isConfigOpen, setIsConfigOpen] = useState(
    Boolean(node.attrs.autoConfigure)
  );
  const [activeTarget, setActiveTarget] = useState<ActiveTarget>(null);

  const commitConfig = useCallback(
    (next: VariationTableConfig) => {
      updateAttributes({
        spec: serializeVariationTableConfig(next),
        autoConfigure: false,
      });
    },
    [updateAttributes]
  );

  const applyPreset = (preset: VariationPresetId) => {
    setActiveTarget(null);
    commitConfig(createPresetVariationConfig(preset));
  };

  const handleCycleSignCell = (rowId: string, intervalIdx: number) => {
    commitConfig({
      ...config,
      rows: config.rows.map((row) => {
        if (row.id !== rowId || row.kind !== 'sign') return row;
        const signs = [...row.signs];
        signs[intervalIdx] = nextInCycle(SIGN_CYCLE, signs[intervalIdx] ?? '');
        return { ...row, signs };
      }),
    });
  };

  const handleCycleSignMarker = (rowId: string, boundaryIdx: number) => {
    commitConfig({
      ...config,
      rows: config.rows.map((row) => {
        if (row.id !== rowId || row.kind !== 'sign') return row;
        const markers = [...row.markers];
        markers[boundaryIdx] = nextInCycle(
          MARKER_CYCLE,
          markers[boundaryIdx] ?? ''
        );
        return { ...row, markers };
      }),
    });
  };

  const handleCycleArrow = (rowId: string, intervalIdx: number) => {
    commitConfig({
      ...config,
      rows: config.rows.map((row) => {
        if (row.id !== rowId || row.kind !== 'variation') return row;
        const arrows = [...row.arrows];
        arrows[intervalIdx] = nextInCycle(
          ARROW_CYCLE,
          arrows[intervalIdx] ?? 'up'
        );
        return { ...row, arrows };
      }),
    });
  };

  const addColumnBeforeEnd = () => {
    const insertAt = Math.max(1, config.xValues.length - 1);
    const nextXValues = [
      ...config.xValues.slice(0, insertAt),
      '0',
      ...config.xValues.slice(insertAt),
    ];
    const nextRows: VariationRow[] = config.rows.map((row) => {
      if (row.kind === 'sign') {
        return {
          ...row,
          markers: [
            ...row.markers.slice(0, insertAt),
            '0',
            ...row.markers.slice(insertAt),
          ],
          signs: [
            ...row.signs.slice(0, insertAt - 1),
            '+',
            ...row.signs.slice(insertAt - 1),
          ],
        };
      }
      return {
        ...row,
        values: [
          ...row.values.slice(0, insertAt),
          { value: '0' },
          ...row.values.slice(insertAt),
        ],
        arrows: [
          ...row.arrows.slice(0, insertAt - 1),
          'up',
          ...row.arrows.slice(insertAt - 1),
        ],
      };
    });
    commitConfig({ ...config, xValues: nextXValues, rows: nextRows });
    setActiveTarget({ kind: 'x', idx: insertAt });
  };

  const removeColumnAt = (idx: number) => {
    if (config.xValues.length <= 2) return;
    const intervalRemoveIdx = Math.min(idx, config.xValues.length - 2);
    const nextXValues = config.xValues.filter((_, i) => i !== idx);
    const nextRows: VariationRow[] = config.rows.map((row) => {
      if (row.kind === 'sign') {
        return {
          ...row,
          markers: row.markers.filter((_, i) => i !== idx),
          signs: row.signs.filter((_, i) => i !== intervalRemoveIdx),
        };
      }
      return {
        ...row,
        values: row.values.filter((_, i) => i !== idx),
        arrows: row.arrows.filter((_, i) => i !== intervalRemoveIdx),
      };
    });
    commitConfig({ ...config, xValues: nextXValues, rows: nextRows });
    setActiveTarget(null);
  };

  const addRow = (kind: 'sign' | 'variation') => {
    const uid = `row-${Date.now().toString(36).slice(-4)}`;
    const colCount = config.xValues.length;
    const intervalCount = colCount - 1;
    const newRow: VariationRow =
      kind === 'sign'
        ? {
            id: uid,
            kind: 'sign',
            label: "f'(x)",
            signs: Array.from({ length: intervalCount }, () => '+'),
            markers: Array.from({ length: colCount }, () => ''),
          }
        : {
            id: uid,
            kind: 'variation',
            label: 'f(x)',
            values: Array.from({ length: colCount }, () => ({ value: '' })),
            arrows: Array.from({ length: intervalCount }, () => 'up'),
          };
    commitConfig({ ...config, rows: [...config.rows, newRow] });
    setActiveTarget({ kind: 'rowLabel', rowId: uid });
  };

  const removeRow = (rowId: string) => {
    if (config.rows.length <= 1) return;
    commitConfig({
      ...config,
      rows: config.rows.filter((r) => r.id !== rowId),
    });
    setActiveTarget(null);
  };

  const updateBoundary = (
    rowId: string,
    idx: number,
    patch: Partial<VariationBoundaryValue>
  ) => {
    commitConfig({
      ...config,
      rows: config.rows.map((row) => {
        if (row.id !== rowId || row.kind !== 'variation') return row;
        const values = row.values.map((v, i) =>
          i === idx ? { ...v, ...patch } : v
        );
        return { ...row, values };
      }),
    });
  };

  const activeRow =
    activeTarget && 'rowId' in activeTarget
      ? config.rows.find((r) => r.id === activeTarget.rowId) ?? null
      : null;

  return (
    <NodeViewWrapper
      data-type="softmath-variation"
      className={`my-4 overflow-hidden rounded-xl border bg-white transition-shadow dark:bg-[#16161a] print:border-stone-400 print:shadow-none ${
        selected
          ? 'border-indigo-400 ring-2 ring-indigo-500/20 dark:border-indigo-500'
          : 'border-stone-200/90 shadow-2xs dark:border-zinc-800'
      }`}
    >
      {/* En-tête du tableau */}
      <div
        contentEditable={false}
        className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/70 bg-stone-50/70 px-3 py-2 dark:border-zinc-800/80 dark:bg-zinc-900/60 print:border-stone-300 print:bg-white"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400 print:hidden" />
          <input
            type="text"
            value={config.title}
            onChange={(e) => commitConfig({ ...config, title: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="Titre du tableau"
            placeholder="Titre du tableau (optionnel)"
            className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-stone-700 outline-none placeholder:text-stone-400 dark:text-zinc-200 dark:placeholder:text-zinc-600 print:text-stone-900"
          />
        </div>

        <div className="flex items-center gap-1 print:hidden">
          <button
            type="button"
            onClick={addColumnBeforeEnd}
            title="Ajouter une borne x intermédiaire"
            className="inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-stone-600 transition-colors hover:bg-stone-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Columns3 className="h-3 w-3" />
            <span>+ Borne</span>
          </button>

          <button
            type="button"
            onClick={() => addRow('sign')}
            title="Ajouter une ligne de signe"
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-stone-600 transition-colors hover:bg-stone-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3 w-3" />
            <span>Signe</span>
          </button>

          <button
            type="button"
            onClick={() => addRow('variation')}
            title="Ajouter une ligne de variations"
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-stone-600 transition-colors hover:bg-stone-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3 w-3" />
            <span>Var.</span>
          </button>

          <button
            type="button"
            onClick={() => setIsConfigOpen((prev) => !prev)}
            title="Modèles et structure du tableau"
            className={`inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors ${
              isConfigOpen
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                : 'text-stone-600 hover:bg-stone-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            <SlidersHorizontal className="h-3 w-3" />
            <span>Éditer</span>
          </button>

          <button
            type="button"
            onClick={deleteNode}
            title="Supprimer ce tableau"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-stone-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:text-zinc-500 dark:hover:bg-red-950/60 dark:hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Corps du tableau interactif */}
      <div contentEditable={false} className="p-3">
        <VariationTableCanvas
          config={config}
          interactive
          onSelectX={(idx) => setActiveTarget({ kind: 'x', idx })}
          onSelectRowLabel={(rowId) =>
            setActiveTarget(
              rowId === '__var__' ? { kind: 'var' } : { kind: 'rowLabel', rowId }
            )
          }
          onCycleSignCell={handleCycleSignCell}
          onCycleSignMarker={handleCycleSignMarker}
          onCycleArrow={handleCycleArrow}
          onSelectBoundaryValue={(rowId, idx) =>
            setActiveTarget({ kind: 'boundary', rowId, idx })
          }
        />

        <p className="mt-2 text-[10px] text-stone-400 print:hidden dark:text-zinc-500">
          Cliquez sur une borne/étiquette pour éditer (LaTeX accepté :{' '}
          <code>-\infty</code>, <code>\frac&#123;1&#125;&#123;2&#125;</code>), sur les signes/flèches pour alterner.
        </p>
      </div>

      {/* Éditeur contextuel de la cellule sélectionnée */}
      {activeTarget && (
        <div
          contentEditable={false}
          className="flex flex-wrap items-center gap-2 border-t border-indigo-200/70 bg-indigo-50/50 px-3 py-2 text-xs print:hidden dark:border-indigo-900/60 dark:bg-indigo-950/20"
        >
          {activeTarget.kind === 'var' && (
            <>
              <span className="font-medium text-indigo-700 dark:text-indigo-300">
                Variable :
              </span>
              <input
                type="text"
                value={config.variable}
                onChange={(e) =>
                  commitConfig({ ...config, variable: e.target.value })
                }
                onKeyDown={(e) => e.stopPropagation()}
                className="w-24 rounded border border-stone-200 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-950"
              />
            </>
          )}

          {activeTarget.kind === 'x' && (
            <>
              <span className="font-medium text-indigo-700 dark:text-indigo-300">
                Borne x{activeTarget.idx + 1} :
              </span>
              <input
                type="text"
                value={config.xValues[activeTarget.idx] ?? ''}
                onChange={(e) => {
                  const nextX = [...config.xValues];
                  nextX[activeTarget.idx] = e.target.value;
                  commitConfig({ ...config, xValues: nextX });
                }}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="-\\infty, 0, \\pi..."
                className="w-36 rounded border border-stone-200 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-950"
              />
              {config.xValues.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeColumnAt(activeTarget.idx)}
                  className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-zinc-950 dark:text-rose-400"
                >
                  <Trash2 className="h-3 w-3" />
                  Retirer cette borne
                </button>
              )}
            </>
          )}

          {activeTarget.kind === 'rowLabel' && activeRow && (
            <>
              <span className="font-medium text-indigo-700 dark:text-indigo-300">
                Étiquette :
              </span>
              <input
                type="text"
                value={activeRow.label}
                onChange={(e) =>
                  commitConfig({
                    ...config,
                    rows: config.rows.map((r) =>
                      r.id === activeRow.id ? { ...r, label: e.target.value } : r
                    ),
                  })
                }
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="f'(x), f(x)..."
                className="w-36 rounded border border-stone-200 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-950"
              />
              {config.rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(activeRow.id)}
                  className="inline-flex items-center gap-1 rounded border border-rose-200 bg-white px-2 py-1 text-[11px] text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-zinc-950 dark:text-rose-400"
                >
                  <Trash2 className="h-3 w-3" />
                  Supprimer la ligne
                </button>
              )}
            </>
          )}

          {activeTarget.kind === 'boundary' &&
            activeRow &&
            activeRow.kind === 'variation' &&
            (() => {
              const bVal = activeRow.values[activeTarget.idx] ?? { value: '' };
              const posOptions: { id: VariationBoundaryPos; label: string }[] = [
                { id: 'auto', label: 'Auto' },
                { id: 'top', label: 'Haut' },
                { id: 'mid', label: 'Milieu' },
                { id: 'bottom', label: 'Bas' },
              ];
              return (
                <>
                  <span className="font-medium text-indigo-700 dark:text-indigo-300">
                    Valeur en {config.xValues[activeTarget.idx] || 'x'} :
                  </span>
                  <label className="inline-flex items-center gap-1 text-[11px] text-stone-600 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={Boolean(bVal.doubleBar)}
                      onChange={(e) =>
                        updateBoundary(activeRow.id, activeTarget.idx, {
                          doubleBar: e.target.checked,
                          leftValue:
                            e.target.checked && !bVal.leftValue
                              ? bVal.value || '-\\infty'
                              : bVal.leftValue,
                          rightValue:
                            e.target.checked && !bVal.rightValue
                              ? '+\\infty'
                              : bVal.rightValue,
                        })
                      }
                    />
                    <span>Double barre ||</span>
                  </label>

                  {bVal.doubleBar ? (
                    <>
                      <input
                        type="text"
                        value={bVal.leftValue ?? ''}
                        onChange={(e) =>
                          updateBoundary(activeRow.id, activeTarget.idx, {
                            leftValue: e.target.value,
                          })
                        }
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Limite G"
                        className="w-24 rounded border border-stone-200 bg-white px-2 py-1 font-mono text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <span className="text-stone-400">||</span>
                      <input
                        type="text"
                        value={bVal.rightValue ?? ''}
                        onChange={(e) =>
                          updateBoundary(activeRow.id, activeTarget.idx, {
                            rightValue: e.target.value,
                          })
                        }
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Limite D"
                        className="w-24 rounded border border-stone-200 bg-white px-2 py-1 font-mono text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={bVal.value}
                        onChange={(e) =>
                          updateBoundary(activeRow.id, activeTarget.idx, {
                            value: e.target.value,
                          })
                        }
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="-\\infty, 0, +\\infty..."
                        className="w-28 rounded border border-stone-200 bg-white px-2 py-1 font-mono text-xs outline-none dark:border-zinc-700 dark:bg-zinc-950"
                      />
                      <select
                        value={bVal.position ?? 'auto'}
                        onChange={(e) =>
                          updateBoundary(activeRow.id, activeTarget.idx, {
                            position: e.target.value as VariationBoundaryPos,
                          })
                        }
                        aria-label="Position verticale"
                        className="rounded border border-stone-200 bg-white px-1.5 py-1 text-[11px] dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        {posOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            Pos : {opt.label}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </>
              );
            })()}

          <button
            type="button"
            onClick={() => setActiveTarget(null)}
            className="ml-auto rounded px-2 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
          >
            OK
          </button>
        </div>
      )}

      {/* Panneau modèles rapides */}
      {isConfigOpen && (
        <div
          contentEditable={false}
          className="flex flex-wrap items-center gap-2 border-t border-stone-200/80 bg-stone-50/75 px-3.5 py-2.5 text-xs print:hidden dark:border-zinc-800 dark:bg-zinc-900/50"
        >
          <span className="font-medium text-stone-500 dark:text-zinc-400">
            Modèles rapides :
          </span>
          {(
            [
              { id: 'quadratic', label: 'Parabole (deg. 2)' },
              { id: 'affine', label: 'Affine (croissante)' },
              { id: 'inverse', label: 'Inverse 1/x (||)' },
              { id: 'cubic', label: 'Cubique (3 extrema)' },
            ] as const
          ).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700 transition-colors hover:border-indigo-300 hover:text-indigo-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-indigo-500"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </NodeViewWrapper>
  );
}

