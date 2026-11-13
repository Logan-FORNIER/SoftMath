import { useMemo, useRef, useState, type RefObject } from 'react';
import { Grid3X3, Search, X } from 'lucide-react';
import type { LatexSymbolInsertSpec } from '../utils/latexSnippets';
import {
  generateMathStructureLatex,
  type MathStructureKind,
} from '../utils/mathTemplates';
import { MathStructureBuilder } from './MathStructureBuilder';
import { useFloatingPopupPosition } from './useFloatingPopupPosition';

interface MathPaletteItem extends LatexSymbolInsertSpec {
  id: string;
  symbol: string;
  label: string;
  category: 'greek' | 'analysis' | 'sets' | 'algebra';
}

const MATH_PALETTE_ITEMS: MathPaletteItem[] = [
  // Lettres grecques
  { id: 'alpha', symbol: 'α', label: 'alpha (\\alpha)', latex: '\\alpha ', category: 'greek' },
  { id: 'beta', symbol: 'β', label: 'bêta (\\beta)', latex: '\\beta ', category: 'greek' },
  { id: 'gamma', symbol: 'γ', label: 'gamma (\\gamma)', latex: '\\gamma ', category: 'greek' },
  { id: 'delta', symbol: 'δ', label: 'delta (\\delta)', latex: '\\delta ', category: 'greek' },
  { id: 'varepsilon', symbol: 'ε', label: 'epsilon (\\varepsilon)', latex: '\\varepsilon ', category: 'greek' },
  { id: 'theta', symbol: 'θ', label: 'thêta (\\theta)', latex: '\\theta ', category: 'greek' },
  { id: 'lambda', symbol: 'λ', label: 'lambda (\\lambda)', latex: '\\lambda ', category: 'greek' },
  { id: 'mu', symbol: 'μ', label: 'mu (\\mu)', latex: '\\mu ', category: 'greek' },
  { id: 'pi', symbol: 'π', label: 'pi (\\pi)', latex: '\\pi ', category: 'greek' },
  { id: 'rho', symbol: 'ρ', label: 'rhô (\\rho)', latex: '\\rho ', category: 'greek' },
  { id: 'sigma', symbol: 'σ', label: 'sigma (\\sigma)', latex: '\\sigma ', category: 'greek' },
  { id: 'varphi', symbol: 'φ', label: 'phi (\\varphi)', latex: '\\varphi ', category: 'greek' },
  { id: 'psi', symbol: 'ψ', label: 'psi (\\psi)', latex: '\\psi ', category: 'greek' },
  { id: 'omega', symbol: 'ω', label: 'oméga (\\omega)', latex: '\\omega ', category: 'greek' },
  { id: 'Gamma', symbol: 'Γ', label: 'Gamma (\\Gamma)', latex: '\\Gamma ', category: 'greek' },
  { id: 'Delta', symbol: 'Δ', label: 'Delta (\\Delta)', latex: '\\Delta ', category: 'greek' },
  { id: 'Sigma', symbol: 'Σ', label: 'Sigma (\\Sigma)', latex: '\\Sigma ', category: 'greek' },
  { id: 'Omega', symbol: 'Ω', label: 'Oméga (\\Omega)', latex: '\\Omega ', category: 'greek' },

  // Analyse & calcul
  { id: 'frac', symbol: 'a/b', label: 'Fraction (\\frac)', latex: '\\frac{}{}', cursorOffset: 6, category: 'analysis' },
  { id: 'sqrt', symbol: '√', label: 'Racine carrée (\\sqrt)', latex: '\\sqrt{}', cursorOffset: 6, category: 'analysis' },
  { id: 'sum', symbol: '∑', label: 'Somme (\\sum)', latex: '\\sum_{}^{}', cursorOffset: 6, category: 'analysis' },
  { id: 'prod', symbol: '∏', label: 'Produit (\\prod)', latex: '\\prod_{}^{}', cursorOffset: 7, category: 'analysis' },
  { id: 'int', symbol: '∫', label: 'Intégrale (\\int)', latex: '\\int_{}^{}', cursorOffset: 6, category: 'analysis' },
  { id: 'iint', symbol: '∬', label: 'Intégrale double (\\iint)', latex: '\\iint_{}^{}', cursorOffset: 7, category: 'analysis' },
  { id: 'oint', symbol: '∮', label: 'Intégrale curviligne (\\oint)', latex: '\\oint_{}^{}', cursorOffset: 7, category: 'analysis' },
  { id: 'lim', symbol: 'lim', label: 'Limite (\\lim)', latex: '\\lim_{ \\to }', cursorOffset: 6, category: 'analysis' },
  { id: 'partial', symbol: '∂', label: 'Dérivée partielle (\\partial)', latex: '\\partial ', category: 'analysis' },
  { id: 'nabla', symbol: '∇', label: 'Nabla / Gradient (\\nabla)', latex: '\\nabla ', category: 'analysis' },
  { id: 'infty', symbol: '∞', label: 'Infini (\\infty)', latex: '\\infty ', category: 'analysis' },
  { id: 'dv', symbol: 'd/dx', label: 'Dérivée (\\frac{d}{dx})', latex: '\\frac{\\mathrm{d}}{\\mathrm{d}x}', cursorOffset: 17, category: 'analysis' },

  // Ensembles & logique
  { id: 'R', symbol: 'ℝ', label: 'Réels (\\mathbb{R})', latex: '\\mathbb{R}', category: 'sets' },
  { id: 'N', symbol: 'ℕ', label: 'Naturels (\\mathbb{N})', latex: '\\mathbb{N}', category: 'sets' },
  { id: 'Z', symbol: 'ℤ', label: 'Entiers (\\mathbb{Z})', latex: '\\mathbb{Z}', category: 'sets' },
  { id: 'Q', symbol: 'ℚ', label: 'Rationnels (\\mathbb{Q})', latex: '\\mathbb{Q}', category: 'sets' },
  { id: 'C', symbol: 'ℂ', label: 'Complexes (\\mathbb{C})', latex: '\\mathbb{C}', category: 'sets' },
  { id: 'K', symbol: '𝕂', label: 'Corps K (\\mathbb{K})', latex: '\\mathbb{K}', category: 'sets' },
  { id: 'forall', symbol: '∀', label: 'Pour tout (\\forall)', latex: '\\forall ', category: 'sets' },
  { id: 'exists', symbol: '∃', label: 'Il existe (\\exists)', latex: '\\exists ', category: 'sets' },
  { id: 'in', symbol: '∈', label: 'Appartient (\\in)', latex: '\\in ', category: 'sets' },
  { id: 'notin', symbol: '∉', label: 'N’appartient pas (\\notin)', latex: '\\notin ', category: 'sets' },
  { id: 'subset', symbol: '⊂', label: 'Inclus (\\subset)', latex: '\\subset ', category: 'sets' },
  { id: 'subseteq', symbol: '⊆', label: 'Inclus ou égal (\\subseteq)', latex: '\\subseteq ', category: 'sets' },
  { id: 'cup', symbol: '∪', label: 'Union (\\cup)', latex: '\\cup ', category: 'sets' },
  { id: 'cap', symbol: '∩', label: 'Intersection (\\cap)', latex: '\\cap ', category: 'sets' },
  { id: 'emptyset', symbol: '∅', label: 'Ensemble vide (\\emptyset)', latex: '\\emptyset ', category: 'sets' },
  { id: 'implies', symbol: '⇒', label: 'Implique (\\Rightarrow)', latex: '\\Rightarrow ', category: 'sets' },
  { id: 'iff', symbol: '⇔', label: 'Équivaut (\\Leftrightarrow)', latex: '\\Leftrightarrow ', category: 'sets' },
  { id: 'mapsto', symbol: '↦', label: 'Associe à (\\mapsto)', latex: '\\mapsto ', category: 'sets' },

  // Relations & algèbre linéaire
  { id: 'leq', symbol: '≤', label: 'Inférieur ou égal (\\leq)', latex: '\\leq ', category: 'algebra' },
  { id: 'geq', symbol: '≥', label: 'Supérieur ou égal (\\geq)', latex: '\\geq ', category: 'algebra' },
  { id: 'neq', symbol: '≠', label: 'Différent (\\neq)', latex: '\\neq ', category: 'algebra' },
  { id: 'approx', symbol: '≈', label: 'Environ égal (\\approx)', latex: '\\approx ', category: 'algebra' },
  { id: 'equiv', symbol: '≡', label: 'Congruent / Équivalent (\\equiv)', latex: '\\equiv ', category: 'algebra' },
  { id: 'pm', symbol: '±', label: 'Plus ou moins (\\pm)', latex: '\\pm ', category: 'algebra' },
  { id: 'cdot', symbol: '·', label: 'Produit scalaire (\\cdot)', latex: '\\cdot ', category: 'algebra' },
  { id: 'times', symbol: '×', label: 'Produit vectoriel (\\times)', latex: '\\times ', category: 'algebra' },
  { id: 'otimes', symbol: '⊗', label: 'Produit tensoriel (\\otimes)', latex: '\\otimes ', category: 'algebra' },
  { id: 'oplus', symbol: '⊕', label: 'Somme directe (\\oplus)', latex: '\\oplus ', category: 'algebra' },
  { id: 'langle', symbol: '⟨·,·⟩', label: 'Produit scalaire', latex: '\\langle , \\rangle', cursorOffset: 8, category: 'algebra' },
  { id: 'norm', symbol: '‖·‖', label: 'Norme', latex: '\\left\\|  \\right\\|', cursorOffset: 8, category: 'algebra' },
  { id: 'vec', symbol: 'u⃗', label: 'Vecteur (\\vec)', latex: '\\vec{}', cursorOffset: 5, category: 'algebra' },
  { id: 'overline', symbol: 'z̄', label: 'Conjugué / Barre (\\overline)', latex: '\\overline{}', cursorOffset: 10, category: 'algebra' },
  { id: 'binom', symbol: 'C(n,k)', label: 'Coefficient binomial (\\binom)', latex: '\\binom{}{}', cursorOffset: 7, category: 'algebra' },
];

