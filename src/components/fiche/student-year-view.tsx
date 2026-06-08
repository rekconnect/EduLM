"use client";

import { useState } from "react";
import { Calendar } from "lucide-react";

/**
 * Year-aware services + authorizations for one student. Each academic year
 * shows ITS OWN data, matching how Dars registration works:
 *  - Enrolled / realized years → what was actually served (billing).
 *  - The future re-registration year → the registration form values.
 *  - PS / MS / GS → collation is obligatory (always Oui), any year.
 *
 * Transport mode (Aller/Retour), the alternate address and the photo
 * authorizations only exist on the registration form, so they come from the
 * per-year registration snapshot regardless of the year.
 */

export type ParcoursEntry = {
  year: string;
  className: string;
  level: string;
  services: string; // billing tokens, e.g. "Transport, Cantine, Collation"
};

const MATERNELLE = new Set(["PS", "MS", "GS"]);

function ynLabel(v: string | undefined): string {
  if (v === "yes") return "Oui";
  if (v === "no") return "Non";
  return "—";
}

function DefList({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="space-y-2">
      <h5 className="text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
        {title}
      </h5>
      <dl className="grid gap-x-4 gap-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-[color:var(--color-foreground-muted)]">{label}</dt>
            <dd
              className={
                "text-sm font-medium " +
                (value === "—"
                  ? "text-[color:var(--color-foreground-subtle)]"
                  : "text-[color:var(--color-foreground)]")
              }
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function StudentYearView({
  parcours,
  registrationByYear,
}: {
  parcours: ParcoursEntry[];
  registrationByYear: Record<string, Record<string, string>>;
}) {
  const enrolledYears = new Set(parcours.map((p) => p.year));
  const years = [
    ...new Set([...parcours.map((p) => p.year), ...Object.keys(registrationByYear)]),
  ].sort((a, b) => b.localeCompare(a));

  const [year, setYear] = useState(parcours[0]?.year ?? years[0] ?? "");
  if (years.length === 0) return null;

  const entry = parcours.find((p) => p.year === year);
  const reg = registrationByYear[year] ?? {};
  const enrolled = !!entry;
  const billing = entry?.services ?? "";
  const billingHas = (t: string) => billing.includes(t);
  const isMaternelle = MATERNELLE.has(entry?.level ?? "");

  // Services: enrolled year → billing (what was served); future-only year →
  // registration form. Maternelle collation is always obligatory.
  const collation = isMaternelle
    ? "Oui"
    : enrolled
      ? billingHas("Collation")
        ? "Oui"
        : "Non"
      : ynLabel(reg.collations);
  const cantine = enrolled
    ? billingHas("Cantine")
      ? "Oui"
      : "Non"
    : ynLabel(reg.repas_chaud);
  const transport = enrolled
    ? billingHas("Transport")
      ? "Oui"
      : "Non"
    : ynLabel(reg.autocar);

  const addr = [
    reg.transport_rue,
    reg.transport_immeuble,
    reg.transport_etage,
    reg.transport_village,
    reg.transport_caza,
  ]
    .filter(Boolean)
    .join(", ");

  const services: Array<[string, string]> = [
    ["Collation" + (isMaternelle ? " (obligatoire)" : ""), collation],
    ["Cantine (repas chaud)", cantine],
    ["Transport (autocar)", transport],
  ];
  if (transport === "Oui") {
    if (reg.transport_aller) services.push(["Aller", reg.transport_aller]);
    if (reg.transport_retour) services.push(["Retour", reg.transport_retour]);
    if (addr) services.push(["Adresse transport", addr]);
  }

  const auths: Array<[string, string]> = [
    ["Site internet", ynLabel(reg.auth_site)],
    ["Livre souvenir", ynLabel(reg.auth_livre)],
    ["Réseaux sociaux", ynLabel(reg.auth_reseaux)],
    ["Web radio", ynLabel(reg.auth_radio)],
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
          Services & autorisations
        </h4>
        <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-foreground-muted)]">
          <Calendar className="size-3.5" aria-hidden />
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-7 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-2 text-xs text-[color:var(--color-foreground)] transition-colors focus:border-[color:var(--color-brand-500)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand-500)]/30"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
                {enrolledYears.has(y) ? "" : " · ré-inscription"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-xs text-[color:var(--color-foreground-muted)]">
        {entry
          ? `Classe ${entry.className}`
          : "Ré-inscription — pas encore inscrit cette année"}
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <DefList title="Services" rows={services} />
        <DefList title="Autorisations" rows={auths} />
      </div>
    </div>
  );
}
