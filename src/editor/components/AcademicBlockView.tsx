import {
  NodeViewContent,
  NodeViewWrapper,
  type NodeViewProps,
} from '@tiptap/react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Landmark,
  Lightbulb,
  PenTool,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useSoftMathUi } from '../../contexts/SoftMathUiContext';
import type { AcademicKind } from '../extensions/AcademicBlock';

interface AcademicVisualMeta {
  label: string;
  placeholder: string;
  Icon: typeof BookOpen;
  borderClass: string;
  bgClass: string;
  badgeClass: string;
  accentTextClass: string;
}

const ACADEMIC_META: Record<AcademicKind, AcademicVisualMeta> = {
  definition: {
    label: 'Définition',
    placeholder: 'Nom de la définition (optionnel)...',
    Icon: BookOpen,
    borderClass:
      'border-l-emerald-500 border-emerald-200/80 dark:border-l-emerald-400 dark:border-emerald-900/60',
    bgClass: 'bg-emerald-50/45 dark:bg-emerald-950/20',
    badgeClass:
      'bg-emerald-100/90 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
    accentTextClass: 'text-emerald-700 dark:text-emerald-300',
  },
  theorem: {
    label: 'Théorème',
    placeholder: 'Nom du théorème (ex: Bolzano-Weierstrass)...',
    Icon: Landmark,
    borderClass:
      'border-l-indigo-500 border-indigo-200/80 dark:border-l-indigo-400 dark:border-indigo-900/60',
    bgClass: 'bg-indigo-50/45 dark:bg-indigo-950/20',
    badgeClass:
      'bg-indigo-100/90 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-300',
    accentTextClass: 'text-indigo-700 dark:text-indigo-300',
  },
  proof: {
    label: 'Démonstration',
    placeholder: 'Méthode ou précision (optionnel)...',
    Icon: PenTool,
    borderClass:
      'border-l-amber-500 border-amber-200/80 dark:border-l-amber-400 dark:border-amber-900/60',
    bgClass: 'bg-amber-50/40 dark:bg-amber-950/15',
    badgeClass:
      'bg-amber-100/90 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
    accentTextClass: 'text-amber-700 dark:text-amber-300',
  },
  example: {
    label: 'Exemple',
    placeholder: 'Titre de l’exemple (optionnel)...',
    Icon: Lightbulb,
    borderClass:
      'border-l-sky-500 border-sky-200/80 dark:border-l-sky-400 dark:border-sky-900/60',
    bgClass: 'bg-sky-50/45 dark:bg-sky-950/20',
    badgeClass:
      'bg-sky-100/90 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300',
    accentTextClass: 'text-sky-700 dark:text-sky-300',
  },
  exercise: {
    label: 'Exercice',
    placeholder: 'Titre de l’exercice (optionnel)...',
    Icon: PenTool,
    borderClass:
      'border-l-teal-500 border-teal-200/80 dark:border-l-teal-400 dark:border-teal-900/60',
    bgClass: 'bg-teal-50/45 dark:bg-teal-950/20',
    badgeClass:
      'bg-teal-100/90 text-teal-800 dark:bg-teal-500/20 dark:text-teal-300',
    accentTextClass: 'text-teal-700 dark:text-teal-300',
  },
};

const ACADEMIC_ORDER: AcademicKind[] = [
  'definition',
  'theorem',
  'proof',
  'example',
  'exercise',
];

