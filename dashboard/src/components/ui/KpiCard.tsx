import { clsx } from '../../lib/util';
export default function KpiCard({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-xs text-gray-600">{label}</div>
      <div className={clsx('text-2xl font-semibold', valueClass)}>{value}</div>
      {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
    </div>
  );
}
