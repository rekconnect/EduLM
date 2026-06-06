import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

export function ReportHeader({ title, description }: { title: string; description?: string }) {
  return (
    <PageHeader
      title={title}
      description={description}
      action={
        <Link
          href="/reports"
          className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Rapports
        </Link>
      }
    />
  );
}

export function StatTiles({ items }: { items: Array<{ label: string; value: number | string }> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((s) => (
        <div
          key={s.label}
          className="rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-4 shadow-card"
        >
          <p className="text-2xl font-semibold tabular-nums text-[color:var(--color-foreground)]">
            {s.value}
          </p>
          <p className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

/** Horizontal proportional bar list for a category breakdown. */
export function BarList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <section className="rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-5 shadow-card">
      <h2 className="mb-4 text-sm font-semibold text-[color:var(--color-foreground)]">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[color:var(--color-foreground-subtle)]">Aucune donnée.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[10rem_1fr_4rem] items-center gap-3">
              <span className="truncate text-sm text-[color:var(--color-foreground)]">{r.label}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-[color:var(--color-surface-sunken)]">
                <span
                  className="block h-full rounded-full bg-[color:var(--color-brand-500)] transition-[width] duration-200 ease-out"
                  style={{ width: `${(r.value / max) * 100}%` }}
                />
              </span>
              <span className="text-end text-sm tabular-nums text-[color:var(--color-foreground-muted)]">
                {r.value}
                {total > 0 ? (
                  <span className="ms-1 text-xs text-[color:var(--color-foreground-subtle)]">
                    {Math.round((r.value / total) * 100)}%
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Build a sorted {label,value} list from a string→count map. */
export function toRows(
  counts: Map<string, number>,
  opts?: { limit?: number; emptyLabel?: string },
): Array<{ label: string; value: number }> {
  const rows = [...counts.entries()]
    .map(([label, value]) => ({ label: label || (opts?.emptyLabel ?? "—"), value }))
    .sort((a, b) => b.value - a.value);
  return opts?.limit ? rows.slice(0, opts.limit) : rows;
}
