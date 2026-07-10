"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Calendar, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { setActiveYear } from "@/app/(app)/admin/years/_actions";

export type YearSwitcherOption = { id: string; label: string };

/**
 * Global academic-year switcher (SCHOOL_ADMIN only) — lives in the sidebar so
 * it's reachable from every section. Selecting a year flips the tenant's
 * ACTIVE year (AcademicYear.isActive) and refreshes, which re-scopes the whole
 * app (dashboard counts, class/enrollment lists, transport, fiche defaults…)
 * since everything keys off the active year. Same effect as the "Rendre active"
 * button on /admin/years, surfaced everywhere.
 */
export function YearSwitcher({
  years,
  activeId,
  activeLabel,
  collapsed,
}: {
  years: YearSwitcherOption[];
  activeId: string;
  activeLabel: string;
  collapsed: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();

  function choose(id: string) {
    if (id === activeId || pending) return;
    start(async () => {
      await setActiveYear(id);
      // Drop any per-section year filter (?yearId=/?classId=) so the dropdowns
      // inside Élèves / Parents / Classes follow the newly-selected year
      // instead of staying on a previously-picked one.
      const next = new URLSearchParams(searchParams.toString());
      next.delete("yearId");
      next.delete("classId");
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
      router.refresh();
      const y = years.find((x) => x.id === id);
      toast.success(`Année scolaire active : ${y?.label ?? ""}`);
    });
  }

  const trigger = collapsed ? (
    <button
      type="button"
      title={`Année scolaire : ${activeLabel}`}
      aria-label={`Année scolaire : ${activeLabel}`}
      className="flex w-full items-center justify-center rounded-md py-2 text-[color:var(--sidebar-muted)] transition-colors hover:bg-[color:var(--sidebar-hover-bg)] hover:text-[color:var(--sidebar-fg)]"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Calendar className="size-4" aria-hidden />
      )}
    </button>
  ) : (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md border border-[color:var(--sidebar-border)] bg-[color:var(--sidebar-hover-bg)]/40 px-3 py-1.5 text-start text-sm text-[color:var(--sidebar-fg)] transition-colors hover:border-[color:var(--sidebar-muted)]/40 hover:bg-[color:var(--sidebar-hover-bg)]"
    >
      {pending ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-[color:var(--sidebar-muted)]" aria-hidden />
      ) : (
        <Calendar className="size-3.5 shrink-0 text-[color:var(--sidebar-muted)]" aria-hidden />
      )}
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[color:var(--sidebar-muted)]">
          Année scolaire
        </span>
        <span className="truncate font-medium">{activeLabel}</span>
      </span>
      <ChevronsUpDown className="size-3.5 shrink-0 text-[color:var(--sidebar-muted)]" aria-hidden />
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={collapsed ? "right" : "bottom"}
        className="w-56"
      >
        <DropdownMenuLabel>Changer l&apos;année active</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {years.map((y) => (
          <DropdownMenuItem
            key={y.id}
            onSelect={() => choose(y.id)}
            className="gap-2"
          >
            <Check
              className={cn("size-4", y.id === activeId ? "opacity-100" : "opacity-0")}
              aria-hidden
            />
            <span className="flex-1">{y.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
