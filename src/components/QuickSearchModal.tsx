import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Search, X } from 'lucide-react';
import { readNoteContent } from '../services/fsService';
import {
  buildIndexedNote,
  flattenWorkspaceNotes,
  searchIndexedNotes,
  type IndexedSearchNote,
} from '../services/searchService';
import type { FileTreeNode, OpenNote } from '../types/notes';

interface QuickSearchModalProps {
  isOpen: boolean;
  rootPath: string;
  tree: FileTreeNode[];
  activeNote: OpenNote | null;
  onClose: () => void;
  onSelectNote: (node: FileTreeNode) => Promise<void> | void;
}

function buildNormalizedIndexMap(rawText: string): {
  normalized: string;
  rawIndexAt: number[];
} {
  let normalized = '';
  const rawIndexAt: number[] = [];

  for (let i = 0; i < rawText.length; i += 1) {
    const ch = rawText[i];
    if (/[\u0300-\u036f]/.test(ch)) {
      continue;
    }
    const base = ch
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    for (let j = 0; j < base.length; j += 1) {
      normalized += base[j];
      rawIndexAt.push(i);
    }
  }

  return { normalized, rawIndexAt };
}

function HighlightedText({
  text,
  terms,
}: {
  text: string;
  terms: string[];
}) {
  if (!text || terms.length === 0) {
    return <>{text}</>;
  }

  const { normalized, rawIndexAt } = buildNormalizedIndexMap(text);
  const ranges: Array<[number, number]> = [];

  for (const term of terms) {
    if (!term) continue;
    let searchFrom = 0;
    while (searchFrom < normalized.length) {
      const idx = normalized.indexOf(term, searchFrom);
      if (idx === -1) break;
      const startRaw = rawIndexAt[idx] ?? 0;
      const endNormIdx = idx + term.length - 1;
      let endRaw = (rawIndexAt[endNormIdx] ?? text.length - 1) + 1;
      while (endRaw < text.length && /[\u0300-\u036f]/.test(text[endRaw])) {
        endRaw += 1;
      }
      ranges.push([startRaw, endRaw]);
      searchFrom = idx + term.length;
    }
  }

  if (ranges.length === 0) {
    return <>{text}</>;
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const prev = merged[merged.length - 1];
    if (!prev || range[0] > prev[1]) {
      merged.push([...range]);
    } else {
      prev[1] = Math.max(prev[1], range[1]);
    }
  }

  const parts: Array<{ text: string; highlight: boolean }> = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) {
      parts.push({ text: text.slice(cursor, start), highlight: false });
    }
    parts.push({ text: text.slice(start, end), highlight: true });
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), highlight: false });
  }

  return (
    <>
      {parts.map((part, idx) =>
        part.highlight ? (
          <mark
            key={idx}
            className="rounded-xs bg-indigo-500/20 px-0.5 text-indigo-950 dark:bg-indigo-400/25 dark:text-indigo-100"
          >
            {part.text}
          </mark>
        ) : (
          <Fragment key={idx}>{part.text}</Fragment>
        )
      )}
    </>
  );
}

