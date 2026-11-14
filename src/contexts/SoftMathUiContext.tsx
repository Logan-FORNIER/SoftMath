import { createContext, useContext } from 'react';
import type { KatexMacroEntry } from '../services/katexMacrosService';

export interface SoftMathUiContextValue {
  katexMacros: KatexMacroEntry[];
  katexMacroVersion: number;
  isExamMode: boolean;
  autoNumbering: boolean;
  onOpenWikiLink?: (target: string, inSplit?: boolean) => void;
  getNoteSnippet?: (target: string) => { title: string; path: string; snippet: string } | null;
  jumpToEquationLabel?: (label: string) => void;
}

const DEFAULT_CONTEXT: SoftMathUiContextValue = {
  katexMacros: [],
  katexMacroVersion: 0,
  isExamMode: false,
  autoNumbering: true,
};

export const SoftMathUiContext = createContext<SoftMathUiContextValue>(DEFAULT_CONTEXT);

export function useSoftMathUi(): SoftMathUiContextValue {
  return useContext(SoftMathUiContext);
}

