import { useCallback, useEffect, useRef, useState } from 'react';
import { endpoints as apiEndpoints, apiGet, apiPost } from '../lib/api';
import { fmtUSD } from '../lib/format';

export type Provider = 'bedrock' | 'rules' | 'unknown';

export interface TopExpenseItem {
  date: string;
  amount: number;
  description: string;
}
export interface AdviceCategory {
  name: string;
  total: number;
  share: number;
}
export interface AdvicePayload {
  expensesTotal: number;
  expensesTotalAll: number;
  categories: AdviceCategory[];
  topCategory: { name: string; total: number; share: number; topExpenses: TopExpenseItem[] } | null;
}

type AdviceStatusResponse =
  | { jobId: string; status: 'queued' | 'running' }
  | { jobId: string; status: 'done'; advice: { text: string; structured?: unknown } }
  | { jobId: string; status: 'error'; error?: string };

export interface AssistantAdviceCardProps {
  from?: string;
  to?: string;
  topN?: number;
  exclude?: string[];
  preferBedrock?: boolean;
  className?: string;
}

export default function AssistantAdviceCard({
  from,
  to,
  topN = 5,
  exclude = ['rent', 'healthcare'],
  preferBedrock = true,
  className,
}: AssistantAdviceCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [payload, setPayload] = useState<AdvicePayload | null>(null);

  const runIdRef = useRef(0);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const fetchAdvice = useCallback(async () => {
    const runId = ++runIdRef.current;

    setLoading(true);
    setError(null);
    setProvider(null);
    setMessage(null);
    setPayload(null);

    try {
      // 1) GET payload
      const payloadRes = await apiGet<{ payload: AdvicePayload }>(apiEndpoints.advicePayload, {
        from,
        to,
        topN,
        exclude: exclude?.length ? exclude.join(',') : undefined,
      });
      if (runId !== runIdRef.current) return;
      setPayload(payloadRes.payload);
      setMessage(renderLocalAdviceFromPayload(payloadRes.payload));
      setProvider('unknown');

      // 2) POST /api/advice
      const start = await apiPost<{ jobId: string; status: string; advice?: any }>(
        apiEndpoints.advice,
        { from, to, topN, exclude },
        undefined,
        preferBedrock ? { 'X-AI-Mode': 'bedrock' } : undefined,
      );
      if (runId !== runIdRef.current) return;
      if (!start?.jobId) {
        setError('No jobId returned by server');
        setLoading(false);
        return;
      }

      // 2.5) check status for done
      try {
        const s0 = await apiGet<AdviceStatusResponse>(apiEndpoints.adviceStatus, {
          jobId: start.jobId,
        });
        if (runId !== runIdRef.current) return;
        if (s0.status === 'done') {
          setMessage(s0.advice?.text ?? '(no text)');
          setProvider('bedrock');
          setLoading(false);
          return;
        }
        if (s0.status === 'error') {
          setError((s0 as any).error || 'Advice job failed');
          setLoading(false);
          return;
        }
      } catch (e) {
        // fallback to poll
      }

      // 3) Poll with backoff + jitter
      const MAX_POLLS = 15;
      let attempt = 0,
        delay = 2000;
      const factor = 1.7,
        maxDelay = 15000;

      while (runId === runIdRef.current && attempt < MAX_POLLS) {
        try {
          const s = await apiGet<AdviceStatusResponse>(apiEndpoints.adviceStatus, {
            jobId: start.jobId,
          });
          if (runId !== runIdRef.current) return;

          if (s.status === 'done') {
            setMessage(s.advice?.text ?? '(no text)');
            setProvider('bedrock');
            setLoading(false);
            return;
          }
          if (s.status === 'error') {
            setError((s as any).error || 'Advice job failed');
            setLoading(false);
            return;
          }

          attempt++;
          const jitter = Math.round(delay * 0.2 * (Math.random() - 0.5) * 2);
          await sleep(delay + jitter);
          delay = Math.min(maxDelay, Math.round(delay * factor));
        } catch (e) {
          if (runId !== runIdRef.current) return;
          setError(e instanceof Error ? e.message : 'Failed to fetch advice status');
          setLoading(false);
          return;
        }
      }

      if (runId === runIdRef.current) {
        setError('Advice is taking longer than expected. Please try again.');
        setLoading(false);
      }
    } catch (e) {
      if (runId !== runIdRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to fetch advice');
      setLoading(false);
    }
  }, [from, to, topN, exclude, preferBedrock]);

  useEffect(() => {
    void fetchAdvice();
  }, [fetchAdvice]);

  return (
    <div
      className={[
        'w-full max-w-3xl mx-auto rounded-2xl border border-neutral-200 shadow-sm bg-white',
        'p-4 md:p-6',
        className || '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-white text-sm font-semibold">
          AI
        </span>
        <h2 className="text-lg font-semibold">Assistant advice</h2>
        {provider && (
          <span className="ml-auto inline-flex items-center rounded-full px-2.5 py-1 text-xs border border-neutral-300">
            {provider === 'bedrock' ? 'Bedrock' : provider === 'rules' ? 'Rules' : 'Preview'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600 mb-4">
        {from && <span className="px-2 py-1 rounded bg-neutral-50 border">from: {from}</span>}
        {to && <span className="px-2 py-1 rounded bg-neutral-50 border">to: {to}</span>}
        <span className="px-2 py-1 rounded bg-neutral-50 border">topN: {topN}</span>
        {exclude.length > 0 && (
          <span className="px-2 py-1 rounded bg-neutral-50 border">
            exclude: {exclude.join(', ')}
          </span>
        )}
        <button
          onClick={fetchAdvice}
          disabled={loading}
          className={`ml-auto inline-flex items-center gap-2 rounded-xl px-3 py-2 border text-white active:scale-[0.99] ${
            loading ? 'bg-neutral-400 cursor-not-allowed' : 'bg-neutral-900 hover:bg-neutral-800'
          }`}
        >
          {loading ? 'Generating…' : 'Generate advice'}
        </button>
      </div>

      <div className="rounded-xl border bg-neutral-50 p-4">
        {loading && (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-neutral-200 rounded" />
            <div className="h-4 bg-neutral-200 rounded w-11/12" />
            <div className="h-4 bg-neutral-200 rounded w-10/12" />
          </div>
        )}
        {!loading && error && <div className="text-red-600 text-sm">{error}</div>}
        {!loading && !error && message && <AssistantBubble text={message} />}
        {!loading && !error && !message && (
          <div className="text-neutral-500 text-sm">No advice yet.</div>
        )}
      </div>

      {payload ? (
        <details className="mt-3 text-sm text-neutral-600">
          <summary className="cursor-pointer select-none">Debug payload</summary>
          <pre className="mt-2 max-h-64 overflow-auto text-xs bg-neutral-100 p-3 rounded-lg">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function AssistantBubble({ text }: { text: string }) {
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }, [text]);
  return (
    <div className="relative">
      <div className="whitespace-pre-wrap leading-relaxed text-[15px] md:text-base bg-white border rounded-2xl p-4 shadow-sm">
        {text}
      </div>
      <div className="mt-2 flex justify-end">
        <button
          onClick={onCopy}
          className="text-xs px-2 py-1 rounded border bg-white hover:bg-neutral-50"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function renderLocalAdviceFromPayload(payload: AdvicePayload): string {
  const { categories, topCategory: top } = payload;
  const bullets: string[] = [];
  if (top)
    bullets.push(
      `Set a cap for ${toTitle(top.name)} (currently ${pct100(top.share)} of expenses). Target a ~10% reduction.`,
    );
  const second = categories[1];
  if (second)
    bullets.push(`Review ${toTitle(second.name)} with a small weekly budget and tracking.`);
  if (top && top.topExpenses.length > 0) {
    const e0 = top.topExpenses[0];
    bullets.push(
      `Investigate your largest line: “${e0.description}” (${fmtUSD(e0.amount, 0)}). Consider reducing, pausing, or renegotiating.`,
    );
  }
  if (bullets.length === 0)
    bullets.push('Looks balanced. Set a 10–15% savings goal and keep weekly check-ins.');
  return bullets.map((b) => `• ${b}`).join('\n');
}
function pct100(x: number) {
  const v = Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)) * 100;
  return `${v.toFixed(1)}%`;
}
function toTitle(s: string) {
  return s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
