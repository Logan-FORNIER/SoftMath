import React, { useRef } from 'react';
import {
  Bot,
  Camera,
  Cloud,
  Cpu,
  RefreshCw,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { PomodoroTimer } from './PomodoroTimer';
import { UpdaterBadge, type UpdaterBadgeProps } from './UpdaterBadge';
import { fileToAiImageAttachment } from '../services/aiService';
import type {
  AiExecutionRoute,
  AiImageAttachment,
  AiProfileMode,
  AiSettings,
  OllamaConnectionState,
  OllamaHealthResult,
} from '../types/ai';

interface StatusBarProps {
  settings: AiSettings;
  ollamaStatus: OllamaConnectionState;
  ollamaHealth: OllamaHealthResult | null;
  activeRoute: AiExecutionRoute | null;
  isStreaming: boolean;
  copilotOpen: boolean;
  hasActiveNote: boolean;
  onSelectProfile: (mode: AiProfileMode) => void;
  onRefreshOllama: () => void;
  onOpenSettings: () => void;
  onToggleCopilot: () => void;
  onScanOcrImage: (image: AiImageAttachment) => void;
  onNotifyError?: (message: string) => void;
  updaterProps?: UpdaterBadgeProps;
}

const PROFILE_OPTIONS: Array<{
  mode: AiProfileMode;
  label: string;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    mode: 'auto',
    label: 'Auto',
    title: 'Mode Auto / Fallback : Local Ollama par défaut, bascule Cloud (Gemini) pour OCR ou hors ligne',
    Icon: Sparkles,
  },
  {
    mode: 'local',
    label: 'Local',
    title: 'Profil Local / Réseau (Ollama — Puissance & Confidentialité)',
    Icon: Cpu,
  },
  {
    mode: 'cloud',
    label: 'Cloud',
    title: 'Profil Cloud (Gemini / Claude — Nomade & Batterie)',
    Icon: Cloud,
  },
];

export const StatusBar: React.FC<StatusBarProps> = ({
  settings,
  ollamaStatus,
  ollamaHealth,
  activeRoute,
  isStreaming,
  copilotOpen,
  hasActiveNote,
  onSelectProfile,
  onRefreshOllama,
  onOpenSettings,
  onToggleCopilot,
  onScanOcrImage,
  onNotifyError,
  updaterProps,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cloudModelLabel =
    settings.cloudProvider === 'gemini'
      ? settings.geminiModel
      : settings.anthropicModel;

  const activeTargetText =
    settings.activeProfile === 'cloud'
      ? `${settings.cloudProvider === 'gemini' ? 'Gemini' : 'Claude'} · ${cloudModelLabel}`
      : settings.activeProfile === 'local'
        ? `Ollama · ${settings.ollamaModel}`
        : ollamaStatus === 'connected'
          ? `Ollama · ${settings.ollamaModel} (OCR → Gemini)`
          : `Fallback → ${settings.cloudProvider === 'gemini' ? 'Gemini' : 'Claude'}`;

  const statusDotClass =
    settings.activeProfile === 'cloud'
      ? 'bg-sky-500'
      : ollamaStatus === 'connected'
        ? 'bg-emerald-500'
        : ollamaStatus === 'checking'
          ? 'bg-amber-400 animate-pulse'
          : 'bg-rose-500';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const attachment = await fileToAiImageAttachment(file, file.name);
      onScanOcrImage(attachment);
    } catch (err) {
      onNotifyError?.(
        err instanceof Error ? err.message : 'Lecture de l’image impossible.',
      );
    }
  };

  return (
    <footer
      data-testid="ai-status-bar"
      className="flex h-7 shrink-0 select-none items-center justify-between border-t border-stone-200 bg-stone-50 px-3 text-[11px] text-stone-600 print:hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
    >
      {/* Gauche : Sélecteur de profil IA en 1 clic + état connexion */}
      <div className="flex min-w-0 items-center gap-2">
        <div
          role="group"
          aria-label="Profil d'exécution IA"
          className="inline-flex items-center rounded-md border border-stone-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-950"
        >
          {PROFILE_OPTIONS.map(({ mode, label, title, Icon }) => {
            const active = settings.activeProfile === mode;
            return (
              <button
                key={mode}
                type="button"
                data-testid={`ai-profile-${mode}`}
                onClick={() => onSelectProfile(mode)}
                title={title}
                aria-pressed={active}
                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                }`}
              >
                <Icon className="h-3 w-3" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Pastille état Ollama + modèle actif */}
        <button
          type="button"
          onClick={onRefreshOllama}
          title={
            ollamaStatus === 'connected'
              ? `Ollama connecté (${settings.ollamaBaseUrl}${ollamaHealth?.latencyMs !== undefined ? `, ${ollamaHealth.latencyMs} ms` : ''}) — Cliquer pour actualiser`
              : `${ollamaHealth?.error ?? 'Ollama hors ligne'} — Cliquer pour retester`
          }
          className="inline-flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-stone-200/70 dark:hover:bg-zinc-800"
        >
          <span
            data-testid="ollama-status-dot"
            className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass}`}
          />
          <span className="truncate font-medium text-stone-700 dark:text-zinc-300">
            {activeTargetText}
          </span>
          {ollamaStatus === 'checking' && (
            <RefreshCw className="h-3 w-3 shrink-0 animate-spin text-stone-400" />
          )}
        </button>

        {activeRoute?.fallbackReason && (
          <span
            data-testid="ai-fallback-badge"
            className="hidden items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 md:inline-flex dark:bg-amber-950/60 dark:text-amber-300"
          >
            {activeRoute.fallbackReason}
          </span>
        )}
      </div>

      {/* Droite : Mise à jour, OCR rapide, Paramètres IA et Copilote */}
      <div className="flex shrink-0 items-center gap-1.5">
        {isStreaming && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-indigo-500" />
            Génération…
          </span>
        )}

        <PomodoroTimer />

        <UpdaterBadge {...updaterProps} />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />

        <button
          type="button"
          data-testid="status-scan-ocr"
          onClick={() => fileInputRef.current?.click()}
          disabled={!hasActiveNote}
          title={
            hasActiveNote
              ? 'Scanner une image mathématique vers LaTeX (ou Ctrl+V dans l’éditeur)'
              : 'Ouvrez une note pour insérer un scan OCR'
          }
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-stone-200/80 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <Camera className="h-3 w-3" />
          <span className="hidden sm:inline">Scan OCR</span>
        </button>

        <button
          type="button"
          data-testid="status-open-ai-settings"
          onClick={onOpenSettings}
          title="Configurer les clés API, Ollama et le prompt système"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-stone-200/80 hover:text-stone-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <Settings2 className="h-3 w-3" />
          <span className="hidden sm:inline">Paramètres IA</span>
        </button>

        <button
          type="button"
          data-testid="status-toggle-copilot"
          onClick={onToggleCopilot}
          title="Afficher / masquer le Copilote mathématique contextuel"
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors ${
            copilotOpen
              ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
              : 'hover:bg-stone-200/80 hover:text-stone-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
          }`}
        >
          <Bot className="h-3 w-3" />
          <span>Copilote IA</span>
        </button>
      </div>
    </footer>
  );
};

