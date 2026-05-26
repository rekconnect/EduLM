import Link from "next/link";
import { ArrowLeft, History, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { unscopedDb } from "@/lib/db";
import { requireRole } from "@/lib/session";
import {
  parseTenantInscriptionFormConfig,
  type FieldOverride,
} from "@/lib/inscription-fields-resolver";
import {
  getInscriptionFieldEntry,
  type DossierFieldEntry,
} from "@/lib/inscription-fields-registry";
import { ResetOverrideButton } from "./_reset-button";

/**
 * Personnalisations actives — admin view of what's currently overridden
 * in `Tenant.inscriptionFormConfig` plus the chronological audit log of
 * every change.
 *
 * Two cards:
 *   1. Champs actuellement personnalisés — one row per field that has
 *      an override, with diff badges + last-edit timestamp + Reset.
 *   2. Historique récent — flat list of TenantConfigAuditLog rows,
 *      newest first, capped at 50.
 *
 * Both reads are tenant-scoped via unscopedDb explicit-where because
 * the auto-scoping Prisma extension doesn't apply to Tenant or its
 * direct children when fetched outside runWithTenant.
 */
export default async function InscriptionConfigOverridesPage() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  const [tenant, auditRows] = await Promise.all([
    unscopedDb().tenant.findUnique({
      where: { id: tenantId },
      select: { inscriptionFormConfig: true, name: true },
    }),
    unscopedDb().tenantConfigAuditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        fieldKey: true,
        action: true,
        previousValue: true,
        newValue: true,
        createdAt: true,
        user: { select: { email: true, name: true } },
      },
    }),
  ]);
  if (!tenant) return null;

  const config = parseTenantInscriptionFormConfig(tenant.inscriptionFormConfig);
  const overrideKeys = Object.keys(config.fields);

  // Build a "last edited at" map from the audit log so each active
  // override row can show when it was last touched. Fall back to "—"
  // when no audit row exists (e.g. override predates the audit log).
  const lastEditedByKey = new Map<string, Date>();
  for (const row of auditRows) {
    if (!lastEditedByKey.has(row.fieldKey)) {
      lastEditedByKey.set(row.fieldKey, row.createdAt);
    }
  }

  // Resolve each overridden key against the registry. Unknown keys
  // (drift between schema + registry) get a soft warning in the row.
  const activeOverrides = overrideKeys
    .map((key) => ({
      key,
      entry: getInscriptionFieldEntry(key),
      override: config.fields[key]!,
      lastEditedAt: lastEditedByKey.get(key) ?? null,
    }))
    .sort((a, b) => {
      // Sort by most-recently-edited first, then by key for stability.
      const at = a.lastEditedAt?.getTime() ?? 0;
      const bt = b.lastEditedAt?.getTime() ?? 0;
      if (at !== bt) return bt - at;
      return a.key.localeCompare(b.key);
    });

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <PageHeader
        title="Personnalisations actives"
        description={`Tous les champs actuellement personnalisés pour ${tenant.name} et l'historique récent.`}
        action={
          <Link
            href="/admin/inscription-config"
            className="inline-flex items-center gap-1.5 text-sm text-[color:var(--color-foreground-muted)] transition-colors hover:text-[color:var(--color-foreground)] hover:underline"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Configuration
          </Link>
        }
      />

      {/* ── Active overrides ── */}
      <Card>
        <CardHeader
          title={`Champs personnalisés (${activeOverrides.length})`}
          description="Différences par rapport aux libellés et règles par défaut du formulaire."
        />
        <CardBody>
          {activeOverrides.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="-mx-4 -mb-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-[color:var(--color-border-subtle)] text-[color:var(--color-foreground-muted)]">
                  <tr>
                    <th className="px-4 py-2 text-start font-medium">Champ</th>
                    <th className="px-4 py-2 text-start font-medium">
                      Personnalisation
                    </th>
                    <th className="px-4 py-2 text-start font-medium">
                      Dernière modification
                    </th>
                    <th className="px-4 py-2 text-end font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOverrides.map((row) => (
                    <tr
                      key={row.key}
                      className="border-b border-[color:var(--color-border-subtle)] last:border-0"
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-[color:var(--color-foreground)]">
                          {row.entry?.defaultLabel.fr ?? row.key}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-[color:var(--color-foreground-subtle)]">
                          {row.key}
                        </div>
                        {row.entry ? (
                          <div className="mt-0.5 text-[11px] text-[color:var(--color-foreground-muted)]">
                            {row.entry.tab} / {row.entry.section}
                            {row.entry.subSection
                              ? ` / ${row.entry.subSection}`
                              : ""}
                          </div>
                        ) : (
                          <div className="mt-0.5 text-[11px] text-[color:var(--color-warning-soft-fg)]">
                            ⚠ Clé non enregistrée (ignorée à l&apos;affichage parent)
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <OverrideBadges
                          override={row.override}
                          entry={row.entry}
                        />
                      </td>
                      <td className="px-4 py-3 align-top text-[color:var(--color-foreground-muted)]">
                        {row.lastEditedAt ? formatWhen(row.lastEditedAt) : "—"}
                      </td>
                      <td className="px-4 py-3 align-top text-end">
                        <ResetOverrideButton
                          fieldKey={row.key}
                          label={row.entry?.defaultLabel.fr ?? row.key}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Recent history ── */}
      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <History className="size-4" aria-hidden />
              Historique récent
            </span>
          }
          description={
            auditRows.length === 0
              ? "Aucune modification enregistrée."
              : `${auditRows.length} dernière(s) modification(s) — du plus récent au plus ancien.`
          }
        />
        <CardBody>
          {auditRows.length === 0 ? (
            <p className="rounded-md border border-dashed border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-6 text-center text-sm text-[color:var(--color-foreground-muted)]">
              L&apos;historique commencera à se remplir dès la première
              personnalisation.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {auditRows.map((row) => {
                const entry = getInscriptionFieldEntry(row.fieldKey);
                const displayLabel =
                  entry?.defaultLabel.fr ?? row.fieldKey;
                const actor = row.user.name ?? row.user.email ?? "—";
                return (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-[color:var(--color-border-subtle)] pb-2 last:border-0 last:pb-0"
                  >
                    <span
                      className={
                        row.action === "RESET"
                          ? "inline-flex items-center rounded-full bg-[color:var(--color-warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-warning-soft-fg)]"
                          : "inline-flex items-center rounded-full bg-[color:var(--color-brand-50)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-brand-700)]"
                      }
                    >
                      {row.action === "RESET" ? "Réinitialisé" : "Modifié"}
                    </span>
                    <span className="font-medium text-[color:var(--color-foreground)]">
                      {displayLabel}
                    </span>
                    <span className="font-mono text-[11px] text-[color:var(--color-foreground-subtle)]">
                      {row.fieldKey}
                    </span>
                    <span className="text-xs text-[color:var(--color-foreground-muted)]">
                      · par {actor}
                    </span>
                    <span className="text-xs text-[color:var(--color-foreground-muted)]">
                      · {formatWhen(row.createdAt)}
                    </span>
                    <AuditDiff
                      previousValue={row.previousValue}
                      newValue={row.newValue}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Display helpers
// ──────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-sunken)] px-4 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
        <Sparkles className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium text-[color:var(--color-foreground)]">
        Aucune personnalisation pour le moment
      </p>
      <p className="max-w-md text-xs text-[color:var(--color-foreground-muted)]">
        Vos parents voient les libellés et règles par défaut. Modifiez un champ
        depuis{" "}
        <Link
          href="/admin/inscription-config/preview"
          className="text-[color:var(--color-brand-600)] underline-offset-2 hover:underline"
        >
          l&apos;éditeur d&apos;aperçu
        </Link>{" "}
        pour qu&apos;il apparaisse ici.
      </p>
    </div>
  );
}

function OverrideBadges({
  override,
  entry,
}: {
  override: FieldOverride;
  entry: DossierFieldEntry | undefined;
}) {
  const badges: Array<{ tone: "brand" | "warning" | "danger"; text: string }> =
    [];

  if (override.label?.fr) {
    badges.push({
      tone: "brand",
      text: `Libellé FR : « ${truncate(override.label.fr, 32)} »`,
    });
  }
  if (override.label?.en) {
    badges.push({
      tone: "brand",
      text: `Label EN: « ${truncate(override.label.en, 32)} »`,
    });
  }
  if (override.label?.ar) {
    badges.push({
      tone: "brand",
      text: `AR: « ${truncate(override.label.ar, 32)} »`,
    });
  }
  if (
    typeof override.required === "boolean" &&
    (!entry || override.required !== entry.defaultRequired)
  ) {
    badges.push({
      tone: "warning",
      text: override.required ? "Obligatoire" : "Optionnel",
    });
  }
  if (override.hidden === true) {
    badges.push({ tone: "danger", text: "Masqué" });
  }

  if (badges.length === 0) {
    return (
      <span className="text-xs text-[color:var(--color-foreground-muted)]">
        — (aucune différence détectée)
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((b, i) => (
        <span
          key={i}
          className={
            b.tone === "danger"
              ? "inline-flex items-center rounded-md bg-[color:var(--color-danger-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--color-danger)]"
              : b.tone === "warning"
                ? "inline-flex items-center rounded-md bg-[color:var(--color-warning-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--color-warning-soft-fg)]"
                : "inline-flex items-center rounded-md bg-[color:var(--color-brand-50)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--color-brand-700)]"
          }
        >
          {b.text}
        </span>
      ))}
    </div>
  );
}

function AuditDiff({
  previousValue,
  newValue,
}: {
  previousValue: unknown;
  newValue: unknown;
}) {
  // Compute a short human description of what changed. For label
  // changes, show the old → new text per locale. For required/hidden
  // toggles, show the new boolean. Falls back to silent if nothing
  // recognisable changed (audit row written but values match).
  const prev = (previousValue ?? {}) as FieldOverride;
  const next = (newValue ?? {}) as FieldOverride;
  const lines: string[] = [];

  for (const locale of ["fr", "en", "ar"] as const) {
    const a = prev.label?.[locale];
    const b = next.label?.[locale];
    if (a !== b) {
      const arrow = `${quote(a)} → ${quote(b)}`;
      lines.push(`Libellé ${locale.toUpperCase()} : ${arrow}`);
    }
  }
  if (prev.required !== next.required) {
    lines.push(
      `Obligatoire : ${boolish(prev.required)} → ${boolish(next.required)}`,
    );
  }
  if (prev.hidden !== next.hidden) {
    lines.push(`Masqué : ${boolish(prev.hidden)} → ${boolish(next.hidden)}`);
  }

  if (lines.length === 0) return null;
  return (
    <span className="basis-full pt-0.5 text-[11px] text-[color:var(--color-foreground-muted)]">
      {lines.join(" · ")}
    </span>
  );
}

function quote(v: string | undefined): string {
  if (v === undefined) return "(par défaut)";
  if (v === "") return "(vide)";
  return `« ${truncate(v, 40)} »`;
}

function boolish(v: boolean | undefined): string {
  if (v === undefined) return "(par défaut)";
  return v ? "oui" : "non";
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Lightweight "relative time" formatter. Outputs FR-style strings like
 * "à l'instant" / "il y a 5 min" / "il y a 3h" / "il y a 2j". Past
 * dates only — audit log is always in the past, so we don't need the
 * future direction.
 */
function formatWhen(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 30) return "à l'instant";
  if (sec < 60) return `il y a ${sec} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `il y a ${day} j`;
  return date.toISOString().slice(0, 10);
}

