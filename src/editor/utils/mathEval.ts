import {
  compile,
  derivative,
  isComplex,
  isMatrix,
  isNode,
  parse,
  simplify,
  evaluate,
  type MathNode,
} from 'mathjs';
import type { LatexEditResult } from './latexSnippets';

export type MathEvalOutcome =
  | {
      ok: true;
      latex: string;
      plainText: string;
      kind: 'number' | 'complex' | 'matrix' | 'symbolic' | 'boolean';
    }
  | {
      ok: false;
      error: string;
    };

function findMatchingDelimiter(
  source: string,
  openIndex: number,
  openChar: string,
  closeChar: string
): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === openChar) {
      depth += 1;
    } else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function skipWhitespace(source: string, index: number): number {
  let i = index;
  while (i < source.length && /\s/.test(source[i])) {
    i += 1;
  }
  return i;
}

function replaceLatexCommandTwoArgs(
  input: string,
  commandPattern: RegExp,
  transform: (first: string, second: string) => string
): string {
  let result = input;
  for (let guard = 0; guard < 64; guard += 1) {
    commandPattern.lastIndex = 0;
    const match = commandPattern.exec(result);
    if (!match) {
      break;
    }
    const open1 = match.index + match[0].length - 1;
    const close1 = findMatchingDelimiter(result, open1, '{', '}');
    if (close1 === -1) {
      break;
    }
    const after1 = skipWhitespace(result, close1 + 1);
    if (result[after1] !== '{') {
      break;
    }
    const close2 = findMatchingDelimiter(result, after1, '{', '}');
    if (close2 === -1) {
      break;
    }
    const arg1 = result.slice(open1 + 1, close1);
    const arg2 = result.slice(after1 + 1, close2);
    const replacement = transform(arg1, arg2);
    result = result.slice(0, match.index) + replacement + result.slice(close2 + 1);
  }
  return result;
}

function replaceLatexCommandOneArg(
  input: string,
  commandPattern: RegExp,
  transform: (arg: string) => string
): string {
  let result = input;
  for (let guard = 0; guard < 64; guard += 1) {
    commandPattern.lastIndex = 0;
    const match = commandPattern.exec(result);
    if (!match) {
      break;
    }
    const open = match.index + match[0].length - 1;
    const close = findMatchingDelimiter(result, open, '{', '}');
    if (close === -1) {
      break;
    }
    const arg = result.slice(open + 1, close);
    const replacement = transform(arg);
    result = result.slice(0, match.index) + replacement + result.slice(close + 1);
  }
  return result;
}

