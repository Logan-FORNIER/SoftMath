import { stripExamSolutionsFromMarkdown } from './examModeService';
import {
  exportLatexMacrosPreamble,
  type KatexMacroEntry,
} from './katexMacrosService';
import {
  escapeLatexText,
  inlineMarkdownToLatex,
  markdownToLatexBody,
} from './latexExportService';

export interface WorkspaceExportNoteItem {
  title: string;
  relativePath: string;
  content: string;
}

export interface WorkspaceLatexExportOptions {
  bookTitle: string;
  notes: WorkspaceExportNoteItem[];
  author?: string;
  excludeSolutions?: boolean;
  macros?: KatexMacroEntry[];
}

/**
 * Compiles multiple SoftMath Markdown notes into a unified standalone
 * multi-chapter LaTeX (`report`) document.
 */
export function exportWorkspaceToLatex(
  options: WorkspaceLatexExportOptions
): string {
  const titleLatex = inlineMarkdownToLatex(
    options.bookTitle.trim() || 'Recueil SoftMath'
  );
  const macrosPreamble = exportLatexMacrosPreamble(options.macros);
  const authorLine = options.author?.trim()
    ? `\\author{${escapeLatexText(options.author.trim())}}`
    : '\\author{}';

  const sortedNotes = [...options.notes].sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, 'fr')
  );

  const chapterBlocks = sortedNotes.map((note) => {
    const cleanTitle = inlineMarkdownToLatex(note.title.trim() || 'Chapitre');
    const effectiveMd = options.excludeSolutions
      ? stripExamSolutionsFromMarkdown(note.content, {
          proofPlaceholder: ':::proof\n\\textit{(À compléter — Mode Examen)}\n:::',
        })
      : note.content;
    const body = markdownToLatexBody(effectiveMd).trim();
    return [
      `% --- Source : ${note.relativePath} ---`,
      `\\chapter{${cleanTitle}}`,
      '',
      body || '\\textit{(Note vide)}',
    ].join('\n');
  });

  return [
    '\\documentclass[11pt,a4paper]{report}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[french]{babel}',
    '\\usepackage{amsmath,amssymb,amsthm}',
    '\\usepackage{booktabs,array,xcolor}',
    '\\usepackage[normalem]{ulem}',
    '\\usepackage{hyperref}',
    '\\usepackage[margin=2.2cm]{geometry}',
    '',
    '\\theoremstyle{definition}',
    '\\newtheorem{softdef}{Définition}[chapter]',
    '\\newtheorem{softex}{Exemple}[chapter]',
    '\\newtheorem{softexo}{Exercice}[chapter]',
    '\\theoremstyle{plain}',
    '\\newtheorem{softtheo}{Théorème}[chapter]',
    ...(macrosPreamble ? ['', '% Macros KaTeX / LaTeX personnalisées', macrosPreamble] : []),
    '',
    `\\title{${titleLatex}}`,
    authorLine,
    '\\date{\\today}',
    '',
    '\\begin{document}',
    '\\maketitle',
    '\\tableofcontents',
    '\\clearpage',
    '',
    chapterBlocks.join('\n\n\\clearpage\n\n'),
    '',
    '\\end{document}',
    '',
  ].join('\n');
}

