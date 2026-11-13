import { invoke } from '@tauri-apps/api/core';
import type {
  AiExecutionRoute,
  AiImageAttachment,
  AiSecrets,
  AiSettings,
  CloudProvider,
  OllamaHealthResult,
  OllamaModelInfo,
} from '../types/ai';
import { DEFAULT_AI_SYSTEM_PROMPT } from './aiPrompts';

const AI_SETTINGS_STORAGE_KEY = 'softmath:aiSettings';
const AI_SECRETS_FALLBACK_STORAGE_KEY = 'softmath:aiSecrets';

export const GEMINI_PRESET_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Recommandé · Rapide & OCR)' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (Ultra rapide)' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview (Raisonnement avancé)' },
];

const DEPRECATED_GEMINI_MODEL_MAP: Record<string, string> = {
  'gemini-2.5-flash': 'gemini-3.8-flash',
  'gemini-2.0-flash': 'gemini-3.8-flash',
  'gemini-2.0-flash-exp': 'gemini-3.8-flash',
  'gemini-1.5-flash': 'gemini-3.8-flash',
  'gemini-1.5-pro': 'gemini-3.1-pro-preview',
  'gemini-2.5-pro': 'gemini-3.1-pro-preview',
};

export function normalizeGeminiModelId(rawModel: string): string {
  const cleaned = rawModel.trim().replace(/^models\//, '');
  if (!cleaned) {
    return 'gemini-3.8-flash';
  }
  return DEPRECATED_GEMINI_MODEL_MAP[cleaned] ?? cleaned;
}

export const ANTHROPIC_PRESET_MODELS = [
  { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
  { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet' },
  { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
];

export const DEFAULT_AI_SETTINGS: AiSettings = {
  activeProfile: 'auto',
  cloudProvider: 'gemini',
  geminiModel: 'gemini-3.8-flash',
  anthropicModel: 'claude-sonnet-4-5-20250929',
  ollamaBaseUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5-math',
  systemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
};

export const EMPTY_AI_SECRETS: AiSecrets = {
  geminiApiKey: '',
  anthropicApiKey: '',
};

export function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window
  );
}

async function aiFetch(
  url: string,
  init?: RequestInit & { connectTimeout?: number }
): Promise<Response> {
  const internals =
    typeof window !== 'undefined'
      ? (
          window as unknown as {
            __TAURI_INTERNALS__?: { metadata?: unknown };
          }
        ).__TAURI_INTERNALS__
      : undefined;
  if (internals && internals.metadata) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(url, init);
  }
  return window.fetch(url, init);
}

export function normalizeOllamaUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return 'http://localhost:11434';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_AI_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    const normalizedGemini = normalizeGeminiModelId(
      parsed.geminiModel || DEFAULT_AI_SETTINGS.geminiModel
    );
    const loaded: AiSettings = {
      activeProfile:
        parsed.activeProfile === 'cloud' ||
        parsed.activeProfile === 'local' ||
        parsed.activeProfile === 'auto'
          ? parsed.activeProfile
          : DEFAULT_AI_SETTINGS.activeProfile,
      cloudProvider:
        parsed.cloudProvider === 'anthropic' || parsed.cloudProvider === 'gemini'
          ? parsed.cloudProvider
          : DEFAULT_AI_SETTINGS.cloudProvider,
      geminiModel: normalizedGemini,
      anthropicModel:
        parsed.anthropicModel?.trim() || DEFAULT_AI_SETTINGS.anthropicModel,
      ollamaBaseUrl: normalizeOllamaUrl(
        parsed.ollamaBaseUrl || DEFAULT_AI_SETTINGS.ollamaBaseUrl
      ),
      ollamaModel: parsed.ollamaModel?.trim() || DEFAULT_AI_SETTINGS.ollamaModel,
      systemPrompt:
        typeof parsed.systemPrompt === 'string' && parsed.systemPrompt.trim()
          ? parsed.systemPrompt
          : DEFAULT_AI_SETTINGS.systemPrompt,
    };
    if (parsed.geminiModel && parsed.geminiModel !== normalizedGemini) {
      saveAiSettings(loaded);
    }
    return loaded;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
}