export function QuickSearchModal({
  isOpen,
  rootPath,
  tree,
  activeNote,
  onClose,
  onSelectNote,
}: QuickSearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [indexedNotes, setIndexedNotes] = useState<IndexedSearchNote[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeNoteRef = useRef(activeNote);
  activeNoteRef.current = activeNote;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [isOpen, onClose]);

  // Build progressive full-text index whenever modal opens cleanly
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;
    setQuery('');
    setSelectedIndex(0);

    const flatNotes = flattenWorkspaceNotes(tree, rootPath);
    const liveNote = activeNoteRef.current;

    const initialIndexed = flatNotes.map((entry) =>
      buildIndexedNote(
        entry,
        liveNote && liveNote.path === entry.path ? liveNote.content : ''
      )
    );
    setIndexedNotes(initialIndexed);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    const loadContents = async () => {
      if (flatNotes.length === 0) {
        setIsIndexing(false);
        return;
      }

      setIsIndexing(true);
      const resultByPath = new Map<string, IndexedSearchNote>(
        initialIndexed.map((item) => [item.path, item])
      );

      const BATCH_SIZE = 10;
      for (let i = 0; i < flatNotes.length; i += BATCH_SIZE) {
        if (cancelled) {
          return;
        }
        const batch = flatNotes.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (entry) => {
            const currentOpen = activeNoteRef.current;
            if (currentOpen && currentOpen.path === entry.path) {
              resultByPath.set(
                entry.path,
                buildIndexedNote(entry, currentOpen.content)
              );
              return;
            }
            try {
              const content = await readNoteContent(entry.path);
              if (!cancelled) {
                resultByPath.set(entry.path, buildIndexedNote(entry, content));
              }
            } catch {
              // Skip unreadable/externally deleted files gracefully
            }
          })
        );

        if (!cancelled) {
          setIndexedNotes(
            flatNotes.map(
              (entry) =>
                resultByPath.get(entry.path) ?? buildIndexedNote(entry, '')
            )
          );
        }
      }

      if (!cancelled) {
        setIsIndexing(false);
      }
    };

    void loadContents();

    return () => {
      cancelled = true;
    };
  }, [isOpen, tree, rootPath]);

  const results = useMemo(
    () => searchIndexedNotes(indexedNotes, query),
    [indexedNotes, query]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) {
    return null;
  }

  const handleOpenResult = (node: FileTreeNode) => {
    onClose();
    void onSelectNote(node);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recherche rapide dans les notes"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-stone-950/35 px-4 pt-[12vh] backdrop-blur-[2px] print:hidden dark:bg-black/60"
    >
      <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#18181B]">
        {/* Search input header */}
        <div className="flex items-center gap-2.5 border-b border-stone-200/80 px-3.5 py-3 dark:border-zinc-800">
          <Search className="h-4 w-4 shrink-0 text-stone-400 dark:text-zinc-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (results.length > 0) {
                  setSelectedIndex((prev) => (prev + 1) % results.length);
                }
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (results.length > 0) {
                  setSelectedIndex(
                    (prev) => (prev - 1 + results.length) % results.length
                  );
                }
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const hit = results[selectedIndex];
                if (hit) {
                  handleOpenResult(hit.entry.node);
                }
              }
            }}
            placeholder="Rechercher une note par titre ou mot-clé…"
            aria-label="Rechercher par titre ou contenu"
            className="min-w-0 flex-1 bg-transparent text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />

          {isIndexing && (
            <Loader2
              aria-label="Indexation des notes en cours"
              className="h-3.5 w-3.5 shrink-0 animate-spin text-stone-400 dark:text-zinc-500"
            />
          )}

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Effacer la recherche"
              className="rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Matching notes list */}
        <div className="max-h-96 overflow-y-auto p-1.5">
          {indexedNotes.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-stone-400 dark:text-zinc-500">
              Aucune note Markdown dans ce dossier.
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-stone-400 dark:text-zinc-500">
              Aucun résultat pour « {query.trim()} ».
            </div>
          ) : (
            <div role="listbox" aria-label="Résultats de recherche" className="space-y-0.5">
              {results.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const isCurrentNote = activeNote?.path === item.entry.path;

                return (
                  <button
                    key={item.entry.id}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => handleOpenResult(item.entry.node)}
                    className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${
                      isSelected
                        ? 'bg-indigo-50/90 text-indigo-950 dark:bg-indigo-500/15 dark:text-indigo-100'
                        : 'text-stone-700 hover:bg-stone-100/70 dark:text-zinc-200 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <FileText
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        isSelected
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'text-stone-400 dark:text-zinc-500'
                      }`}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium">
                          <HighlightedText
                            text={item.entry.displayName}
                            terms={item.matchTerms}
                          />
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {isCurrentNote && (
                            <span className="rounded bg-stone-200/70 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 dark:bg-zinc-800 dark:text-zinc-300">
                              Ouverte
                            </span>
                          )}
                          {item.entry.relativeFolder && (
                            <span className="max-w-36 truncate text-[11px] text-stone-400 dark:text-zinc-500">
                              {item.entry.relativeFolder}
                            </span>
                          )}
                        </div>
                      </div>

                      {item.snippet && (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-stone-500 dark:text-zinc-400">
                          <HighlightedText
                            text={item.snippet}
                            terms={item.matchTerms}
                          />
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between border-t border-stone-200/70 bg-stone-50/60 px-3.5 py-2 text-[11px] text-stone-400 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-500">
          <span>
            {indexedNotes.length}{' '}
            {indexedNotes.length <= 1 ? 'note' : 'notes'}
          </span>
          <div className="flex items-center gap-3">
            <span>↑↓ naviguer</span>
            <span>Entrée ouvrir</span>
            <span>Échap fermer</span>
          </div>
        </div>
      </div>
    </div>
  );
}

