import { useState } from 'react';
import { fmtUSD } from '../../lib/format';
type Point = { date: string; income: number; expense: number; net: number };

export default function DailyFlowMiniChart({ data }: { data: Point[] }) {
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

  const ysIncome = data.map((d) => +d.income || 0);
  const ysExpense = data.map((d) => -Math.abs(+d.expense || 0));
  const yMin = Math.min(0, ...ysIncome, ...ysExpense);
  const yMax = Math.max(0, ...ysIncome, ...ysExpense);
  const yRange = yMax - yMin || 1;

  const scaleX = (i: number) => P + (i / (len - 1)) * (W - P * 2);
  const scaleY = (y: number) => H - P - ((y - yMin) / yRange) * (H - P * 2);

  const path = (vals: number[]) =>
    vals.map((y, i) => `${i ? 'L' : 'M'}${scaleX(i)},${scaleY(y)}`).join(' ');
  const zeroY = scaleY(0);

  // último punto (badges)
  const lastIdx = len - 1;
  const lastX = scaleX(lastIdx);
  const lastIncomeY = scaleY(ysIncome[lastIdx]);
  const lastExpenseY = scaleY(ysExpense[lastIdx]);

  // hover state
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

      {/* baseline 0 + labels mínimos */}
      <line
        x1={P}
        x2={W - P}
        y1={zeroY}
        y2={zeroY}
        className="stroke-neutral-200"
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

      {/* líneas */}
      <path d={path(ysIncome)} className="stroke-emerald-600" fill="none" strokeWidth={2} />
      <path d={path(ysExpense)} className="stroke-rose-500" fill="none" strokeWidth={2} />

      {/* badges último valor */}
      <g>
        <rect
          x={lastX + 6}
          y={lastIncomeY - 10}
          rx={4}
          width="60"
          height="16"
          className="fill-white"
        />
        <text
          x={lastX + 36}
          y={lastIncomeY + 2}
          textAnchor="middle"
          className="fill-emerald-700 text-[10px] font-medium"
        >
          {fmtUSD(ysIncome[lastIdx])}
        </text>

        <rect
          x={lastX + 6}
          y={lastExpenseY - 10}
          rx={4}
          width="60"
          height="16"
          className="fill-white"
        />
        <text
          x={lastX + 36}
          y={lastExpenseY + 2}
          textAnchor="middle"
          className="fill-rose-700 text-[10px] font-medium"
        >
          {fmtUSD(Math.abs(ysExpense[lastIdx]))}
        </text>
      </g>

      {/* hover crosshair + tooltip */}
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
          <circle
            cx={scaleX(hoverI)}
            cy={scaleY(ysIncome[hoverI])}
            r="2.5"
            className="fill-emerald-600"
          />
          <circle
            cx={scaleX(hoverI)}
            cy={scaleY(ysExpense[hoverI])}
            r="2.5"
            className="fill-rose-500"
          />

          {/* card */}
          <g
            transform={`translate(${Math.min(W - 150, Math.max(P, scaleX(hoverI) + 8))},${P + 8})`}
          >
            <rect width="140" height="54" rx="8" className="fill-white stroke-neutral-200" />
            <text x="8" y="16" className="fill-neutral-700 text-[11px] font-semibold">
              {data[hoverI].date}
            </text>
            <text x="8" y="32" className="fill-emerald-700 text-[11px]">
              Income: {fmtUSD(ysIncome[hoverI])}
            </text>
            <text x="8" y="46" className="fill-rose-700 text-[11px]">
              Expense: {fmtUSD(Math.abs(ysExpense[hoverI]))}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}
