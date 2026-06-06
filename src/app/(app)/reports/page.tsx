import Link from "next/link";
import {
  GraduationCap,
  Bus,
  PieChart,
  Users,
  FileSpreadsheet,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { requireRole } from "@/lib/session";

const REPORTS = [
  {
    href: "/reports/lists",
    icon: FileSpreadsheet,
    title: "Listes détaillées",
    desc: "Listes nominatives exportables en Excel & PDF — élèves, transport, cantine, familles, comptes parents.",
  },
  {
    href: "/reports/effectifs",
    icon: GraduationCap,
    title: "Effectifs",
    desc: "Élèves par classe, niveau et établissement · évolution des effectifs par année.",
  },
  {
    href: "/reports/services",
    icon: Bus,
    title: "Services",
    desc: "Listes transport, cantine et collation — qui utilise quoi, par année.",
  },
  {
    href: "/reports/demographie",
    icon: PieChart,
    title: "Démographie",
    desc: "Répartition par nationalité, communauté, genre et année de naissance.",
  },
  {
    href: "/reports/familles",
    icon: Users,
    title: "Familles & comptes",
    desc: "Types de famille, situations, fratries · comptes parents, emails, autorisations photo.",
  },
];

export default async function ReportsPage() {
  await requireRole("SCHOOL_ADMIN");
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
      <PageHeader title="Rapports" description="Vues d'ensemble et listes exportables de l'établissement." />
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Link
              key={r.href}
              href={r.href}
              className="group flex items-start gap-4 rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-5 shadow-card transition-all duration-200 ease-out hover:border-[color:var(--color-border-strong)] hover:shadow-[var(--shadow-card-hover)]"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
                <Icon className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
                    {r.title}
                  </h2>
                  <ArrowRight className="size-4 text-[color:var(--color-foreground-subtle)] transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-[color:var(--color-brand-600)]" aria-hidden />
                </div>
                <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
                  {r.desc}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
