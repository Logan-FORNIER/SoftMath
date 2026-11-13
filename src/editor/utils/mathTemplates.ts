export type MathStructureKind =
  | 'pmatrix'
  | 'bmatrix'
  | 'vmatrix'
  | 'vector'
  | 'cases';

export interface MathStructureDescriptor {
  kind: MathStructureKind;
  label: string;
  shortLabel: string;
  defaultRows: number;
  defaultCols: number;
  fixedCols?: number;
}

export const MATH_STRUCTURE_KINDS: MathStructureDescriptor[] = [
  {
    kind: 'pmatrix',
    label: 'Matrice ( )',
    shortLabel: '( )',
    defaultRows: 2,
    defaultCols: 2,
  },
  {
    kind: 'bmatrix',
    label: 'Matrice [ ]',
    shortLabel: '[ ]',
    defaultRows: 2,
    defaultCols: 2,
  },
  {
    kind: 'vmatrix',
    label: 'Déterminant | |',
    shortLabel: '| |',
    defaultRows: 2,
    defaultCols: 2,
  },
  {
    kind: 'vector',
    label: 'Vecteur colonne',
    shortLabel: 'Vect.',
    defaultRows: 3,
    defaultCols: 1,
    fixedCols: 1,
  },
  {
    kind: 'cases',
    label: 'Système d’équations',
    shortLabel: '{ Sys.',
    defaultRows: 2,
    defaultCols: 1,
    fixedCols: 1,
  },
];

/**
 * Génère le code LaTeX d'une matrice, d'un déterminant, d'un vecteur ou d'un système
 * avec la position du curseur directement dans la première cellule.
 */
export function generateMathStructureLatex(
  kind: MathStructureKind,
  rawRows: number,
  rawCols: number,
  multiline = false
): { latex: string; cursorOffset: number } {
  const rows = Math.max(1, Math.min(8, Math.round(rawRows)));
  const cols =
    kind === 'vector' || kind === 'cases'
      ? 1
      : Math.max(1, Math.min(8, Math.round(rawCols)));

  const env = kind === 'vector' ? 'pmatrix' : kind;
  const open = `\\begin{${env}}`;
  const close = `\\end{${env}}`;

  if (kind === 'cases') {
    const sampleLines = Array.from({ length: rows }, (_, r) =>
      r === 0 ? ' = ' : ' = '
    );
    if (multiline) {
      const prefix = `${open}\n  `;
      const body = sampleLines.join(' \\\\\n  ');
      return {
        latex: `${prefix}${body}\n${close}`,
        cursorOffset: prefix.length,
      };
    }
    const prefix = `${open} `;
    const body = sampleLines.join(' \\\\ ');
    return {
      latex: `${prefix}${body} ${close}`,
      cursorOffset: prefix.length,
    };
  }

  const rowStrings = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => '  ').join('&')
  );

  if (multiline) {
    const prefix = `${open}\n  `;
    const body = rowStrings.join(' \\\\\n  ');
    return {
      latex: `${prefix}${body}\n${close}`,
      cursorOffset: prefix.length + 1,
    };
  }

  const prefix = `${open} `;
  const body = rowStrings.join(' \\\\ ');
  return {
    latex: `${prefix}${body} ${close}`,
    cursorOffset: prefix.length,
  };
}

