import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  FileText,
  Layers,
  RotateCcw,
  Shuffle,
  Sparkles,
  X,
} from 'lucide-react';
import { MathMarkdownPreview } from './MathMarkdownPreview';
import {
  loadFlashcardProgress,
  loadFlashcardsForScope,
  recordFlashcardReview,
  resetFlashcardProgress,
  type FlashcardItem,
  type FlashcardKind,
  type FlashcardMastery,
  type FlashcardProgressMap,
  type FlashcardReviewRating,
} from '../services/flashcardService';
import type { FileTreeNode, OpenNote } from '../types/notes';

interface FlashcardReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  rootPath: string;
  tree: FileTreeNode[];
  openTabs: OpenNote[];
  activeNote: OpenNote | null;
  secondaryNote?: OpenNote | null;
  onOpenSourceNote: (notePath: string) => void;
}

type KindFilter = 'all' | FlashcardKind;

const KIND_BADGE_CLASSES: Record<FlashcardKind, string> = {
  definition:
    'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/70 dark:bg-indigo-950/60 dark:text-indigo-300',
  theorem:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/60 dark:text-amber-300',
  exercise:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/60 dark:text-emerald-300',
  example:
    'border-stone-200 bg-stone-100 text-stone-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

const MASTERY_LABELS: Record<FlashcardMastery, { label: string; cls: string }> = {
  new: {
    label: 'Nouvelle',
    cls: 'text-stone-500 dark:text-zinc-400',
  },
  learning: {
    label: 'En révision',
    cls: 'text-amber-600 dark:text-amber-400',
  },
  mastered: {
    label: 'Maîtrisée',
    cls: 'text-emerald-600 dark:text-emerald-400',
  },
};

export const FlashcardReviewModal: React.FC<FlashcardReviewModalProps> = ({
  isOpen,
  onClose,
  rootPath,
  tree,
  openTabs,
  activeNote,
  secondaryNote,
  onOpenSourceNote,
}) => {
  const [scope, setScope] = useState<'active' | 'workspace'>(() =>
    activeNote ? 'active' : 'workspace'
  );
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [onlyPending, setOnlyPending] = useState(false);
  const [allCards, setAllCards] = useState<FlashcardItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<FlashcardProgressMap>(() =>
    loadFlashcardProgress(rootPath)
  );
  const [orderSeed, setOrderSeed] = useState<string[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionReviewed, setSessionReviewed] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);

  // Sync scope default if modal reopens without active note
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setProgress(loadFlashcardProgress(rootPath));
    if (!activeNote && scope === 'active') {
      setScope('workspace');
    }
  }, [isOpen, rootPath, activeNote, scope]);

  // Extract cards when modal opens or scope changes
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setOrderSeed(null);
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionReviewed(0);
    setSessionDone(false);

    void loadFlashcardsForScope({
      rootPath,
      tree,
      openTabs,
      activeNote,
      secondaryNote,
      scope,
    })
      .then((cards) => {
        if (!cancelled) {
          setAllCards(cards);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, scope, rootPath, tree, openTabs, activeNote, secondaryNote]);

  const stats = useMemo(() => {
    let mastered = 0;
    let learning = 0;
    let unseen = 0;
    for (const card of allCards) {
      const m = progress[card.id]?.mastery ?? 'new';
      if (m === 'mastered') {
        mastered += 1;
      } else if (m === 'learning') {
        learning += 1;
      } else {
        unseen += 1;
      }
    }
    return { total: allCards.length, mastered, learning, unseen };
  }, [allCards, progress]);

  const deck = useMemo(() => {
    const filtered = allCards.filter((card) => {
      if (kindFilter !== 'all' && card.kind !== kindFilter) {
        return false;
      }
      if (onlyPending) {
        const rec = progress[card.id];
        if (rec?.mastery === 'mastered') {
          return false;
        }
      }
      return true;
    });

    if (!orderSeed) {
      return filtered;
    }
    const orderRank = new Map(orderSeed.map((id, idx) => [id, idx]));
    return [...filtered].sort(
      (a, b) => (orderRank.get(a.id) ?? 99999) - (orderRank.get(b.id) ?? 99999)
    );
  }, [allCards, kindFilter, onlyPending, progress, orderSeed]);

  const safeIndex =
    deck.length > 0 ? Math.min(currentIndex, deck.length - 1) : 0;
  const currentCard = deck[safeIndex] ?? null;

  const handleShuffle = useCallback(() => {
    const ids = deck.map((c) => c.id);
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setOrderSeed(ids);
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionDone(false);
  }, [deck]);

  const handleRate = useCallback(
    (rating: FlashcardReviewRating) => {
      if (!currentCard) {
        return;
      }
      const prevLength = deck.length;
      const nextProgress = recordFlashcardReview(
        rootPath,
        progress,
        currentCard.id,
        rating
      );
      setProgress(nextProgress);
      setSessionReviewed((n) => n + 1);
      setIsFlipped(false);

      // If filtering out mastered cards and this card just became mastered,
      // deck shrinks by 1 so keeping safeIndex automatically reveals the next card.
      const removesCurrent = onlyPending && rating === 'mastered';
      if (removesCurrent) {
        if (prevLength <= 1) {
          setSessionDone(true);
          setCurrentIndex(0);
        } else if (safeIndex >= prevLength - 1) {
          setCurrentIndex(Math.max(0, prevLength - 2));
        }
        return;
      }

      if (safeIndex + 1 >= prevLength) {
        setSessionDone(true);
      } else {
        setCurrentIndex(safeIndex + 1);
      }
    },
    [currentCard, deck.length, onlyPending, progress, rootPath, safeIndex]
  );

  const handleRestartSession = useCallback(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionDone(false);
  }, []);

  const handleResetProgress = useCallback(() => {
    setProgress(resetFlashcardProgress(rootPath));
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionDone(false);
    setSessionReviewed(0);
  }, [rootPath]);

  // Keyboard shortcuts during review
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (sessionDone || !currentCard) {
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!isFlipped) {
          setIsFlipped(true);
        }
        return;
      }

      if (isFlipped) {
        if (e.key === '1') {
          e.preventDefault();
          handleRate('again');
        } else if (e.key === '2') {
          e.preventDefault();
          handleRate('medium');
        } else if (e.key === '3') {
          e.preventDefault();
          handleRate('mastered');
        }
      }

      if (e.key === 'ArrowRight' && deck.length > 1) {
        e.preventDefault();
        setIsFlipped(false);
        setCurrentIndex((idx) => (idx + 1) % deck.length);
      } else if (e.key === 'ArrowLeft' && deck.length > 1) {
        e.preventDefault();
        setIsFlipped(false);
        setCurrentIndex((idx) => (idx - 1 + deck.length) % deck.length);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isOpen,
    onClose,
    sessionDone,
    currentCard,
    isFlipped,
    handleRate,
    deck.length,
  ]);

  if (!isOpen) {
    return null;
  }

  const currentMastery: FlashcardMastery = currentCard
    ? (progress[currentCard.id]?.mastery ?? 'new')
    : 'new';
  const masteryInfo = MASTERY_LABELS[currentMastery];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/80 px-5 py-3.5 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-stone-900 dark:text-zinc-100">
                Mode Révision — Flashcards académiques
              </h2>
              <p className="text-xs text-stone-500 dark:text-zinc-400">
                {stats.total} carte{stats.total > 1 ? 's' : ''} · {stats.mastered} maîtrisée
                {stats.mastered > 1 ? 's' : ''} · {stats.learning} en cours
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Scope selector */}
            <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              <button
                type="button"
                disabled={!activeNote}
                onClick={() => setScope('active')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  scope === 'active'
                    ? 'bg-white text-stone-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-stone-500 hover:text-stone-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                Note active
              </button>
              <button
                type="button"
                onClick={() => setScope('workspace')}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  scope === 'workspace'
                    ? 'bg-white text-stone-900 shadow-2xs dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                }`}
              >
                Tout le dossier
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              title="Fermer (Échap)"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/70 bg-stone-50/70 px-5 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['all', 'Tout'],
                ['definition', 'Définitions'],
                ['theorem', 'Théorèmes'],
                ['exercise', 'Exercices'],
                ['example', 'Exemples'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setKindFilter(key);
                  setCurrentIndex(0);
                  setIsFlipped(false);
                  setSessionDone(false);
                }}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  kindFilter === key
                    ? 'bg-indigo-600 text-white'
                    : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-stone-600 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={onlyPending}
                onChange={(e) => {
                  setOnlyPending(e.target.checked);
                  setCurrentIndex(0);
                  setIsFlipped(false);
                  setSessionDone(false);
                }}
                className="rounded border-stone-300 accent-indigo-600"
              />
              <span>À revoir uniquement</span>
            </label>

            <button
              type="button"
              onClick={handleShuffle}
              disabled={deck.length < 2}
              title="Mélanger les cartes"
              className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Shuffle className="h-3.5 w-3.5" />
              <span>Mélanger</span>
            </button>

            <button
              type="button"
              onClick={handleResetProgress}
              disabled={Object.keys(progress).length === 0}
              title="Réinitialiser la progression mémorisée"
              className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Réinitialiser</span>
            </button>
          </div>
        </div>

        {/* Main Card Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="flex h-60 items-center justify-center text-sm text-stone-500 dark:text-zinc-400">
              Extraction des cartes de révision…
            </div>
          ) : deck.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
              <Sparkles className="h-8 w-8 text-indigo-500/80" />
              <div className="max-w-md space-y-1">
                <p className="text-sm font-medium text-stone-800 dark:text-zinc-200">
                  {allCards.length === 0
                    ? 'Aucune flashcard détectée pour le moment.'
                    : 'Toutes les cartes filtrées sont déjà maîtrisées !'}
                </p>
                <p className="text-xs text-stone-500 dark:text-zinc-400">
                  {allCards.length === 0
                    ? 'Ajoutez des blocs Définition, Théorème, Démonstration ou Exercice via « / » pour générer automatiquement vos fiches.'
                    : 'Décochez « À revoir uniquement » pour relancer une passe complète.'}
                </p>
              </div>
              {onlyPending && allCards.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOnlyPending(false)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  Afficher toutes les cartes ({allCards.length})
                </button>
              )}
            </div>
          ) : sessionDone ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-stone-900 dark:text-zinc-100">
                  Série terminée !
                </h3>
                <p className="text-xs text-stone-500 dark:text-zinc-400">
                  {sessionReviewed} carte{sessionReviewed > 1 ? 's' : ''} révisée
                  {sessionReviewed > 1 ? 's' : ''} dans cette session · {stats.mastered}/
                  {stats.total} maîtrisées.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleRestartSession}
                  className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  Recommencer la série
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-stone-200 px-3.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Fermer
                </button>
              </div>
            </div>
          ) : currentCard ? (
            <div className="space-y-4">
              {/* Card metadata & progress */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-md border px-2 py-0.5 font-medium ${KIND_BADGE_CLASSES[currentCard.kind]}`}
                  >
                    {currentCard.badgeLabel}
                  </span>
                  <span className={`font-medium ${masteryInfo.cls}`}>
                    · {masteryInfo.label}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-stone-500 dark:text-zinc-400">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSourceNote(currentCard.notePath);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400"
                    title="Ouvrir la note d'origine"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span className="max-w-44 truncate">{currentCard.noteTitle}</span>
                  </button>
                  <span className="font-mono font-medium">
                    {safeIndex + 1} / {deck.length}
                  </span>
                </div>
              </div>

              {/* Card Front */}
              <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
                <div className="mb-2 text-[10px] font-semibold tracking-wider text-stone-400 uppercase dark:text-zinc-500">
                  Question / Énoncé
                </div>
                <div className="softmath-prose text-sm text-stone-900 dark:text-zinc-100">
                  <MathMarkdownPreview content={currentCard.frontMarkdown} />
                </div>
              </div>

              {/* Card Back */}
              {isFlipped ? (
                <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/35 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/20">
                  <div className="mb-2 text-[10px] font-semibold tracking-wider text-indigo-500 uppercase dark:text-indigo-400">
                    Réponse / Démonstration
                  </div>
                  <div className="softmath-prose text-sm text-stone-900 dark:text-zinc-100">
                    <MathMarkdownPreview content={currentCard.backMarkdown} />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsFlipped(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white py-5 text-sm font-medium text-stone-700 transition-colors hover:border-indigo-400 hover:bg-indigo-50/40 hover:text-indigo-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-300"
                >
                  <Eye className="h-4 w-4" />
                  <span>Afficher la réponse (Espace)</span>
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer Rating / Controls */}
        {!isLoading && deck.length > 0 && !sessionDone && currentCard && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200/80 bg-stone-50/70 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="text-[11px] text-stone-400 dark:text-zinc-500">
              Raccourcis : <kbd className="rounded border px-1">Espace</kbd> retourner ·{' '}
              <kbd className="rounded border px-1">1</kbd>
              <kbd className="ml-0.5 rounded border px-1">2</kbd>
              <kbd className="ml-0.5 rounded border px-1">3</kbd> évaluer ·{' '}
              <kbd className="rounded border px-1">←</kbd>{' '}
              <kbd className="rounded border px-1">→</kbd> naviguer
            </div>

            {isFlipped ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRate('again')}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-900/70 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-950"
                >
                  1 · À revoir
                </button>
                <button
                  type="button"
                  onClick={() => handleRate('medium')}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-950"
                >
                  2 · Moyen
                </button>
                <button
                  type="button"
                  onClick={() => handleRate('mastered')}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950"
                >
                  3 · Maîtrisé
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsFlipped(true)}
                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Révéler la réponse
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

