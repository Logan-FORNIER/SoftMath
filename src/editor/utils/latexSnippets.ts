import { evaluateLatexField } from './mathEval';

export interface LatexEditResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface LatexSymbolInsertSpec {
  latex: string;
  /** Offset du curseur à l'intérieur de `latex`. Par défaut `latex.length`. */
  cursorOffset?: number;
}

type BoundaryMode = 'none' | 'identifier' | 'backslash-command';

interface SpaceWordSnippet {
  trigger: string;
  replacement: string;
  cursorOffset: number;
  boundary: BoundaryMode;
}

interface OperatorSnippet {
  prefix: string;
  key: string;
  replacement: string;
  cursorOffset?: number;
}

/**
 * Dictionnaire complet de snippets déclenchés par Espace dans les éditeurs LaTeX.
 */
const SPACE_WORD_SNIPPETS: SpaceWordSnippet[] = [
  // Fractions, racines et délimiteurs
  { trigger: '//', replacement: '\\frac{}{}', cursorOffset: 6, boundary: 'none' },
  { trigger: 'sqrt', replacement: '\\sqrt{}', cursorOffset: 6, boundary: 'identifier' },
  { trigger: 'nrt', replacement: '\\sqrt[]{}', cursorOffset: 6, boundary: 'identifier' },
  { trigger: 'abs', replacement: '\\left|  \\right|', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'norm', replacement: '\\left\\|  \\right\\|', cursorOffset: 8, boundary: 'identifier' },
  { trigger: 'binom', replacement: '\\binom{}{}', cursorOffset: 7, boundary: 'identifier' },

  // Grands opérateurs & Analyse
  { trigger: 'sum', replacement: '\\sum_{}^{}', cursorOffset: 6, boundary: 'identifier' },
  { trigger: 'prod', replacement: '\\prod_{}^{}', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'int', replacement: '\\int_{}^{}', cursorOffset: 6, boundary: 'identifier' },
  { trigger: 'iint', replacement: '\\iint_{}^{}', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'iiint', replacement: '\\iiint_{}^{}', cursorOffset: 8, boundary: 'identifier' },
  { trigger: 'oint', replacement: '\\oint_{}^{}', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'lim', replacement: '\\lim_{ \\to }', cursorOffset: 6, boundary: 'identifier' },
  { trigger: 'dv', replacement: '\\frac{\\mathrm{d}}{\\mathrm{d}x}', cursorOffset: 17, boundary: 'identifier' },
  { trigger: 'pdv', replacement: '\\frac{\\partial }{\\partial x}', cursorOffset: 15, boundary: 'identifier' },
  { trigger: 'part', replacement: '\\partial ', cursorOffset: 9, boundary: 'identifier' },
  { trigger: 'nabla', replacement: '\\nabla ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'grad', replacement: '\\nabla ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'dx', replacement: '\\,\\mathrm{d}x', cursorOffset: 13, boundary: 'identifier' },
  { trigger: 'dt', replacement: '\\,\\mathrm{d}t', cursorOffset: 13, boundary: 'identifier' },
  { trigger: 'infty', replacement: '\\infty ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'oo', replacement: '\\infty ', cursorOffset: 7, boundary: 'identifier' },

  // Ensembles mathématiques (\R, \N, \C... et RR, NN, CC...)
  { trigger: '\\R', replacement: '\\mathbb{R}', cursorOffset: 10, boundary: 'backslash-command' },
  { trigger: '\\N', replacement: '\\mathbb{N}', cursorOffset: 10, boundary: 'backslash-command' },
  { trigger: '\\Z', replacement: '\\mathbb{Z}', cursorOffset: 10, boundary: 'backslash-command' },
  { trigger: '\\Q', replacement: '\\mathbb{Q}', cursorOffset: 10, boundary: 'backslash-command' },
  { trigger: '\\C', replacement: '\\mathbb{C}', cursorOffset: 10, boundary: 'backslash-command' },
  { trigger: '\\K', replacement: '\\mathbb{K}', cursorOffset: 10, boundary: 'backslash-command' },
  { trigger: 'RR', replacement: '\\mathbb{R}', cursorOffset: 10, boundary: 'identifier' },
  { trigger: 'NN', replacement: '\\mathbb{N}', cursorOffset: 10, boundary: 'identifier' },
  { trigger: 'ZZ', replacement: '\\mathbb{Z}', cursorOffset: 10, boundary: 'identifier' },
  { trigger: 'QQ', replacement: '\\mathbb{Q}', cursorOffset: 10, boundary: 'identifier' },
  { trigger: 'CC', replacement: '\\mathbb{C}', cursorOffset: 10, boundary: 'identifier' },
  { trigger: 'KK', replacement: '\\mathbb{K}', cursorOffset: 10, boundary: 'identifier' },

  // Logique, ensembles et relations
  { trigger: 'forall', replacement: '\\forall ', cursorOffset: 8, boundary: 'identifier' },
  { trigger: 'exists', replacement: '\\exists ', cursorOffset: 8, boundary: 'identifier' },
  { trigger: 'nexists', replacement: '\\nexists ', cursorOffset: 9, boundary: 'identifier' },
  { trigger: 'notin', replacement: '\\notin ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'in', replacement: '\\in ', cursorOffset: 4, boundary: 'identifier' },
  { trigger: 'subeq', replacement: '\\subseteq ', cursorOffset: 10, boundary: 'identifier' },
  { trigger: 'sub', replacement: '\\subset ', cursorOffset: 8, boundary: 'identifier' },
  { trigger: 'cup', replacement: '\\cup ', cursorOffset: 5, boundary: 'identifier' },
  { trigger: 'cap', replacement: '\\cap ', cursorOffset: 5, boundary: 'identifier' },
  { trigger: 'emptyset', replacement: '\\emptyset ', cursorOffset: 10, boundary: 'identifier' },
  { trigger: 'vide', replacement: '\\emptyset ', cursorOffset: 10, boundary: 'identifier' },
  { trigger: 'equiv', replacement: '\\equiv ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'approx', replacement: '\\approx ', cursorOffset: 8, boundary: 'identifier' },
  { trigger: 'cdot', replacement: '\\cdot ', cursorOffset: 6, boundary: 'identifier' },
  { trigger: 'times', replacement: '\\times ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'otimes', replacement: '\\otimes ', cursorOffset: 8, boundary: 'identifier' },
  { trigger: 'oplus', replacement: '\\oplus ', cursorOffset: 7, boundary: 'identifier' },

  // Vecteurs, matrices et systèmes rapides
  { trigger: 'vec', replacement: '\\vec{}', cursorOffset: 5, boundary: 'identifier' },
  { trigger: 'hat', replacement: '\\hat{}', cursorOffset: 5, boundary: 'identifier' },
  { trigger: 'bar', replacement: '\\overline{}', cursorOffset: 10, boundary: 'identifier' },
  { trigger: 'tilde', replacement: '\\tilde{}', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'txt', replacement: '\\text{}', cursorOffset: 6, boundary: 'identifier' },
  {
    trigger: 'pmat',
    replacement: '\\begin{pmatrix}  &  \\\\  &  \\end{pmatrix}',
    cursorOffset: 16,
    boundary: 'identifier',
  },
  {
    trigger: 'mat',
    replacement: '\\begin{pmatrix}  &  \\\\  &  \\end{pmatrix}',
    cursorOffset: 16,
    boundary: 'identifier',
  },
  {
    trigger: 'bmat',
    replacement: '\\begin{bmatrix}  &  \\\\  &  \\end{bmatrix}',
    cursorOffset: 16,
    boundary: 'identifier',
  },
  {
    trigger: 'vmat',
    replacement: '\\begin{vmatrix}  &  \\\\  &  \\end{vmatrix}',
    cursorOffset: 16,
    boundary: 'identifier',
  },
  {
    trigger: 'sys',
    replacement: '\\begin{cases}  \\\\  \\end{cases}',
    cursorOffset: 14,
    boundary: 'identifier',
  },
  {
    trigger: 'cases',
    replacement: '\\begin{cases}  \\\\  \\end{cases}',
    cursorOffset: 14,
    boundary: 'identifier',
  },

  // Lettres grecques (minuscules & majuscules)
  { trigger: 'alpha', replacement: '\\alpha ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'beta', replacement: '\\beta ', cursorOffset: 6, boundary: 'identifier' },
  { trigger: 'gamma', replacement: '\\gamma ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'delta', replacement: '\\delta ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'eps', replacement: '\\varepsilon ', cursorOffset: 12, boundary: 'identifier' },
  { trigger: 'epsilon', replacement: '\\varepsilon ', cursorOffset: 12, boundary: 'identifier' },
  { trigger: 'zeta', replacement: '\\zeta ', cursorOffset: 6, boundary: 'identifier' },
  { trigger: 'eta', replacement: '\\eta ', cursorOffset: 5, boundary: 'identifier' },
  { trigger: 'theta', replacement: '\\theta ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'vtheta', replacement: '\\vartheta ', cursorOffset: 10, boundary: 'identifier' },
  { trigger: 'iota', replacement: '\\iota ', cursorOffset: 6, boundary: 'identifier' },
  { trigger: 'kappa', replacement: '\\kappa ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'lambda', replacement: '\\lambda ', cursorOffset: 8, boundary: 'identifier' },
  { trigger: 'mu', replacement: '\\mu ', cursorOffset: 4, boundary: 'identifier' },
  { trigger: 'nu', replacement: '\\nu ', cursorOffset: 4, boundary: 'identifier' },
  { trigger: 'xi', replacement: '\\xi ', cursorOffset: 4, boundary: 'identifier' },
  { trigger: 'pi', replacement: '\\pi ', cursorOffset: 4, boundary: 'identifier' },
  { trigger: 'rho', replacement: '\\rho ', cursorOffset: 5, boundary: 'identifier' },
  { trigger: 'sigma', replacement: '\\sigma ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'tau', replacement: '\\tau ', cursorOffset: 5, boundary: 'identifier' },
  { trigger: 'phi', replacement: '\\varphi ', cursorOffset: 8, boundary: 'identifier' },
  { trigger: 'vphi', replacement: '\\phi ', cursorOffset: 5, boundary: 'identifier' },
  { trigger: 'chi', replacement: '\\chi ', cursorOffset: 5, boundary: 'identifier' },
  { trigger: 'psi', replacement: '\\psi ', cursorOffset: 5, boundary: 'identifier' },
  { trigger: 'omega', replacement: '\\omega ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'Gamma', replacement: '\\Gamma ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'Delta', replacement: '\\Delta ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'Theta', replacement: '\\Theta ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'Lambda', replacement: '\\Lambda ', cursorOffset: 8, boundary: 'identifier' },
  { trigger: 'Sigma', replacement: '\\Sigma ', cursorOffset: 7, boundary: 'identifier' },
  { trigger: 'Phi', replacement: '\\Phi ', cursorOffset: 5, boundary: 'identifier' },
  { trigger: 'Psi', replacement: '\\Psi ', cursorOffset: 5, boundary: 'identifier' },
  { trigger: 'Omega', replacement: '\\Omega ', cursorOffset: 7, boundary: 'identifier' },
];

/**
 * Remplacements immédiats à la frappe d'opérateurs symboliques.
 */
const OPERATOR_SNIPPETS: OperatorSnippet[] = [
  { prefix: '\\leq', key: '>', replacement: '\\Leftrightarrow ' },
  { prefix: '\\leftarrow', key: '>', replacement: '\\leftrightarrow ' },
  { prefix: '|-', key: '>', replacement: '\\mapsto ' },
  { prefix: '-', key: '>', replacement: '\\rightarrow ' },
  { prefix: '<', key: '-', replacement: '\\leftarrow ' },
  { prefix: '=', key: '>', replacement: '\\Rightarrow ' },
  { prefix: '!', key: '=', replacement: '\\neq ' },
  { prefix: '<', key: '=', replacement: '\\leq ' },
  { prefix: '>', key: '=', replacement: '\\geq ' },
  { prefix: '+', key: '-', replacement: '\\pm ' },
  { prefix: '~', key: '~', replacement: '\\approx ' },
  { prefix: '..', key: '.', replacement: '\\dots ' },
];

const AUTO_CLOSE_PAIRS: Record<string, string> = {
  '{': '}',
  '(': ')',
};

const CLOSING_DELIMITERS = new Set(['}', ')']);

function hasValidBoundary(beforeTrigger: string, mode: BoundaryMode): boolean {
  if (mode === 'none' || beforeTrigger.length === 0) {
    return true;
  }
  const prevChar = beforeTrigger[beforeTrigger.length - 1];
  return !/[a-zA-Z0-9\\]/.test(prevChar);
}

/**
 * Calcule la transformation intelligente à appliquer lors d'une frappe dans un éditeur LaTeX.
 * Gère : auto-snippets sur Espace, opérateurs immédiats, auto-fermeture de `{}`/`()`,
 * et évaluation symbolique/numérique mathjs via `==` ou `Alt+=`.
 */
export function computeLatexKeyDownEdit(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>
): LatexEditResult | null {
  const { key, ctrlKey, metaKey, altKey } = event;

  // Raccourci explicite Alt+= : évaluer l'expression avant le curseur via mathjs
  if (altKey && !ctrlKey && !metaKey && key === '=') {
    return evaluateLatexField(value, selectionStart, 0);
  }

  if (ctrlKey || metaKey || altKey) {
    return null;
  }

  const hasSelection = selectionStart !== selectionEnd;
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);

  // Backspace sur paire vide {} ou () -> supprime les deux
  if (key === 'Backspace' && !hasSelection && selectionStart > 0) {
    const prevChar = value[selectionStart - 1];
    const nextChar = value[selectionStart];
    if (AUTO_CLOSE_PAIRS[prevChar] === nextChar) {
      const nextValue =
        value.slice(0, selectionStart - 1) + value.slice(selectionStart + 1);
      const nextCursor = selectionStart - 1;
      return {
        value: nextValue,
        selectionStart: nextCursor,
        selectionEnd: nextCursor,
      };
    }
    return null;
  }

  // Espace -> snippets d'abréviations LaTeX
  if (key === ' ' && !hasSelection) {
    for (const snippet of SPACE_WORD_SNIPPETS) {
      if (!before.endsWith(snippet.trigger)) {
        continue;
      }
      const triggerStart = before.length - snippet.trigger.length;
      const prefixBeforeTrigger = before.slice(0, triggerStart);
      if (!hasValidBoundary(prefixBeforeTrigger, snippet.boundary)) {
        continue;
      }
      const nextValue = prefixBeforeTrigger + snippet.replacement + after;
      const nextCursor = triggerStart + snippet.cursorOffset;
      return {
        value: nextValue,
        selectionStart: nextCursor,
        selectionEnd: nextCursor,
      };
    }
    return null;
  }

  // `==` : évaluation rapide via mathjs si le membre gauche est calculable
  if (key === '=' && !hasSelection && before.endsWith('=')) {
    const charBeforeFirstEquals = before[before.length - 2] ?? '';
    if (
      charBeforeFirstEquals !== '<' &&
      charBeforeFirstEquals !== '>' &&
      charBeforeFirstEquals !== '!' &&
      charBeforeFirstEquals !== '='
    ) {
      const evaluated = evaluateLatexField(value, selectionStart, 1);
      if (evaluated) {
        return evaluated;
      }
    }
  }

  // Opérateurs multi-caractères immédiats (->, =>, <=, >=, !=, <=>, |->, +-, ~~, ...)
  if (!hasSelection && key.length === 1) {
    for (const op of OPERATOR_SNIPPETS) {
      if (op.key !== key || !before.endsWith(op.prefix)) {
        continue;
      }
      // Éviter que `=` après un autre `=` ou caractère sans rapport transforme mal `<=` etc.
      const opStart = before.length - op.prefix.length;
      const prefixBefore = before.slice(0, opStart);
      const nextValue = prefixBefore + op.replacement + after;
      const nextCursor = opStart + (op.cursorOffset ?? op.replacement.length);
      return {
        value: nextValue,
        selectionStart: nextCursor,
        selectionEnd: nextCursor,
      };
    }
  }

  // Auto-fermeture { } et ( )
  if (key in AUTO_CLOSE_PAIRS) {
    const closeChar = AUTO_CLOSE_PAIRS[key];
    // Ne pas auto-fermer si un antislash échappe l'accolade \{ ou la parenthèse \(
    if (before.endsWith('\\')) {
      return null;
    }
    if (hasSelection) {
      const selectedText = value.slice(selectionStart, selectionEnd);
      const nextValue = `${before}${key}${selectedText}${closeChar}${after}`;
      return {
        value: nextValue,
        selectionStart: selectionStart + 1,
        selectionEnd: selectionEnd + 1,
      };
    }
    const nextValue = `${before}${key}${closeChar}${after}`;
    const nextCursor = selectionStart + 1;
    return {
      value: nextValue,
      selectionStart: nextCursor,
      selectionEnd: nextCursor,
    };
  }

  // Sur-frappe d'une accolade/parenthèse fermante déjà présente juste après le curseur
  if (!hasSelection && CLOSING_DELIMITERS.has(key) && after.startsWith(key)) {
    return {
      value,
      selectionStart: selectionStart + 1,
      selectionEnd: selectionStart + 1,
    };
  }

  return null;
}

/**
 * Insère un symbole LaTeX issu de la palette à la sélection courante.
 */
export function computeLatexSymbolInsert(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  spec: LatexSymbolInsertSpec
): LatexEditResult {
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const nextValue = before + spec.latex + after;
  const cursorOffset = spec.cursorOffset ?? spec.latex.length;
  const nextCursor = selectionStart + cursorOffset;

  return {
    value: nextValue,
    selectionStart: nextCursor,
    selectionEnd: nextCursor,
  };
}
