import { useState } from 'react';
import { fmtUSD } from '../../lib/format';
type Point = { date: string; income: number; expense: number; net: number };

export default function NetCumulativeMiniChart({ data }: { data: Point[] }) {
  const W = 640,
    H = 160,
    P = 10;
  const len = data.length;
  if (len < 2)
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40">
        <rect x={0} y={0} width={W} height={H} rx={12} className="fill-gray-50" />
      </svg>
    );

  // construir acumulado desde daily net
  let run = 0;
  const cum = data.map((d) => (run += (+d.income || 0) - (+d.expense || 0)));

  const yMin = Math.min(0, ...cum);
  const yMax = Math.max(0, ...cum);
  const yRange = yMax - yMin || 1;

  const scaleX = (i: number) => P + (i / (len - 1)) * (W - P * 2);
  const scaleY = (y: number) => H - P - ((y - yMin) / yRange) * (H - P * 2);
  const path = cum.map((y, i) => `${i ? 'L' : 'M'}${scaleX(i)},${scaleY(y)}`).join(' ');
  const zeroY = scaleY(0);

  const lastIdx = len - 1;
  const lastX = scaleX(lastIdx);
  const lastY = scaleY(cum[lastIdx]);

  const [hoverI, setHoverI] = useState<number | null>(null);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const bbox = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - bbox.left;
    const t = Math.max(P, Math.min(W - P, px));
    const ratio = (t - P) / (W - P * 2);
    const i = Math.round(ratio * (len - 1));
    setHoverI(i);
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-40"
      onMouseMove={onMove}
      onMouseLeave={() => setHoverI(null)}
    >
      <rect x={0} y={0} width={W} height={H} rx={12} className="fill-gray-50" />

      {/* baseline + ticks básicos */}
      <line
        x1={P}
        x2={W - P}
        y1={zeroY}
        y2={zeroY}
        className="stroke-neutral-300"
        strokeDasharray="4 4"
        strokeWidth={1}
      />
      <text x={P} y={zeroY - 4} className="fill-neutral-400 text-[10px] select-none">
        0
      </text>
      <text
        x={W - P}
        y={scaleY(yMax) - 4}
        textAnchor="end"
        className="fill-neutral-400 text-[10px] select-none"
      >
        {fmtUSD(yMax)}
      </text>
      <text
        x={W - P}
        y={scaleY(yMin) + 10}
        textAnchor="end"
        className="fill-neutral-400 text-[10px] select-none"
      >
        {fmtUSD(yMin)}
      </text>

      {/* línea net acumulado */}
      <path d={path} className="stroke-slate-800" fill="none" strokeWidth={3} />
      {/* dot y badge final */}
      <circle cx={lastX} cy={lastY} r="3" className="fill-slate-800" />
      <rect x={lastX + 6} y={lastY - 10} rx={4} width="76" height="16" className="fill-white" />
      <text
        x={lastX + 44}
        y={lastY + 2}
        textAnchor="middle"
        className="fill-slate-800 text-[10px] font-medium"
      >
        {fmtUSD(cum[lastIdx])}
      </text>

      {/* hover */}
      {hoverI !== null && (
        <g>
          <line
            x1={scaleX(hoverI)}
            x2={scaleX(hoverI)}
            y1={P}
            y2={H - P}
            className="stroke-neutral-300"
            strokeDasharray="3 3"
          />
          <circle cx={scaleX(hoverI)} cy={scaleY(cum[hoverI])} r="2.5" className="fill-slate-800" />

          <g
            transform={`translate(${Math.min(W - 160, Math.max(P, scaleX(hoverI) + 8))},${P + 8})`}
          >
            <rect width="150" height="40" rx="8" className="fill-white stroke-neutral-200" />
            <text x="8" y="16" className="fill-neutral-700 text-[11px] font-semibold">
              {data[hoverI].date}
            </text>
            <text x="8" y="30" className="fill-slate-800 text-[11px]">
              Balance: {fmtUSD(cum[hoverI])}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}
