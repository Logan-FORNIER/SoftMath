import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { isTauriEnvironment } from '../services/aiService';

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'up-to-date'
  | 'error';

export interface CheckUpdatesOptions {
  silent?: boolean;
  autoDownload?: boolean;
}

interface UseAppUpdaterOptions {
  onBeforeInstall?: () => Promise<void> | void;
  onNotifyError?: (message: string) => void;
}

function hasTauriIpc(): boolean {
  if (!isTauriEnvironment()) {
    return false;
  }
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__?: { invoke?: unknown };
    }
  ).__TAURI_INTERNALS__;
  return typeof internals?.invoke === 'function';
}

function formatUpdaterError(err: unknown): string {
  const raw =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : 'Erreur inconnue lors de la vérification.';

  const lower = raw.toLowerCase();
  if (
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('valid release json') ||
    lower.includes('from the remote')
  ) {
    return 'Aucune release valide trouvée sur GitHub (vérifiez le dépôt configuré dans tauri.conf.json et publiez une première release).';
  }
  if (
    lower.includes('network') ||
    lower.includes('dns') ||
    lower.includes('timed out') ||
    lower.includes('connect')
  ) {
    return 'Impossible de joindre GitHub pour vérifier les mises à jour.';
  }
  if (lower.includes('signature') || lower.includes('pubkey')) {
    return 'Signature de mise à jour invalide ou clé publique incorrecte.';
  }
  return raw;
}

export function useAppUpdater({
  onBeforeInstall,
  onNotifyError,
}: UseAppUpdaterOptions = {}) {
  const [status, setStatus] = useState<AppUpdateStatus>('idle');
  const [currentVersion, setCurrentVersion] = useState<string>('0.2.0');
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pendingUpdateRef = useRef<Update | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const statusRef = useRef<AppUpdateStatus>(status);
  statusRef.current = status;
  const startupCheckedRef = useRef<boolean>(false);
  const upToDateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBeforeInstallRef = useRef(onBeforeInstall);
  onBeforeInstallRef.current = onBeforeInstall;
  const onNotifyErrorRef = useRef(onNotifyError);
  onNotifyErrorRef.current = onNotifyError;

  const closePendingUpdate = useCallback(async () => {
    const existing = pendingUpdateRef.current;
    pendingUpdateRef.current = null;
    if (existing) {
      await existing.close().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!hasTauriIpc()) {
      return;
    }
    let cancelled = false;
    void getVersion()
      .then((version) => {
        if (!cancelled && version) {
          setCurrentVersion(version);
        }
      })
      .catch(() => {
        // Keep fallback version outside native bundle.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (upToDateTimerRef.current !== null) {
        clearTimeout(upToDateTimerRef.current);
      }
      void closePendingUpdate();
    };
  }, [closePendingUpdate]);

  const checkForUpdates = useCallback(
    async ({ silent = false, autoDownload = true }: CheckUpdatesOptions = {}) => {
      if (!hasTauriIpc() || inFlightRef.current) {
        return;
      }

      if (upToDateTimerRef.current !== null) {
        clearTimeout(upToDateTimerRef.current);
        upToDateTimerRef.current = null;
      }

      inFlightRef.current = true;
      setErrorMessage(null);

      // Si une mise à jour est déjà téléchargée et prête, inutile de re-télécharger.
      if (pendingUpdateRef.current && statusRef.current === 'ready') {
        inFlightRef.current = false;
        return;
      }

      setStatus('checking');

      try {
        const update = await check({ timeout: 12000 });
        if (!update) {
          await closePendingUpdate();
          setAvailableVersion(null);
          setReleaseNotes(null);
          setDownloadProgress(null);

          if (silent) {
            setStatus('idle');
          } else {
            setStatus('up-to-date');
            upToDateTimerRef.current = setTimeout(() => {
              setStatus((prev) => (prev === 'up-to-date' ? 'idle' : prev));
            }, 4000);
          }
          return;
        }

        await closePendingUpdate();
        pendingUpdateRef.current = update;
        setAvailableVersion(update.version);
        setReleaseNotes(update.body ?? null);

        if (!autoDownload) {
          setStatus('ready');
          return;
        }

        setStatus('downloading');
        setDownloadProgress(0);

        let contentLength = 0;
        let downloaded = 0;

        await update.download((event) => {
          if (event.event === 'Started') {
            contentLength = event.data.contentLength ?? 0;
          } else if (event.event === 'Progress') {
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              const pct = Math.min(99, Math.round((downloaded / contentLength) * 100));
              setDownloadProgress(pct);
            } else {
              setDownloadProgress(null);
            }
          } else if (event.event === 'Finished') {
            setDownloadProgress(100);
          }
        });

        setStatus('ready');
      } catch (err) {
        await closePendingUpdate();
        setDownloadProgress(null);

        if (silent) {
          // Ne jamais perturber l'utilisateur au démarrage s'il est hors ligne ou sans release.
          setStatus('idle');
          return;
        }

        const msg = formatUpdaterError(err);
        setErrorMessage(msg);
        setStatus('error');
        onNotifyErrorRef.current?.(msg);
      } finally {
        inFlightRef.current = false;
      }
    },
    [closePendingUpdate],
  );

  const installAndRestart = useCallback(async () => {
    const update = pendingUpdateRef.current;
    if (!update || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setStatus('installing');
    setErrorMessage(null);

    try {
      await onBeforeInstallRef.current?.();
      await update.install({ restartAfterInstall: true });
      await relaunch();
    } catch (err) {
      const msg = formatUpdaterError(err);
      setErrorMessage(msg);
      setStatus('error');
      onNotifyErrorRef.current?.(`Échec de l’installation de la mise à jour : ${msg}`);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Vérification et téléchargement automatique en arrière-plan peu après l'ouverture (prod uniquement).
  useEffect(() => {
    if (import.meta.env.DEV || !hasTauriIpc() || startupCheckedRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      if (startupCheckedRef.current) {
        return;
      }
      startupCheckedRef.current = true;
      void checkForUpdates({ silent: true, autoDownload: true });
    }, 2500);

    return () => {
      clearTimeout(timer);
    };
  }, [checkForUpdates]);

  const dismissError = useCallback(() => {
    setErrorMessage(null);
    setStatus((prev) => (prev === 'error' ? 'idle' : prev));
  }, []);

  return {
    status,
    currentVersion,
    availableVersion,
    downloadProgress,
    releaseNotes,
    errorMessage,
    checkForUpdates,
    installAndRestart,
    dismissError,
  };
}
