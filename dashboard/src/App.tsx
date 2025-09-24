import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, endpoints } from './lib/api';
import { fmtUSD, pct, toISODateInput } from './lib/format';
import type { SummaryResponse, TimelineResponse } from './types';

import AssistantAdviceCard from './components/AssistantAdviceCard';
import BarRow from './components/bars/BarRow';
import DailyFlowMiniChart from './components/charts/DailyFlowMiniChart';
import NetCumulativeMiniChart from './components/charts/NetCumulativeMiniChart';
import DateRangeControls from './components/filters/DateRangeControls';
import Card from './components/ui/Card';
import KpiCard from './components/ui/KpiCard';

export default function App() {
  // default range: last 30 days
  const today: Date = useMemo(() => new Date(), []);
  // const monthAgo: Date = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), []);

  const [from, setFrom] = useState<string>('2024-01-01');
  const [to, setTo] = useState<string>(toISODateInput(today));

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const s = await apiGet<SummaryResponse>(endpoints.summary, { from, to });
      setSummary(s);

      const t = await apiGet<TimelineResponse>(endpoints.timeline, { from, to });
      setTimeline(t);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const expenseTotal: number = Math.abs(summary?.totals.expense ?? 0);
  const byCategory: Array<{ category: string; amount: number; pct: number }> =
    summary?.byCategory ?? [];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Finance AI — Dashboard</h1>
          {loading && <span className="text-xs text-gray-500">Loading…</span>}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Filters */}
        <DateRangeControls from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={load} />

        {/* KPIs */}
        <section className="mt-6 grid sm:grid-cols-3 gap-4">
          <KpiCard
            label="Income"
            value={fmtUSD(summary?.totals.income)}
            hint={`${summary?.count ?? 0} txns`}
          />
          <KpiCard label="Expenses" value={fmtUSD(summary?.totals.expense)} />
          <KpiCard
            label="Net"
            value={fmtUSD(summary?.totals.net)}
            valueClass={summary && summary.totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}
          />
        </section>

        {/* Content grid */}
        <section className="mt-6 grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6">
            <Card title="Top 5 spending">
              <div className="grid gap-3">
                {(summary?.top5 ?? []).map((c) => (
                  <BarRow
                    key={c.category}
                    label={c.category}
                    amount={c.amount}
                    total={expenseTotal}
                    pctLabel={pct(c.pct)}
                    emphasize
                  />
                ))}
                {!(summary?.top5 && summary.top5.length > 0) && !loading && (
                  <p className="text-sm text-gray-500">No top 5 available.</p>
                )}
                {loading && (
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200/70 rounded" />
                    <div className="h-3 bg-gray-200/70 rounded w-11/12" />
                    <div className="h-3 bg-gray-200/70 rounded w-9/12" />
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-6">
            <Card title="Spending by category">
              <div className="grid gap-3">
                {byCategory.slice(0, 8).map((c) => (
                  <BarRow
                    key={c.category}
                    label={c.category}
                    amount={c.amount}
                    total={expenseTotal}
                    pctLabel={pct(c.pct)}
                  />
                ))}
                {byCategory.length === 0 && !loading && (
                  <p className="text-sm text-gray-500">No data for selected range.</p>
                )}
                {loading && (
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200/70 rounded" />
                    <div className="h-3 bg-gray-200/70 rounded w-10/12" />
                    <div className="h-3 bg-gray-200/70 rounded w-8/12" />
                  </div>
                )}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-12">
            <Card title="Cash Flow (Timeline)">
              <DailyFlowMiniChart
                data={(timeline?.points ?? []).map((p) => ({
                  date: p.date,
                  income: p.income,
                  expense: p.expense,
                  net: p.net,
                }))}
              />
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-6 rounded bg-emerald-600 inline-block" /> Income
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-6 rounded bg-rose-500 inline-block" /> Expenses
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-12">
            <Card title="Net Income (Timeline)">
              <NetCumulativeMiniChart
                data={(timeline?.points ?? []).map((p) => ({
                  date: p.date,
                  income: p.income,
                  expense: p.expense,
                  net: p.net,
                }))}
              />
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-6 rounded bg-slate-700 inline-block" /> Net
                </div>
              </div>
            </Card>
          </div>
        </section>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <section className="mt-6">
          <AssistantAdviceCard
            className="w-full"
            from={from}
            to={to}
            topN={5}
            exclude={['rent', 'healthcare']}
            preferBedrock
          />
        </section>
      </main>
    </div>
  );
}
