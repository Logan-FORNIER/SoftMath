import { FilePlus2, FileText, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import {
  NOTE_TEMPLATES,
  type NoteTemplate,
} from '../services/noteTemplateService';

export interface NoteTemplatesModalProps {
  open: boolean;
  canApplyToCurrentEmptyNote: boolean;
  onCreateNoteFromTemplate: (template: NoteTemplate) => void;
  onApplyToCurrentNote?: (template: NoteTemplate) => void;
  onCreateBlankNote: () => void;
  onClose: () => void;
}

export function NoteTemplatesModal({
  open,
  canApplyToCurrentEmptyNote,
  onCreateNoteFromTemplate,
  onApplyToCurrentNote,
  onCreateBlankNote,
  onClose,
}: NoteTemplatesModalProps) {
  const [selected, setSelected] = useState<NoteTemplate>(NOTE_TEMPLATES[0]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Modèles de notes mathématiques"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Modèles de notes mathématiques
              </h2>
              <p className="text-xs text-slate-400">
                Démarrez avec une structure complète ou créez une note vierge
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            title="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[310px_1fr]">
          {/* Left template list */}
          <div className="flex flex-col gap-1.5 overflow-y-auto border-r border-slate-800 bg-slate-950/50 p-3">
            <button
              type="button"
              onClick={() => {
                onCreateBlankNote();
                onClose();
              }}
              className="mb-1 flex items-center gap-2 rounded-lg border border-dashed border-slate-700 px-3 py-2 text-left text-xs font-medium text-slate-300 transition-colors hover:border-indigo-500/60 hover:bg-slate-800/60 hover:text-white"
            >
              <FileText className="h-4 w-4 text-slate-400" />
              <span>Note vierge (Ctrl+N)</span>
            </button>

            {NOTE_TEMPLATES.map((tpl) => {
              const active = tpl.id === selected.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => setSelected(tpl)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? 'border-indigo-500/70 bg-indigo-500/15 text-white'
                      : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{tpl.title}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-indigo-300">
                      {tpl.category}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">
                    {tpl.description}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right Markdown source preview */}
          <div className="flex flex-col overflow-hidden bg-slate-950/80">
            <div className="border-b border-slate-800 px-4 py-2 text-[11px] font-medium text-slate-400">
              Aperçu du modèle :{' '}
              <span className="text-slate-200">{selected.title}</span>
            </div>
            <pre className="flex-1 overflow-y-auto p-4 font-mono text-[11.5px] leading-relaxed text-slate-300">
              {selected.content}
            </pre>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 bg-slate-900 px-4 py-3">
              {canApplyToCurrentEmptyNote && onApplyToCurrentNote && (
                <button
                  type="button"
                  onClick={() => {
                    onApplyToCurrentNote(selected);
                    onClose();
                  }}
                  className="rounded-md border border-indigo-500/50 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20"
                >
                  Appliquer dans la note vide actuelle
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onCreateNoteFromTemplate(selected);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                Créer une nouvelle note
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

