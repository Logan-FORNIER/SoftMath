import { AlertCircle, FolderOpen, Sigma } from 'lucide-react';
import type { ThemeMode } from '../types/notes';
import { ThemeToggle } from './ThemeToggle';
import { UpdaterBadge, type UpdaterBadgeProps } from './UpdaterBadge';

interface WelcomeScreenProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenFolder: () => void;
  errorMessage: string | null;
  onDismissError: () => void;
  updaterProps?: UpdaterBadgeProps;
}

export function WelcomeScreen({
  theme,
  onToggleTheme,
  onOpenFolder,
  errorMessage,
  onDismissError,
  updaterProps,
}: WelcomeScreenProps) {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-white px-6 text-stone-900 dark:bg-[#111113] dark:text-zinc-100">
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <UpdaterBadge {...updaterProps} />
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-indigo-600 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-indigo-400">
          <Sigma className="h-6 w-6 stroke-[2]" />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-zinc-100">
          SoftMath
        </h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-stone-500 dark:text-zinc-400">
          Prise de notes mathématiques rapide, locale et épurée. Ouvrez un dossier pour
          accéder à vos fichiers Markdown.
        </p>

        <button
          type="button"
          onClick={onOpenFolder}
          className="mt-7 inline-flex items-center gap-2.5 rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          <FolderOpen className="h-4 w-4" />
          Ouvrir un dossier de notes
        </button>

        {errorMessage && (
          <div
            role="alert"
            className="mt-5 flex w-full items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-left text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
            <button
              type="button"
              onClick={onDismissError}
              className="font-medium underline-offset-2 hover:underline"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

