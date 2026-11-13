export type AiProfileMode = 'auto' | 'local' | 'cloud';

export type CloudProvider = 'gemini' | 'anthropic';

export type ResolvedAiProvider = 'ollama' | 'gemini' | 'anthropic';

export type OllamaConnectionState = 'unknown' | 'checking' | 'connected' | 'offline';

export interface OllamaModelInfo {
  name: string;
  size?: number;
  parameterSize?: string;
  family?: string;
  modifiedAt?: string;
}

export interface OllamaHealthResult {
  online: boolean;
  models: OllamaModelInfo[];
  latencyMs?: number;
  error?: string;
}

export interface AiSettings {
  activeProfile: AiProfileMode;
  cloudProvider: CloudProvider;
  geminiModel: string;
  anthropicModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  systemPrompt: string;
}

export interface AiSecrets {
  geminiApiKey: string;
  anthropicApiKey: string;
}

export interface AiImageAttachment {
  mimeType: string;
  base64Data: string;
  previewDataUrl?: string;
  label?: string;
}

export interface AiExecutionRoute {
  provider: ResolvedAiProvider;
  model: string;
  profileUsed: 'local' | 'cloud';
  fallbackReason?: string;
}

export type AiInlineActionKind =
  | 'verify-rigor'
  | 'detail-steps'
  | 'generate-exercise'
  | 'convert-latex';

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  route?: AiExecutionRoute;
  kind?: 'chat' | 'rigor-audit';
  errorMessage?: string;
  imagePreviewUrl?: string;
}

export interface AiContextSelectionPayload {
  action: AiInlineActionKind;
  selectedText: string;
  surroundingText: string;
  selectionRange: { from: number; to: number };
  insertAfterPos: number;
}

