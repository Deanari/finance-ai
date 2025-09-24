import { fmtUSD } from '../../lib/format';
import { colorFor } from '../../lib/util';

export default function BarRow({
  label,
  amount,
  total,
  pctLabel,
  emphasize,
}: {
  label: string;
  amount: number;
  total: number;
  pctLabel?: string;
  emphasize?: boolean;
}) {
  const absAmount = Math.abs(amount);
  const ratio = total > 0 ? Math.min(1, absAmount / total) : 0;
  const widthPct = Math.max(2, ratio * 100);
  const fill = colorFor(label);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="truncate pr-2">{label}</span>
        <span className="tabular-nums text-gray-600">
          {fmtUSD(-absAmount)}
          {pctLabel ? ` · ${pctLabel}` : ''}
        </span>
      </div>
      <div
        className={`h-2 w-full rounded-full bg-gray-100 overflow-hidden ${emphasize ? 'ring-2 ring-gray-200' : ''}`}
      >
        <div className={`h-full ${fill}`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}
