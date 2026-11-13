import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  FileText,
  ImagePlus,
  PlusSquare,
  SendHorizontal,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { normalizeAiMarkdownForEditor } from '../services/aiPrompts';
import { fileToAiImageAttachment } from '../services/aiService';
import type {
  AiChatMessage,
  AiExecutionRoute,
  AiImageAttachment,
} from '../types/ai';
import { MathMarkdownPreview } from './MathMarkdownPreview';

interface AiCopilotPanelProps {
  isOpen: boolean;
  noteTitle: string | null;
  hasActiveNote: boolean;
  messages: AiChatMessage[];
  isStreaming: boolean;
  onSendMessage: (text: string, image?: AiImageAttachment | null) => Promise<void>;
  onStopStreaming: () => void;
  onClearMessages: () => void;
  onInsertIntoNote: (markdown: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
  onNotifyError?: (message: string) => void;
}

const QUICK_PROMPTS = [
  'Résume les définitions et théorèmes clés de cette note.',
  'Quelles hypothèses critiques faut-il retenir sur ce chapitre ?',
  'Propose un exercice corrigé progressif adapté à cette note.',
];

function formatRouteLabel(route?: AiExecutionRoute): string {
  if (!route) return '';
  const providerName =
    route.provider === 'ollama'
      ? 'Ollama'
      : route.provider === 'gemini'
        ? 'Gemini'
        : 'Claude';
  return `${providerName} · ${route.model}`;
}

export const AiCopilotPanel: React.FC<AiCopilotPanelProps> = ({
  isOpen,
  noteTitle,
  hasActiveNote,
  messages,
  isStreaming,
  onSendMessage,
  onStopStreaming,
  onClearMessages,
  onInsertIntoNote,
  onOpenSettings,
  onClose,
  onNotifyError,
}) => {
  const [input, setInput] = useState('');
  const [attachedImage, setAttachedImage] = useState<AiImageAttachment | null>(
    null,
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [isOpen, messages]);

  if (!isOpen) return null;

  const handleSend = async (customText?: string) => {
    const textToSend = (customText ?? input).trim();
    const imageToSend = customText ? null : attachedImage;
    if (!textToSend && !imageToSend) return;
    if (!customText) {
      setInput('');
      setAttachedImage(null);
    }
    await onSendMessage(textToSend, imageToSend);
  };

  const handleImageFile = async (file: File) => {
    try {
      const attachment = await fileToAiImageAttachment(file, file.name);
      setAttachedImage(attachment);
    } catch (err) {
      onNotifyError?.(
        err instanceof Error ? err.message : 'Lecture de l’image impossible.',
      );
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          e.preventDefault();
          await handleImageFile(blob);
          return;
        }
      }
    }
  };

  const handleCopy = async (msg: AiChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === msg.id ? null : prev));
      }, 1500);
    } catch {
      onNotifyError?.('Copie dans le presse-papiers impossible.');
    }
  };

  const handleInsert = (msg: AiChatMessage) => {
    const cleaned = normalizeAiMarkdownForEditor(msg.content, {
      unwrapOuterCodeFence: true,
    });
    if (!cleaned) return;
    onInsertIntoNote(cleaned);
    setInsertedId(msg.id);
    window.setTimeout(() => {
      setInsertedId((prev) => (prev === msg.id ? null : prev));
    }, 1500);
  };

  return (
    <aside
      data-testid="ai-copilot-panel"
      aria-label="Copilote IA contextuel"
      className="flex h-full w-80 shrink-0 flex-col border-l border-stone-200 bg-stone-50/90 print:hidden xl:w-96 dark:border-zinc-800 dark:bg-zinc-900/95"
    >
      {/* En-tête */}
      <div className="flex items-center justify-between border-b border-stone-200 px-3.5 py-2.5 dark:border-zinc-800">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-600 dark:bg-indigo-950/70 dark:text-indigo-400">
            <Bot className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-stone-900 dark:text-zinc-100">
              Copilote Mathématique
            </div>
            <div className="flex items-center gap-1 truncate text-[10px] text-stone-500 dark:text-zinc-400">
              <FileText className="h-2.5 w-2.5 shrink-0 text-indigo-500" />
              <span className="truncate">
                {noteTitle ? `Contexte : ${noteTitle}` : 'Aucune note ouverte'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearMessages}
              title="Effacer l’historique de conversation"
              className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-200/70 hover:text-stone-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            title="Paramètres IA"
            className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-200/70 hover:text-stone-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le copilote IA"
            className="rounded-md p-1 text-stone-400 transition-colors hover:bg-stone-200/70 hover:text-stone-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Liste des messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3"
      >
        {messages.length === 0 ? (
          <div className="space-y-3 py-4">
            <div className="rounded-xl border border-stone-200 bg-white p-3 text-xs leading-relaxed text-stone-600 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
              <p className="mb-1 font-semibold text-stone-900 dark:text-zinc-100">
                Assistant contextuel du chapitre
              </p>
              <p className="text-[11px] text-stone-500 dark:text-zinc-400">
                Je lis automatiquement le Markdown de la note ouverte. Toutes
                les réponses sont rendues en KaTeX en temps réel et peuvent être
                insérées d’un clic dans votre cours.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:text-zinc-500">
                Suggestions rapides
              </p>
              {QUICK_PROMPTS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void handleSend(suggestion)}
                  className="block w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-left text-[11px] text-stone-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1;
            const streamingThis =
              msg.role === 'assistant' && isStreaming && isLast && !msg.errorMessage;

            if (msg.role === 'user') {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[88%] space-y-1.5 rounded-2xl rounded-tr-xs bg-indigo-600 px-3 py-2 text-xs text-white shadow-xs dark:bg-indigo-500">
                    {msg.imagePreviewUrl && (
                      <img
                        src={msg.imagePreviewUrl}
                        alt="Capture mathématique envoyée"
                        className="max-h-36 rounded-lg border border-white/20 object-contain"
                      />
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                data-testid="ai-assistant-message"
                className="space-y-2 rounded-2xl rounded-tl-xs border border-stone-200 bg-white p-3 shadow-2xs dark:border-zinc-800 dark:bg-zinc-950/70"
              >
                {/* Badge route & mode audit */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    {msg.kind === 'rigor-audit' && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        <ShieldCheck className="h-3 w-3" />
                        Audit de rigueur
                      </span>
                    )}
                    {msg.route && (
                      <span className="font-mono text-stone-400 dark:text-zinc-500">
                        {formatRouteLabel(msg.route)}
                      </span>
                    )}
                  </div>

                  {msg.route?.fallbackReason && (
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600 dark:bg-zinc-800 dark:text-zinc-400">
                      Fallback auto
                    </span>
                  )}
                </div>

                {msg.errorMessage ? (
                  <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                    <p>{msg.errorMessage}</p>
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="text-[11px] font-semibold underline hover:no-underline"
                    >
                      Ouvrir Paramètres IA
                    </button>
                  </div>
                ) : (
                  <MathMarkdownPreview
                    content={msg.content}
                    isStreaming={streamingThis}
                  />
                )}

                {!streamingThis && msg.content.trim() && !msg.errorMessage && (
                  <div className="flex items-center justify-between border-t border-stone-100 pt-2 dark:border-zinc-800/80">
                    <button
                      type="button"
                      data-testid="ai-insert-reply-btn"
                      disabled={!hasActiveNote}
                      onClick={() => handleInsert(msg)}
                      title={
                        hasActiveNote
                          ? 'Insérer cette réponse à la position du curseur (KaTeX + Markdown)'
                          : 'Ouvrez une note pour insérer'
                      }
                      className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 transition-colors hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-950/80"
                    >
                      {insertedId === msg.id ? (
                        <>
                          <Check className="h-3 w-3" />
                          <span>Inséré</span>
                        </>
                      ) : (
                        <>
                          <PlusSquare className="h-3 w-3" />
                          <span>Insérer dans la note</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleCopy(msg)}
                      title="Copier le Markdown source"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span>Copié</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copier</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Zone de saisie */}
      <div className="border-t border-stone-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        {attachedImage && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 p-1.5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex min-w-0 items-center gap-2">
              {attachedImage.previewDataUrl && (
                <img
                  src={attachedImage.previewDataUrl}
                  alt="Aperçu joint"
                  className="h-8 w-8 rounded object-cover"
                />
              )}
              <span className="truncate text-[11px] text-stone-600 dark:text-zinc-300">
                {attachedImage.label ?? 'Image jointe'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setAttachedImage(null)}
              aria-label="Retirer l’image jointe"
              className="rounded p-1 text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-2 focus-within:border-indigo-500 focus-within:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:border-indigo-400">
          <textarea
            data-testid="ai-copilot-input"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={(e) => void handlePaste(e)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isStreaming) {
                  void handleSend();
                }
              }
            }}
            placeholder="Posez une question sur ce chapitre… (Entrée pour envoyer)"
            className="w-full resize-none bg-transparent text-xs text-stone-800 outline-none placeholder:text-stone-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />

          <div className="mt-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void handleImageFile(f);
                }}
                className="hidden"
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Joindre une image (OCR / exercice manuscrit)"
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-stone-500 transition-colors hover:bg-stone-200/70 hover:text-stone-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <ImagePlus className="h-3.5 w-3.5" />
              </button>
            </div>

            {isStreaming ? (
              <button
                type="button"
                data-testid="ai-stop-btn"
                onClick={onStopStreaming}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-rose-700"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Arrêter</span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="ai-send-btn"
                onClick={() => void handleSend()}
                disabled={!input.trim() && !attachedImage}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-indigo-500 dark:hover:bg-indigo-600"
              >
                <SendHorizontal className="h-3 w-3" />
                <span>Envoyer</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

