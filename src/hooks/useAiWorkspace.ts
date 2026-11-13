import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildContextualSystemPrompt,
  buildInlineActionPrompts,
  MATH_OCR_SYSTEM_PROMPT,
  normalizeAiMarkdownForEditor,
} from '../services/aiPrompts';
import {
  checkOllamaConnection,
  DEFAULT_AI_SETTINGS,
  EMPTY_AI_SECRETS,
  loadAiSecrets,
  loadAiSettings,
  saveAiSecrets,
  saveAiSettings,
  streamAiCompletion,
} from '../services/aiService';
import type {
  AiChatMessage,
  AiContextSelectionPayload,
  AiExecutionRoute,
  AiImageAttachment,
  AiInlineActionKind,
  AiProfileMode,
  AiSecrets,
  AiSettings,
  OllamaConnectionState,
  OllamaHealthResult,
} from '../types/ai';

export interface InlineAiTaskState {
  id: string;
  kind: AiInlineActionKind | 'ocr';
  label: string;
  streamedText: string;
  route: AiExecutionRoute | null;
  error?: string;
  status: 'streaming' | 'error';
}

export interface EditorAiBridge {
  insertMarkdownAtCursor: (markdown: string) => void;
  replaceRangeWithMarkdown: (from: number, to: number, markdown: string) => void;
  insertMarkdownAfter: (pos: number, markdown: string) => void;
}

const INLINE_ACTION_LABELS: Record<AiInlineActionKind | 'ocr', string> = {
  'verify-rigor': 'Vérification de la rigueur',
  'detail-steps': 'Développement des étapes',
  'generate-exercise': 'Génération d’un exercice',
  'convert-latex': 'Conversion en LaTeX KaTeX',
  ocr: 'OCR mathématique (image → LaTeX)',
};

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isAbortLikeError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.name === 'AbortError' ||
      err.message.toLowerCase().includes('abort') ||
      err.message.toLowerCase().includes('annul')
    );
  }
  return false;
}

interface UseAiWorkspaceOptions {
  activeNoteTitle?: string | null;
  activeNoteMarkdown?: string | null;
}

