export default function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}
