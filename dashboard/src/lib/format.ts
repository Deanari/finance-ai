export function fmtUSD(n?: number | null, maxFrac: number = 0): string {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: maxFrac,
  }).format(Number(n));
}
export function pct(n: number): string {
  return `${Math.round(n)}%`;
}
export function toISODateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}
