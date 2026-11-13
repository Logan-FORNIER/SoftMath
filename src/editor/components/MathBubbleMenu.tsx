import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { TextSelection } from '@tiptap/pm/state';
import { Bold, Code, Italic, Sigma, Sparkles } from 'lucide-react';

interface MathBubbleMenuProps {
  editor: Editor;
  onOpenAiMenu?: () => void;
}

export function MathBubbleMenu({ editor, onOpenAiMenu }: MathBubbleMenuProps) {
  const activeState = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      isBold: current.isActive('bold'),
      isItalic: current.isActive('italic'),
      isCode: current.isActive('code'),
    }),
  });

  const handleConvertToInlineMath = () => {
    const { from, to } = editor.state.selection;
    const raw = editor.state.doc.textBetween(from, to, ' ').trim();
    const latex = raw.replace(/^\$(.+)\$$/, '$1').trim();
    if (!latex) {
      return;
    }

    editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, { type: 'inlineMath', attrs: { latex } })
      .run();
  };

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={80}
      options={{
        placement: 'top',
        offset: 8,
      }}
      shouldShow={({ editor: current, state, from, to }) => {
        if (!current.isEditable) {
          return false;
        }
        if (!(state.selection instanceof TextSelection) || state.selection.empty) {
          return false;
        }
        if (current.isActive('codeBlock')) {
          return false;
        }
        return state.doc.textBetween(from, to, ' ').trim().length > 0;
      }}
    >
      <div
        role="toolbar"
        aria-label="Mise en forme du texte sélectionné"
        className="flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white/95 p-1 shadow-lg backdrop-blur-sm dark:border-zinc-700/80 dark:bg-zinc-900/95"
      >
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Gras (Ctrl+B)"
          aria-label="Gras"
          aria-pressed={activeState.isBold}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
            activeState.isBold
              ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
          }`}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italique (*texte*)"
          aria-label="Italique"
          aria-pressed={activeState.isItalic}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
            activeState.isItalic
              ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
          }`}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Code en ligne (`code`)"
          aria-label="Code"
          aria-pressed={activeState.isCode}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs transition-colors ${
            activeState.isCode
              ? 'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
          }`}
        >
          <Code className="h-3.5 w-3.5" />
        </button>

        <div className="mx-0.5 h-4 w-px bg-stone-200 dark:bg-zinc-700" />

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleConvertToInlineMath}
          title="Convertir en formule inline ($...$)"
          aria-label="Formule inline"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/60"
        >
          <Sigma className="h-3.5 w-3.5" />
          <span>Formule</span>
        </button>

        {onOpenAiMenu && (
          <>
            <div className="mx-0.5 h-4 w-px bg-stone-200 dark:bg-zinc-700" />
            <button
              type="button"
              data-testid="bubble-ai-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onOpenAiMenu}
              title="Actions IA contextuelles (Ctrl+I)"
              aria-label="Menu IA"
              className="inline-flex h-7 items-center gap-1 rounded-md bg-indigo-50 px-2 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-950/90"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>IA</span>
            </button>
          </>
        )}
      </div>
    </BubbleMenu>
  );
}

