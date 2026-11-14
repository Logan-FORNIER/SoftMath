export interface Rational {
  n: bigint;
  d: bigint;
}

export interface RrefStep {
  operation: string;
  operationLatex: string;
  matrix: Rational[][];
}

export interface RrefResult {
  rref: Rational[][];
  rank: number;
  pivotCols: number[];
  steps: RrefStep[];
}

export interface InverseResult {
  invertible: boolean;
  det: Rational;
  inverse: Rational[][] | null;
  steps: RrefStep[];
}

export interface LinearSystemResult {
  status: 'unique' | 'infinite' | 'inconsistent';
  rankA: number;
  rankAugmented: number;
  uniqueSolution: Rational[] | null;
  freeVarIndices: number[];
  /** For each unknown x_i: constant term + coeff * freeParam[k] */
  parametricTerms: {
    constant: Rational;
    coeffs: { paramIndex: number; coeff: Rational }[];
  }[] | null;
  steps: RrefStep[];
}

export type MatrixMode = 'matrix' | 'system';
export type MatrixDelimiter = 'pmatrix' | 'bmatrix' | 'vmatrix';

export interface MatrixBlockConfig {
  title: string;
  mode: MatrixMode;
  delimiter: MatrixDelimiter;
  rows: number;
  cols: number;
  entries: string[][];
  rhs: string[];
  showSteps: boolean;
}

function absBig(a: bigint): bigint {
  return a < 0n ? -a : a;
}

