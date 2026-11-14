import { Camera, History, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  computeSnapshotDiff,
  deleteNoteSnapshot,
  listNoteSnapshots,
  saveNoteSnapshot,
  type NoteSnapshot,
} from '../services/snapshotService';

export interface SnapshotHistoryModalProps {
  open: boolean;
  notePath: string | null;
  noteTitle: string;
  currentContent: string;
  onRestoreContent: (content: string) => void;
  onClose: () => void;
}

function formatSnapshotDate(ts: number): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(ts));
  } catch {
    return String(ts);
  }
}

export function SnapshotHistoryModal({
  open,
  notePath,
  noteTitle,
  currentContent,
  onRestoreContent,
  onClose,
}: SnapshotHistoryModalProps) {
  const [snapshots, setSnapshots] = useState<NoteSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'diff' | 'raw'>('diff');

  useEffect(() => {
    if (!open || !notePath) {
      setSnapshots([]);
      setSelectedId(null);
      return;
    }
    const list = listNoteSnapshots(notePath);
    setSnapshots(list);
    setSelectedId(list[0]?.id ?? null);
  }, [open, notePath]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((s) => s.id === selectedId) ?? null,
    [snapshots, selectedId]
  );

  const diffLines = useMemo(() => {
    if (!selectedSnapshot) return [];
    return computeSnapshotDiff(selectedSnapshot.content, currentContent);
  }, [selectedSnapshot, currentContent]);

  if (!open || !notePath) {
    return null;
  }

  const handleTakeManualSnapshot = () => {
    const saved = saveNoteSnapshot(notePath, currentContent, 'Instantané manuel');
    const refreshed = listNoteSnapshots(notePath);
    setSnapshots(refreshed);
    if (saved) setSelectedId(saved.id);
  };

  const handleRestore = () => {
    if (!selectedSnapshot) return;
    // Backup current version cleanly before overwriting
    saveNoteSnapshot(notePath, currentContent, 'Avant restauration', {
      skipIfIdentical: true,
    });
    onRestoreContent(selectedSnapshot.content);
    onClose();
  };

  const handleDelete = (id: string) => {
    const next = deleteNoteSnapshot(notePath, id);
    setSnapshots(next);
    if (selectedId === id) {
      setSelectedId(next[0]?.id ?? null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Historique local de la note"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
              <History className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Historique local — {noteTitle}
              </h2>
              <p className="text-xs text-slate-400">
                Instantanés horodatés hors Git stockés localement ({snapshots.length}/25)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTakeManualSnapshot}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              <Camera className="h-3.5 w-3.5" />
              Prendre un instantané
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              title="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[270px_1fr]">
          {/* Left snapshot timeline */}
          <div className="flex flex-col gap-1 overflow-y-auto border-r border-slate-800 bg-slate-950/50 p-2.5">
            {snapshots.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                Aucun instantané enregistré pour cette note. Cliquez sur « Prendre un instantané » ou enregistrez la note.
              </div>
            ) : (
              snapshots.map((snap) => {
                const active = snap.id === selectedId;
                return (
                  <div
                    key={snap.id}
                    className={`group flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                      active
                        ? 'border-indigo-500/70 bg-indigo-500/15 text-white'
                        : 'border-slate-800/80 bg-slate-900/50 text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(snap.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-xs font-medium">
                        {snap.label}
                      </div>
                      <div className="text-[10.5px] text-slate-400">
                        {formatSnapshotDate(snap.createdAt)} · {snap.lineCount} l.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(snap.id)}
                      title="Supprimer cet instantané"
                      className="rounded p-1 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Right comparison pane */}
          <div className="flex flex-col overflow-hidden bg-slate-950/80">
            {selectedSnapshot ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2 text-xs">
                  <div className="flex items-center gap-1 rounded bg-slate-900 p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode('diff')}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        viewMode === 'diff'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Diff vs note actuelle
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('raw')}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                        viewMode === 'raw'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Contenu de l’instantané
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleRestore}
                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restaurer cette version
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 font-mono text-[11.5px] leading-relaxed">
                  {viewMode === 'raw' ? (
                    <pre className="whitespace-pre-wrap text-slate-300">
                      {selectedSnapshot.content}
                    </pre>
                  ) : (
                    <div className="space-y-0.5">
                      {diffLines.map((line, idx) => (
                        <div
                          key={`diff-${idx}`}
                          className={`whitespace-pre-wrap rounded px-2 py-0.5 ${
                            line.kind === 'added'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : line.kind === 'removed'
                                ? 'bg-rose-500/15 text-rose-300'
                                : 'text-slate-400'
                          }`}
                        >
                          <span className="mr-2 select-none opacity-60">
                            {line.kind === 'added'
                              ? '+'
                              : line.kind === 'removed'
                                ? '-'
                                : ' '}
                          </span>
                          {line.text || ' '}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-xs text-slate-500">
                Sélectionnez un instantané à gauche pour comparer ou restaurer.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