export function saveAiSettings(settings: AiSettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors cleanly.
  }
}

export async function loadAiSecrets(): Promise<AiSecrets> {
  if (isTauriEnvironment()) {
    try {
      const loaded = await invoke<Partial<AiSecrets>>('ai_load_secrets');
      return {
        geminiApiKey: (loaded?.geminiApiKey ?? '').trim(),
        anthropicApiKey: (loaded?.anthropicApiKey ?? '').trim(),
      };
    } catch {
      // Fallback safely if custom command is unavailable in mocked test runners
    }
  }

  try {
    const raw = localStorage.getItem(AI_SECRETS_FALLBACK_STORAGE_KEY);
    if (!raw) {
      return EMPTY_AI_SECRETS;
    }
    const parsed = JSON.parse(raw) as Partial<AiSecrets>;
    return {
      geminiApiKey: (parsed.geminiApiKey ?? '').trim(),
      anthropicApiKey: (parsed.anthropicApiKey ?? '').trim(),
    };
  } catch {
    return EMPTY_AI_SECRETS;
  }
}

export async function saveAiSecrets(secrets: AiSecrets): Promise<void> {
  const sanitized: AiSecrets = {
    geminiApiKey: secrets.geminiApiKey.trim(),
    anthropicApiKey: secrets.anthropicApiKey.trim(),
  };

  if (isTauriEnvironment()) {
    try {
      await invoke('ai_save_secrets', { secrets: sanitized });
      return;
    } catch {
      // Fall through cleanly if mocked environment lacks Rust handler
    }
  }

  try {
    localStorage.setItem(
      AI_SECRETS_FALLBACK_STORAGE_KEY,
      JSON.stringify(sanitized)
    );
  } catch {
    // Ignore storage errors cleanly.
  }
}

function rankOllamaModel(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes('qwen') && lower.includes('math')) return 0;
  if (lower.includes('deepseek-r1')) return 1;
  if (lower.includes('qwen')) return 2;
  if (lower.includes('llama3')) return 3;
  if (lower.includes('mistral')) return 4;
  return 5;
}

