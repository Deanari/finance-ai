import { toISODateInput } from '../../lib/format';

export type DateRangeControlsProps = {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  onApply: () => void;
};

export default function DateRangeControls({
  from,
  to,
  setFrom,
  setTo,
  onApply,
}: DateRangeControlsProps) {
  const today = new Date();
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return (
    <div className="grid sm:grid-cols-5 gap-3 items-end">
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-600 mb-1">From</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-full rounded-xl border bg-white px-3 py-2"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="block text-xs text-gray-600 mb-1">To</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-full rounded-xl border bg-white px-3 py-2"
        />
      </div>
      <div className="sm:col-span-1 flex gap-2">
        <button
          onClick={onApply}
          className="w-full rounded-xl bg-gray-900 text-white px-3 py-2 text-sm font-medium"
        >
          Apply
        </button>
        <button
          onClick={() => {
            setFrom(toISODateInput(monthAgo));
            setTo(toISODateInput(today));
          }}
          className="rounded-xl border px-3 py-2 text-sm"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
