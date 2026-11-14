import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Columns2, FileText } from 'lucide-react';
import { useState } from 'react';
import { useSoftMathUi } from '../../contexts/SoftMathUiContext';

export function WikiLinkView({ node, selected }: NodeViewProps) {
  const target = String(node.attrs.target ?? '');
  const label = String(node.attrs.label ?? '') || target;
  const { onOpenWikiLink, getNoteSnippet } = useSoftMathUi();
  const [hovered, setHovered] = useState(false);

  const info = hovered && getNoteSnippet ? getNoteSnippet(target) : null;

  return (
    <NodeViewWrapper
      as="span"
      className="relative inline-block align-baseline"
      contentEditable={false}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenWikiLink?.(target, e.altKey || e.ctrlKey || e.metaKey);
        }}
        title="Clic : ouvrir la note • Alt+Clic : ouvrir en vue scindée"
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.92em] font-medium transition-colors ${
          selected
            ? 'bg-indigo-600 text-white'
            : 'bg-indigo-500/12 text-indigo-700 hover:bg-indigo-500/20 dark:bg-indigo-500/20 dark:text-indigo-300 dark:hover:bg-indigo-500/30'
        }`}
      >
        <FileText className="h-3 w-3 shrink-0 opacity-80" />
        <span className="underline decoration-indigo-400/50 underline-offset-2">
          {label}
        </span>
      </button>

      {hovered && (
        <span className="pointer-events-none absolute left-0 top-full z-40 mt-1.5 block w-72 rounded-lg border border-stone-200 bg-white p-2.5 text-left text-xs shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <span className="flex items-center justify-between gap-1 font-semibold text-stone-800 dark:text-zinc-100">
            <span className="truncate">{info ? info.title : target}</span>
            <span className="inline-flex items-center gap-0.5 text-[10px] font-normal text-stone-400">
              <Columns2 className="h-3 w-3" />
              Alt+clic
            </span>
          </span>
          <span className="mt-1 block text-[11px] leading-snug text-stone-500 dark:text-zinc-400">
            {info ? info.snippet : 'Note introuvable dans le dossier ouvert.'}
          </span>
        </span>
      )}
    </NodeViewWrapper>
  );
}