export async function checkOllamaConnection(
  baseUrl: string,
  timeoutMs = 3500
): Promise<OllamaHealthResult> {
  const normalizedUrl = normalizeOllamaUrl(baseUrl);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();

  try {
    const resp = await aiFetch(`${normalizedUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
      connectTimeout: timeoutMs,
    });
    if (!resp.ok) {
      return {
        online: false,
        models: [],
        error: `Serveur Ollama HTTP ${resp.status}`,
      };
    }

    const data = (await resp.json()) as {
      models?: Array<{
        name?: string;
        size?: number;
        modified_at?: string;
        details?: { parameter_size?: string; family?: string };
      }>;
    };

    const models: OllamaModelInfo[] = (data.models ?? [])
      .filter((item): item is NonNullable<typeof item> & { name: string } =>
        Boolean(item?.name)
      )
      .map((item) => ({
        name: item.name,
        size: item.size,
        parameterSize: item.details?.parameter_size,
        family: item.details?.family,
        modifiedAt: item.modified_at,
      }))
      .sort((a, b) => rankOllamaModel(a.name) - rankOllamaModel(b.name));

    return {
      online: true,
      models,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort =
      (err instanceof Error && err.name === 'AbortError') ||
      msg.toLowerCase().includes('abort') ||
      msg.toLowerCase().includes('cancel');
    return {
      online: false,
      models: [],
      error: isAbort
        ? `Délai dépassé sur ${normalizedUrl}`
        : `Serveur Ollama injoignable (${normalizedUrl})`,
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export interface StreamConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  images?: AiImageAttachment[];
}

export interface StreamAiCompletionRequest {
  systemPrompt: string;
  messages: StreamConversationTurn[];
  signal?: AbortSignal;
  preferredCloudForVision?: 'gemini' | 'anthropic';
}

export interface StreamAiCompletionCallbacks {
  onRouteResolved?: (route: AiExecutionRoute) => void;
  onToken: (deltaText: string) => void;
}

class LocalConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalConnectionError';
  }
}

function formatProviderHttpError(providerLabel: string, status: number, bodyText: string): string {
  let detail = '';
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string } | string;
      message?: string;
    };
    if (typeof parsed.error === 'string') {
      detail = parsed.error;
    } else if (parsed.error?.message) {
      detail = parsed.error.message;
    } else if (parsed.message) {
      detail = parsed.message;
    }
  } catch {
    detail = bodyText.slice(0, 180).trim();
  }

  if (status === 401 || status === 403) {
    return `${providerLabel} : clé API invalide ou refusée (HTTP ${status}).${detail ? ` ${detail}` : ''}`;
  }
  if (status === 429) {
    return `${providerLabel} : quota ou limite de requêtes atteinte (HTTP 429).`;
  }
  if (status === 404) {
    return `${providerLabel} : modèle ou point d'accès introuvable (HTTP 404).${detail ? ` ${detail}` : ''}`;
  }
  return `${providerLabel} a renvoyé HTTP ${status}${detail ? ` : ${detail}` : '.'}`;
}

async function consumeLineStream(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          onLine(trimmed);
        }
      }
    }

    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) {
      onLine(tail);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function listGeminiModels(
  apiKey: string
): Promise<Array<{ id: string; label: string }>> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('Renseignez d’abord votre clé API Google Gemini.');
  }

  const resp = await aiFetch(
    'https://generativelanguage.googleapis.com/v1beta/models?pageSize=100',
    {
      method: 'GET',
      headers: {
        'x-goog-api-key': cleanKey,
      },
    }
  );
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(formatProviderHttpError('Google Gemini', resp.status, errText));
  }

  const data = (await resp.json()) as {
    models?: Array<{
      name?: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }>;
  };

  return (data.models ?? [])
    .filter((m) => {
      if (!m?.name) return false;
      const methods = m.supportedGenerationMethods ?? [];
      if (!methods.includes('generateContent')) return false;
      const lower = m.name.toLowerCase();
      return (
        !lower.includes('embedding') &&
        !lower.includes('imagen') &&
        !lower.includes('veo') &&
        !lower.includes('-tts') &&
        !lower.includes('live') &&
        !lower.includes('transcribe')
      );
    })
    .map((m) => {
      const id = String(m.name).replace(/^models\//, '');
      const display = m.displayName?.trim();
      return {
        id,
        label: display ? `${display} (${id})` : id,
      };
    });
}

