import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Editor } from '@tiptap/core';
import { Plus } from 'lucide-react';
import { SLASH_COMMAND_ITEMS } from '../extensions/SlashCommand';
import {
  SlashCommandList,
  type SlashCommandItem,
} from './SlashCommandList';

interface MarginInsertButtonProps {
  editor: Editor | null;
  containerRef: RefObject<HTMLDivElement | null>;
}

export function MarginInsertButton({
  editor,
  containerRef,
}: MarginInsertButtonProps) {
  const [lineTop, setLineTop] = useState<number | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) {
      setLineTop(null);
      setIsMenuOpen(false);
      return;
    }

    const updateLinePosition = () => {
      const container = containerRef.current;
      if (!container || editor.isDestroyed) {
        setLineTop(null);
        return;
      }

      const activeEl = document.activeElement as HTMLElement | null;
      if (
        activeEl &&
        activeEl.closest('[data-excalidraw-interactive="true"], [data-type="block-math"]')
      ) {
        setLineTop(null);
        return;
      }

      try {
        const { selection } = editor.state;
        if (!selection.$from.parent.isTextblock) {
          setLineTop(null);
          return;
        }
        const coords = editor.view.coordsAtPos(selection.from);
        const containerRect = container.getBoundingClientRect();
        const centerY = coords.top - containerRect.top + (coords.bottom - coords.top) / 2;
        setLineTop(Math.max(0, centerY));
      } catch {
        setLineTop(null);
      }
    };

    updateLinePosition();

    editor.on('selectionUpdate', updateLinePosition);
    editor.on('update', updateLinePosition);
    editor.on('focus', updateLinePosition);
    window.addEventListener('resize', updateLinePosition);

    return () => {
      editor.off('selectionUpdate', updateLinePosition);
      editor.off('update', updateLinePosition);
      editor.off('focus', updateLinePosition);
      window.removeEventListener('resize', updateLinePosition);
    };
  }, [editor, containerRef]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) {
        return;
      }
      setIsMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  if (!editor || lineTop === null) {
    return null;
  }

  const handleSelectItem = (item: SlashCommandItem) => {
    setIsMenuOpen(false);
    item.run({ editor });
  };

  return (
    <div
      ref={rootRef}
      style={{ top: `${lineTop}px` }}
      className="absolute -left-7 z-30 -translate-y-1/2 sm:-left-9 print:hidden"
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setIsMenuOpen((prev) => !prev)}
        title="Insérer un bloc (/dessin, /schema, $$…)"
        aria-label="Insérer un bloc sur la ligne courante"
        aria-expanded={isMenuOpen}
        className={`flex h-6 w-6 items-center justify-center rounded-md border transition-all ${
          isMenuOpen
            ? 'border-indigo-300 bg-indigo-50 text-indigo-600 shadow-xs dark:border-indigo-500/50 dark:bg-indigo-500/15 dark:text-indigo-400'
            : 'border-transparent bg-transparent text-stone-300 hover:border-stone-200 hover:bg-stone-100 hover:text-stone-700 dark:text-zinc-600 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
        }`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      {isMenuOpen && (
        <div className="absolute left-0 top-full mt-1.5">
          <SlashCommandList
            items={SLASH_COMMAND_ITEMS}
            command={handleSelectItem}
          />
        </div>
      )}
    </div>
  );
}
