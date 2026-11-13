import { useRef } from 'react';
import { Calculator, Grid3X3 } from 'lucide-react';
import type { LatexSymbolInsertSpec } from '../utils/latexSnippets';
import type { MathStructureKind } from '../utils/mathTemplates';
import { MathStructureBuilder } from './MathStructureBuilder';
import { MathSymbolPalette } from './MathSymbolPalette';

interface LatexActionButtonsProps {
  compact?: boolean;
  align?: 'left' | 'right';
  isPaletteOpen: boolean;
  isStructureOpen: boolean;
  calcError: string | null;
  onTogglePalette: () => void;
  onToggleStructure: () => void;
  onClosePalette: () => void;
  onCloseStructure: () => void;
  onSelectSymbol: (spec: LatexSymbolInsertSpec) => void;
  onInsertStructure: (kind: MathStructureKind, rows: number, cols: number) => void;
  onEvaluateMath: () => void;
}

export function LatexActionButtons({
  compact = false,
  align = 'right',
  isPaletteOpen,
  isStructureOpen,
  calcError,
  onTogglePalette,
  onToggleStructure,
  onClosePalette,
  onCloseStructure,
  onSelectSymbol,
  onInsertStructure,
  onEvaluateMath,
}: LatexActionButtonsProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const btnSize = compact ? 'h-5 px-1 text-[11px]' : 'h-6 px-1.5 text-xs';

  return (
    <span ref={anchorRef} className="relative inline-flex items-center gap-0.5">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onEvaluateMath}
        title="Calculer / Simplifier avec Math.js (taper == ou Alt+=)"
        aria-label="Évaluer l'expression mathématique"
        className={`inline-flex items-center gap-1 rounded font-medium transition-colors ${btnSize} ${
          calcError
            ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
            : compact
              ? 'text-indigo-600/80 hover:bg-indigo-200/60 hover:text-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-500/25'
              : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
        }`}
      >
        <Calculator className="h-3 w-3" />
        {!compact && <span>Calculer</span>}
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggleStructure}
        title="Assistant matrices, vecteurs et systèmes"
        aria-label="Ouvrir l'assistant de matrices et systèmes"
        aria-expanded={isStructureOpen}
        className={`inline-flex items-center justify-center rounded font-medium transition-colors ${btnSize} ${
          isStructureOpen
            ? 'bg-indigo-600 text-white dark:bg-indigo-500'
            : compact
              ? 'text-indigo-600/80 hover:bg-indigo-200/60 hover:text-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-500/25'
              : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
        }`}
      >
        <Grid3X3 className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onTogglePalette}
        title="Palette de symboles (Ctrl+M)"
        aria-label="Ouvrir la palette de symboles LaTeX"
        aria-expanded={isPaletteOpen}
        className={`inline-flex items-center justify-center rounded font-semibold transition-colors ${btnSize} ${
          isPaletteOpen
            ? 'bg-indigo-600 text-white dark:bg-indigo-500'
            : compact
              ? 'text-indigo-600/80 hover:bg-indigo-200/60 hover:text-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-500/25'
              : 'text-stone-600 hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
        }`}
      >
        <span>∑</span>
      </button>

      {isStructureOpen && (
        <MathStructureBuilder
          align={align}
          anchorRef={anchorRef}
          onInsert={onInsertStructure}
          onClose={onCloseStructure}
        />
      )}

      {isPaletteOpen && (
        <MathSymbolPalette
          align={align}
          anchorRef={anchorRef}
          onSelect={onSelectSymbol}
          onClose={onClosePalette}
        />
      )}
    </span>
  );
}