export function AcademicBlockView({
  node,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const kind = (node.attrs.kind as AcademicKind) || 'theorem';
  const title = (node.attrs.title as string) || '';
  const collapsed = Boolean(node.attrs.collapsed);
  const meta = ACADEMIC_META[kind] ?? ACADEMIC_META.theorem;
  const Icon = meta.Icon;
  const { isExamMode } = useSoftMathUi();
  const [revealedInExam, setRevealedInExam] = useState(false);

  const isMaskedByExam = isExamMode && kind === 'proof' && !revealedInExam;

  return (
    <NodeViewWrapper
      as="section"
      data-academic-kind={kind}
      className={`softmath-academic-block group/academic my-4 rounded-r-xl rounded-l-sm border border-l-4 px-4 py-3 transition-colors ${meta.borderClass} ${meta.bgClass}`}
    >
      {/* En-tête non éditable ProseMirror */}
      <header
        contentEditable={false}
        className="flex items-center gap-2 select-none"
      >
        <button
          type="button"
          onClick={() => updateAttributes({ collapsed: !collapsed })}
          title={collapsed ? 'Déplier le bloc' : 'Replier le bloc'}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Déplier ${meta.label}` : `Replier ${meta.label}`}
          className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10 print:hidden ${meta.accentTextClass}`}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>

        <select
          value={kind}
          onChange={(event) =>
            updateAttributes({ kind: event.target.value as AcademicKind })
          }
          aria-label="Type de bloc académique"
          className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide outline-none transition-opacity ${meta.badgeClass}`}
        >
          {ACADEMIC_ORDER.map((itemKind) => (
            <option
              key={itemKind}
              value={itemKind}
              className="bg-white text-stone-900 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {ACADEMIC_META[itemKind].label}
            </option>
          ))}
        </select>

        <Icon className={`h-3.5 w-3.5 shrink-0 opacity-75 ${meta.accentTextClass}`} />

        {kind !== 'proof' && (
          <span
            aria-hidden="true"
            className={`softmath-academic-num text-xs font-bold ${meta.accentTextClass}`}
          />
        )}

        <input
          type="text"
          value={title}
          onChange={(event) => updateAttributes({ title: event.target.value })}
          onKeyDown={(event) => event.stopPropagation()}
          placeholder={meta.placeholder}
          aria-label={`Titre : ${meta.label}`}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-stone-800 placeholder:font-normal placeholder:text-stone-400/80 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />

        {isExamMode && kind === 'proof' && (
          <button
            type="button"
            onClick={() => setRevealedInExam((v) => !v)}
            title={
              revealedInExam
                ? 'Remasquer la démonstration (Mode Examen)'
                : 'Révéler temporairement pour vérifier'
            }
            className="inline-flex items-center gap-1 rounded border border-amber-400/50 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-500/20 print:hidden dark:text-amber-300"
          >
            {revealedInExam ? (
              <>
                <EyeOff className="h-3 w-3" />
                Masquer
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                Révéler (Examen)
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={deleteNode}
          title="Supprimer ce bloc académique"
          aria-label={`Supprimer ${meta.label}`}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-400 opacity-0 transition-opacity group-hover/academic:opacity-100 hover:bg-red-100 hover:text-red-600 focus:opacity-100 print:hidden dark:text-zinc-500 dark:hover:bg-red-950/60 dark:hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* Contenu riche TipTap (conservé monté même replié pour l'intégrité ProseMirror) */}
      <div
        className={`softmath-academic-content mt-2 pl-1 ${
          collapsed ? 'hidden print:block' : ''
        } ${isMaskedByExam ? 'hidden softmath-exam-hidden' : ''}`}
      >
        <NodeViewContent className="outline-none" />
        {kind === 'proof' && (
          <div
            contentEditable={false}
            aria-hidden="true"
            className="mt-1 flex justify-end text-sm font-semibold text-amber-700/70 select-none dark:text-amber-300/70"
          >
            □
          </div>
        )}
      </div>

      {isMaskedByExam && (
        <div
          contentEditable={false}
          onClick={() => setRevealedInExam(true)}
          className="softmath-exam-hidden mt-2 cursor-pointer rounded-lg border border-dashed border-amber-400/60 bg-white/50 px-3 py-2 text-xs italic text-amber-800/80 hover:bg-white/80 print:block dark:bg-zinc-900/40 dark:text-amber-300/80"
        >
          Mode Examen actif — Démonstration masquée. Rédigez sur feuille puis cliquez pour révéler.
        </div>
      )}

      {collapsed && !isMaskedByExam && (
        <p
          contentEditable={false}
          onClick={() => updateAttributes({ collapsed: false })}
          className="mt-1.5 cursor-pointer pl-7 text-xs italic text-stone-400 hover:text-stone-600 print:hidden dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          Bloc replié — cliquer pour afficher le contenu
        </p>
      )}
    </NodeViewWrapper>
  );
}