function replaceLatexSqrt(input: string): string {
  let result = input;
  const sqrtPattern = /\\sqrt(?=\s*[\[({]|(?:\s*{))/g;
  for (let guard = 0; guard < 64; guard += 1) {
    sqrtPattern.lastIndex = 0;
    const match = sqrtPattern.exec(result);
    if (!match) {
      break;
    }
    let pos = skipWhitespace(result, match.index + match[0].length);
    let rootOrder: string | null = null;

    if (result[pos] === '[') {
      const closeBracket = findMatchingDelimiter(result, pos, '[', ']');
      if (closeBracket === -1) {
        break;
      }
      rootOrder = result.slice(pos + 1, closeBracket).trim();
      pos = skipWhitespace(result, closeBracket + 1);
    }

    if (result[pos] !== '{') {
      break;
    }
    const closeBrace = findMatchingDelimiter(result, pos, '{', '}');
    if (closeBrace === -1) {
      break;
    }
    const radicand = result.slice(pos + 1, closeBrace);
    const replacement = rootOrder
      ? `nthRoot((${radicand}), (${rootOrder}))`
      : `sqrt(${radicand})`;
    result = result.slice(0, match.index) + replacement + result.slice(closeBrace + 1);
  }
  return result;
}

function convertLatexMatrices(input: string): string {
  return input.replace(
    /\\begin\{(pmatrix|bmatrix|Bmatrix|vmatrix|matrix)\}([\s\S]*?)\\end\{\1\}/g,
    (_full, env: string, body: string) => {
      const rows = body
        .split(/\\\\/)
        .map((row) => row.trim())
        .filter((row) => row.length > 0)
        .map(
          (row) =>
            `[${row
              .split('&')
              .map((cell) => normalizeMathExpression(cell))
              .join(', ')}]`
        );
      const matrixLiteral = `[${rows.join(', ')}]`;
      if (env === 'vmatrix') {
        return `det(${matrixLiteral})`;
      }
      return matrixLiteral;
    }
  );
}

function wrapFunctionCallMatrixArg(input: string, fnName: string): string {
  const pattern = new RegExp(`\\b${fnName}\\s*\\[`, 'g');
  let result = input;
  for (let guard = 0; guard < 32; guard += 1) {
    pattern.lastIndex = 0;
    const match = pattern.exec(result);
    if (!match) {
      break;
    }
    const openBracket = match.index + match[0].length - 1;
    const closeBracket = findMatchingDelimiter(result, openBracket, '[', ']');
    if (closeBracket === -1) {
      break;
    }
    const matrixArg = result.slice(openBracket, closeBracket + 1);
    result =
      result.slice(0, match.index) +
      `${fnName}(${matrixArg})` +
      result.slice(closeBracket + 1);
  }
  return result;
}

/**
 * Normalise une expression LaTeX ou mathématique libre vers la syntaxe mathjs.
 */
export function normalizeMathExpression(rawInput: string): string {
  let expr = rawInput.trim();
  if (!expr) {
    return '';
  }

  // Supprimer les séparateurs visuels d'alignement et commandes de taille LaTeX
  expr = expr
    .replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b/g, ' ')
    .replace(/\\(?:left|right|bigl|bigr|Bigl|Bigr)\s*/g, '')
    .replace(/\\(?:quad|qquad|,|;|!|:)/g, ' ')
    .replace(/\\mathrm\{d\}/g, 'd')
    .replace(/\\operatorname\{([^}]+)\}/g, '$1');

  // Matrices LaTeX avant remplacement des commandes générales
  expr = convertLatexMatrices(expr);

  // Remplacer les fractions, coefficients binomiaux et racines (avec imbrication)
  expr = replaceLatexCommandTwoArgs(
    expr,
    /\\(?:d|t|c)?frac\s*\{/,
    (num, den) => `((${num})/(${den}))`
  );
  expr = replaceLatexCommandTwoArgs(
    expr,
    /\\(?:t|d)?binom\s*\{/,
    (n, k) => `combinations((${n}), (${k}))`
  );
  expr = replaceLatexSqrt(expr);

  // Enveloppe \abs{...} et exposants e^{...} / ^{...}
  expr = replaceLatexCommandOneArg(expr, /\\abs\s*\{/, (inner) => `abs(${inner})`);
  expr = replaceLatexCommandOneArg(expr, /\\exp\s*\{/, (inner) => `exp(${inner})`);
  expr = replaceLatexCommandOneArg(expr, /\\ln\s*\{/, (inner) => `log(${inner})`);
  expr = replaceLatexCommandOneArg(expr, /\\log\s*\{/, (inner) => `log10(${inner})`);
  expr = replaceLatexCommandOneArg(
    expr,
    /\^\s*\{/,
    (inner) => `^(${inner})`
  );

  // \log_{base}(val) -> log(val, base)
  expr = expr.replace(
    /\\log_\{?([0-9]+(?:\.[0-9]+)?|[a-zA-Z]+)\}?\s*\(([^)]+)\)/g,
    'log($2, $1)'
  );

  // Fonctions usuelles et constantes LaTeX -> mathjs
  expr = expr
    .replace(/\\arcsin\b/g, 'asin')
    .replace(/\\arccos\b/g, 'acos')
    .replace(/\\arctan\b/g, 'atan')
    .replace(/\\sinh\b/g, 'sinh')
    .replace(/\\cosh\b/g, 'cosh')
    .replace(/\\tanh\b/g, 'tanh')
    .replace(/\\sin\b/g, 'sin')
    .replace(/\\cos\b/g, 'cos')
    .replace(/\\tan\b/g, 'tan')
    .replace(/\\exp\b/g, 'exp')
    .replace(/\\ln\b/g, 'log')
    .replace(/\\log\b/g, 'log10')
    .replace(/\\sqrt\b/g, 'sqrt')
    .replace(/\\det\b/g, 'det')
    .replace(/\\tr\b/g, 'trace')
    .replace(/\\abs\b/g, 'abs')
    .replace(/\\min\b/g, 'min')
    .replace(/\\max\b/g, 'max')
    .replace(/\\(?:cdot|times)\b/g, '*')
    .replace(/\\div\b/g, '/')
    .replace(/\\pi\b/g, 'pi')
    .replace(/\\tau\b/g, 'tau')
    .replace(/\\varphi\b|\\phi\b/g, 'phi')
    .replace(/\\infty\b/g, 'Infinity')
    .replace(/\\([a-zA-Z]+)\b/g, '$1');

  // Symbole Unicode courants (si saisis depuis le presse-papiers)
  expr = expr
    .replace(/×|·/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/∞/g, 'Infinity');

  // Accolades résiduelles {a+b} -> (a+b)
  expr = expr.replace(/\{/g, '(').replace(/\}/g, ')');

  // Transformer det[...] et trace[...] en det([...]) / trace([...]) pour mathjs
  expr = wrapFunctionCallMatrixArg(expr, 'det');
  expr = wrapFunctionCallMatrixArg(expr, 'trace');

  return expr.replace(/\s+/g, ' ').trim();
}

function splitChainedEqualsSegment(rawInput: string): string {
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let lastTopLevelEquals = -1;

  for (let i = 0; i < rawInput.length; i += 1) {
    const ch = rawInput[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '{') braceDepth += 1;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '[') bracketDepth += 1;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (
      ch === '=' &&
      braceDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0
    ) {
      const prev = rawInput[i - 1] ?? '';
      const next = rawInput[i + 1] ?? '';
      if (prev !== '<' && prev !== '>' && prev !== '!' && prev !== '=' && next !== '=') {
        lastTopLevelEquals = i;
      }
    }
  }

  if (lastTopLevelEquals === -1) {
    return rawInput.trim();
  }

  const afterEquals = rawInput.slice(lastTopLevelEquals + 1).trim();
  return afterEquals.length > 0 ? afterEquals : rawInput.slice(0, lastTopLevelEquals).trim();
}

function formatNumberToLatex(num: number): { latex: string; plainText: string } {
  if (!Number.isFinite(num)) {
    if (Number.isNaN(num)) {
      return { latex: '\\text{Indéfini}', plainText: 'NaN' };
    }
    return num > 0
      ? { latex: '+\\infty', plainText: '+Infinity' }
      : { latex: '-\\infty', plainText: '-Infinity' };
  }

  const cleaned = Math.abs(num) < 1e-12 ? 0 : num;
  if (Number.isInteger(cleaned) && Math.abs(cleaned) < 1e15) {
    const str = String(cleaned);
    return { latex: str, plainText: str };
  }

  const nearInt = Math.round(cleaned);
  if (Math.abs(cleaned - nearInt) < 1e-11 && Math.abs(cleaned) < 1e12) {
    const str = String(nearInt);
    return { latex: str, plainText: str };
  }

  if (Math.abs(cleaned) >= 1e9 || (cleaned !== 0 && Math.abs(cleaned) < 1e-6)) {
    const [mantissaStr, expStr] = cleaned.toExponential(6).split('e');
    const trimmedMantissa = mantissaStr.replace(/\.?0+$/, '');
    const expNum = Number.parseInt(expStr, 10);
    return {
      latex: `${trimmedMantissa} \\times 10^{${expNum}}`,
      plainText: `${trimmedMantissa}e${expNum}`,
    };
  }

  const formatted = Number(cleaned.toPrecision(10)).toString();
  return { latex: formatted, plainText: formatted };
}

function formatValueToLatex(value: unknown): {
  latex: string;
  plainText: string;
  kind: 'number' | 'complex' | 'matrix' | 'symbolic' | 'boolean';
} {
  if (typeof value === 'boolean') {
    return {
      latex: value ? '\\text{Vrai}' : '\\text{Faux}',
      plainText: String(value),
      kind: 'boolean',
    };
  }

  if (typeof value === 'number') {
    return { ...formatNumberToLatex(value), kind: 'number' };
  }

  if (isComplex(value)) {
    const re = Math.abs(value.re) < 1e-12 ? 0 : value.re;
    const im = Math.abs(value.im) < 1e-12 ? 0 : value.im;
    if (im === 0) {
      return { ...formatNumberToLatex(re), kind: 'number' };
    }
    const imAbsStr =
      Math.abs(Math.abs(im) - 1) < 1e-12 ? '' : formatNumberToLatex(Math.abs(im)).latex;
    if (re === 0) {
      const sign = im < 0 ? '-' : '';
      return {
        latex: `${sign}${imAbsStr}i`,
        plainText: `${sign}${imAbsStr}i`,
        kind: 'complex',
      };
    }
    const reStr = formatNumberToLatex(re).latex;
    const sign = im < 0 ? ' - ' : ' + ';
    const out = `${reStr}${sign}${imAbsStr}i`;
    return { latex: out, plainText: out, kind: 'complex' };
  }

  if (isMatrix(value) || Array.isArray(value)) {
    const arr = isMatrix(value) ? value.toArray() : value;
    if (Array.isArray(arr)) {
      const is2D = arr.some((item) => Array.isArray(item));
      const rows = is2D
        ? (arr as unknown[][])
        : (arr as unknown[]).map((item) => [item]);
      const latexRows = rows.map((row) =>
        row.map((cell) => formatValueToLatex(cell).latex).join(' & ')
      );
      const plainRows = rows.map((row) =>
        `[${row.map((cell) => formatValueToLatex(cell).plainText).join(', ')}]`
      );
      return {
        latex: `\\begin{pmatrix} ${latexRows.join(' \\\\ ')} \\end{pmatrix}`,
        plainText: `[${plainRows.join(', ')}]`,
        kind: 'matrix',
      };
    }
  }

  if (isNode(value)) {
    const tex = value
      .toTex({ parenthesis: 'auto' })
      .replace(/~/g, ' ')
      .replace(/\\mathrm\{([^}]+)\}/g, '$1')
      .trim();
    return {
      latex: tex,
      plainText: value.toString(),
      kind: 'symbolic',
    };
  }

  const str = String(value);
  return { latex: str, plainText: str, kind: 'symbolic' };
}

function trySymbolicCommand(normalized: string): MathNode | null {
  // d/dx(expr) ou ((d)/(dx))(expr)
  const leibnizMatch = normalized.match(
    /^\(\s*\(?\s*d\s*\)?\s*\/\s*\(?\s*d\s*([a-zA-Z])\s*\)?\s*\)\s*\((.+)\)$|^d\/d([a-zA-Z])\s*\((.+)\)$/
  );
  if (leibnizMatch) {
    const variable = leibnizMatch[1] ?? leibnizMatch[3];
    const targetExpr = leibnizMatch[2] ?? leibnizMatch[4];
    if (variable && targetExpr) {
      return simplify(derivative(targetExpr, variable));
    }
  }

  // derive(expr[, var]) ou diff(expr[, var])
  const diffCallMatch = normalized.match(/^(?:derive|diff)\s*\(([\s\S]+)\)$/);
  if (diffCallMatch) {
    const inner = diffCallMatch[1];
    // Découpage au premier ',' hors parenthèses/crochets
    let depth = 0;
    let commaIndex = -1;
    for (let i = 0; i < inner.length; i += 1) {
      const ch = inner[i];
      if (ch === '(' || ch === '[') depth += 1;
      else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      else if (ch === ',' && depth === 0) {
        commaIndex = i;
      }
    }
    if (commaIndex !== -1) {
      const targetExpr = inner.slice(0, commaIndex).trim();
      const variable = inner.slice(commaIndex + 1).trim();
      return simplify(derivative(targetExpr, variable || 'x'));
    }
    return simplify(derivative(inner, 'x'));
  }

  // simp(expr) ou simplify(expr)
  const simpCallMatch = normalized.match(/^(?:simp|simplify)\s*\(([\s\S]+)\)$/);
  if (simpCallMatch) {
    return simplify(simpCallMatch[1]);
  }

  return null;
}

/**
 * Évalue numériquement ou symboliquement une expression LaTeX/mathjs.
 */
export function evaluateLatexExpression(rawInput: string): MathEvalOutcome {
  const segment = splitChainedEqualsSegment(rawInput);
  if (!segment) {
    return { ok: false, error: 'Expression vide.' };
  }

  const normalized = normalizeMathExpression(segment);
  if (!normalized) {
    return { ok: false, error: 'Expression vide.' };
  }

  try {
    const symbolicCmdResult = trySymbolicCommand(normalized);
    if (symbolicCmdResult) {
      return { ok: true, ...formatValueToLatex(symbolicCmdResult) };
    }

    const parsed = parse(normalized);
    try {
      const val = evaluate(normalized);
      if (typeof val === 'function' || val === undefined) {
        const simplified = simplify(parsed);
        return { ok: true, ...formatValueToLatex(simplified) };
      }
      return { ok: true, ...formatValueToLatex(val) };
    } catch {
      const simplified = simplify(parsed);
      return { ok: true, ...formatValueToLatex(simplified) };
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Expression mathématique invalide.';
    return { ok: false, error: message };
  }
}

/**
 * Évalue la formule dans un champ LaTeX jusqu'au curseur et insère ` = <résultat>`.
 * Utilisé à la frappe de `==` (`trailingEqualsToConsume = 1`) ou via le raccourci `Alt+=` (`0`).
 */
export function evaluateLatexField(
  value: string,
  cursor: number,
  trailingEqualsToConsume = 0
): LatexEditResult | null {
  const endPos = Math.max(0, cursor - trailingEqualsToConsume);
  const lhs = value.slice(0, endPos).trimEnd();
  if (!lhs) {
    return null;
  }

  // Ne pas déclencher si un résultat vient déjà juste d'être collé avec '=' terminal sans expression
  if (/=\s*$/.test(lhs)) {
    return null;
  }

  const outcome = evaluateLatexExpression(lhs);
  if (!outcome.ok) {
    return null;
  }

  const beforeCursorRaw = value.slice(0, endPos);
  const trimmedBefore = beforeCursorRaw.trimEnd();
  const suffix = value.slice(cursor);
  const needsLeadingSpace = trimmedBefore.length > 0;
  const inserted = `${needsLeadingSpace ? ' ' : ''}= ${outcome.latex}`;
  const nextValue = `${trimmedBefore}${inserted}${suffix}`;
  const nextCursor = trimmedBefore.length + inserted.length;

  return {
    value: nextValue,
    selectionStart: nextCursor,
    selectionEnd: nextCursor,
  };
}

/**
 * Compile une expression f(x) avec normalisation LaTeX -> mathjs pour les graphes 2D.
 */
export function compilePlotFunction(
  rawExpr: string
): { evaluateAt: (x: number) => number; error?: undefined } | { evaluateAt?: undefined; error: string } {
  const normalized = normalizeMathExpression(rawExpr);
  if (!normalized) {
    return { error: 'Expression vide' };
  }
  try {
    const compiled = compile(normalized);
    // Test rapide pour valider les symboles
    compiled.evaluate({ x: 1 });
    return {
      evaluateAt: (x: number) => {
        try {
          const val = compiled.evaluate({ x });
          return typeof val === 'number' && Number.isFinite(val) ? val : Number.NaN;
        } catch {
          return Number.NaN;
        }
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Expression invalide',
    };
  }
}

/**
 * Compile automatiquement la dérivée symbolique f'(x) via mathjs.
 */
export function compilePlotDerivative(rawExpr: string): {
  evaluateAt: (x: number) => number;
  formula: string;
} | null {
  const normalized = normalizeMathExpression(rawExpr);
  if (!normalized) {
    return null;
  }
  try {
    const derivNode = simplify(derivative(normalized, 'x'));
    const compiled = derivNode.compile();
    return {
      formula: derivNode.toString(),
      evaluateAt: (x: number) => {
        try {
          const val = compiled.evaluate({ x });
          return typeof val === 'number' && Number.isFinite(val) ? val : Number.NaN;
        } catch {
          return Number.NaN;
        }
      },
    };
  } catch {
    return null;
  }
}

/**
 * Calcul numérique d'intégrale définie par méthode composite de Simpson.
 */
export function integrateSimpson(
  fn: (x: number) => number,
  a: number,
  b: number,
  intervals = 200
): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
    return a === b && Number.isFinite(a) ? 0 : null;
  }
  const n = intervals % 2 === 0 ? intervals : intervals + 1;
  const h = (b - a) / n;
  const fa = fn(a);
  const fb = fn(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) {
    return null;
  }

  let sum = fa + fb;
  for (let i = 1; i < n; i += 1) {
    const y = fn(a + i * h);
    if (!Number.isFinite(y)) {
      return null;
    }
    sum += (i % 2 === 0 ? 2 : 4) * y;
  }

  return (h / 3) * sum;
}
