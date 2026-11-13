import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { evaluateLatexExpression } from '../utils/mathEval';

const MATH_EVAL_PLUGIN_KEY = new PluginKey('softMathEval');

const KNOWN_MATH_WORD_REGEX =
  /^(?:pi|tau|phi|e|i|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|asin|acos|atan|sinh|cosh|tanh|ln|log|exp|sqrt|abs|det|tr|trace|min|max|derive|diff|simp|simplify|Infinity)$/i;

function isPlausibleMathToken(token: string): boolean {
  if (!token) return false;
  if (/[À-ÿ]/.test(token)) return false;
  if (/[0-9+\-*/^()[\]{}\\_]/.test(token)) return true;
  if (KNOWN_MATH_WORD_REGEX.test(token)) return true;
  // Lettre mathématique isolée (x, y, z, t, n, a, b...)
  return /^[a-zA-Z]$/.test(token);
}

function deltaBracketDepth(token: string): number {
  let delta = 0;
  for (let i = 0; i < token.length; i += 1) {
    const ch = token[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') delta -= 1; // En reculant: '(' ferme le bloc en cours
    else if (ch === ')' || ch === ']' || ch === '}') delta += 1; // En reculant: ')' ouvre le bloc
  }
  return delta;
}

/**
 * Extrait une expression mathématique plausible en fin de texte avant le curseur.
 */
export function extractProseMathCandidate(rawTextBefore: string): {
  expression: string;
  startOffsetFromEnd: number;
} | null {
  const trimmedRight = rawTextBefore.replace(/\s+$/, '');
  if (!trimmedRight) {
    return null;
  }

  let cutIndex = 0;
  for (let i = trimmedRight.length - 1; i >= 0; i -= 1) {
    const ch = trimmedRight[i];
    if (ch === '\n' || ch === ';' || ch === ':') {
      cutIndex = i + 1;
      break;
    }
  }

  const tailSlice = trimmedRight.slice(cutIndex).trim();
  if (!tailSlice) {
    return null;
  }

  let candidate = tailSlice;
  if (tailSlice.includes(' ')) {
    const tokens = tailSlice.split(/\s+/);
    let endIdx = tokens.length - 1;
    // Ignorer un éventuel '=' terminal isolé (si présent)
    while (endIdx > 0 && tokens[endIdx] === '') {
      endIdx -= 1;
    }

    const lastTok = tokens[endIdx];
    if (!lastTok || !isPlausibleMathToken(lastTok)) {
      return null;
    }

    let startIdx = endIdx;
    let depth = deltaBracketDepth(lastTok);

    while (startIdx > 0) {
      const nextRight = tokens[startIdx];
      const leftTok = tokens[startIdx - 1];
      if (depth > 0) {
        startIdx -= 1;
        depth += deltaBracketDepth(leftTok);
        continue;
      }

      const rightStartsWithOp = /^[+\-*/^,=<>!]/.test(nextRight);
      const leftEndsWithOp = /[+\-*/^,=<>!([]$/.test(leftTok);
      const leftIsMathLike =
        !/[À-ÿ]/.test(leftTok) &&
        (/[0-9+\-*/^()[\]{}\\]/.test(leftTok) ||
          KNOWN_MATH_WORD_REGEX.test(leftTok));

      if (rightStartsWithOp || leftEndsWithOp) {
        if (!isPlausibleMathToken(leftTok)) {
          break;
        }
        startIdx -= 1;
        depth += deltaBracketDepth(leftTok);
        continue;
      }

      // Deux jetons mathématiques collés avec parenthèse ou fonction explicite (ex: "2 sin(x)")
      if (leftIsMathLike && /^[(\\]/.test(nextRight)) {
        startIdx -= 1;
        depth += deltaBracketDepth(leftTok);
        continue;
      }

      break;
    }

    candidate = tokens.slice(startIdx, endIdx + 1).join(' ');
  }

  if (!looksLikeMathExpression(candidate)) {
    return null;
  }

  const exactIndex = rawTextBefore.lastIndexOf(candidate);
  if (exactIndex === -1) {
    return null;
  }

  return {
    expression: candidate,
    startOffsetFromEnd: rawTextBefore.length - exactIndex,
  };
}

function looksLikeMathExpression(expr: string): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return false;
  // Rejeter les mots simples ou chaînes sans opérateur, chiffre, parenthèse ou commande symbolique
  if (/^[a-zA-ZÀ-ÿ]+$/.test(trimmed)) {
    return false;
  }
  return (
    /[0-9+\-*/^()[\]\\]/.test(trimmed) ||
    /^(?:derive|diff|simp|simplify|det|sqrt|sin|cos|tan|ln|log|exp)\s*\(/.test(
      trimmed
    )
  );
}

/**
 * Évalue une expression sélectionnée ou située avant le curseur dans l'éditeur
 * et la remplace par une formule KaTeX `<expr> = <résultat>`.
 */
export function evaluateProseAtSelection(
  view: EditorView,
  consumeTrailingEquals = 0
): boolean {
  const { state } = view;
  const { selection } = state;
  const { $from, from, to, empty } = selection;

  // Ne pas interférer à l'intérieur des blocs de code ou si nœud non textuel
  if ($from.parent.type.spec.code || !$from.parent.isTextblock) {
    return false;
  }

  const inlineMathType = state.schema.nodes.inlineMath;
  if (!inlineMathType) {
    return false;
  }

  if (!empty) {
    const selectedText = state.doc.textBetween(from, to, ' ').trim();
    if (!selectedText) {
      return false;
    }
    const outcome = evaluateLatexExpression(selectedText);
    if (!outcome.ok) {
      return false;
    }
    const node = inlineMathType.create({
      latex: `${selectedText} = ${outcome.latex}`,
    });
    const tr = state.tr.replaceWith(from, to, node);
    view.dispatch(tr);
    return true;
  }

  const parentStart = $from.start();
  const rawBeforeCursor = state.doc.textBetween(parentStart, from, ' ', ' ');
  const beforeEquals =
    consumeTrailingEquals > 0
      ? rawBeforeCursor.slice(0, -consumeTrailingEquals)
      : rawBeforeCursor;

  const candidate = extractProseMathCandidate(beforeEquals);
  if (!candidate) {
    return false;
  }

  const outcome = evaluateLatexExpression(candidate.expression);
  if (!outcome.ok) {
    return false;
  }

  const replaceFrom = from - consumeTrailingEquals - candidate.startOffsetFromEnd;
  const replaceTo = from;
  if (
    replaceFrom < parentStart ||
    !state.doc.textBetween(replaceFrom, from, ' ', ' ').startsWith(candidate.expression)
  ) {
    return false;
  }

  const mathNode = inlineMathType.create({
    latex: `${candidate.expression} = ${outcome.latex}`,
  });
  const tr = state.tr.replaceWith(replaceFrom, replaceTo, mathNode);
  view.dispatch(tr);
  return true;
}

export const SoftMathEval = Extension.create({
  name: 'softMathEval',

  addKeyboardShortcuts() {
    return {
      'Alt-=': () => evaluateProseAtSelection(this.editor.view, 0),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: MATH_EVAL_PLUGIN_KEY,
        props: {
          handleTextInput(view, from, to, text) {
            if (text !== '=' || from !== to) {
              return false;
            }
            const { $from } = view.state.selection;
            if ($from.parent.type.spec.code || !$from.parent.isTextblock) {
              return false;
            }
            const parentStart = $from.start();
            const textBefore = view.state.doc.textBetween(parentStart, from, ' ', ' ');
            if (!textBefore.endsWith('=')) {
              return false;
            }
            const charBeforeEquals = textBefore[textBefore.length - 2] ?? '';
            if (
              charBeforeEquals === '<' ||
              charBeforeEquals === '>' ||
              charBeforeEquals === '!' ||
              charBeforeEquals === '='
            ) {
              return false;
            }
            return evaluateProseAtSelection(view, 1);
          },
        },
      }),
    ];
  },
});
