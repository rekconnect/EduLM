import { requireRole } from "@/lib/session";
import { runWithTenant } from "@/lib/tenant-context";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { ReportHeader, StatTiles, BarList, toRows } from "../_ui";
import { ExportCsvButton } from "../_export";

const PLACEHOLDER_DOMAIN = "@import.lyceemontaigne.local";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Actifs",
  INVITED: "Invités",
  DISABLED: "Désactivés",
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
const relRank = (r: string | null) =>
  r === "pere" ? 0 : r === "mere" ? 1 : 2;

export default async function FamillesReport() {
  const user = await requireRole("SCHOOL_ADMIN");
  const tenantId = user.tenantId;
  if (!tenantId) return null;

  return runWithTenant({ tenantId, slug: null }, async () => {
    const [families, parentStatus, totalParents, placeholderEmails] =
      await Promise.all([
        db.family.findMany({
          select: {
            id: true,
            imageRightsSite: true,
            imageRightsBook: true,
            imageRightsSocial: true,
            imageRightsRadio: true,
            guardians: {
              select: {
                relation: true,
                user: { select: { status: true, customAnswers: true } },
              },
            },
            _count: { select: { students: true } },
          },
        }),
        db.user.groupBy({
          by: ["status"],
          where: { role: "PARENT" },
          _count: { _all: true },
        }),
        db.user.count({ where: { role: "PARENT" } }),
        db.user.count({
          where: { role: "PARENT", email: { endsWith: PLACEHOLDER_DOMAIN } },
        }),
      ]);

    // Representative guardian value per family (père first).
    const repValue = (
      guardians: { relation: string | null; user: { customAnswers: unknown } }[],
      key: string,
    ): string => {
      const ordered = [...guardians].sort(
        (a, b) => relRank(a.relation) - relRank(b.relation),
      );
      for (const g of ordered) {
        const v = str((g.user.customAnswers as Record<string, unknown>)?.[key]);
        if (v) return v;
      }
      return "";
    };

    const typeFamille = new Map<string, number>();
    const situation = new Map<string, number>();
    const sizeDist = new Map<string, number>();
    const imageRights = {
      site: { yes: 0, no: 0, na: 0 },
      book: { yes: 0, no: 0, na: 0 },
      social: { yes: 0, no: 0, na: 0 },
      radio: { yes: 0, no: 0, na: 0 },
    };
    let activeFamilies = 0;

    const tally = (b: { yes: number; no: number; na: number }, v: boolean | null) => {
      if (v === true) b.yes++;
      else if (v === false) b.no++;
      else b.na++;
    };

    for (const f of families) {
      const tf = repValue(f.guardians, "type_famille") || "Non renseigné";
      typeFamille.set(tf, (typeFamille.get(tf) ?? 0) + 1);

      const sit = repValue(f.guardians, "situation_famille") || "Non renseignée";
      situation.set(sit, (situation.get(sit) ?? 0) + 1);

      const n = f._count.students;
      const bucket = n >= 4 ? "4 +" : String(n);
      sizeDist.set(bucket, (sizeDist.get(bucket) ?? 0) + 1);

      if (f.guardians.some((g) => g.user.status === "ACTIVE")) activeFamilies++;

      tally(imageRights.site, f.imageRightsSite);
      tally(imageRights.book, f.imageRightsBook);
      tally(imageRights.social, f.imageRightsSocial);
      tally(imageRights.radio, f.imageRightsRadio);
    }

    const statusCounts = new Map<string, number>(
      parentStatus.map((s) => [String(s.status), s._count._all]),
    );
    const activeAccounts = statusCounts.get("ACTIVE") ?? 0;
    const realEmails = totalParents - placeholderEmails;

    const imageRows = [
      { key: "Site internet", b: imageRights.site },
      { key: "Livre souvenir", b: imageRights.book },
      { key: "Réseaux sociaux", b: imageRights.social },
      { key: "Web radio", b: imageRights.radio },
    ];

    const sizeRows = [...sizeDist.entries()]
      .map(([label, value]) => ({ label: `${label} enfant(s)`, value }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));

    return (
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <ReportHeader
          title="Familles & comptes"
          description="Types de famille, situations, fratries et comptes parents."
        />

        <StatTiles
          items={[
            { label: "Familles", value: families.length },
            { label: "Comptes parents", value: totalParents },
            { label: "Comptes actifs", value: activeAccounts },
            { label: "Emails réels", value: realEmails },
          ]}
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">
                Type de famille
              </h2>
              <ExportCsvButton
                filename="familles-types"
                headers={["Type", "Familles"]}
                rows={toRows(typeFamille).map((r) => [r.label, r.value])}
              />
            </div>
            <BarList title="Répartition par type" rows={toRows(typeFamille)} />
          </section>

          <BarList title="Situation familiale" rows={toRows(situation)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <BarList
            title="Statut des comptes parents"
            rows={["ACTIVE", "INVITED", "DISABLED"].map((s) => ({
              label: STATUS_LABELS[s] ?? s,
              value: statusCounts.get(s) ?? 0,
            }))}
          />
          <BarList title="Nombre d'enfants par famille" rows={sizeRows} />
        </div>

        {/* Autorisations photo */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[color:var(--color-foreground)]">
              Autorisations photo (par famille)
            </h2>
            <ExportCsvButton
              filename="familles-autorisations-photo"
              headers={["Autorisation", "Oui", "Non", "Non renseigné"]}
              rows={imageRows.map((r) => [r.key, r.b.yes, r.b.no, r.b.na])}
            />
          </div>
          <Table>
            <THead>
              <TR>
                <TH className="text-start">Autorisation</TH>
                <TH className="text-end">Oui</TH>
                <TH className="text-end">Non</TH>
                <TH className="text-end">Non renseigné</TH>
              </TR>
            </THead>
            <tbody>
              {imageRows.map((r) => (
                <TR key={r.key}>
                  <TD className="font-medium">{r.key}</TD>
                  <TD className="text-end tabular-nums text-[color:var(--color-success-soft-fg)]">
                    {r.b.yes}
                  </TD>
                  <TD className="text-end tabular-nums">{r.b.no}</TD>
                  <TD className="text-end tabular-nums text-[color:var(--color-foreground-subtle)]">
                    {r.b.na}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </section>
      </main>
    );
  });
}
