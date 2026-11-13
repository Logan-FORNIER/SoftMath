import React, { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import {
  Camera,
  FlaskConical,
  ListOrdered,
  ShieldCheck,
  Sigma,
  Sparkles,
} from 'lucide-react';
import type {
  AiContextSelectionPayload,
  AiInlineActionKind,
} from '../../types/ai';

export interface AiMenuPosition {
  top: number;
  left: number;
}

interface AiContextMenuProps {
  isOpen: boolean;
  position: AiMenuPosition;
  hasSelection: boolean;
  onSelectAction: (action: AiInlineActionKind) => void;
  onTriggerOcr: () => void;
  onClose: () => void;
}

const MENU_ITEMS: Array<{
  action: AiInlineActionKind;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}> = [
  {
    action: 'verify-rigor',
    label: 'Vérifier la rigueur',
    description: 'Audit signes, domaines et logique dans le Copilote',
    Icon: ShieldCheck,
    accentClass: 'text-amber-600 dark:text-amber-400',
  },
  {
    action: 'detail-steps',
    label: 'Détailler les étapes',
    description: 'Développe les calculs intermédiaires sous le passage',
    Icon: ListOrdered,
    accentClass: 'text-sky-600 dark:text-sky-400',
  },
  {
    action: 'generate-exercise',
    label: 'Générer un exemple / exercice',
    description: 'Insère un bloc Exercice + solution repliable dessous',
    Icon: FlaskConical,
    accentClass: 'text-teal-600 dark:text-teal-400',
  },
  {
    action: 'convert-latex',
    label: 'Convertir en LaTeX propre',
    description: 'Transforme le texte ou brouillon en KaTeX impeccable',
    Icon: Sigma,
    accentClass: 'text-indigo-600 dark:text-indigo-400',
  },
];

function serializeRangeText(editor: Editor, from: number, to: number): string {
  return editor.state.doc
    .textBetween(from, to, '\n\n', (node) => {
      if (node.type.name === 'inlineMath') {
        return `$${String(node.attrs?.latex ?? '')}$`;
      }
      if (node.type.name === 'blockMath') {
        return `\n$$\n${String(node.attrs?.latex ?? '')}\n$$\n`;
      }
      if (node.type.name === 'hardBreak') {
        return '\n';
      }
      return '';
    })
    .trim();
}

export function extractEditorContextForAi(
  editor: Editor,
): Omit<AiContextSelectionPayload, 'action'> {
  const { doc, selection } = editor.state;
  const fullMarkdown = editor.getMarkdown();

  let from = selection.from;
  let to = selection.to;
  let selectedText = '';
  let insertAfterPos = to;

  if (!selection.empty) {
    selectedText = serializeRangeText(editor, from, to);
    const $to = doc.resolve(to);
    insertAfterPos = $to.depth >= 1 ? $to.after(1) : to;
  } else {
    const $from = selection.$from;
    let academicDepth = -1;
    for (let d = $from.depth; d >= 1; d -= 1) {
      if ($from.node(d).type.name === 'academicBlock') {
        academicDepth = d;
        break;
      }
    }

    if (academicDepth !== -1) {
      const blockNode = $from.node(academicDepth);
      from = $from.before(academicDepth);
      to = $from.after(academicDepth);
      insertAfterPos = to;
      selectedText =
        editor.markdown?.serialize({
          type: 'doc',
          content: [blockNode.toJSON()],
        })?.trim() || serializeRangeText(editor, from, to);
    } else if ($from.depth >= 1) {
      from = $from.before(1);
      to = $from.after(1);
      insertAfterPos = to;
      const topNode = $from.node(1);
      selectedText =
        editor.markdown?.serialize({
          type: 'doc',
          content: [topNode.toJSON()],
        })?.trim() || serializeRangeText(editor, from, to);
    }
  }

  if (!selectedText) {
    selectedText = fullMarkdown.slice(0, 3000).trim();
  }

  const contextFrom = Math.max(0, from - 600);
  const contextTo = Math.min(doc.content.size, to + 600);
  const surroundingText = serializeRangeText(editor, contextFrom, contextTo);

  return {
    selectedText,
    surroundingText,
    selectionRange: { from, to },
    insertAfterPos: Math.min(insertAfterPos, doc.content.size),
  };
}

export const AiContextMenu: React.FC<AiContextMenuProps> = ({
  isOpen,
  position,
  hasSelection,
  onSelectAction,
  onTriggerOcr,
  onClose,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveIndex(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % MENU_ITEMS.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(
          (prev) => (prev - 1 + MENU_ITEMS.length) % MENU_ITEMS.length,
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const chosen = MENU_ITEMS[activeIndex];
        if (chosen) {
          onSelectAction(chosen.action);
        }
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isOpen, activeIndex, onSelectAction, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      data-testid="ai-context-menu"
      role="menu"
      aria-label="Actions IA contextuelles"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      className="absolute z-40 w-80 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl print:hidden dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/90 px-3 py-1.5 text-[11px] dark:border-zinc-800 dark:bg-zinc-950/60">
        <div className="flex items-center gap-1.5 font-semibold text-indigo-600 dark:text-indigo-400">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Assistant IA Mathématique</span>
        </div>
        <span className="font-mono text-[10px] text-stone-400 dark:text-zinc-500">
          {hasSelection ? 'Sur sélection' : 'Sur bloc'} · Ctrl+I
        </span>
      </div>

      <div className="p-1">
        {MENU_ITEMS.map((item, idx) => {
          const Icon = item.Icon;
          const highlighted = idx === activeIndex;
          return (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              data-testid={`ai-action-${item.action}`}
              onMouseEnter={() => setActiveIndex(idx)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelectAction(item.action)}
              className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                highlighted
                  ? 'bg-indigo-50 dark:bg-indigo-950/50'
                  : 'hover:bg-stone-50 dark:hover:bg-zinc-800/60'
              }`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.accentClass}`} />
              <div className="min-w-0">
                <div className="text-xs font-medium text-stone-900 dark:text-zinc-100">
                  {item.label}
                </div>
                <div className="text-[11px] leading-snug text-stone-500 dark:text-zinc-400">
                  {item.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="border-t border-stone-100 p-1 dark:border-zinc-800">
        <button
          type="button"
          data-testid="ai-action-ocr"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onTriggerOcr}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Camera className="h-3.5 w-3.5 text-stone-500 dark:text-zinc-400" />
          <span>Scanner une image (OCR → LaTeX) · ou Ctrl+V</span>
        </button>
      </div>
    </div>
  );
};

