import Link from "next/link";
import { FileSpreadsheet, ArrowRight } from "lucide-react";
import { requireRole } from "@/lib/session";
import { reportGroups } from "@/lib/reports/registry";
import { ReportHeader } from "../_ui";

export default async function ReportListsPage() {
  await requireRole("SCHOOL_ADMIN");
  const groups = reportGroups();

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <ReportHeader
        title="Listes détaillées"
        description="Listes nominatives exportables en Excel et PDF — élèves, services, familles, comptes."
      />

      {groups.map((g) => (
        <section key={g.group} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
            {g.group}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.reports.map((r) => (
              <Link
                key={r.id}
                href={`/reports/lists/${r.id}`}
                className="group flex items-start gap-4 rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-4 shadow-card transition-all duration-200 ease-out hover:border-[color:var(--color-border-strong)] hover:shadow-[var(--shadow-card-hover)]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                  <FileSpreadsheet className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-[color:var(--color-foreground)]">
                      {r.title}
                    </h3>
                    <ArrowRight
                      className="size-3.5 text-[color:var(--color-foreground-subtle)] transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-[color:var(--color-brand-600)]"
                      aria-hidden
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">
                    {r.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
