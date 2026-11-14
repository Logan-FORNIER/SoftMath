import { useId, useMemo, useRef } from 'react';
import type { Geometry2DConfig } from '../extensions/SoftGeometry2D';

interface Geometry2DCanvasProps {
  config: Geometry2DConfig;
  interactive?: boolean;
  onMovePoint?: (pointId: string, x: number, y: number) => void;
}

export function Geometry2DCanvas({
  config,
  interactive = false,
  onMovePoint,
}: Geometry2DCanvasProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const arrowId = `geo-arrow-${uid}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingIdRef = useRef<string | null>(null);

  const width = 520;
  const height = 320;
  const pad = 28;
  const plotW = width - 2 * pad;
  const plotH = height - 2 * pad;

  const xSpan = config.xMax - config.xMin || 1;
  const ySpan = config.yMax - config.yMin || 1;

  const toSvgX = (x: number) => pad + ((x - config.xMin) / xSpan) * plotW;
  const toSvgY = (y: number) => pad + ((config.yMax - y) / ySpan) * plotH;

  const toWorldCoords = (clientX: number, clientY: number, fine: boolean) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const svgY = ((clientY - rect.top) / rect.height) * height;
    const wx = config.xMin + ((svgX - pad) / plotW) * xSpan;
    const wy = config.yMax - ((svgY - pad) / plotH) * ySpan;
    const step = fine ? 0.1 : 0.5;
    const snap = (v: number) => Math.round(v / step) * step;
    return {
      x: Number(snap(wx).toFixed(2)),
      y: Number(snap(wy).toFixed(2)),
    };
  };

  const pointMap = useMemo(
    () => new Map(config.points.map((p) => [p.id, p])),
    [config.points]
  );

  const originX = toSvgX(0);
  const originY = toSvgY(0);

  const xTicks = useMemo(() => {
    const start = Math.ceil(config.xMin);
    const end = Math.floor(config.xMax);
    const step = end - start > 18 ? 2 : 1;
    const arr: number[] = [];
    for (let x = start; x <= end; x += step) arr.push(x);
    return arr;
  }, [config.xMin, config.xMax]);

  const yTicks = useMemo(() => {
    const start = Math.ceil(config.yMin);
    const end = Math.floor(config.yMax);
    const step = end - start > 14 ? 2 : 1;
    const arr: number[] = [];
    for (let y = start; y <= end; y += step) arr.push(y);
    return arr;
  }, [config.yMin, config.yMax]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="mx-auto block h-auto w-full max-w-[580px] select-none rounded-lg bg-white dark:bg-zinc-950"
      onPointerMove={
        interactive && onMovePoint
          ? (e) => {
              const ptId = draggingIdRef.current;
              if (!ptId) return;
              const coords = toWorldCoords(e.clientX, e.clientY, e.shiftKey);
              if (coords) {
                onMovePoint(ptId, coords.x, coords.y);
              }
            }
          : undefined
      }
      onPointerUp={() => {
        draggingIdRef.current = null;
      }}
      onPointerCancel={() => {
        draggingIdRef.current = null;
      }}
      role="img"
      aria-label={config.title || 'Figure de géométrie 2D'}
    >
      <defs>
        <marker
          id={arrowId}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="context-stroke" />
        </marker>
        <clipPath id={`clip-${uid}`}>
          <rect x={pad} y={pad} width={plotW} height={plotH} />
        </clipPath>
      </defs>

      {/* Grid */}
      {config.showGrid && (
        <g stroke="#e2e8f0" strokeWidth={0.7} className="dark:opacity-25">
          {xTicks.map((x) => {
            const sx = toSvgX(x);
            return (
              <line key={`gx-${x}`} x1={sx} y1={pad} x2={sx} y2={pad + plotH} />
            );
          })}
          {yTicks.map((y) => {
            const sy = toSvgY(y);
            return (
              <line key={`gy-${y}`} x1={pad} y1={sy} x2={pad + plotW} y2={sy} />
            );
          })}
        </g>
      )}

      {/* Axes */}
      <g>
        {originY >= pad && originY <= pad + plotH && (
          <line
            x1={pad}
            y1={originY}
            x2={pad + plotW}
            y2={originY}
            stroke="#64748b"
            strokeWidth={1.3}
          />
        )}
        {originX >= pad && originX <= pad + plotW && (
          <line
            x1={originX}
            y1={pad}
            x2={originX}
            y2={pad + plotH}
            stroke="#64748b"
            strokeWidth={1.3}
          />
        )}
        {xTicks
          .filter((x) => x !== 0)
          .map((x) => {
            const sx = toSvgX(x);
            const labelY = Math.min(pad + plotH - 4, Math.max(pad + 12, originY + 13));
            return (
              <text
                key={`tx-${x}`}
                x={sx}
                y={labelY}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
              >
                {x}
              </text>
            );
          })}
        {yTicks
          .filter((y) => y !== 0)
          .map((y) => {
            const sy = toSvgY(y);
            const labelX = Math.max(pad + 10, Math.min(pad + plotW - 14, originX - 8));
            return (
              <text
                key={`ty-${y}`}
                x={labelX}
                y={sy + 3}
                textAnchor="end"
                fontSize={9}
                fill="#64748b"
              >
                {y}
              </text>
            );
          })}
      </g>

      {/* Clipped geometric shapes */}
      <g clipPath={`url(#clip-${uid})`}>
        {config.circles.map((circle) => {
          const center = pointMap.get(circle.centerId);
          if (!center) return null;
          const through = circle.throughPointId
            ? pointMap.get(circle.throughPointId)
            : undefined;
          const radius = through
            ? Math.hypot(through.x - center.x, through.y - center.y)
            : circle.radius;
          const rx = (radius / xSpan) * plotW;
          const ry = (radius / ySpan) * plotH;
          return (
            <ellipse
              key={circle.id}
              cx={toSvgX(center.x)}
              cy={toSvgY(center.y)}
              rx={rx}
              ry={ry}
              fill={circle.color}
              fillOpacity={0.07}
              stroke={circle.color}
              strokeWidth={1.8}
            />
          );
        })}

        {config.shapes.map((shape) => {
          const p1 = pointMap.get(shape.fromId);
          const p2 = pointMap.get(shape.toId);
          if (!p1 || !p2) return null;

          if (shape.kind === 'line') {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
            const tScale = 100;
            const ax = p1.x - dx * tScale;
            const ay = p1.y - dy * tScale;
            const bx = p1.x + dx * tScale;
            const by = p1.y + dy * tScale;
            return (
              <line
                key={shape.id}
                x1={toSvgX(ax)}
                y1={toSvgY(ay)}
                x2={toSvgX(bx)}
                y2={toSvgY(by)}
                stroke={shape.color}
                strokeWidth={1.6}
                strokeDasharray="6 4"
              />
            );
          }

          return (
            <line
              key={shape.id}
              x1={toSvgX(p1.x)}
              y1={toSvgY(p1.y)}
              x2={toSvgX(p2.x)}
              y2={toSvgY(p2.y)}
              stroke={shape.color}
              strokeWidth={shape.kind === 'vector' ? 2.2 : 1.8}
              markerEnd={shape.kind === 'vector' ? `url(#${arrowId})` : undefined}
            />
          );
        })}
      </g>

      {/* Points on top */}
      {config.points.map((pt) => {
        const cx = toSvgX(pt.x);
        const cy = toSvgY(pt.y);
        return (
          <g
            key={pt.id}
            style={{ cursor: interactive ? 'grab' : 'default' }}
            onPointerDown={
              interactive
                ? (e) => {
                    e.stopPropagation();
                    svgRef.current?.setPointerCapture(e.pointerId);
                    draggingIdRef.current = pt.id;
                  }
                : undefined
            }
          >
            <circle
              cx={cx}
              cy={cy}
              r={interactive ? 7 : 4.5}
              fill="transparent"
            />
            <circle
              cx={cx}
              cy={cy}
              r={4.2}
              fill={pt.color}
              stroke="#ffffff"
              strokeWidth={1.4}
            />
            <text
              x={cx + 7}
              y={cy - 7}
              fontSize={11}
              fontWeight={700}
              fill={pt.color}
            >
              {pt.name}({pt.x}, {pt.y})
            </text>
          </g>
        );
      })}
    </svg>
  );
}