type PaletteTab = 'all' | 'greek' | 'analysis' | 'sets' | 'algebra' | 'structures';

const PALETTE_TABS: Array<{ id: PaletteTab; label: string }> = [
  { id: 'all', label: 'Tout' },
  { id: 'greek', label: 'Grec' },
  { id: 'analysis', label: 'Analyse' },
  { id: 'sets', label: 'Ensembles' },
  { id: 'algebra', label: 'Algèbre' },
  { id: 'structures', label: 'Matrices' },
];

interface MathSymbolPaletteProps {
  onSelect: (spec: LatexSymbolInsertSpec) => void;
  onClose: () => void;
  align?: 'left' | 'right';
  anchorRef?: RefObject<HTMLElement | null>;
}

export function MathSymbolPalette({
  onSelect,
  onClose,
  align = 'right',
  anchorRef,
}: MathSymbolPaletteProps) {
  const [activeTab, setActiveTab] = useState<PaletteTab>('all');
  const [filterText, setFilterText] = useState('');
  const fallbackAnchorRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const floatingStyle = useFloatingPopupPosition({
    anchorRef: anchorRef ?? fallbackAnchorRef,
    popupRef: dialogRef,
    align,
  });

  const filteredItems = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return MATH_PALETTE_ITEMS.filter((item) => {
      if (activeTab !== 'all' && activeTab !== 'structures' && item.category !== activeTab) {
        return false;
      }
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        item.symbol.toLowerCase().includes(q) ||
        item.latex.toLowerCase().includes(q)
      );
    });
  }, [activeTab, filterText]);

  const handleInsertStructure = (
    kind: MathStructureKind,
    rows: number,
    cols: number
  ) => {
    const generated = generateMathStructureLatex(kind, rows, cols);
    onSelect({
      latex: generated.latex,
      cursorOffset: generated.cursorOffset,
    });
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="Palette rapide de symboles mathématiques"
      style={floatingStyle}
      onMouseDown={(event) => event.preventDefault()}
      className="w-[392px] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-stone-200/90 bg-white p-3 shadow-xl ring-1 ring-black/5 dark:border-zinc-700/80 dark:bg-[#1E1E22] dark:ring-white/5"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 dark:text-zinc-500">
          Symboles &amp; Structures LaTeX
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Fermer (Échap)"
          aria-label="Fermer la palette de symboles"
          className="rounded p-0.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Onglets de catégories */}
      <div className="mb-2 flex flex-wrap gap-1">
        {PALETTE_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {tab.id === 'structures' && <Grid3X3 className="h-3 w-3" />}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'structures' ? (
        <MathStructureBuilder
          embedded
          onInsert={handleInsertStructure}
          onClose={onClose}
        />
      ) : (
        <>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-stone-400 dark:text-zinc-500" />
            <input
              type="text"
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              onMouseDown={(event) => event.stopPropagation()}
              placeholder="Filtrer (ex: alpha, sum, subset, R)..."
              className="w-full rounded-md border border-stone-200 bg-stone-50/70 py-1 pl-7 pr-2 text-xs text-stone-800 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto pr-0.5">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                onClick={() =>
                  onSelect({
                    latex: item.latex,
                    cursorOffset: item.cursorOffset,
                  })
                }
                className="flex h-8 items-center justify-center rounded-md border border-stone-200/60 bg-stone-50/60 px-1 text-xs font-medium text-stone-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-zinc-700/60 dark:bg-zinc-900/70 dark:text-zinc-200 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300"
              >
                <span className="truncate">{item.symbol}</span>
              </button>
            ))}
            {filteredItems.length === 0 && (
              <p className="col-span-6 py-4 text-center text-xs text-stone-400 dark:text-zinc-500">
                Aucun symbole correspondant.
              </p>
            )}
          </div>
        </>
      )}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2 text-[10px] text-stone-400 dark:border-zinc-800 dark:text-zinc-500">
        <span>Snippets : // · sqrt · sum · int · \R</span>
        <span>Calcul : == ou Alt+=</span>
      </div>
    </div>
  );
}