export function useAiWorkspace({
  activeNoteTitle,
  activeNoteMarkdown,
}: UseAiWorkspaceOptions) {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [secrets, setSecrets] = useState<AiSecrets>(EMPTY_AI_SECRETS);
  const [secretsLoaded, setSecretsLoaded] = useState(false);

  const [ollamaStatus, setOllamaStatus] =
    useState<OllamaConnectionState>('unknown');
  const [ollamaHealth, setOllamaHealth] = useState<OllamaHealthResult | null>(
    null,
  );

  const [copilotOpen, setCopilotOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [isCopilotStreaming, setIsCopilotStreaming] = useState(false);
  const [activeRoute, setActiveRoute] = useState<AiExecutionRoute | null>(null);
  const [inlineTask, setInlineTask] = useState<InlineAiTaskState | null>(null);

  const copilotAbortRef = useRef<AbortController | null>(null);
  const inlineAbortRef = useRef<AbortController | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const secretsRef = useRef(secrets);
  secretsRef.current = secrets;

  const noteTitleRef = useRef(activeNoteTitle);
  noteTitleRef.current = activeNoteTitle;
  const noteMarkdownRef = useRef(activeNoteMarkdown);
  noteMarkdownRef.current = activeNoteMarkdown;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Charger les clés API depuis le coffre Tauri au démarrage
  useEffect(() => {
    let active = true;
    loadAiSecrets()
      .then((loaded) => {
        if (!active) return;
        setSecrets(loaded);
        setSecretsLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setSecretsLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshOllamaHealth = useCallback(
    async (customBaseUrl?: string): Promise<OllamaHealthResult> => {
      const targetUrl = customBaseUrl ?? settingsRef.current.ollamaBaseUrl;
      setOllamaStatus('checking');
      const result = await checkOllamaConnection(targetUrl, 3000);
      setOllamaHealth(result);
      setOllamaStatus(result.online ? 'connected' : 'offline');

      if (result.online && result.models.length > 0) {
        const currentModel = settingsRef.current.ollamaModel.trim();
        const exactMatch = result.models.some((m) => m.name === currentModel);
        const prefixMatch = !exactMatch
          ? result.models.find(
              (m) =>
                currentModel &&
                (m.name.startsWith(`${currentModel}:`) ||
                  currentModel.startsWith(`${m.name}:`)),
            )
          : undefined;

        if (!currentModel || (prefixMatch && prefixMatch.name !== currentModel)) {
          const picked = prefixMatch?.name ?? result.models[0].name;
          const next = { ...settingsRef.current, ollamaModel: picked };
          setSettings(next);
          saveAiSettings(next);
        } else if (
          !exactMatch &&
          currentModel === DEFAULT_AI_SETTINGS.ollamaModel
        ) {
          const next = {
            ...settingsRef.current,
            ollamaModel: result.models[0].name,
          };
          setSettings(next);
          saveAiSettings(next);
        }
      }

      return result;
    },
    [],
  );

  // Vérification initiale discrète d'Ollama à l'ouverture
  useEffect(() => {
    void refreshOllamaHealth(settings.ollamaBaseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setProfileMode = useCallback((mode: AiProfileMode) => {
    setSettings((prev) => {
      const next = { ...prev, activeProfile: mode };
      saveAiSettings(next);
      return next;
    });
  }, []);

  const updateSettingsAndSecrets = useCallback(
    async (nextSettings: AiSettings, nextSecrets?: AiSecrets) => {
      const prevUrl = settingsRef.current.ollamaBaseUrl;
      setSettings(nextSettings);
      saveAiSettings(nextSettings);

      if (nextSecrets) {
        const cleanedSecrets: AiSecrets = {
          geminiApiKey: nextSecrets.geminiApiKey.trim(),
          anthropicApiKey: nextSecrets.anthropicApiKey.trim(),
        };
        setSecrets(cleanedSecrets);
        await saveAiSecrets(cleanedSecrets);
      }

      if (nextSettings.ollamaBaseUrl !== prevUrl) {
        void refreshOllamaHealth(nextSettings.ollamaBaseUrl);
      }
    },
    [refreshOllamaHealth],
  );

  const stopCopilotGeneration = useCallback(() => {
    copilotAbortRef.current?.abort();
    copilotAbortRef.current = null;
    setIsCopilotStreaming(false);
  }, []);

  const clearCopilotMessages = useCallback(() => {
    copilotAbortRef.current?.abort();
    copilotAbortRef.current = null;
    setIsCopilotStreaming(false);
    setMessages([]);
  }, []);

  const streamToCopilot = useCallback(
    async (options: {
      userDisplayText: string;
      userPromptForModel: string;
      kind: 'chat' | 'rigor-audit';
      image?: AiImageAttachment | null;
    }) => {
      // Annuler toute génération précédente du copilote
      copilotAbortRef.current?.abort();
      const controller = new AbortController();
      copilotAbortRef.current = controller;

      const userMsg: AiChatMessage = {
        id: createId('usr'),
        role: 'user',
        content: options.userDisplayText,
        createdAt: Date.now(),
        kind: options.kind,
        imagePreviewUrl: options.image?.previewDataUrl,
      };
      const assistantId = createId('ast');
      const assistantPlaceholder: AiChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        kind: options.kind,
      };

      const priorTurns = messagesRef.current
        .filter((m) => !m.errorMessage && m.content.trim().length > 0)
        .slice(-10)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      setCopilotOpen(true);
      setIsCopilotStreaming(true);
      setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);

      const systemPrompt = buildContextualSystemPrompt(
        settingsRef.current.systemPrompt,
        noteTitleRef.current,
        noteMarkdownRef.current,
      );

      try {
        let resolvedRoute: AiExecutionRoute | null = null;
        let accumulated = '';

        await streamAiCompletion(
          {
            systemPrompt,
            messages: [
              ...priorTurns,
              {
                role: 'user',
                content: options.userPromptForModel,
                images: options.image ? [options.image] : undefined,
              },
            ],
            signal: controller.signal,
          },
          settingsRef.current,
          secretsRef.current,
          {
            onRouteResolved: (route) => {
              resolvedRoute = route;
              setActiveRoute(route);
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, route } : m)),
              );
              if (route.profileUsed === 'cloud' && route.fallbackReason) {
                setOllamaStatus('offline');
              } else if (route.provider === 'ollama') {
                setOllamaStatus('connected');
              }
            },
            onToken: (delta) => {
              accumulated += delta;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: accumulated } : m,
                ),
              );
            },
          },
        );

        const finalized = accumulated.trim();
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: finalized,
                  route: resolvedRoute ?? m.route,
                }
              : m,
          ),
        );
      } catch (err) {
        if (controller.signal.aborted || isAbortLikeError(err)) {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Erreur lors de la requête IA.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  errorMessage: message,
                }
              : m,
          ),
        );
      } finally {
        if (copilotAbortRef.current === controller) {
          copilotAbortRef.current = null;
          setIsCopilotStreaming(false);
        }
      }
    },
    [],
  );

  const sendCopilotMessage = useCallback(
    async (promptText: string, image?: AiImageAttachment | null) => {
      const cleaned = promptText.trim();
      if (!cleaned && !image) return;
      const effectivePrompt =
        cleaned ||
        'Analyse cette image mathématique, explique ou transcris-la proprement en KaTeX ($...$ / $$...$$).';

      await streamToCopilot({
        userDisplayText:
          cleaned || 'Image envoyée pour analyse mathématique',
        userPromptForModel: effectivePrompt,
        kind: 'chat',
        image,
      });
    },
    [streamToCopilot],
  );

  const abortInlineTask = useCallback(() => {
    inlineAbortRef.current?.abort();
    inlineAbortRef.current = null;
    setInlineTask(null);
  }, []);

  const dismissInlineError = useCallback(() => {
    setInlineTask(null);
  }, []);

  const runInlineAction = useCallback(
    async (payload: AiContextSelectionPayload, editorBridge: EditorAiBridge) => {
      const prompts = buildInlineActionPrompts(
        payload.action,
        payload.selectedText,
        payload.surroundingText,
      );

      // 1. Vérifier la rigueur : audit latéral sans écraser la note
      if (payload.action === 'verify-rigor') {
        const previewSnippet =
          payload.selectedText.length > 140
            ? `${payload.selectedText.slice(0, 140).trim()}…`
            : payload.selectedText;
        await streamToCopilot({
          userDisplayText: `Vérifier la rigueur :\n> ${previewSnippet.replace(/\n+/g, ' ')}`,
          userPromptForModel: prompts.userPrompt,
          kind: 'rigor-audit',
        });
        return;
      }

      // 2. Actions avec insertion directe dans la note (sans bloquer l'interface)
      inlineAbortRef.current?.abort();
      const controller = new AbortController();
      inlineAbortRef.current = controller;

      const taskId = createId('inline');
      setInlineTask({
        id: taskId,
        kind: payload.action,
        label: INLINE_ACTION_LABELS[payload.action],
        streamedText: '',
        route: null,
        status: 'streaming',
      });

      const systemPrompt = prompts.actionPromptOverride
        ? buildContextualSystemPrompt(
            prompts.actionPromptOverride,
            noteTitleRef.current,
            noteMarkdownRef.current,
          )
        : buildContextualSystemPrompt(
            settingsRef.current.systemPrompt,
            noteTitleRef.current,
            noteMarkdownRef.current,
          );

      try {
        let accumulated = '';
        await streamAiCompletion(
          {
            systemPrompt,
            messages: [{ role: 'user', content: prompts.userPrompt }],
            signal: controller.signal,
          },
          settingsRef.current,
          secretsRef.current,
          {
            onRouteResolved: (route) => {
              setActiveRoute(route);
              setInlineTask((prev) =>
                prev && prev.id === taskId ? { ...prev, route } : prev,
              );
              if (route.profileUsed === 'cloud' && route.fallbackReason) {
                setOllamaStatus('offline');
              } else if (route.provider === 'ollama') {
                setOllamaStatus('connected');
              }
            },
            onToken: (delta) => {
              accumulated += delta;
              setInlineTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, streamedText: accumulated }
                  : prev,
              );
            },
          },
        );

        if (controller.signal.aborted) {
          return;
        }

        const normalized = normalizeAiMarkdownForEditor(accumulated, {
          unwrapOuterCodeFence: true,
        });
        if (!normalized) {
          throw new Error('La réponse générée par le modèle est vide.');
        }

        if (payload.action === 'convert-latex') {
          editorBridge.replaceRangeWithMarkdown(
            payload.selectionRange.from,
            payload.selectionRange.to,
            normalized,
          );
        } else {
          editorBridge.insertMarkdownAfter(payload.insertAfterPos, normalized);
        }

        setInlineTask(null);
      } catch (err) {
        if (controller.signal.aborted || isAbortLikeError(err)) {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Erreur lors de la génération IA.';
        setInlineTask((prev) =>
          prev && prev.id === taskId
            ? { ...prev, status: 'error', error: message }
            : prev,
        );
      } finally {
        if (inlineAbortRef.current === controller) {
          inlineAbortRef.current = null;
        }
      }
    },
    [streamToCopilot],
  );

  const runOcrFromImage = useCallback(
    async (image: AiImageAttachment, editorBridge: EditorAiBridge) => {
      inlineAbortRef.current?.abort();
      const controller = new AbortController();
      inlineAbortRef.current = controller;

      const taskId = createId('ocr');
      setInlineTask({
        id: taskId,
        kind: 'ocr',
        label: INLINE_ACTION_LABELS.ocr,
        streamedText: '',
        route: null,
        status: 'streaming',
      });

      try {
        let accumulated = '';
        await streamAiCompletion(
          {
            systemPrompt: MATH_OCR_SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content:
                  'Transcris intégralement cette image mathématique en Markdown + LaTeX KaTeX pur ($...$ et $$...$$).',
                images: [image],
              },
            ],
            signal: controller.signal,
            preferredCloudForVision: 'gemini',
          },
          settingsRef.current,
          secretsRef.current,
          {
            onRouteResolved: (route) => {
              setActiveRoute(route);
              setInlineTask((prev) =>
                prev && prev.id === taskId ? { ...prev, route } : prev,
              );
            },
            onToken: (delta) => {
              accumulated += delta;
              setInlineTask((prev) =>
                prev && prev.id === taskId
                  ? { ...prev, streamedText: accumulated }
                  : prev,
              );
            },
          },
        );

        if (controller.signal.aborted) {
          return;
        }

        const normalized = normalizeAiMarkdownForEditor(accumulated, {
          unwrapOuterCodeFence: true,
        });
        if (!normalized) {
          throw new Error('Aucun texte ou formule n’a pu être extrait.');
        }

        editorBridge.insertMarkdownAtCursor(normalized);
        setInlineTask(null);
      } catch (err) {
        if (controller.signal.aborted || isAbortLikeError(err)) {
          return;
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Erreur lors de la transcription OCR.';
        setInlineTask((prev) =>
          prev && prev.id === taskId
            ? { ...prev, status: 'error', error: message }
            : prev,
        );
      } finally {
        if (inlineAbortRef.current === controller) {
          inlineAbortRef.current = null;
        }
      }
    },
    [],
  );

  // Nettoyage des requêtes actives au démontage
  useEffect(() => {
    return () => {
      copilotAbortRef.current?.abort();
      inlineAbortRef.current?.abort();
    };
  }, []);

  return {
    settings,
    secrets,
    secretsLoaded,
    ollamaStatus,
    ollamaHealth,
    copilotOpen,
    setCopilotOpen,
    settingsOpen,
    setSettingsOpen,
    messages,
    isCopilotStreaming,
    activeRoute,
    inlineTask,
    refreshOllamaHealth,
    setProfileMode,
    updateSettingsAndSecrets,
    sendCopilotMessage,
    stopCopilotGeneration,
    clearCopilotMessages,
    runInlineAction,
    runOcrFromImage,
    abortInlineTask,
    dismissInlineError,
  };
}

