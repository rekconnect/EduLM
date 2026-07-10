"use client";

import { useState, useTransition } from "react";
import { Calendar, Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input, Select } from "@/components/ui/input";

/**
 * Year-aware services + authorizations for one student. Each academic year
 * shows ITS OWN data, matching how Dars registration works:
 *  - Enrolled / realized years → what was actually served (billing).
 *  - The future re-registration year → the registration form values.
 *  - PS / MS / GS → collation is obligatory (always Oui), any year.
 *
 * Transport mode (Aller/Retour), the alternate address and the photo
 * authorizations only exist on the registration form, so they come from the
 * per-year registration snapshot regardless of the year — and, when an
 * `onSaveYear` action is supplied, are editable per year (a pencil that writes
 * back into registration_by_year[<year>], never the single value).
 *
 * Transport has a root "bus" flag (autocar): Oui → the Aller/Retour legs,
 * alternate address and pickup person apply; Non → none of them do.
 */

export type ParcoursEntry = {
  year: string;
  className: string;
  level: string;
  services: string; // billing tokens, e.g. "Transport, Cantine, Collation"
  isActive: boolean; // the tenant's current academic year → default selection
};

// Collation is only offered up to CM2 — never in collège / lycée (6ème+).
const COLLATION_LEVELS = new Set([
  "PS",
  "MS",
  "GS",
  "CP",
  "CE1",
  "CE2",
  "CM1",
  "CM2",
]);

// Per-year, editable registration fields (stored in registration_by_year).
const MODE_OPTS = ["Avec bus", "Avec parent"];
const ADDR_FIELDS: Array<[string, string]> = [
  ["transport_rue", "Rue"],
  ["transport_immeuble", "Immeuble"],
  ["transport_etage", "Étage"],
  ["transport_village", "Village / localité"],
  ["transport_caza", "Caza"],
];
const AUTH_FIELDS: Array<[string, string]> = [
  ["auth_site", "Site internet"],
  ["auth_livre", "Livre souvenir"],
  ["auth_reseaux", "Réseaux sociaux"],
  ["auth_radio", "Web radio"],
  ["quitter_seul", "Autorisé à quitter seul"],
];
// Commute details that only exist when the bus flag is "yes".
const TRANSPORT_DETAIL_KEYS = [
  "transport_aller",
  "transport_retour",
  "transport_adresse_diff",
  ...ADDR_FIELDS.map(([k]) => k),
  "transport_person",
];
const EDIT_KEYS = [
  "autocar",
  ...TRANSPORT_DETAIL_KEYS,
  ...AUTH_FIELDS.map(([k]) => k),
];

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

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-[color:var(--color-foreground-muted)]">{label}</span>
      {children}
    </label>
  );
}

