import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ErrorInfo,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  Excalidraw,
  THEME,
  exportToSvg,
  getNonDeletedElements,
  getSceneVersion,
  restore,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import {
  Check,
  Maximize2,
  Minimize2,
  Pencil,
  PenTool,
  RefreshCw,
} from 'lucide-react';
import {
  DEFAULT_DRAWING_HEIGHT,
  clampDrawingHeight,
  formatFsError,
  readDrawingAsset,
  writeDrawingAsset,
} from '../../services/fsService';
import { writeDrawingSvgAsset } from '../../services/drawingAssetSvg';
import type { ThemeMode } from '../../types/notes';
import { getExcalidrawStorage } from '../extensions/SoftExcalidraw';

async function syncDrawingSvgSnapshot(
  notePath: string,
  rawSrc: string,
  serializedJson: string
): Promise<void> {
  try {
    const parsed = JSON.parse(serializedJson) as {
      elements?: unknown[];
      appState?: Record<string, unknown>;
      files?: Record<string, unknown>;
    };
    const restored = restore(
      {
        elements: (parsed.elements ?? []) as never,
        appState: (parsed.appState ?? {}) as never,
        files: (parsed.files ?? null) as never,
      },
      null,
      null
    );
    const nonDeleted = getNonDeletedElements(restored.elements);
    if (nonDeleted.length === 0) {
      await writeDrawingSvgAsset(
        notePath,
        rawSrc,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>'
      );
      return;
    }
    const svgElement = (await exportToSvg({
      elements: nonDeleted,
      appState: {
        ...restored.appState,
        exportBackground: false,
        exportWithDarkMode: false,
      },
      files: restored.files ?? null,
      exportPadding: 20,
    })) as SVGSVGElement;
    if (!svgElement.getAttribute('xmlns')) {
      svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    await writeDrawingSvgAsset(notePath, rawSrc, svgElement.outerHTML);
  } catch {
    // La sauvegarde JSON principale reste prioritaire si le rendu SVG échoue
  }
}

interface ExcalidrawErrorBoundaryProps {
  onClose?: () => void;
  children: ReactNode;
}

interface ExcalidrawErrorBoundaryState {
  errorMessage: string | null;
}

class ExcalidrawErrorBoundary extends Component<
  ExcalidrawErrorBoundaryProps,
  ExcalidrawErrorBoundaryState
> {
  state: ExcalidrawErrorBoundaryState = { errorMessage: null };

  static getDerivedStateFromError(error: Error): ExcalidrawErrorBoundaryState {
    return { errorMessage: error?.message || 'Erreur inconnue du canevas Excalidraw.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Excalidraw ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-xs font-medium text-red-600 dark:text-red-400">
            Impossible d&apos;afficher l&apos;éditeur Excalidraw : {this.state.errorMessage}
          </p>
          {this.props.onClose && (
            <button
              type="button"
              onClick={this.props.onClose}
              className="rounded-md border border-stone-200 bg-white px-3 py-1 text-xs text-stone-700 hover:bg-stone-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Revenir à l&apos;aperçu
            </button>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

type ExcalidrawProps = ComponentProps<typeof Excalidraw>;
type OnChangeArgs = Parameters<NonNullable<ExcalidrawProps['onChange']>>;
type SceneElements = OnChangeArgs[0];
type SceneAppState = OnChangeArgs[1];
type SceneFiles = OnChangeArgs[2];
type SceneInitialData = NonNullable<
  Exclude<ExcalidrawProps['initialData'], (...args: never[]) => unknown>
>;
type ExcalidrawAPI = Parameters<
  NonNullable<ExcalidrawProps['excalidrawAPI']>
>[0];

interface LoadedSceneSnapshot {
  elements: SceneElements;
  appState: Partial<SceneAppState>;
  files: SceneFiles;
}

function buildSceneFingerprint(
  elements: SceneElements,
  appState: Partial<SceneAppState>,
  files: SceneFiles
): string {
  return [
    getSceneVersion(elements),
    Object.keys(files ?? {}).length,
    appState.viewBackgroundColor ?? '',
    appState.gridSize ?? '',
  ].join(':');
}

export function ExcalidrawBlockView({
  editor,
  node,
  selected,
  updateAttributes,
}: ReactNodeViewProps) {
  const src = String(node.attrs.src ?? '');
  const attrHeight =
    typeof node.attrs.height === 'number'
      ? clampDrawingHeight(node.attrs.height)
      : DEFAULT_DRAWING_HEIGHT;

  const storage = getExcalidrawStorage(editor);
  const [notePath, setNotePath] = useState<string>(storage?.notePath ?? '');
  const [theme, setTheme] = useState<ThemeMode>(storage?.theme ?? 'light');

  const [height, setHeight] = useState<number>(attrHeight);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMissingFile, setIsMissingFile] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  );
  const [hasVisibleElements, setHasVisibleElements] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [sceneRevision, setSceneRevision] = useState<number>(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgHostRef = useRef<HTMLDivElement>(null);
  const excalidrawApiRef = useRef<ExcalidrawAPI | null>(null);

  const notePathRef = useRef(notePath);
  notePathRef.current = notePath;
  const srcRef = useRef(src);
  srcRef.current = src;
  const heightRef = useRef(height);
  heightRef.current = height;

  const latestSceneRef = useRef<LoadedSceneSnapshot>({
    elements: [],
    appState: {},
    files: {},
  });
  const savedFingerprintRef = useRef<string>('0:0::');
  const pendingSaveTimerRef = useRef<number | null>(null);
  const pendingFlushPayloadRef = useRef<{
    notePath: string;
    src: string;
    json: string;
    height: number;
  } | null>(null);

  // Sync runtime theme and notePath changes from RichMarkdownEditor
  useEffect(() => {
    if (!storage) {
      return;
    }
    const syncFromStorage = () => {
      setNotePath(storage.notePath);
      setTheme(storage.theme);
    };
    storage.listeners.add(syncFromStorage);
    syncFromStorage();
    return () => {
      storage.listeners.delete(syncFromStorage);
    };
  }, [storage]);

  useEffect(() => {
    setHeight(attrHeight);
  }, [attrHeight]);

  const flushPendingSave = useCallback(async () => {
    if (pendingSaveTimerRef.current !== null) {
      window.clearTimeout(pendingSaveTimerRef.current);
      pendingSaveTimerRef.current = null;
    }

    const payload = pendingFlushPayloadRef.current;
    if (!payload || !payload.notePath || !payload.src) {
      return;
    }

    pendingFlushPayloadRef.current = null;
    setSaveState('saving');

    try {
      await writeDrawingAsset(
        payload.notePath,
        payload.src,
        payload.json,
        payload.height
      );
      void syncDrawingSvgSnapshot(payload.notePath, payload.src, payload.json);
      setIsMissingFile(false);
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      storage?.onNotifyError?.(
        formatFsError(
          err,
          `Impossible d'enregistrer le schéma « ${payload.src} ».`
        )
      );
    }
  }, [storage]);

  const activeLoadTokenRef = useRef(0);

  const loadSceneFromDisk = useCallback(async () => {
    const loadToken = activeLoadTokenRef.current + 1;
    activeLoadTokenRef.current = loadToken;

    const currentNotePath = notePathRef.current;
    const currentSrc = srcRef.current;
    if (!currentNotePath || !currentSrc) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const record = await readDrawingAsset(currentNotePath, currentSrc);
      if (activeLoadTokenRef.current !== loadToken) {
        return;
      }

      if (!record.found || !record.rawJson) {
        const emptyRestored = restore(null, null, null);
        latestSceneRef.current = {
          elements: emptyRestored.elements,
          appState: emptyRestored.appState,
          files: emptyRestored.files,
        };
        savedFingerprintRef.current = buildSceneFingerprint(
          emptyRestored.elements,
          emptyRestored.appState,
          emptyRestored.files
        );
        setIsMissingFile(true);
        setHasVisibleElements(false);
        setSceneRevision((prev) => prev + 1);
      } else {
        const parsed = JSON.parse(record.rawJson) as Parameters<typeof restore>[0];
        const restored = restore(parsed, null, null, {
          refreshDimensions: true,
          repairBindings: true,
        });
        latestSceneRef.current = {
          elements: restored.elements,
          appState: restored.appState,
          files: restored.files,
        };
        savedFingerprintRef.current = buildSceneFingerprint(
          restored.elements,
          restored.appState,
          restored.files
        );
        setIsMissingFile(false);
        setHasVisibleElements(getNonDeletedElements(restored.elements).length > 0);
        if (record.height !== undefined) {
          setHeight(record.height);
        }
        setSceneRevision((prev) => prev + 1);
      }

      if (storage?.autoEditSrc && storage.autoEditSrc === currentSrc) {
        storage.autoEditSrc = null;
        setIsEditing(true);
      }
    } catch (err) {
      if (activeLoadTokenRef.current !== loadToken) {
        return;
      }
      setLoadError(
        formatFsError(err, `Impossible de lire le fichier « ${currentSrc} ».`)
      );
    } finally {
      if (activeLoadTokenRef.current === loadToken) {
        setIsLoading(false);
      }
    }
  }, [storage]);

  // Reload whenever the referenced asset or note directory context changes cleanly
  useEffect(() => {
    void loadSceneFromDisk();
    return () => {
      // Invalidate in-flight load (e.g. React StrictMode double-mount) so it cannot consume autoEditSrc.
      activeLoadTokenRef.current += 1;
      if (pendingSaveTimerRef.current !== null) {
        window.clearTimeout(pendingSaveTimerRef.current);
        pendingSaveTimerRef.current = null;
      }
      const pending = pendingFlushPayloadRef.current;
      if (pending && pending.notePath && pending.src) {
        pendingFlushPayloadRef.current = null;
        void writeDrawingAsset(
          pending.notePath,
          pending.src,
          pending.json,
          pending.height
        );
        void syncDrawingSvgSnapshot(pending.notePath, pending.src, pending.json);
      }
    };
  }, [notePath, src, loadSceneFromDisk]);

  // Render crisp SVG preview whenever preview mode is active, scene changes, or theme switches
  useEffect(() => {
    if (isEditing || isLoading || loadError) {
      return;
    }

    const host = svgHostRef.current;
    if (!host) {
      return;
    }

    const nonDeleted = getNonDeletedElements(latestSceneRef.current.elements);
    if (nonDeleted.length === 0) {
      host.replaceChildren();
      setHasVisibleElements(false);
      return;
    }

    setHasVisibleElements(true);
    let cancelled = false;

    const renderPreviewSvg = async () => {
      try {
        const svgElement = (await exportToSvg({
          elements: nonDeleted,
          appState: {
            ...latestSceneRef.current.appState,
            exportBackground: false,
            exportWithDarkMode: theme === 'dark',
          },
          files: latestSceneRef.current.files ?? null,
          exportPadding: 20,
        })) as SVGSVGElement;

        if (cancelled || !svgHostRef.current) {
          return;
        }
        svgElement.style.width = '100%';
        svgElement.style.height = '100%';
        svgElement.style.maxWidth = '100%';
        svgElement.style.maxHeight = '100%';
        svgElement.style.display = 'block';
        svgHostRef.current.replaceChildren(svgElement);
      } catch {
        if (!cancelled && svgHostRef.current) {
          svgHostRef.current.replaceChildren();
        }
      }
    };

    void renderPreviewSvg();

    return () => {
      cancelled = true;
    };
  }, [isEditing, isLoading, loadError, theme, sceneRevision]);

  const lockDrawing = useCallback(() => {
    setIsFullscreen(false);
    setIsEditing(false);
    setSceneRevision((prev) => prev + 1);
    const hadPending = Boolean(pendingFlushPayloadRef.current);
    void flushPendingSave();
    if (!hadPending && notePathRef.current && srcRef.current) {
      const serialized = serializeAsJSON(
        latestSceneRef.current.elements,
        latestSceneRef.current.appState,
        latestSceneRef.current.files,
        'local'
      );
      void syncDrawingSvgSnapshot(notePathRef.current, srcRef.current, serialized);
    }
  }, [flushPendingSave]);

  // Lock active drawing cleanly right before PDF print/export
  useEffect(() => {
    if (!isEditing) {
      return;
    }
    const handleBeforePrintLock = () => {
      lockDrawing();
    };
    window.addEventListener('softmath:lock-drawings-for-print', handleBeforePrintLock);
    return () => {
      window.removeEventListener('softmath:lock-drawings-for-print', handleBeforePrintLock);
    };
  }, [isEditing, lockDrawing]);

  // Lock and save automatically when clicking outside an inline active Excalidraw block
  useEffect(() => {
    if (!isEditing || isFullscreen) {
      return;
    }

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (wrapperRef.current?.contains(target)) {
        return;
      }
      // Keep edit mode open when clicking Excalidraw portals, modals, or color popovers
      if (
        target.closest(
          '.excalidraw, .excalidraw-modal-container, [data-radix-popper-content-wrapper], .popover, .context-menu, .Modal'
        )
      ) {
        return;
      }
      lockDrawing();
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    };
  }, [isEditing, isFullscreen, lockDrawing]);

  // Trigger Excalidraw viewport recalculation when toggling fullscreen mode
  useEffect(() => {
    if (!isEditing) {
      return;
    }
    const raf = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      excalidrawApiRef.current?.refresh?.();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isEditing, isFullscreen]);

  const handleExcalidrawChange = useCallback(
    (elements: SceneElements, appState: SceneAppState, files: SceneFiles) => {
      latestSceneRef.current = { elements, appState, files };
      setHasVisibleElements(getNonDeletedElements(elements).length > 0);

      const nextFingerprint = buildSceneFingerprint(elements, appState, files);
      if (nextFingerprint === savedFingerprintRef.current) {
        return;
      }

      savedFingerprintRef.current = nextFingerprint;
      const serialized = serializeAsJSON(elements, appState, files, 'local');

      pendingFlushPayloadRef.current = {
        notePath: notePathRef.current,
        src: srcRef.current,
        json: serialized,
        height: heightRef.current,
      };

      setSaveState('saving');
      if (pendingSaveTimerRef.current !== null) {
        window.clearTimeout(pendingSaveTimerRef.current);
      }

      pendingSaveTimerRef.current = window.setTimeout(() => {
        void flushPendingSave();
      }, 400);
    },
    [flushPendingSave]
  );

  const handleResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startHeight = heightRef.current;
    setIsResizing(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const next = clampDrawingHeight(startHeight + (moveEvent.clientY - startY));
      heightRef.current = next;
      setHeight(next);
    };

    const onPointerUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      const committedHeight = heightRef.current;
      updateAttributes({ height: committedHeight });

      const serialized = serializeAsJSON(
        latestSceneRef.current.elements,
        latestSceneRef.current.appState,
        latestSceneRef.current.files,
        'local'
      );
      if (notePathRef.current && srcRef.current) {
        void writeDrawingAsset(
          notePathRef.current,
          srcRef.current,
          serialized,
          committedHeight
        );
        void syncDrawingSvgSnapshot(
          notePathRef.current,
          srcRef.current,
          serialized
        );
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const enterEditMode = (startFullscreen = false) => {
    setLoadError(null);
    setIsFullscreen(startFullscreen);
    setIsEditing(true);
  };

  const initialData: SceneInitialData = {
    elements: latestSceneRef.current.elements,
    appState: {
      ...latestSceneRef.current.appState,
      theme: theme === 'dark' ? THEME.DARK : THEME.LIGHT,
    },
    files: latestSceneRef.current.files,
    scrollToContent: true,
  };

  return (
    <NodeViewWrapper
      ref={wrapperRef}
      className="my-5 select-none"
      contentEditable={false}
      data-type="excalidraw-block"
      data-src={src}
    >
      {isEditing ? (
        <div
          data-excalidraw-interactive="true"
          className={
            isFullscreen
              ? 'fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#111113]'
              : 'softmath-excalidraw-shell relative flex flex-col overflow-hidden rounded-xl border border-indigo-400/70 bg-white shadow-sm ring-2 ring-indigo-500/15 dark:border-indigo-500/60 dark:bg-[#141417]'
          }
          style={
            isFullscreen
              ? undefined
              : { height: `${Math.max(height, 440)}px` }
          }
        >
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-stone-200/80 bg-stone-50/90 px-3 text-xs dark:border-zinc-800 dark:bg-zinc-900/90">
            <div className="flex items-center gap-2 text-stone-600 dark:text-zinc-300">
              <PenTool className="h-3.5 w-3.5 text-indigo-500" />
              <span className="truncate font-mono text-[11px] text-stone-500 dark:text-zinc-400">
                {src}
              </span>
              {saveState === 'saving' && (
                <span className="text-[11px] text-stone-400 dark:text-zinc-500">
                  Enregistrement…
                </span>
              )}
              {saveState === 'saved' && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  Sauvegardé
                </span>
              )}
              {saveState === 'error' && (
                <span className="text-[11px] text-red-600 dark:text-red-400">
                  Erreur d&apos;écriture
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsFullscreen((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-stone-600 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                title={isFullscreen ? 'Revenir dans la note' : 'Agrandir en plein écran'}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="h-3 w-3" />
                    Réduire
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3 w-3" />
                    Plein écran
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={lockDrawing}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600"
              >
                <Check className="h-3 w-3" />
                Terminer
              </button>
            </div>
          </div>

          <div className="softmath-excalidraw-canvas relative min-h-0 flex-1 w-full">
            <ExcalidrawErrorBoundary onClose={lockDrawing}>
              <Excalidraw
                excalidrawAPI={(api) => {
                  excalidrawApiRef.current = api;
                }}
                initialData={initialData}
                theme={theme === 'dark' ? THEME.DARK : THEME.LIGHT}
                langCode="fr-FR"
                detectScroll={false}
                handleKeyboardGlobally={false}
                UIOptions={{
                  canvasActions: {
                    changeViewBackgroundColor: true,
                    clearCanvas: true,
                    export: false,
                    loadScene: false,
                    saveAsImage: false,
                    saveToActiveFile: false,
                    toggleTheme: null,
                  },
                  tools: {
                    image: true,
                  },
                }}
                onChange={handleExcalidrawChange}
              />
            </ExcalidrawErrorBoundary>
          </div>
        </div>
      ) : (
        <div
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            enterEditMode(false);
          }}
          className={`group relative overflow-hidden rounded-xl border bg-stone-50/45 transition-colors print:border-stone-200/70 print:bg-white print:ring-0 dark:bg-zinc-900/45 ${
            selected
              ? 'border-indigo-400/80 ring-2 ring-indigo-500/15 dark:border-indigo-500/70'
              : 'border-stone-200/80 hover:border-stone-300 dark:border-zinc-800 dark:hover:border-zinc-700'
          }`}
          style={{ height: `${height}px` }}
          title="Double-cliquez pour éditer le schéma"
        >
          {/* Floating top action bar shown on hover */}
          <div className="pointer-events-none absolute inset-x-2.5 top-2 z-10 flex items-center justify-between opacity-0 transition-opacity group-hover:opacity-100 print:hidden">
            <span className="rounded-md border border-stone-200/80 bg-white/90 px-2 py-0.5 font-mono text-[10px] text-stone-500 backdrop-blur-xs dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:text-zinc-400">
              {src}
            </span>

            <div className="pointer-events-auto flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  enterEditMode(true);
                }}
                title="Éditer en plein écran"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-stone-200/90 bg-white/95 text-stone-600 shadow-2xs transition-colors hover:bg-stone-100 hover:text-stone-900 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <Maximize2 className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  enterEditMode(false);
                }}
                className="inline-flex items-center gap-1 rounded-md border border-stone-200/90 bg-white/95 px-2.5 py-1 text-[11px] font-medium text-stone-700 shadow-2xs transition-colors hover:bg-stone-100 hover:text-stone-900 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <Pencil className="h-3 w-3" />
                Éditer
              </button>
            </div>
          </div>

          {/* Preview body */}
          <div className="flex h-full w-full items-center justify-center p-4 pb-6">
            {isLoading ? (
              <span className="text-xs text-stone-400 dark:text-zinc-500">
                Chargement du schéma…
              </span>
            ) : loadError ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="text-xs text-red-600 dark:text-red-400">
                  {loadError}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void loadSceneFromDisk();
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-[11px] text-stone-700 hover:bg-stone-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <RefreshCw className="h-3 w-3" />
                  Réessayer
                </button>
              </div>
            ) : !hasVisibleElements ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <PenTool className="h-5 w-5 text-stone-300 dark:text-zinc-600" />
                <p className="text-xs text-stone-500 dark:text-zinc-400">
                  {isMissingFile
                    ? `Fichier introuvable (.assets/${src}) — double-cliquez pour le créer`
                    : 'Schéma vide — double-cliquez ou cliquez sur « Éditer » pour dessiner'}
                </p>
              </div>
            ) : null}

            <div
              ref={svgHostRef}
              className={
                !isLoading && !loadError && hasVisibleElements
                  ? 'flex h-full w-full items-center justify-center'
                  : 'hidden'
              }
            />
          </div>

          {/* Bottom drag handle for height resizing */}
          <div
            data-excalidraw-interactive="true"
            onPointerDown={handleResizePointerDown}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Redimensionner la hauteur du schéma"
            className="absolute inset-x-0 bottom-0 flex h-4 cursor-ns-resize items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 print:hidden"
          >
            <span
              className={`h-1 rounded-full transition-all ${
                isResizing
                  ? 'w-14 bg-indigo-500'
                  : 'w-10 bg-stone-300 hover:bg-stone-400 dark:bg-zinc-700 dark:hover:bg-zinc-500'
              }`}
            />
          </div>

          {isResizing && (
            <div className="pointer-events-none absolute bottom-5 right-3 rounded bg-stone-900/80 px-1.5 py-0.5 font-mono text-[10px] text-white dark:bg-zinc-100/90 dark:text-zinc-900">
              {height} px
            </div>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}