async function executeGeminiRequest(
  request: StreamAiCompletionRequest,
  model: string,
  cleanKey: string,
  onToken: (delta: string) => void
): Promise<void> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:streamGenerateContent?alt=sse`;

  const contents = request.messages.map((msg) => {
    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (msg.images && msg.images.length > 0) {
      for (const img of msg.images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType || 'image/png',
            data: img.base64Data,
          },
        });
      }
    }
    if (msg.content.trim() || parts.length === 0) {
      parts.push({ text: msg.content });
    }

    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });

  const resp = await aiFetch(endpoint, {
    method: 'POST',
    signal: request.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': cleanKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: request.systemPrompt }],
      },
      contents,
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    const formatted = formatProviderHttpError('Google Gemini', resp.status, errText);
    const err = new Error(formatted) as Error & {
      httpStatus?: number;
      rawBody?: string;
    };
    err.httpStatus = resp.status;
    err.rawBody = errText;
    throw err;
  }

  if (!resp.body) {
    const json = (await resp.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    };
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (!part.thought && part.text) {
        onToken(part.text);
      }
    }
    return;
  }

  await consumeLineStream(resp.body, (line) => {
    if (!line.startsWith('data:')) {
      return;
    }
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') {
      return;
    }
    const parsed = JSON.parse(payload) as {
      error?: { message?: string };
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    };
    if (parsed.error?.message) {
      throw new Error(`Google Gemini : ${parsed.error.message}`);
    }
    const parts = parsed.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (!part.thought && part.text) {
        onToken(part.text);
      }
    }
  });
}

async function streamGemini(
  request: StreamAiCompletionRequest,
  model: string,
  apiKey: string,
  onToken: (delta: string) => void
): Promise<string> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error(
      'Clé API Google Gemini manquante. Renseignez-la dans les Paramètres IA.'
    );
  }

  const effectiveModel = normalizeGeminiModelId(model);

  try {
    await executeGeminiRequest(request, effectiveModel, cleanKey, onToken);
    return effectiveModel;
  } catch (err) {
    const typedErr = err as Error & { httpStatus?: number; rawBody?: string };
    if (request.signal?.aborted || typedErr?.httpStatus !== 404) {
      throw err;
    }

    const suggested = typedErr.rawBody?.match(
      /use\s+models\/([a-zA-Z0-9._-]+)/i
    )?.[1];
    const retryModel =
      suggested && suggested !== effectiveModel
        ? suggested
        : effectiveModel !== DEFAULT_AI_SETTINGS.geminiModel
          ? DEFAULT_AI_SETTINGS.geminiModel
          : null;

    if (!retryModel) {
      throw err;
    }

    await executeGeminiRequest(request, retryModel, cleanKey, onToken);
    return retryModel;
  }
}

async function streamAnthropic(
  request: StreamAiCompletionRequest,
  model: string,
  apiKey: string,
  onToken: (delta: string) => void
): Promise<void> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error(
      'Clé API Anthropic (Claude) manquante. Renseignez-la dans les Paramètres IA.'
    );
  }

  const messages = request.messages.map((msg) => {
    if (!msg.images || msg.images.length === 0) {
      return { role: msg.role, content: msg.content };
    }
    const contentBlocks: Array<
      | {
          type: 'image';
          source: { type: 'base64'; media_type: string; data: string };
        }
      | { type: 'text'; text: string }
    > = msg.images.map((img) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mimeType || 'image/png',
        data: img.base64Data,
      },
    }));
    contentBlocks.push({
      type: 'text',
      text: msg.content.trim() || 'Analyse cette image mathématique.',
    });
    return {
      role: msg.role,
      content: contentBlocks,
    };
  });

  const resp = await aiFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: request.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cleanKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      system: request.systemPrompt,
      messages,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(formatProviderHttpError('Anthropic Claude', resp.status, errText));
  }

  if (!resp.body) {
    const json = (await resp.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    for (const block of json.content ?? []) {
      if (block.type === 'text' && block.text) {
        onToken(block.text);
      }
    }
    return;
  }

  await consumeLineStream(resp.body, (line) => {
    if (!line.startsWith('data:')) {
      return;
    }
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') {
      return;
    }
    const parsed = JSON.parse(payload) as {
      type?: string;
      delta?: { type?: string; text?: string };
      error?: { message?: string };
    };
    if (parsed.type === 'error' || parsed.error?.message) {
      throw new Error(
        `Anthropic Claude : ${parsed.error?.message ?? 'Erreur de flux SSE'}`
      );
    }
    if (
      parsed.type === 'content_block_delta' &&
      parsed.delta?.type === 'text_delta' &&
      parsed.delta.text
    ) {
      onToken(parsed.delta.text);
    }
  });
}

async function streamOllama(
  request: StreamAiCompletionRequest,
  baseUrl: string,
  model: string,
  onToken: (delta: string) => void
): Promise<void> {
  const normalizedUrl = normalizeOllamaUrl(baseUrl);
  const messages = [
    { role: 'system', content: request.systemPrompt },
    ...request.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      ...(msg.images && msg.images.length > 0
        ? { images: msg.images.map((img) => img.base64Data) }
        : {}),
    })),
  ];

  let emittedAnyToken = false;
  let resp: Response;
  try {
    resp = await aiFetch(`${normalizedUrl}/api/chat`, {
      method: 'POST',
      signal: request.signal,
      connectTimeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages,
      }),
    });
  } catch (err) {
    if (request.signal?.aborted) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new LocalConnectionError(
      `Serveur Ollama injoignable sur ${normalizedUrl} (${msg}).`
    );
  }

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    const formatted = formatProviderHttpError('Ollama', resp.status, errText);
    if (resp.status >= 500 || resp.status === 404) {
      throw new LocalConnectionError(formatted);
    }
    throw new Error(formatted);
  }

  if (!resp.body) {
    const json = (await resp.json()) as { message?: { content?: string } };
    if (json.message?.content) {
      emittedAnyToken = true;
      onToken(json.message.content);
    }
    return;
  }

  try {
    await consumeLineStream(resp.body, (line) => {
      const parsed = JSON.parse(line) as {
        error?: string;
        message?: { content?: string };
        done?: boolean;
      };
      if (parsed.error) {
        if (!emittedAnyToken) {
          throw new LocalConnectionError(`Ollama : ${parsed.error}`);
        }
        throw new Error(`Ollama : ${parsed.error}`);
      }
      const chunk = parsed.message?.content;
      if (chunk) {
        emittedAnyToken = true;
        onToken(chunk);
      }
    });
  } catch (err) {
    if (!emittedAnyToken && !(err instanceof LocalConnectionError) && !request.signal?.aborted) {
      throw new LocalConnectionError(
        err instanceof Error ? err.message : 'Erreur réseau Ollama'
      );
    }
    throw err;
  }
}

function selectCloudTarget(
  settings: AiSettings,
  secrets: AiSecrets,
  preferGemini = false
): { provider: CloudProvider; model: string; apiKey: string } | null {
  if (preferGemini && secrets.geminiApiKey.trim()) {
    return {
      provider: 'gemini',
      model: settings.geminiModel,
      apiKey: secrets.geminiApiKey,
    };
  }

  if (settings.cloudProvider === 'gemini' && secrets.geminiApiKey.trim()) {
    return {
      provider: 'gemini',
      model: settings.geminiModel,
      apiKey: secrets.geminiApiKey,
    };
  }

  if (settings.cloudProvider === 'anthropic' && secrets.anthropicApiKey.trim()) {
    return {
      provider: 'anthropic',
      model: settings.anthropicModel,
      apiKey: secrets.anthropicApiKey,
    };
  }

  // Fallback vers l'autre clé Cloud disponible le cas échéant
  if (secrets.geminiApiKey.trim()) {
    return {
      provider: 'gemini',
      model: settings.geminiModel,
      apiKey: secrets.geminiApiKey,
    };
  }
  if (secrets.anthropicApiKey.trim()) {
    return {
      provider: 'anthropic',
      model: settings.anthropicModel,
      apiKey: secrets.anthropicApiKey,
    };
  }

  return null;
}

async function runCloudProvider(
  request: StreamAiCompletionRequest,
  target: { provider: CloudProvider; model: string; apiKey: string },
  onToken: (delta: string) => void
): Promise<string> {
  if (target.provider === 'gemini') {
    return streamGemini(request, target.model, target.apiKey, onToken);
  }
  await streamAnthropic(request, target.model, target.apiKey, onToken);
  return target.model;
}

/**
 * Routeur IA Hybride (Auto / Local Ollama / Cloud Gemini & Anthropic).
 */
export async function streamAiCompletion(
  request: StreamAiCompletionRequest,
  settings: AiSettings,
  secrets: AiSecrets,
  callbacks: StreamAiCompletionCallbacks
): Promise<AiExecutionRoute> {
  const hasImages = request.messages.some(
    (msg) => msg.images && msg.images.length > 0
  );

  // 1. Profil Cloud explicite (Nomade / Batterie)
  if (settings.activeProfile === 'cloud') {
    const preferredProvider = settings.cloudProvider;
    const rawModel =
      preferredProvider === 'gemini'
        ? settings.geminiModel
        : settings.anthropicModel;
    const model =
      preferredProvider === 'gemini'
        ? normalizeGeminiModelId(rawModel)
        : rawModel;
    const apiKey =
      preferredProvider === 'gemini'
        ? secrets.geminiApiKey
        : secrets.anthropicApiKey;

    const route: AiExecutionRoute = {
      provider: preferredProvider,
      model,
      profileUsed: 'cloud',
    };
    callbacks.onRouteResolved?.(route);
    const actualModel = await runCloudProvider(
      request,
      { provider: preferredProvider, model, apiKey },
      callbacks.onToken
    );
    if (actualModel !== route.model) {
      route.model = actualModel;
      callbacks.onRouteResolved?.({ ...route });
    }
    return route;
  }

  // 2. Mode Auto avec image / OCR -> bascule immédiate sur Gemini (ou autre Cloud Vision)
  if (settings.activeProfile === 'auto' && hasImages) {
    const cloudTarget = selectCloudTarget(settings, secrets, true);
    if (!cloudTarget) {
      throw new Error(
        'Une clé API Google Gemini est requise pour l’OCR et l’analyse d’image en mode Auto. Configurez-la dans Paramètres IA.'
      );
    }

    const effectiveModel =
      cloudTarget.provider === 'gemini'
        ? normalizeGeminiModelId(cloudTarget.model)
        : cloudTarget.model;

    const route: AiExecutionRoute = {
      provider: cloudTarget.provider,
      model: effectiveModel,
      profileUsed: 'cloud',
      fallbackReason: `Vision / OCR routé vers ${
        cloudTarget.provider === 'gemini' ? 'Gemini' : 'Claude'
      }`,
    };
    callbacks.onRouteResolved?.(route);
    const actualModel = await runCloudProvider(
      request,
      { ...cloudTarget, model: effectiveModel },
      callbacks.onToken
    );
    if (actualModel !== route.model) {
      route.model = actualModel;
      callbacks.onRouteResolved?.({ ...route });
    }
    return route;
  }

  // 3. Profil Local explicite
  if (settings.activeProfile === 'local') {
    const route: AiExecutionRoute = {
      provider: 'ollama',
      model: settings.ollamaModel,
      profileUsed: 'local',
    };
    callbacks.onRouteResolved?.(route);
    await streamOllama(
      request,
      settings.ollamaBaseUrl,
      settings.ollamaModel,
      callbacks.onToken
    );
    return route;
  }

  // 4. Mode Auto (texte) : Local Ollama d'abord, puis Fallback automatique Cloud
  const localRoute: AiExecutionRoute = {
    provider: 'ollama',
    model: settings.ollamaModel,
    profileUsed: 'local',
  };
  callbacks.onRouteResolved?.(localRoute);

  try {
    await streamOllama(
      request,
      settings.ollamaBaseUrl,
      settings.ollamaModel,
      callbacks.onToken
    );
    return localRoute;
  } catch (err) {
    if (request.signal?.aborted || !(err instanceof LocalConnectionError)) {
      throw err;
    }

    const cloudTarget = selectCloudTarget(settings, secrets, false);
    if (!cloudTarget) {
      throw new Error(
        `${err.message} Aucun fournisseur Cloud de secours n’est configuré (Paramètres IA).`
      );
    }

    const effectiveModel =
      cloudTarget.provider === 'gemini'
        ? normalizeGeminiModelId(cloudTarget.model)
        : cloudTarget.model;

    const fallbackRoute: AiExecutionRoute = {
      provider: cloudTarget.provider,
      model: effectiveModel,
      profileUsed: 'cloud',
      fallbackReason: `Serveur Ollama hors ligne → Bascule ${
        cloudTarget.provider === 'gemini' ? 'Gemini' : 'Claude'
      }`,
    };
    callbacks.onRouteResolved?.(fallbackRoute);
    const actualModel = await runCloudProvider(
      request,
      { ...cloudTarget, model: effectiveModel },
      callbacks.onToken
    );
    if (actualModel !== fallbackRoute.model) {
      fallbackRoute.model = actualModel;
      callbacks.onRouteResolved?.({ ...fallbackRoute });
    }
    return fallbackRoute;
  }
}

export function fileToAiImageAttachment(
  file: Blob,
  label?: string
): Promise<AiImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      const base64Data = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      if (!base64Data) {
        reject(new Error('Impossible de lire le contenu de l’image.'));
        return;
      }
      resolve({
        mimeType: file.type || 'image/png',
        base64Data,
        previewDataUrl: result,
        label,
      });
    };
    reader.onerror = () => {
      reject(new Error('Échec de la lecture du fichier image.'));
    };
    reader.readAsDataURL(file);
  });
}
