import { useRef, useState, type RefObject } from 'react';
import { Grid3X3, Minus, Plus } from 'lucide-react';
import {
  MATH_STRUCTURE_KINDS,
  type MathStructureKind,
} from '../utils/mathTemplates';
import { useFloatingPopupPosition } from './useFloatingPopupPosition';

interface MathStructureBuilderProps {
  onInsert: (kind: MathStructureKind, rows: number, cols: number) => void;
  onClose?: () => void;
  embedded?: boolean;
  align?: 'left' | 'right';
  anchorRef?: RefObject<HTMLElement | null>;
}

const MAX_GRID = 6;

export function MathStructureBuilder({
  onInsert,
  onClose,
  embedded = false,
  align = 'right',
  anchorRef,
}: MathStructureBuilderProps) {
  const [selectedKind, setSelectedKind] = useState<MathStructureKind>('pmatrix');
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [hoverCell, setHoverCell] = useState<{ r: number; c: number } | null>(null);
  const fallbackAnchorRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const floatingStyle = useFloatingPopupPosition({
    anchorRef: anchorRef ?? fallbackAnchorRef,
    popupRef: dialogRef,
    align,
  });

  const descriptor =
    MATH_STRUCTURE_KINDS.find((item) => item.kind === selectedKind) ??
    MATH_STRUCTURE_KINDS[0];
  const isSingleCol = descriptor.fixedCols === 1;

  const previewRows = hoverCell ? hoverCell.r : rows;
  const previewCols = isSingleCol ? 1 : hoverCell ? hoverCell.c : cols;

  const handleSelectKind = (kind: MathStructureKind) => {
    const nextDesc =
      MATH_STRUCTURE_KINDS.find((item) => item.kind === kind) ??
      MATH_STRUCTURE_KINDS[0];
    setSelectedKind(kind);
    setRows(nextDesc.defaultRows);
    setCols(nextDesc.fixedCols ?? nextDesc.defaultCols);
    setHoverCell(null);
  };

  const handleGridClick = (r: number, c: number) => {
    const finalCols = isSingleCol ? 1 : c;
    setRows(r);
    setCols(finalCols);
    onInsert(selectedKind, r, finalCols);
    onClose?.();
  };

  const content = (
    <div
      onMouseDown={(event) => event.preventDefault()}
      className={embedded ? 'space-y-2.5 pt-1' : 'space-y-2.5'}
    >
      {/* Choix du type de structure */}
      <div className="flex flex-wrap gap-1">
        {MATH_STRUCTURE_KINDS.map((item) => {
          const active = item.kind === selectedKind;
          return (
            <button
              key={item.kind}
              type="button"
              onClick={() => handleSelectKind(item.kind)}
              title={item.label}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200/80 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {item.shortLabel}
            </button>
          );
        })}
      </div>

      {/* Grille interactive de sélection de dimension */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-stone-500 dark:text-zinc-400">
            <span>{descriptor.label}</span>
            <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-300">
              {previewRows} × {previewCols}
            </span>
          </div>

          <div
            onMouseLeave={() => setHoverCell(null)}
            className="inline-grid gap-1 rounded-md border border-stone-200/80 bg-stone-50/70 p-1.5 dark:border-zinc-800 dark:bg-zinc-950/60"
            style={{
              gridTemplateColumns: `repeat(${isSingleCol ? 1 : MAX_GRID}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: MAX_GRID }, (_, rIdx) => {
              const r = rIdx + 1;
              return Array.from(
                { length: isSingleCol ? 1 : MAX_GRID },
                (_, cIdx) => {
                  const c = cIdx + 1;
                  const highlighted = r <= previewRows && c <= previewCols;
                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      onMouseEnter={() => setHoverCell({ r, c })}
                      onClick={() => handleGridClick(r, c)}
                      aria-label={`Insérer ${descriptor.label} ${r} par ${c}`}
                      className={`h-4 ${isSingleCol ? 'w-16' : 'w-4'} rounded-[3px] border transition-colors ${
                        highlighted
                          ? 'border-indigo-500 bg-indigo-500/25 dark:border-indigo-400 dark:bg-indigo-400/30'
                          : 'border-stone-300/70 bg-white hover:border-indigo-300 dark:border-zinc-700 dark:bg-zinc-900'
                      }`}
                    />
                  );
                }
              );
            })}
          </div>
        </div>

        {/* Ajustement manuel jusqu'à 8x8 */}
        <div className="flex flex-col gap-1.5 pt-4 text-[11px]">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-stone-500 dark:text-zinc-400">Lignes</span>
            <div className="flex items-center gap-0.5 rounded border border-stone-200 dark:border-zinc-700">
              <button
                type="button"
                onClick={() => setRows((v) => Math.max(1, v - 1))}
                aria-label="Moins de lignes"
                className="p-0.5 text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                <Minus className="h-3 w-3" />
              </button>
              <span className="w-5 text-center font-mono text-stone-800 dark:text-zinc-200">
                {rows}
              </span>
              <button
                type="button"
                onClick={() => setRows((v) => Math.min(8, v + 1))}
                aria-label="Plus de lignes"
                className="p-0.5 text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>

          {!isSingleCol && (
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-stone-500 dark:text-zinc-400">Col.</span>
              <div className="flex items-center gap-0.5 rounded border border-stone-200 dark:border-zinc-700">
                <button
                  type="button"
                  onClick={() => setCols((v) => Math.max(1, v - 1))}
                  aria-label="Moins de colonnes"
                  className="p-0.5 text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-5 text-center font-mono text-stone-800 dark:text-zinc-200">
                  {cols}
                </span>
                <button
                  type="button"
                  onClick={() => setCols((v) => Math.min(8, v + 1))}
                  aria-label="Plus de colonnes"
                  className="p-0.5 text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              onInsert(selectedKind, rows, isSingleCol ? 1 : cols);
              onClose?.();
            }}
            className="mt-1 inline-flex items-center justify-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <Grid3X3 className="h-3 w-3" />
            <span>Insérer</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Assistant matrices et systèmes"
      style={floatingStyle}
      onMouseDown={(event) => event.preventDefault()}
      className="w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-stone-200/90 bg-white p-3 shadow-xl ring-1 ring-black/5 dark:border-zinc-700/80 dark:bg-[#1E1E22] dark:ring-white/5"
    >
      {content}
    </div>
  );
}

