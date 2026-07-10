"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GraduationCap, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { promoteYear } from "../../_actions";

type Student = { id: string; name: string; from: string; to: string };

export function PromoteClient({
  targetYearId,
  targetLabel,
  sourceLabel,
  promotable,
  graduating,
  alreadyCount,
}: {
  targetYearId: string;
  targetLabel: string;
  sourceLabel: string;
  promotable: Student[];
  graduating: number;
  alreadyCount: number;
}) {
  const router = useRouter();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return promotable.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 40);
  }, [query, promotable]);

  const excludedList = useMemo(
    () => promotable.filter((s) => excluded.has(s.id)),
    [excluded, promotable],
  );
  const willPromote = promotable.length - excluded.size;

  function confirm() {
    start(async () => {
      const r = await promoteYear(targetYearId, [...excluded]);
      if (r.ok) {
        toast.success(
          `${r.promoted} élève(s) promu(s) vers ${targetLabel} · ${r.graduated} diplômé(s)`,
        );
        router.push("/admin/years");
        router.refresh();
      } else {
        toast.error(
          r.error === "no-source"
            ? "Aucune année précédente à promouvoir."
            : "Échec de la promotion.",
        );
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="À promouvoir" value={willPromote} tone="brand" />
        <Stat label="Exclus" value={excluded.size} tone="muted" />
        <Stat label={`Diplômés (Tle)`} value={graduating} tone="muted" />
        <Stat label="Déjà inscrits" value={alreadyCount} tone="muted" />
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div>
            <p className="text-sm font-medium text-[color:var(--color-foreground)]">
              Exceptions — élèves qui ne montent pas de niveau
            </p>
            <p className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">
              Par défaut, tous les élèves de {sourceLabel} montent d'un niveau.
              Cherchez et décochez les redoublants. Les Terminales sont
              automatiquement diplômées, et les élèves déjà inscrits en{" "}
              {targetLabel} ne sont pas touchés.
            </p>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-[color:var(--color-foreground-subtle)]"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un élève à exclure…"
              className="ps-9"
            />
          </div>

          {query.trim() ? (
            matches.length === 0 ? (
              <p className="text-sm text-[color:var(--color-foreground-muted)]">
                Aucun élève promouvable ne correspond.
              </p>
            ) : (
              <ul className="divide-y divide-[color:var(--color-border-subtle)] rounded-md border border-[color:var(--color-border-subtle)]">
                {matches.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-[color:var(--color-surface-sunken)]">
                      <input
                        type="checkbox"
                        checked={!excluded.has(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      <span className="flex-1 font-medium">{s.name}</span>
                      <span className="tabular-nums text-xs text-[color:var(--color-foreground-muted)]">
                        {s.from} → {s.to}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {excludedList.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {excludedList.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className="inline-flex items-center gap-1 rounded-full bg-[color:var(--color-surface-sunken)] px-2.5 py-1 text-xs font-medium text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)]"
                >
                  {s.name}
                  <X className="size-3" aria-hidden />
                </button>
              ))}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-xs text-[color:var(--color-foreground-muted)]">
          <GraduationCap className="size-4" aria-hidden />
          Sections assignées aléatoirement — à ajuster ensuite.
        </p>
        <Button
          type="button"
          onClick={confirm}
          disabled={pending || willPromote <= 0}
          className="gap-2"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {pending
            ? "Promotion…"
            : `Promouvoir ${willPromote} élève(s) vers ${targetLabel}`}
        </Button>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "brand" | "muted";
}) {
  return (
    <div className="rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-2.5">
      <div
        className={`text-xl font-semibold tabular-nums ${
          tone === "brand"
            ? "text-[color:var(--color-brand-600)]"
            : "text-[color:var(--color-foreground)]"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-[color:var(--color-foreground-muted)]">
        {label}
      </div>
    </div>
  );
}
