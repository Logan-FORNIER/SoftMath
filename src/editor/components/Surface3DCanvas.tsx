import { useMemo, useRef } from 'react';
import {
  computeSurface3DMesh,
  type Surface3DConfig,
} from '../extensions/SoftSurface3D';

interface Surface3DCanvasProps {
  config: Surface3DConfig;
  interactive?: boolean;
  onRotate?: (azimuthDeg: number, elevationDeg: number) => void;
}

export function Surface3DCanvas({
  config,
  interactive = false,
  onRotate,
}: Surface3DCanvasProps) {
  const width = 480;
  const height = 310;

  const dragRef = useRef<{
    startX: number;
    startY: number;
    startAz: number;
    startEl: number;
  } | null>(null);

  const mesh = useMemo(
    () => computeSurface3DMesh(config, width, height),
    [config]
  );

  if (mesh.error) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-rose-300/60 bg-rose-50/40 px-4 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">
        Erreur de formule 3D : {mesh.error}
      </div>
    );
  }

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={`mx-auto block h-auto w-full max-w-[540px] rounded-lg bg-stone-50/70 dark:bg-zinc-950/60 ${
          interactive ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        onPointerDown={
          interactive && onRotate
            ? (e) => {
                (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
                dragRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  startAz: config.azimuthDeg,
                  startEl: config.elevationDeg,
                };
              }
            : undefined
        }
        onPointerMove={
          interactive && onRotate
            ? (e) => {
                if (!dragRef.current) return;
                const dx = e.clientX - dragRef.current.startX;
                const dy = e.clientY - dragRef.current.startY;
                const nextAz = (dragRef.current.startAz + dx * 0.65) % 360;
                const nextEl = Math.max(
                  -85,
                  Math.min(85, dragRef.current.startEl + dy * 0.45)
                );
                onRotate(Math.round(nextAz), Math.round(nextEl));
              }
            : undefined
        }
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        role="img"
        aria-label={config.title || `Surface z = ${config.expression}`}
      >
        {/* Coordinate axes */}
        {mesh.axes.map((ax) => (
          <g key={ax.label}>
            <line
              x1={ax.x1}
              y1={ax.y1}
              x2={ax.x2}
              y2={ax.y2}
              stroke={ax.color}
              strokeWidth={1.5}
              strokeDasharray="3 2"
              opacity={0.7}
            />
            <text
              x={ax.x2 + 6}
              y={ax.y2 + 4}
              fontSize={11}
              fontWeight={600}
              fill={ax.color}
            >
              {ax.label}
            </text>
          </g>
        ))}

        {/* Depth-sorted quads */}
        {mesh.quads.map((q, idx) => (
          <polygon
            key={`q-${idx}`}
            points={q.points}
            fill={q.fill}
            fillOpacity={0.9}
            stroke={q.stroke}
            strokeWidth={0.55}
          />
        ))}
      </svg>

      <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-stone-400 dark:text-zinc-500">
        <span>
          z ∈ [{mesh.zMin.toFixed(2)}, {mesh.zMax.toFixed(2)}]
        </span>
        {interactive && (
          <span>
            Cliquer-glisser pour tourner • θ={Math.round(config.azimuthDeg)}° φ=
            {Math.round(config.elevationDeg)}°
          </span>
        )}
      </div>
    </div>
  );
}

