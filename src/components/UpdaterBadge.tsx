import React from 'react';
import { Check, Download, RefreshCw, RotateCw } from 'lucide-react';
import type { AppUpdateStatus } from '../hooks/useAppUpdater';

export interface UpdaterBadgeProps {
  status?: AppUpdateStatus;
  currentVersion?: string;
  availableVersion?: string | null;
  downloadProgress?: number | null;
  errorMessage?: string | null;
  onCheckUpdates?: () => void;
  onInstallUpdate?: () => void;
}

export const UpdaterBadge: React.FC<UpdaterBadgeProps> = ({
  status = 'idle',
  currentVersion = '0.3.0',
  availableVersion = null,
  downloadProgress = null,
  errorMessage = null,
  onCheckUpdates,
  onInstallUpdate,
}) => {
  if (!onCheckUpdates) {
    return null;
  }

  if (status === 'ready' && availableVersion) {
    return (
      <button
        type="button"
        data-testid="updater-install-btn"
        onClick={onInstallUpdate}
        title={`Enregistrer les notes en cours, installer SoftMath v${availableVersion} et redémarrer`}
        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
      >
        <RotateCw className="h-3 w-3" />
        <span>MàJ v{availableVersion} · Redémarrer</span>
      </button>
    );
  }

  if (status === 'downloading') {
    return (
      <span
        data-testid="updater-downloading-badge"
        title={`Téléchargement automatique de SoftMath v${availableVersion ?? ''} en cours`}
        className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
      >
        <Download className="h-3 w-3 animate-bounce" />
        <span>
          MàJ v{availableVersion ?? ''}
          {downloadProgress !== null ? ` · ${downloadProgress}%` : '…'}
        </span>
      </span>
    );
  }

  if (status === 'installing') {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span>Installation…</span>
      </span>
    );
  }

  if (status === 'checking') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-stone-500 dark:text-zinc-400">
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span className="hidden sm:inline">Vérif. MàJ…</span>
      </span>
    );
  }

  if (status === 'up-to-date') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" />
        <span>À jour</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      data-testid="updater-check-btn"
      onClick={onCheckUpdates}
      title={
        status === 'error' && errorMessage
          ? `${errorMessage} — Cliquer pour réessayer`
          : `SoftMath v${currentVersion} — Vérifier les mises à jour`
      }
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
        status === 'error'
          ? 'text-amber-700 hover:bg-amber-100/70 dark:text-amber-400 dark:hover:bg-amber-950/50'
          : 'text-stone-500 hover:bg-stone-200/80 hover:text-stone-900 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200'
      }`}
    >
      <span>{status === 'error' ? 'MàJ ?' : `v${currentVersion}`}</span>
    </button>
  );
};

