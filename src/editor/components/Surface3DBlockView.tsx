import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Box, RotateCcw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useMemo } from 'react';
import { Surface3DCanvas } from './Surface3DCanvas';
import {
  createPresetSurface3DConfig,
  parseSurface3DConfig,
  serializeSurface3DConfig,
  type Surface3DConfig,
  type Surface3DPalette,
  type Surface3DPresetId,
} from '../extensions/SoftSurface3D';

export function Surface3DBlockView({
  node,
  selected,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const config = useMemo(
    () => parseSurface3DConfig(String(node.attrs.spec ?? '')),
    [node.attrs.spec]
  );

  const commitConfig = (next: Surface3DConfig) => {
    updateAttributes({ spec: serializeSurface3DConfig(next) });
  };

  return (
    <NodeViewWrapper
      as="div"
      className={`my-4 rounded-xl border transition-shadow ${
        selected
          ? 'border-indigo-400 ring-2 ring-indigo-500/20 dark:border-indigo-500'
          : 'border-stone-200 dark:border-zinc-800'
      } bg-white shadow-xs dark:bg-zinc-900/80 print:border-stone-400 print:bg-white`}
      contentEditable={false}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b border-stone-200/80 bg-stone-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60 print:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-300">
            <Box className="h-3.5 w-3.5" />
          </span>
          <input
            type="text"
            value={config.title}
            onChange={(e) => commitConfig({ ...config, title: e.target.value })}
            placeholder="Titre de la surface 3D..."
            className="w-52 bg-transparent text-xs font-semibold text-stone-800 focus:outline-none dark:text-zinc-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            defaultValue=""
            onChange={(e) => {
              if (!e.target.value) return;
              commitConfig(
                createPresetSurface3DConfig(e.target.value as Surface3DPresetId)
              );
              e.target.value = '';
            }}
            className="rounded border border-stone-200 bg-white px-2 py-0.5 text-[11px] text-stone-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="">Modèle…</option>
            <option value="wave">Onde radiale</option>
            <option value="saddle">Selle (x² - y²)</option>
            <option value="paraboloid">Paraboloïde</option>
            <option value="gaussian">Gaussienne modulée</option>
          </select>

          <select
            value={config.palette}
            onChange={(e) =>
              commitConfig({
                ...config,
                palette: e.target.value as Surface3DPalette,
              })
            }
            className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[11px] text-stone-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="indigo">Palette Indigo</option>
            <option value="heat">Palette Thermique</option>
            <option value="emerald">Palette Émeraude</option>
          </select>

          <button
            type="button"
            onClick={() =>
              commitConfig({ ...config, zoom: Math.min(2.2, config.zoom + 0.15) })
            }
            className="rounded border border-stone-200 bg-white p-1 text-stone-600 hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            title="Zoom avant"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              commitConfig({ ...config, zoom: Math.max(0.5, config.zoom - 0.15) })
            }
            className="rounded border border-stone-200 bg-white p-1 text-stone-600 hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            title="Zoom arrière"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              commitConfig({ ...config, azimuthDeg: 40, elevationDeg: 28, zoom: 1 })
            }
            className="rounded border border-stone-200 bg-white p-1 text-stone-600 hover:bg-stone-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            title="Réinitialiser la vue"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={deleteNode}
            className="rounded p-1 text-stone-400 hover:bg-rose-500/10 hover:text-rose-500"
            title="Supprimer ce graphique 3D"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expression & domain controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-3.5 py-2 text-xs dark:border-zinc-800 print:hidden">
        <label className="flex flex-1 min-w-[200px] items-center gap-1.5">
          <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
            z =
          </span>
          <input
            type="text"
            value={config.expression}
            onChange={(e) => commitConfig({ ...config, expression: e.target.value })}
            className="w-full rounded border border-stone-200 bg-stone-50 px-2 py-1 font-mono text-xs text-stone-800 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </label>

        <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
          <span>x∈[</span>
          <input
            type="number"
            value={config.xMin}
            onChange={(e) => commitConfig({ ...config, xMin: Number(e.target.value) })}
            className="w-12 rounded border border-stone-200 bg-white px-1 py-0.5 text-center font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span>,</span>
          <input
            type="number"
            value={config.xMax}
            onChange={(e) => commitConfig({ ...config, xMax: Number(e.target.value) })}
            className="w-12 rounded border border-stone-200 bg-white px-1 py-0.5 text-center font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span>]</span>

          <span className="ml-1">y∈[</span>
          <input
            type="number"
            value={config.yMin}
            onChange={(e) => commitConfig({ ...config, yMin: Number(e.target.value) })}
            className="w-12 rounded border border-stone-200 bg-white px-1 py-0.5 text-center font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span>,</span>
          <input
            type="number"
            value={config.yMax}
            onChange={(e) => commitConfig({ ...config, yMax: Number(e.target.value) })}
            className="w-12 rounded border border-stone-200 bg-white px-1 py-0.5 text-center font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <span>]</span>
        </div>
      </div>

      {/* Print title */}
      {config.title && (
        <div className="px-4 pt-2 text-xs font-semibold text-stone-700 dark:text-zinc-300">
          {config.title} — <code className="font-mono">z = {config.expression}</code>
        </div>
      )}

      <div className="p-3">
        <Surface3DCanvas
          config={config}
          interactive
          onRotate={(az, el) =>
            commitConfig({ ...config, azimuthDeg: az, elevationDeg: el })
          }
        />
      </div>
    </NodeViewWrapper>
  );
}

