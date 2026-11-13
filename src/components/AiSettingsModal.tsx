import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';
import { DEFAULT_AI_SYSTEM_PROMPT } from '../services/aiPrompts';
import {
  ANTHROPIC_PRESET_MODELS,
  GEMINI_PRESET_MODELS,
  listGeminiModels,
  normalizeGeminiModelId,
  normalizeOllamaUrl,
} from '../services/aiService';
import type {
  AiProfileMode,
  AiSecrets,
  AiSettings,
  OllamaConnectionState,
  OllamaHealthResult,
} from '../types/ai';

interface AiSettingsModalProps {
  isOpen: boolean;
  settings: AiSettings;
  secrets: AiSecrets;
  ollamaStatus: OllamaConnectionState;
  ollamaHealth: OllamaHealthResult | null;
  onRefreshOllama: (baseUrl: string) => Promise<OllamaHealthResult>;
  onSave: (nextSettings: AiSettings, nextSecrets: AiSecrets) => Promise<void>;
  onClose: () => void;
}

export const AiSettingsModal: React.FC<AiSettingsModalProps> = ({
  isOpen,
  settings,
  secrets,
  ollamaStatus,
  ollamaHealth,
  onRefreshOllama,
  onSave,
  onClose,
}) => {
  const [draftSettings, setDraftSettings] = useState<AiSettings>(settings);
  const [draftSecrets, setDraftSecrets] = useState<AiSecrets>(secrets);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [isTestingOllama, setIsTestingOllama] = useState(false);
  const [detectedGeminiModels, setDetectedGeminiModels] = useState<
    Array<{ id: string; label: string }>
  >([]);
  const [isDetectingGemini, setIsDetectingGemini] = useState(false);
  const [geminiDetectError, setGeminiDetectError] = useState<string | null>(
    null,
  );
  const [customGeminiMode, setCustomGeminiMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const normalizedModel = normalizeGeminiModelId(settings.geminiModel);
      setDraftSettings({ ...settings, geminiModel: normalizedModel });
      setDraftSecrets(secrets);
      setGeminiDetectError(null);
      setCustomGeminiMode(
        !GEMINI_PRESET_MODELS.some((m) => m.id === normalizedModel),
      );
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, settings, secrets]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTestOllama = async () => {
    setIsTestingOllama(true);
    const normalizedUrl = normalizeOllamaUrl(draftSettings.ollamaBaseUrl);
    setDraftSettings((prev) => ({ ...prev, ollamaBaseUrl: normalizedUrl }));
    try {
      const result = await onRefreshOllama(normalizedUrl);
      if (result.online && result.models.length > 0) {
        const hasCurrent = result.models.some(
          (m) => m.name === draftSettings.ollamaModel.trim(),
        );
        if (!hasCurrent) {
          setDraftSettings((prev) => ({
            ...prev,
            ollamaModel: result.models[0].name,
          }));
        }
      }
    } finally {
      setIsTestingOllama(false);
    }
  };

  const handleDetectGeminiModels = async () => {
    setIsDetectingGemini(true);
    setGeminiDetectError(null);
    try {
      const models = await listGeminiModels(draftSecrets.geminiApiKey);
      setDetectedGeminiModels(models);
      if (
        models.length > 0 &&
        !models.some((m) => m.id === draftSettings.geminiModel.trim())
      ) {
        const preferred =
          models.find((m) => m.id === 'gemini-3.8-flash') ??
          models.find((m) => m.id.includes('flash')) ??
          models[0];
        setDraftSettings((prev) => ({ ...prev, geminiModel: preferred.id }));
        setCustomGeminiMode(false);
      }
    } catch (err) {
      setGeminiDetectError(
        err instanceof Error ? err.message : 'Détection impossible.',
      );
    } finally {
      setIsDetectingGemini(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const cleaned: AiSettings = {
        ...draftSettings,
        geminiModel: normalizeGeminiModelId(draftSettings.geminiModel),
        anthropicModel:
          draftSettings.anthropicModel.trim() || 'claude-sonnet-4-5-20250929',
        ollamaBaseUrl: normalizeOllamaUrl(draftSettings.ollamaBaseUrl),
        ollamaModel: draftSettings.ollamaModel.trim() || 'qwen2.5-math',
        systemPrompt:
          draftSettings.systemPrompt.trim() || DEFAULT_AI_SYSTEM_PROMPT,
      };
      await onSave(cleaned, draftSecrets);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const detectedModels = ollamaHealth?.models ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs print:hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="ai-settings-title"
                className="text-sm font-semibold text-stone-900 dark:text-zinc-100"
              >
                Paramètres IA Hybride (Cloud + Local)
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400">
                Clés sauvegardées localement · Routage contextuel &amp; OCR KaTeX
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les paramètres IA"
            className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Formulaire scrollable */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {/* 1. Profil actif */}
            <section className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-zinc-400">
                Profil d’exécution par défaut
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(
                  [
                    {
                      id: 'auto',
                      title: 'Auto / Fallback',
                      desc: 'Local pour le texte, Cloud (Gemini) pour l’OCR ou si hors ligne',
                      Icon: Sparkles,
                    },
                    {
                      id: 'local',
                      title: 'Local / Réseau',
                      desc: 'Ollama exclusivement (GPU local, LAN ou Tailscale)',
                      Icon: Cpu,
                    },
                    {
                      id: 'cloud',
                      title: 'Cloud (Nomade)',
                      desc: 'Gemini ou Anthropic Claude (économie batterie)',
                      Icon: Cloud,
                    },
                  ] as Array<{
                    id: AiProfileMode;
                    title: string;
                    desc: string;
                    Icon: React.ComponentType<{ className?: string }>;
                  }>
                ).map(({ id, title, desc, Icon }) => {
                  const selected = draftSettings.activeProfile === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          activeProfile: id,
                        }))
                      }
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                        selected
                          ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500/40 dark:border-indigo-400 dark:bg-indigo-950/35'
                          : 'border-stone-200 hover:border-stone-300 dark:border-zinc-800 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-stone-900 dark:text-zinc-100">
                        <Icon className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>{title}</span>
                      </div>
                      <p className="text-[11px] leading-snug text-stone-500 dark:text-zinc-400">
                        {desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2. Section Local / Ollama */}
            <section className="space-y-3 rounded-xl border border-stone-200 p-4 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-xs font-semibold text-stone-900 dark:text-zinc-100">
                    Local / Réseau (Ollama)
                  </h3>
                </div>

                {/* Pastille connexion en direct */}
                <div
                  data-testid="modal-ollama-status"
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-2.5 py-0.5 text-[11px] font-medium dark:border-zinc-700"
                >
                  {isTestingOllama || ollamaStatus === 'checking' ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin text-amber-500" />
                      <span className="text-stone-600 dark:text-zinc-300">
                        Test en cours…
                      </span>
                    </>
                  ) : ollamaStatus === 'connected' ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-emerald-700 dark:text-emerald-300">
                        Connecté ({detectedModels.length} modèle
                        {detectedModels.length > 1 ? 's' : ''}
                        {ollamaHealth?.latencyMs !== undefined
                          ? ` · ${ollamaHealth.latencyMs} ms`
                          : ''}
                        )
                      </span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3.5 w-3.5 text-rose-500" />
                      <span className="text-rose-600 dark:text-rose-400">
                        Hors ligne
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label
                    htmlFor="ollama-url-input"
                    className="mb-1 block text-[11px] font-medium text-stone-600 dark:text-zinc-400"
                  >
                    URL du serveur Ollama (localhost, LAN ou IP Tailscale)
                  </label>
                  <input
                    id="ollama-url-input"
                    type="url"
                    value={draftSettings.ollamaBaseUrl}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        ollamaBaseUrl: e.target.value,
                      }))
                    }
                    placeholder="http://localhost:11434"
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-mono text-xs text-stone-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    data-testid="test-ollama-btn"
                    onClick={handleTestOllama}
                    disabled={isTestingOllama}
                    className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isTestingOllama ? 'animate-spin' : ''}`}
                    />
                    Tester
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="ollama-model-input"
                  className="mb-1 block text-[11px] font-medium text-stone-600 dark:text-zinc-400"
                >
                  Modèle local actif
                </label>
                {detectedModels.length > 0 ? (
                  <div className="space-y-1.5">
                    <select
                      id="ollama-model-input"
                      value={draftSettings.ollamaModel}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          ollamaModel: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-mono text-xs text-stone-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      {!detectedModels.some(
                        (m) => m.name === draftSettings.ollamaModel,
                      ) && (
                        <option value={draftSettings.ollamaModel}>
                          {draftSettings.ollamaModel} (personnalisé)
                        </option>
                      )}
                      {detectedModels.map((model) => (
                        <option key={model.name} value={model.name}>
                          {model.name}
                          {model.parameterSize
                            ? ` (${model.parameterSize})`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input
                    id="ollama-model-input"
                    type="text"
                    value={draftSettings.ollamaModel}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        ollamaModel: e.target.value,
                      }))
                    }
                    placeholder="qwen2.5-math ou deepseek-r1"
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-mono text-xs text-stone-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  />
                )}
              </div>
            </section>

            {/* 3. Section Cloud (Gemini & Claude) */}
            <section className="space-y-3 rounded-xl border border-stone-200 p-4 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  <h3 className="text-xs font-semibold text-stone-900 dark:text-zinc-100">
                    Cloud (Nomade / Vision OCR)
                  </h3>
                </div>

                <div className="inline-flex rounded-lg border border-stone-200 p-0.5 dark:border-zinc-700">
                  {(['gemini', 'anthropic'] as const).map((provider) => {
                    const active = draftSettings.cloudProvider === provider;
                    return (
                      <button
                        key={provider}
                        type="button"
                        onClick={() =>
                          setDraftSettings((prev) => ({
                            ...prev,
                            cloudProvider: provider,
                          }))
                        }
                        className={`rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                          active
                            ? 'bg-sky-600 text-white'
                            : 'text-stone-600 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                        }`}
                      >
                        {provider === 'gemini' ? 'Google Gemini' : 'Anthropic Claude'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modèle & clé Gemini (toujours utile pour l'OCR en mode Auto !) */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="gemini-key-input"
                    className="mb-1 flex items-center gap-1 text-[11px] font-medium text-stone-600 dark:text-zinc-400"
                  >
                    <KeyRound className="h-3 w-3" />
                    Clé API Google Gemini
                  </label>
                  <div className="relative">
                    <input
                      id="gemini-key-input"
                      type={showGeminiKey ? 'text' : 'password'}
                      value={draftSecrets.geminiApiKey}
                      onChange={(e) =>
                        setDraftSecrets((prev) => ({
                          ...prev,
                          geminiApiKey: e.target.value,
                        }))
                      }
                      placeholder="AIza..."
                      autoComplete="off"
                      className="w-full rounded-lg border border-stone-200 bg-stone-50 py-1.5 pr-8 pl-3 font-mono text-xs text-stone-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey((v) => !v)}
                      aria-label={
                        showGeminiKey ? 'Masquer la clé Gemini' : 'Afficher la clé Gemini'
                      }
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-zinc-300"
                    >
                      {showGeminiKey ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label
                      htmlFor="gemini-model-select"
                      className="block text-[11px] font-medium text-stone-600 dark:text-zinc-400"
                    >
                      Modèle Gemini actif
                    </label>
                    <button
                      type="button"
                      data-testid="detect-gemini-models-btn"
                      onClick={handleDetectGeminiModels}
                      disabled={
                        isDetectingGemini || !draftSecrets.geminiApiKey.trim()
                      }
                      title="Lister les modèles disponibles pour votre clé API Google Gemini"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-indigo-400 dark:hover:bg-indigo-950/50"
                    >
                      <RefreshCw
                        className={`h-2.5 w-2.5 ${isDetectingGemini ? 'animate-spin' : ''}`}
                      />
                      Détecter
                    </button>
                  </div>

                  {(() => {
                    const mergedOptions = [...GEMINI_PRESET_MODELS];
                    for (const detected of detectedGeminiModels) {
                      if (!mergedOptions.some((o) => o.id === detected.id)) {
                        mergedOptions.push(detected);
                      }
                    }
                    const isKnownOption = mergedOptions.some(
                      (o) => o.id === draftSettings.geminiModel,
                    );
                    const selectValue =
                      customGeminiMode || !isKnownOption
                        ? '__custom__'
                        : draftSettings.geminiModel;

                    return (
                      <div className="space-y-1.5">
                        <select
                          id="gemini-model-select"
                          value={selectValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__custom__') {
                              setCustomGeminiMode(true);
                            } else {
                              setCustomGeminiMode(false);
                              setDraftSettings((prev) => ({
                                ...prev,
                                geminiModel: val,
                              }));
                            }
                          }}
                          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-mono text-xs text-stone-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                        >
                          {mergedOptions.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                          <option value="__custom__">
                            Autre ID de modèle personnalisé…
                          </option>
                        </select>

                        {(customGeminiMode || !isKnownOption) && (
                          <input
                            id="gemini-custom-model-input"
                            type="text"
                            value={draftSettings.geminiModel}
                            onChange={(e) =>
                              setDraftSettings((prev) => ({
                                ...prev,
                                geminiModel: e.target.value,
                              }))
                            }
                            placeholder="ex: gemini-3.8-flash"
                            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-mono text-xs text-stone-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          />
                        )}

                        {geminiDetectError && (
                          <p className="text-[10px] text-rose-600 dark:text-rose-400">
                            {geminiDetectError}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label
                    htmlFor="anthropic-key-input"
                    className="mb-1 flex items-center gap-1 text-[11px] font-medium text-stone-600 dark:text-zinc-400"
                  >
                    <KeyRound className="h-3 w-3" />
                    Clé API Anthropic (Claude)
                  </label>
                  <div className="relative">
                    <input
                      id="anthropic-key-input"
                      type={showAnthropicKey ? 'text' : 'password'}
                      value={draftSecrets.anthropicApiKey}
                      onChange={(e) =>
                        setDraftSecrets((prev) => ({
                          ...prev,
                          anthropicApiKey: e.target.value,
                        }))
                      }
                      placeholder="sk-ant-..."
                      autoComplete="off"
                      className="w-full rounded-lg border border-stone-200 bg-stone-50 py-1.5 pr-8 pl-3 font-mono text-xs text-stone-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAnthropicKey((v) => !v)}
                      aria-label={
                        showAnthropicKey
                          ? 'Masquer la clé Anthropic'
                          : 'Afficher la clé Anthropic'
                      }
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-zinc-300"
                    >
                      {showAnthropicKey ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="anthropic-model-select"
                    className="mb-1 block text-[11px] font-medium text-stone-600 dark:text-zinc-400"
                  >
                    Modèle Claude actif
                  </label>
                  <select
                    id="anthropic-model-select"
                    value={draftSettings.anthropicModel}
                    onChange={(e) =>
                      setDraftSettings((prev) => ({
                        ...prev,
                        anthropicModel: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 font-mono text-xs text-stone-900 outline-none focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    {ANTHROPIC_PRESET_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* 4. Prompt système */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="ai-system-prompt"
                  className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-zinc-400"
                >
                  Prompt système (enseignant-chercheur KaTeX)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraftSettings((prev) => ({
                      ...prev,
                      systemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
                    }))
                  }
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <RotateCcw className="h-3 w-3" />
                  Réinitialiser
                </button>
              </div>
              <textarea
                id="ai-system-prompt"
                rows={5}
                value={draftSettings.systemPrompt}
                onChange={(e) =>
                  setDraftSettings((prev) => ({
                    ...prev,
                    systemPrompt: e.target.value,
                  }))
                }
                className="w-full rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-[11px] leading-relaxed text-stone-800 outline-none focus:border-indigo-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              />
            </section>
          </div>

          {/* Pied du modal */}
          <div className="flex items-center justify-end gap-2 border-t border-stone-200 bg-stone-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              data-testid="save-ai-settings-btn"
              disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              {isSaving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