export function StudentYearView({
  parcours,
  registrationByYear,
  fallback = {},
  onSaveYear,
}: {
  parcours: ParcoursEntry[];
  registrationByYear: Record<string, Record<string, string>>;
  /** Single-value consent fields (most-recently-answered) — used as a fallback
   *  for enrolled years whose own registration row didn't carry the value. */
  fallback?: Record<string, string>;
  /** When supplied, each year gets a pencil; saving merges the edited fields
   *  into registration_by_year[<year>]. */
  onSaveYear?: (
    year: string,
    fields: Record<string, string>,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const enrolledYears = new Set(parcours.map((p) => p.year));
  const years = [
    ...new Set([...parcours.map((p) => p.year), ...Object.keys(registrationByYear)]),
  ].sort((a, b) => b.localeCompare(a));

  // Default to the CURRENT (active) year — not the newest, which is next year's
  // pre-registration draft. Falls back to newest when the pupil isn't enrolled
  // in the active year (e.g. a brand-new student only in next year).
  const [year, setYear] = useState(
    parcours.find((p) => p.isActive)?.year ?? parcours[0]?.year ?? years[0] ?? "",
  );
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  if (years.length === 0) return null;

  const entry = parcours.find((p) => p.year === year);
  const reg = registrationByYear[year] ?? {};
  const enrolled = !!entry;
  const billing = entry?.services ?? "";
  const billingHas = (t: string) => billing.includes(t);
  const level = entry?.level ?? "";
  const collationOffered = COLLATION_LEVELS.has(level);

  // Services: enrolled year → billing/accounting (the authoritative semester
  // list synced into services_by_year); future-only year → registration form.
  // Collation is never offered after CM2; otherwise it is exactly what the
  // accounting list says — no maternelle "obligatoire" override, the list is
  // the source of truth (a PS pupil off the list shows Non).
  const collation = enrolled
    ? collationOffered && billingHas("Collation")
      ? "Oui"
      : "Non"
    : ynLabel(reg.collations);
  const cantine = enrolled
    ? billingHas("Cantine")
      ? "Oui"
      : "Non"
    : ynLabel(reg.repas_chaud);
  // Auth + pickup person are stable consents → fall back to the single value
  // for enrolled years. Transport mode / address are YEAR-SPECIFIC → no
  // fallback (never show another year's commute mode against this year).
  const regOr = (key: string) =>
    reg[key] || (enrolled ? (fallback[key] ?? "") : "");
  const regYear = (key: string) => reg[key] ?? "";

  // Transport: the root "bus" flag (autocar) is the source of truth when set;
  // otherwise billing decides for an enrolled year. Bus = Non → no legs shown.
  const autocarFlag = regYear("autocar");
  const transport =
    autocarFlag === "yes"
      ? "Oui"
      : autocarFlag === "no"
        ? "Non"
        : enrolled
          ? billingHas("Transport")
            ? "Oui"
            : "Non"
          : "—";
  const busOn = transport === "Oui";

  const aller = regYear("transport_aller");
  const retour = regYear("transport_retour");
  const addr = ADDR_FIELDS.map(([k]) => k)
    .map(regYear)
    .filter(Boolean)
    .join(", ");

  const services: Array<[string, string]> = [
    ["Collation", collation],
    ["Cantine (repas chaud)", cantine],
    ["Transport (bus)", transport],
  ];
  // Aller/Retour, the alternate address and the pickup person only apply when
  // the bus is used — Transport "Non" shows nothing further.
  if (busOn) {
    if (aller) services.push(["Aller", aller]);
    if (retour) services.push(["Retour", retour]);
    if (addr) services.push(["Adresse transport", addr]);
    if (regOr("transport_person"))
      services.push([
        "Personne autorisée à récupérer",
        regOr("transport_person"),
      ]);
  }

  const auths: Array<[string, string]> = AUTH_FIELDS.map(([k, label]) => [
    label,
    ynLabel(regOr(k)),
  ]);

  // ── Editing ──────────────────────────────────────────────────
  function seed(forYear: string): Record<string, string> {
    const r = registrationByYear[forYear] ?? {};
    const p = parcours.find((x) => x.year === forYear);
    const isEnrolled = !!p;
    const billingTransport = (p?.services ?? "").includes("Transport");
    const f: Record<string, string> = {};
    for (const k of EDIT_KEYS) {
      // Auth + pickup person fall back to the single value; transport mode /
      // address are year-specific (no fallback).
      const useFallback =
        k.startsWith("auth_") || k === "quitter_seul" || k === "transport_person";
      f[k] = useFallback
        ? r[k] || (isEnrolled ? (fallback[k] ?? "") : "")
        : (r[k] ?? "");
    }
    // Bus flag: explicit registration value, else infer from billing for an
    // enrolled year so the toggle starts on the right state.
    f.autocar = r.autocar || (isEnrolled && billingTransport ? "yes" : "");
    // Restauration: editable now — seeded from billing for enrolled years,
    // from the registration answers otherwise. Saved back into BOTH
    // services_by_year (module Cantine) and the registration keys.
    const lvlHasCollation = COLLATION_LEVELS.has(p?.level ?? "");
    f.svc_collation = isEnrolled
      ? lvlHasCollation && (p?.services ?? "").includes("Collation")
        ? "yes"
        : "no"
      : (r.collations ?? "");
    f.svc_cantine = isEnrolled
      ? (p?.services ?? "").includes("Cantine")
        ? "yes"
        : "no"
      : (r.repas_chaud ?? "");
    return f;
  }
  function openEdit() {
    setForm(seed(year));
    setEditing(true);
  }
  function changeYear(y: string) {
    setYear(y);
    if (editing) setForm(seed(y));
  }
  function set(k: string, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  function save() {
    if (!onSaveYear) return;
    const payload = { ...form };
    // Bus = Non → drop every commute detail so nothing stale lingers.
    if (payload.autocar !== "yes") {
      for (const k of TRANSPORT_DETAIL_KEYS) payload[k] = "";
    }
    start(async () => {
      const r = await onSaveYear(year, payload);
      if (r.ok) {
        toast.success("Enregistré");
        setEditing(false);
      } else {
        toast.error("Échec de l'enregistrement");
      }
    });
  }

  const busEditOn = form.autocar === "yes";
  const showAddr = form.transport_adresse_diff === "yes";

  const YesNo = ({ k }: { k: string }) => (
    <Select value={form[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
      <option value="">—</option>
      <option value="yes">Oui</option>
      <option value="no">Non</option>
    </Select>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
          Services & autorisations
        </h4>
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-foreground-muted)]">
            <Calendar className="size-3.5" aria-hidden />
            <select
              value={year}
              onChange={(e) => changeYear(e.target.value)}
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
          {onSaveYear ? (
            editing ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                  aria-label="Annuler"
                  className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-muted)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={pending}
                  className="inline-flex h-6 items-center gap-1 rounded bg-[color:var(--color-brand-600)] px-2 text-xs font-medium text-[color:var(--color-foreground-onbrand)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-brand-700)] disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : (
                    <Check className="size-3" aria-hidden />
                  )}
                  OK
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={openEdit}
                aria-label={`Modifier ${year}`}
                className="inline-flex size-6 items-center justify-center rounded text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
              >
                <Pencil className="size-3" aria-hidden />
              </button>
            )
          ) : null}
        </div>
      </div>

      <p className="text-xs text-[color:var(--color-foreground-muted)]">
        {entry
          ? `Classe ${entry.className}`
          : "Ré-inscription — pas encore inscrit cette année"}
      </p>

      {editing ? (
        <div className="space-y-5">
          <div className="space-y-3">
            <h5 className="text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
              Restauration
            </h5>
            <div className="grid gap-3 sm:grid-cols-2">
              {collationOffered || !enrolled ? (
                <FieldLabel label="Collation">
                  <YesNo k="svc_collation" />
                </FieldLabel>
              ) : null}
              <FieldLabel label="Cantine (repas chaud)">
                <YesNo k="svc_cantine" />
              </FieldLabel>
            </div>
          </div>
          <div className="space-y-3">
            <h5 className="text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
              Transport
            </h5>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldLabel label="Transport (bus)">
                <YesNo k="autocar" />
              </FieldLabel>
              {busEditOn ? (
                <>
                  <FieldLabel label="Aller">
                    <Select
                      value={form.transport_aller ?? ""}
                      onChange={(e) => set("transport_aller", e.target.value)}
                    >
                      <option value="">—</option>
                      {MODE_OPTS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  </FieldLabel>
                  <FieldLabel label="Retour">
                    <Select
                      value={form.transport_retour ?? ""}
                      onChange={(e) => set("transport_retour", e.target.value)}
                    >
                      <option value="">—</option>
                      {MODE_OPTS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  </FieldLabel>
                  <FieldLabel label="Personne autorisée à récupérer">
                    <Input
                      value={form.transport_person ?? ""}
                      onChange={(e) => set("transport_person", e.target.value)}
                    />
                  </FieldLabel>
                  <FieldLabel label="Adresse différente du domicile ?">
                    <YesNo k="transport_adresse_diff" />
                  </FieldLabel>
                  {showAddr
                    ? ADDR_FIELDS.map(([k, label]) => (
                        <FieldLabel key={k} label={label}>
                          <Input
                            value={form[k] ?? ""}
                            onChange={(e) => set(k, e.target.value)}
                          />
                        </FieldLabel>
                      ))
                    : null}
                </>
              ) : null}
            </div>
          </div>
          <div className="space-y-3">
            <h5 className="text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
              Autorisations
            </h5>
            <div className="grid gap-3 sm:grid-cols-2">
              {AUTH_FIELDS.map(([k, label]) => (
                <FieldLabel key={k} label={label}>
                  <YesNo k={k} />
                </FieldLabel>
              ))}
            </div>
          </div>
          <p className="text-xs text-[color:var(--color-foreground-subtle)]">
            Collation et cantine sont synchronisées avec le module Cantine —
            une modification ici met à jour sa liste aussi.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <DefList title="Services" rows={services} />
          <DefList title="Autorisations" rows={auths} />
        </div>
      )}
    </div>
  );
}
