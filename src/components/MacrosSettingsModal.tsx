import { Plus, RotateCcw, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_KATEX_MACROS,
  loadKatexMacroEntries,
  normalizeMacroName,
  renderKatexWithMacros,
  resetKatexMacroEntries,
  saveKatexMacroEntries,
  type KatexMacroEntry,
} from '../services/katexMacrosService';

export interface MacrosSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (entries: KatexMacroEntry[]) => void;
}

function buildMacroMapFromDraft(entries: KatexMacroEntry[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.enabled) continue;
    const key = normalizeMacroName(entry.name);
    if (key && entry.expansion.trim()) {
      map[key] = entry.expansion.trim();
    }
  }
  return map;
}

function sampleLatexForMacro(name: string, expansion: string): string {
  const cleanName = normalizeMacroName(name);
  if (!cleanName) return '';
  if (expansion.includes('#1')) {
    return `${cleanName}{x}`;
  }
  if (cleanName === '\\limn') {
    return `${cleanName} u_n = \\ell`;
  }
  return cleanName;
}

export function MacrosSettingsModal({
  open,
  onClose,
  onSaved,
}: MacrosSettingsModalProps) {
  const [entries, setEntries] = useState<KatexMacroEntry[]>(() => loadKatexMacroEntries());
  const [newName, setNewName] = useState('');
  const [newExpansion, setNewExpansion] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEntries(loadKatexMacroEntries());
    setStatusMessage(null);
  }, [open]);

  const draftMacroMap = useMemo(() => buildMacroMapFromDraft(entries), [entries]);

  if (!open) {
    return null;
  }

  const handleUpdate = (
    id: string,
    patch: Partial<Pick<KatexMacroEntry, 'name' | 'expansion' | 'description' | 'enabled'>>
  ) => {
    setEntries((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const handleDelete = (id: string) => {
    setEntries((prev) => prev.filter((item) => item.id !== id));
  };

  const handleAdd = () => {
    const cleanName = normalizeMacroName(newName);
    const cleanExp = newExpansion.trim();
    if (!cleanName || !cleanExp) {
      setStatusMessage('Indiquez un nom (ex: \\vecu) et une expansion LaTeX valide.');
      return;
    }
    const exists = entries.some(
      (item) => normalizeMacroName(item.name) === cleanName
    );
    if (exists) {
      setStatusMessage(`La macro ${cleanName} existe déjà dans la liste.`);
      return;
    }
    const created: KatexMacroEntry = {
      id: `macro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      expansion: cleanExp,
      description: newDesc.trim(),
      enabled: true,
    };
    setEntries((prev) => [created, ...prev]);
    setNewName('');
    setNewExpansion('');
    setNewDesc('');
    setStatusMessage(null);
  };

  const handleSave = () => {
    const saved = saveKatexMacroEntries(entries);
    setEntries(saved);
    onSaved?.(saved);
    onClose();
  };

  const handleReset = () => {
    const defaults = resetKatexMacroEntries();
    setEntries(defaults);
    onSaved?.(defaults);
    setStatusMessage(
      `${DEFAULT_KATEX_MACROS.length} macros mathématiques par défaut restaurées.`
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Macros KaTeX personnalisées"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Macros KaTeX &amp; raccourcis LaTeX
              </h2>
              <p className="text-xs text-slate-400">
                Utilisables dans toutes vos formules inline/bloc et exportées en{' '}
                <code className="text-slate-300">\providecommand</code>
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

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          {/* Add bar */}
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 text-xs font-medium text-slate-300">
              Nouvelle macro (lettres uniquement, supporte #1)
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[130px_1fr_170px_auto]">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="\scal"
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
              <input
                type="text"
                value={newExpansion}
                onChange={(e) => setNewExpansion(e.target.value)}
                placeholder="\langle #1, #2 \rangle"
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description courte"
                className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAdd}
                className="inline-flex items-center justify-center gap-1.5 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter
              </button>
            </div>
            {statusMessage && (
              <p className="mt-2 text-xs text-amber-300">{statusMessage}</p>
            )}
          </div>

          {/* Macro list */}
          <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/40">
            {entries.map((entry) => {
              const previewSample = sampleLatexForMacro(entry.name, entry.expansion);
              const previewHtml = previewSample
                ? renderKatexWithMacros(previewSample, {
                    displayMode: false,
                    throwOnError: false,
                    macros: {
                      ...draftMacroMap,
                      [normalizeMacroName(entry.name)]: entry.expansion,
                    },
                  })
                : '';

              return (
                <div
                  key={entry.id}
                  className="grid grid-cols-1 items-center gap-2 px-3 py-2.5 sm:grid-cols-[26px_115px_1fr_140px_90px_32px]"
                >
                  <input
                    type="checkbox"
                    checked={entry.enabled}
                    onChange={(e) =>
                      handleUpdate(entry.id, { enabled: e.target.checked })
                    }
                    title={entry.enabled ? 'Désactiver' : 'Activer'}
                    className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-indigo-500"
                  />
                  <input
                    type="text"
                    value={entry.name}
                    onChange={(e) => handleUpdate(entry.id, { name: e.target.value })}
                    className="rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-xs text-indigo-300 focus:border-indigo-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={entry.expansion}
                    onChange={(e) =>
                      handleUpdate(entry.id, { expansion: e.target.value })
                    }
                    className="rounded border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={entry.description ?? ''}
                    onChange={(e) =>
                      handleUpdate(entry.id, { description: e.target.value })
                    }
                    placeholder="Description"
                    className="rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-400 focus:border-indigo-500 focus:outline-none"
                  />
                  <div
                    className="flex h-8 items-center justify-center overflow-hidden rounded border border-slate-800/80 bg-slate-900/70 px-1.5 text-sm text-slate-100"
                    title="Aperçu KaTeX"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id)}
                    className="flex h-7 w-7 items-center justify-center rounded text-slate-500 hover:bg-rose-500/15 hover:text-rose-400"
                    title="Supprimer cette macro"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/70 px-5 py-3">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Réinitialiser par défaut
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
            >
              Enregistrer les macros
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