function gcdBig(a: bigint, b: bigint): bigint {
  let x = absBig(a);
  let y = absBig(b);
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

export function rat(n: bigint | number, d: bigint | number = 1n): Rational {
  let bn = typeof n === 'bigint' ? n : BigInt(Math.trunc(n));
  let bd = typeof d === 'bigint' ? d : BigInt(Math.trunc(d));
  if (bd === 0n) {
    throw new Error('Division par zéro');
  }
  if (bd < 0n) {
    bn = -bn;
    bd = -bd;
  }
  if (bn === 0n) {
    return { n: 0n, d: 1n };
  }
  const g = gcdBig(bn, bd);
  return { n: bn / g, d: bd / g };
}

export function isZeroRat(a: Rational): boolean {
  return a.n === 0n;
}

export function addRat(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function subRat(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mulRat(a: Rational, b: Rational): Rational {
  return rat(a.n * b.n, a.d * b.d);
}

export function divRat(a: Rational, b: Rational): Rational {
  return rat(a.n * b.d, a.d * b.n);
}

export function negRat(a: Rational): Rational {
  return { n: -a.n, d: a.d };
}

export function parseCellToRational(raw: string): Rational | null {
  const s = raw.trim().replace(/,/g, '.').replace(/\s+/g, '');
  if (!s) return rat(0n, 1n);

  // Fraction "a/b"
  const fracMatch = s.match(/^([+-]?\d+)\/([+-]?\d+)$/);
  if (fracMatch) {
    const den = BigInt(fracMatch[2]);
    if (den === 0n) return null;
    return rat(BigInt(fracMatch[1]), den);
  }

  // Integer
  if (/^[+-]?\d+$/.test(s)) {
    return rat(BigInt(s), 1n);
  }

  // Finite decimal "a.b"
  const decMatch = s.match(/^([+-]?)(\d*)\.(\d+)$/);
  if (decMatch) {
    const sign = decMatch[1] === '-' ? -1n : 1n;
    const intPart = decMatch[2] || '0';
    const fracPart = decMatch[3];
    const scale = 10n ** BigInt(fracPart.length);
    const num = BigInt(intPart) * scale + BigInt(fracPart);
    return rat(sign * num, scale);
  }

  return null;
}

export function rationalToString(r: Rational): string {
  if (r.n === 0n) return '0';
  if (r.d === 1n) return r.n.toString();
  return `${r.n.toString()}/${r.d.toString()}`;
}

export function rationalToLatex(r: Rational): string {
  if (r.n === 0n) return '0';
  if (r.d === 1n) return r.n.toString();
  if (r.n < 0n) {
    return `-\\frac{${(-r.n).toString()}}{${r.d.toString()}}`;
  }
  return `\\frac{${r.n.toString()}}{${r.d.toString()}}`;
}

function cloneRatMatrix(m: Rational[][]): Rational[][] {
  return m.map((row) => row.map((cell) => ({ ...cell })));
}

export function parseEntriesMatrix(
  entries: string[][],
  rows: number,
  cols: number
): Rational[][] | null {
  const result: Rational[][] = [];
  for (let i = 0; i < rows; i += 1) {
    const row: Rational[] = [];
    for (let j = 0; j < cols; j += 1) {
      const parsed = parseCellToRational(entries[i]?.[j] ?? '0');
      if (!parsed) return null;
      row.push(parsed);
    }
    result.push(row);
  }
  return result;
}

export function matrixTranspose(m: Rational[][]): Rational[][] {
  if (m.length === 0) return [];
  const rows = m.length;
  const cols = m[0].length;
  return Array.from({ length: cols }, (_, c) =>
    Array.from({ length: rows }, (__, r) => m[r][c])
  );
}

export function matrixTrace(m: Rational[][]): Rational | null {
  const n = m.length;
  if (n === 0 || m[0].length !== n) return null;
  let sum = rat(0n, 1n);
  for (let i = 0; i < n; i += 1) {
    sum = addRat(sum, m[i][i]);
  }
  return sum;
}

export function matrixDeterminant(m: Rational[][]): Rational | null {
  const n = m.length;
  if (n === 0 || m[0].length !== n) return null;
  const work = cloneRatMatrix(m);
  let det = rat(1n, 1n);

  for (let col = 0; col < n; col += 1) {
    let pivotRow = -1;
    for (let row = col; row < n; row += 1) {
      if (!isZeroRat(work[row][col])) {
        pivotRow = row;
        break;
      }
    }
    if (pivotRow === -1) {
      return rat(0n, 1n);
    }
    if (pivotRow !== col) {
      const tmp = work[col];
      work[col] = work[pivotRow];
      work[pivotRow] = tmp;
      det = negRat(det);
    }
    const pivot = work[col][col];
    det = mulRat(det, pivot);

    for (let row = col + 1; row < n; row += 1) {
      if (isZeroRat(work[row][col])) continue;
      const factor = divRat(work[row][col], pivot);
      for (let k = col; k < n; k += 1) {
        work[row][k] = subRat(work[row][k], mulRat(factor, work[col][k]));
      }
    }
  }
  return det;
}

function formatScaledCoeffLatex(factor: Rational, plusSign = true): string {
  const absR = factor.n < 0n ? negRat(factor) : factor;
  const op = plusSign
    ? factor.n < 0n
      ? '-'
      : '+'
    : factor.n < 0n
      ? '+'
      : '-';
  if (absR.n === 1n && absR.d === 1n) {
    return op;
  }
  return `${op} ${rationalToLatex(absR)}`;
}

export function matrixRref(
  input: Rational[][],
  maxPivotCols?: number
): RrefResult {
  const rows = input.length;
  const cols = rows > 0 ? input[0].length : 0;
  const pivotLimit = maxPivotCols !== undefined ? Math.min(cols, maxPivotCols) : cols;
  const work = cloneRatMatrix(input);
  const steps: RrefStep[] = [
    {
      operation: 'Matrice initiale',
      operationLatex: '\\text{Matrice initiale}',
      matrix: cloneRatMatrix(work),
    },
  ];

  const pivotCols: number[] = [];
  let pivotRow = 0;

  for (let col = 0; col < pivotLimit && pivotRow < rows; col += 1) {
    let bestRow = -1;
    for (let r = pivotRow; r < rows; r += 1) {
      if (!isZeroRat(work[r][col])) {
        bestRow = r;
        break;
      }
    }
    if (bestRow === -1) continue;

    if (bestRow !== pivotRow) {
      const tmp = work[pivotRow];
      work[pivotRow] = work[bestRow];
      work[bestRow] = tmp;
      steps.push({
        operation: `L${pivotRow + 1} ↔ L${bestRow + 1}`,
        operationLatex: `L_{${pivotRow + 1}} \\leftrightarrow L_{${bestRow + 1}}`,
        matrix: cloneRatMatrix(work),
      });
    }

    const pivot = work[pivotRow][col];
    if (pivot.n !== 1n || pivot.d !== 1n) {
      const inv = divRat(rat(1n, 1n), pivot);
      for (let c = 0; c < cols; c += 1) {
        work[pivotRow][c] = mulRat(work[pivotRow][c], inv);
      }
      steps.push({
        operation: `L${pivotRow + 1} ← (${rationalToString(inv)})·L${pivotRow + 1}`,
        operationLatex: `L_{${pivotRow + 1}} \\leftarrow ${rationalToLatex(inv)}\\,L_{${pivotRow + 1}}`,
        matrix: cloneRatMatrix(work),
      });
    }

    for (let r = 0; r < rows; r += 1) {
      if (r === pivotRow || isZeroRat(work[r][col])) continue;
      const factor = work[r][col];
      for (let c = 0; c < cols; c += 1) {
        work[r][c] = subRat(work[r][c], mulRat(factor, work[pivotRow][c]));
      }
      steps.push({
        operation: `L${r + 1} ← L${r + 1} - (${rationalToString(factor)})·L${pivotRow + 1}`,
        operationLatex: `L_{${r + 1}} \\leftarrow L_{${r + 1}} ${formatScaledCoeffLatex(factor, false)}\\,L_{${pivotRow + 1}}`,
        matrix: cloneRatMatrix(work),
      });
    }

    pivotCols.push(col);
    pivotRow += 1;
  }

  return {
    rref: work,
    rank: pivotCols.length,
    pivotCols,
    steps,
  };
}

export function matrixInverse(m: Rational[][]): InverseResult | null {
  const n = m.length;
  if (n === 0 || m[0].length !== n) return null;
  const det = matrixDeterminant(m) ?? rat(0n, 1n);

  const augmented: Rational[][] = m.map((row, r) => [
    ...row,
    ...Array.from({ length: n }, (__, c) => (r === c ? rat(1n, 1n) : rat(0n, 1n))),
  ]);

  const { rref, rank, steps } = matrixRref(augmented, n);
  if (rank < n || isZeroRat(det)) {
    return {
      invertible: false,
      det,
      inverse: null,
      steps,
    };
  }

  const inverse = rref.map((row) => row.slice(n));
  return {
    invertible: true,
    det,
    inverse,
    steps,
  };
}

export function solveLinearSystem(
  A: Rational[][],
  B: Rational[]
): LinearSystemResult | null {
  const rows = A.length;
  const cols = rows > 0 ? A[0].length : 0;
  if (rows === 0 || cols === 0 || B.length !== rows) return null;

  const augmented: Rational[][] = A.map((row, r) => [...row, B[r]]);
  const { rref, pivotCols, steps } = matrixRref(augmented, cols);
  const rankA = pivotCols.length;

  let inconsistent = false;
  let rankAugmented = rankA;
  for (let r = rankA; r < rows; r += 1) {
    if (!isZeroRat(rref[r][cols])) {
      inconsistent = true;
      rankAugmented = rankA + 1;
      break;
    }
  }

  if (inconsistent) {
    return {
      status: 'inconsistent',
      rankA,
      rankAugmented,
      uniqueSolution: null,
      freeVarIndices: [],
      parametricTerms: null,
      steps,
    };
  }

  const pivotSet = new Set(pivotCols);
  const freeVarIndices: number[] = [];
  for (let c = 0; c < cols; c += 1) {
    if (!pivotSet.has(c)) {
      freeVarIndices.push(c);
    }
  }

  if (freeVarIndices.length === 0) {
    const uniqueSolution: Rational[] = Array.from({ length: cols }, () => rat(0n, 1n));
    pivotCols.forEach((col, rowIdx) => {
      uniqueSolution[col] = rref[rowIdx][cols];
    });
    return {
      status: 'unique',
      rankA,
      rankAugmented: rankA,
      uniqueSolution,
      freeVarIndices: [],
      parametricTerms: null,
      steps,
    };
  }

  const parametricTerms = Array.from({ length: cols }, (_, c) => {
    const freeIdx = freeVarIndices.indexOf(c);
    if (freeIdx !== -1) {
      return {
        constant: rat(0n, 1n),
        coeffs: [{ paramIndex: freeIdx, coeff: rat(1n, 1n) }],
      };
    }
    const rowIdx = pivotCols.indexOf(c);
    const coeffs: { paramIndex: number; coeff: Rational }[] = [];
    freeVarIndices.forEach((fCol, pIdx) => {
      const val = negRat(rref[rowIdx][fCol]);
      if (!isZeroRat(val)) {
        coeffs.push({ paramIndex: pIdx, coeff: val });
      }
    });
    return {
      constant: rref[rowIdx][cols],
      coeffs,
    };
  });

  return {
    status: 'infinite',
    rankA,
    rankAugmented: rankA,
    uniqueSolution: null,
    freeVarIndices,
    parametricTerms,
    steps,
  };
}

export function rationalMatrixToLatex(
  m: Rational[][],
  delimiter: MatrixDelimiter = 'pmatrix',
  splitCol?: number
): string {
  if (m.length === 0) return '';
  if (splitCol !== undefined && splitCol > 0 && splitCol < m[0].length) {
    const leftCols = 'c'.repeat(splitCol);
    const rightCols = 'c'.repeat(m[0].length - splitCol);
    const open = delimiter === 'bmatrix' ? '[' : '(';
    const close = delimiter === 'bmatrix' ? ']' : ')';
    const body = m
      .map((row) => row.map(rationalToLatex).join(' & '))
      .join(' \\\\\n  ');
    return `\\left${open}\\begin{array}{${leftCols}|${rightCols}}\n  ${body}\n\\end{array}\\right${close}`;
  }
  const body = m
    .map((row) => row.map(rationalToLatex).join(' & '))
    .join(' \\\\\n  ');
  return `\\begin{${delimiter}}\n  ${body}\n\\end{${delimiter}}`;
}

export function matrixBlockConfigToLatex(config: MatrixBlockConfig): string {
  const rows = Math.max(1, Math.min(8, config.rows));
  const cols = Math.max(1, Math.min(8, config.cols));
  const cellLatex = (raw: string) => {
    const trimmed = raw.trim() || '0';
    const r = parseCellToRational(trimmed);
    return r ? rationalToLatex(r) : trimmed;
  };

  if (config.mode === 'system') {
    const leftCols = 'c'.repeat(cols);
    const open = config.delimiter === 'bmatrix' ? '[' : '(';
    const close = config.delimiter === 'bmatrix' ? ']' : ')';
    const lines = Array.from({ length: rows }, (_, r) => {
      const left = Array.from({ length: cols }, (__, c) =>
        cellLatex(config.entries[r]?.[c] ?? '0')
      );
      const b = cellLatex(config.rhs?.[r] ?? '0');
      return `${left.join(' & ')} & ${b}`;
    });
    return `\\left${open}\\begin{array}{${leftCols}|c}\n  ${lines.join(' \\\\\n  ')}\n\\end{array}\\right${close}`;
  }

  const lines = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (__, c) =>
      cellLatex(config.entries[r]?.[c] ?? '0')
    ).join(' & ')
  );
  return `\\begin{${config.delimiter}}\n  ${lines.join(' \\\\\n  ')}\n\\end{${config.delimiter}}`;
}

export function solutionToLatex(result: LinearSystemResult): string {
  const vars = ['x', 'y', 'z', 't', 'u', 'v', 'w', 'p'];
  if (result.status === 'inconsistent') {
    return '\\mathcal{S} = \\varnothing \\quad (\\text{système incompatible})';
  }
  if (result.status === 'unique' && result.uniqueSolution) {
    const tuple = result.uniqueSolution.map(rationalToLatex).join(',\\; ');
    return `\\mathcal{S} = \\left\\{\\left(${tuple}\\right)\\right\\}`;
  }
  if (result.parametricTerms) {
    const params = result.freeVarIndices.map((_, idx) => `t_{${idx + 1}}`);
    const tuple = result.parametricTerms
      .map((term) => {
        const parts: string[] = [];
        if (!isZeroRat(term.constant) || term.coeffs.length === 0) {
          parts.push(rationalToLatex(term.constant));
        }
        for (const item of term.coeffs) {
          const pName = params[item.paramIndex] ?? `t_{${item.paramIndex + 1}}`;
          const c = item.coeff;
          const isNeg = c.n < 0n;
          const absC = isNeg ? negRat(c) : c;
          const mag = absC.n === 1n && absC.d === 1n ? pName : `${rationalToLatex(absC)}\\,${pName}`;
          if (parts.length === 0) {
            parts.push(isNeg ? `-${mag}` : mag);
          } else {
            parts.push(isNeg ? `- ${mag}` : `+ ${mag}`);
          }
        }
        return parts.join(' ');
      })
      .join(',\\; ');
    const paramNames =
      params.length === 1 ? `${params[0]} \\in \\mathbb{R}` : `${params.join(', ')} \\in \\mathbb{R}`;
    const varTuple = Array.from(
      { length: result.parametricTerms.length },
      (_, idx) => vars[idx] ?? `x_{${idx + 1}}`
    ).join(', ');
    return `\\left(${varTuple}\\right) = \\left(${tuple}\\right),\\quad ${paramNames}`;
  }
  return '';
}

