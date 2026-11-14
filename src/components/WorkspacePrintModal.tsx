import { CheckSquare, FileCode2, Printer, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { stripExamSolutionsFromMarkdown } from '../services/examModeService';
import type { WorkspaceExportNoteItem } from '../services/workspaceExportService';
import { MathMarkdownPreview } from './MathMarkdownPreview';

export interface WorkspacePrintModalProps {
  open: boolean;
  workspaceName: string;
  notes: WorkspaceExportNoteItem[];
  isExamMode: boolean;
  onExportLatexBundle: (selectedNotes: WorkspaceExportNoteItem[], excludeSolutions: boolean) => void;
  onClose: () => void;
}

export function WorkspacePrintModal({
  open,
  workspaceName,
  notes,
  isExamMode,
  onExportLatexBundle,
  onClose,
}: WorkspacePrintModalProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(open ? notes.map((n) => n.relativePath) : [])
  );
  const [excludeSolutions, setExcludeSolutions] = useState(isExamMode);

  useEffect(() => {
    if (!open) return;
    setSelectedPaths(new Set(notes.map((n) => n.relativePath)));
    setExcludeSolutions(isExamMode);
  }, [open, notes, isExamMode]);

  if (!open) {
    return null;
  }

  const chosenNotes = notes.filter((n) => selectedPaths.has(n.relativePath));

  const toggleNote = (rel: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(rel)) next.delete(rel);
      else next.add(rel);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm print:static print:block print:bg-white print:p-0"
      role="dialog"
      aria-modal="true"
      aria-label="Export et impression multi-notes"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 shadow-2xl print:max-h-none print:border-0 print:bg-white print:shadow-none">
        {/* Header (hidden during print) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-5 py-3.5 print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
              <CheckSquare className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Export &amp; Impression multi-notes — {workspaceName}
              </h2>
              <p className="text-xs text-slate-400">
                {chosenNotes.length} note{chosenNotes.length > 1 ? 's' : ''} sélectionnée{chosenNotes.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={excludeSolutions}
                onChange={(e) => setExcludeSolutions(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-600"
              />
              Masquer démos &amp; corrigés (Examen)
            </label>

            <button
              type="button"
              disabled={chosenNotes.length === 0}
              onClick={() => onExportLatexBundle(chosenNotes, excludeSolutions)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-40"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              Exporter recueil .tex
            </button>

            <button
              type="button"
              disabled={chosenNotes.length === 0}
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimer / PDF
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

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[260px_1fr] print:block">
          {/* Note selector sidebar (hidden when printing) */}
          <div className="flex flex-col gap-1 overflow-y-auto border-r border-slate-800 bg-slate-950/60 p-3 print:hidden">
            <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-400">
              <span>Notes incluses</span>
              <button
                type="button"
                onClick={() =>
                  setSelectedPaths(
                    selectedPaths.size === notes.length
                      ? new Set()
                      : new Set(notes.map((n) => n.relativePath))
                  )
                }
                className="text-indigo-400 hover:underline"
              >
                {selectedPaths.size === notes.length ? 'Tout décocher' : 'Tout cocher'}
              </button>
            </div>
            {notes.map((note) => (
              <label
                key={note.relativePath}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60"
              >
                <input
                  type="checkbox"
                  checked={selectedPaths.has(note.relativePath)}
                  onChange={() => toggleNote(note.relativePath)}
                  className="h-3.5 w-3.5 rounded border-slate-600"
                />
                <span className="truncate">{note.relativePath}</span>
              </label>
            ))}
          </div>

          {/* Printable preview */}
          <div className="overflow-y-auto bg-white p-8 text-stone-900 print:overflow-visible print:p-0">
            <h1 className="mb-6 border-b border-stone-200 pb-3 text-2xl font-bold">
              {workspaceName || 'Recueil SoftMath'}
            </h1>
            {chosenNotes.map((note, idx) => (
              <section
                key={note.relativePath}
                className={idx > 0 ? 'mt-8 border-t border-stone-200 pt-6 break-before-page' : ''}
              >
                <div className="mb-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                  {note.relativePath}
                </div>
                <MathMarkdownPreview
                  content={
                    excludeSolutions
                      ? stripExamSolutionsFromMarkdown(note.content, {
                          proofPlaceholder: '> *Démonstration masquée (Mode Examen).*',
                        })
                      : note.content
                  }
                />
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
