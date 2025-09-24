export function clsx(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(' ');
}
export function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const BAR_COLORS = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-indigo-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-violet-500',
  'bg-lime-500',
];
export function colorFor(label: string): string {
  return BAR_COLORS[strHash(label) % BAR_COLORS.length];
}
