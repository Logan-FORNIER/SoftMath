import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import {
  computeLatexKeyDownEdit,
  computeLatexSymbolInsert,
  type LatexEditResult,
  type LatexSymbolInsertSpec,
} from '../utils/latexSnippets';
import { evaluateLatexField } from '../utils/mathEval';
import {
  generateMathStructureLatex,
  type MathStructureKind,
} from '../utils/mathTemplates';

interface UseLatexEditorControlOptions {
  fieldRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  value: string;
  onChangeValue: (nextValue: string) => void;
  multiline?: boolean;
}

/**
 * Gère les auto-snippets LaTeX, le calcul symbolique (`==` / `Alt+=`),
 * la palette `Ctrl+M`, le constructeur de matrices/systèmes et le curseur.
 */
export function useLatexEditorControl({
  fieldRef,
  value,
  onChangeValue,
  multiline = false,
}: UseLatexEditorControlOptions) {
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isStructureOpen, setIsStructureOpen] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(
    null
  );
  const lastKnownSelectionRef = useRef<{ start: number; end: number } | null>(
    null
  );

  const captureSelection = useCallback(() => {
    const el = fieldRef.current;
    if (!el) return;
    lastKnownSelectionRef.current = {
      start: el.selectionStart ?? value.length,
      end: el.selectionEnd ?? value.length,
    };
  }, [fieldRef, value.length]);

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending) {
      return;
    }
    const el = fieldRef.current;
    if (!el) {
      return;
    }
    pendingSelectionRef.current = null;
    if (document.activeElement !== el) {
      el.focus();
    }
    el.setSelectionRange(pending.start, pending.end);
    lastKnownSelectionRef.current = pending;
  }, [value, fieldRef]);

  const applyEditResult = useCallback(
    (result: LatexEditResult) => {
      setCalcError(null);
      pendingSelectionRef.current = {
        start: result.selectionStart,
        end: result.selectionEnd,
      };
      onChangeValue(result.value);

      requestAnimationFrame(() => {
        const el = fieldRef.current;
        if (!el || !pendingSelectionRef.current) {
          return;
        }
        if (el.value === result.value) {
          const { start, end } = pendingSelectionRef.current;
          pendingSelectionRef.current = null;
          if (document.activeElement !== el) {
            el.focus();
          }
          el.setSelectionRange(start, end);
          lastKnownSelectionRef.current = { start, end };
        }
      });
    },
    [fieldRef, onChangeValue]
  );

  const resolveCurrentSelection = useCallback((): {
    start: number;
    end: number;
  } => {
    const el = fieldRef.current;
    if (el && typeof el.selectionStart === 'number') {
      return {
        start: Math.min(el.selectionStart, value.length),
        end: Math.min(el.selectionEnd ?? el.selectionStart, value.length),
      };
    }
    if (lastKnownSelectionRef.current) {
      const { start, end } = lastKnownSelectionRef.current;
      return {
        start: Math.min(start, value.length),
        end: Math.min(end, value.length),
      };
    }
    return { start: value.length, end: value.length };
  }, [fieldRef, value.length]);

  const handleEvaluateMath = useCallback((): boolean => {
    const { start } = resolveCurrentSelection();
    const evaluated = evaluateLatexField(value, start, 0);
    if (!evaluated) {
      setCalcError('Expression non évaluable');
      return false;
    }
    applyEditResult(evaluated);
    return true;
  }, [value, resolveCurrentSelection, applyEditResult]);

  const handleSmartKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): boolean => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        e.stopPropagation();
        captureSelection();
        setIsStructureOpen(false);
        setIsPaletteOpen((prev) => !prev);
        return true;
      }

      if (e.key === 'Escape' && (isPaletteOpen || isStructureOpen)) {
        e.preventDefault();
        e.stopPropagation();
        setIsPaletteOpen(false);
        setIsStructureOpen(false);
        fieldRef.current?.focus();
        return true;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        e.stopPropagation();
        return true;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === '=') {
        e.preventDefault();
        e.stopPropagation();
        handleEvaluateMath();
        return true;
      }

      const target = e.currentTarget;
      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;

      const edit = computeLatexKeyDownEdit(value, start, end, e);
      if (!edit) {
        if (calcError) {
          setCalcError(null);
        }
        return false;
      }

      e.preventDefault();
      applyEditResult(edit);
      return true;
    },
    [
      value,
      isPaletteOpen,
      isStructureOpen,
      calcError,
      applyEditResult,
      captureSelection,
      fieldRef,
      handleEvaluateMath,
    ]
  );

  const handleInsertSymbol = useCallback(
    (spec: LatexSymbolInsertSpec) => {
      const { start, end } = resolveCurrentSelection();
      const result = computeLatexSymbolInsert(value, start, end, spec);
      applyEditResult(result);
    },
    [value, resolveCurrentSelection, applyEditResult]
  );

  const handleInsertStructure = useCallback(
    (kind: MathStructureKind, rows: number, cols: number) => {
      const { start, end } = resolveCurrentSelection();
      const generated = generateMathStructureLatex(kind, rows, cols, multiline);
      const result = computeLatexSymbolInsert(value, start, end, {
        latex: generated.latex,
        cursorOffset: generated.cursorOffset,
      });
      setIsStructureOpen(false);
      applyEditResult(result);
    },
    [value, multiline, resolveCurrentSelection, applyEditResult]
  );

  const closeAllPopovers = useCallback(() => {
    setIsPaletteOpen(false);
    setIsStructureOpen(false);
    setCalcError(null);
  }, []);

  return {
    isPaletteOpen,
    setIsPaletteOpen,
    isStructureOpen,
    setIsStructureOpen,
    calcError,
    captureSelection,
    closeAllPopovers,
    handleSmartKeyDown,
    handleInsertSymbol,
    handleInsertStructure,
    handleEvaluateMath,
  };
}
