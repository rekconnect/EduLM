import { Users, Home, Baby, History } from "lucide-react";
import type { EntityFieldsConfig, FieldDef } from "@/lib/entity-fields";
import { EditableGroup } from "./_fiche-client";
import { saveGuardianFiche, saveStudentFiche } from "./_fiche-actions";

/**
 * "Fiche famille" mirroring the Dars parent detail: père | mère parallel
 * columns + enfants + historique. Each category is its own EditableGroup —
 * a pencil edits just that block in place (no window change), routing each
 * value to its canonical column or customAnswers.
 */

// ── shaped inputs ──
export type FicheGuardian = {
  guardianId: string;
  userId: string;
  /** Raw relation key (e.g. "pere" / "mere") — drives mother-only fields. */
  relation: string;
  relationLabel: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  nationality1: string | null;
  nationality2: string | null;
  answers: Record<string, string>;
};
export type FicheStudent = {
  id: string;
  firstName: string;
  lastName: string;
  className: string | null;
  yearLabel: string | null;
  status: string;
  answers: Record<string, string>;
  parcours: Array<{ year: string; className: string; services: string }>;
};
export type FicheFamily = {
  code: string;
  addressStreet: string | null;
  addressHood: string | null;
  addressCity: string | null;
  addressCountry: string | null;
  imageRights: { site: boolean | null; book: boolean | null; social: boolean | null; radio: boolean | null };
};

function fieldsIn(config: EntityFieldsConfig, categoryName: string): FieldDef[] {
  const cat = config.categories.find((c) => c.name === categoryName);
  if (!cat) return [];
  return config.fields
    .filter((f) => f.categoryId === cat.id && f.active !== false)
    .sort((a, b) => a.order - b.order);
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="size-4 text-[color:var(--color-brand-600)]" aria-hidden />
      <h2 className="text-sm font-semibold tracking-tight text-[color:var(--color-foreground)]">
        {children}
      </h2>
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={
        "rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-5 shadow-card transition-shadow duration-200 ease-out hover:shadow-[var(--shadow-card-hover)] " +
        className
      }
    >
      {children}
    </div>
  );
}

function Initials({ first, last }: { first: string; last: string }) {
  const i = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase().trim();
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-xs font-semibold text-[color:var(--color-brand-700)]">
      {i || "·"}
    </div>
  );
}

// ── main ──
export function FamilyFiche({
  parentConfig,
  studentConfig,
  guardians,
  family,
  currentStudents,
  pastStudents,
}: {
  parentConfig: EntityFieldsConfig;
  studentConfig: EntityFieldsConfig;
  guardians: FicheGuardian[];
  family: FicheFamily;
  currentStudents: FicheStudent[];
  pastStudents: FicheStudent[];
}) {
  const pInfo = fieldsIn(parentConfig, "Info générale");
  const pContact = fieldsIn(parentConfig, "Contact");
  const pPro = fieldsIn(parentConfig, "Professionnel");
  const pAdr = fieldsIn(parentConfig, "Adresse");
  const pAr = fieldsIn(parentConfig, "Info Arabe");

  const sInfo = fieldsIn(studentConfig, "Info générale").filter((f) => !f.dossierBoundTo);
  const sSco = fieldsIn(studentConfig, "Scolarité").filter((f) => !f.dossierBoundTo);
  const sSrv = fieldsIn(studentConfig, "Services");
  const sAuth = fieldsIn(studentConfig, "Autorisations");

  const parentGroups: Array<{ title: string; fields: FieldDef[]; rtl?: boolean }> = [
    { title: "Info générale", fields: pInfo },
    { title: "Contact", fields: pContact },
    { title: "Professionnel", fields: pPro },
    { title: "Info Arabe", fields: pAr, rtl: true },
  ];
  const studentGroups: Array<{ title: string; fields: FieldDef[] }> = [
    { title: "Identité", fields: sInfo },
    { title: "Scolarité", fields: sSco },
    { title: "Services", fields: sSrv },
    { title: "Autorisations", fields: sAuth },
  ];

  const boolStr = (b: boolean | null) => (b == null ? "" : b ? "yes" : "no");
  const allParentFields = [...pInfo, ...pContact, ...pPro, ...pAr];
  const buildParentValues = (g: FicheGuardian): Record<string, string> => {
    const ev: Record<string, string> = {};
    for (const f of allParentFields) {
      if (f.userBoundTo === "firstName") ev[f.key] = g.firstName;
      else if (f.userBoundTo === "lastName") ev[f.key] = g.lastName;
      else if (f.userBoundTo === "email") ev[f.key] = g.email;
      else if (f.guardianBoundTo === "phone") ev[f.key] = g.phone ?? "";
      else if (f.guardianBoundTo === "nationality1") ev[f.key] = g.nationality1 ?? "";
      else if (f.guardianBoundTo === "nationality2") ev[f.key] = g.nationality2 ?? "";
      else if (f.familyBoundTo === "imageRightsSite") ev[f.key] = boolStr(family.imageRights.site);
      else if (f.familyBoundTo === "imageRightsBook") ev[f.key] = boolStr(family.imageRights.book);
      else if (f.familyBoundTo === "imageRightsSocial") ev[f.key] = boolStr(family.imageRights.social);
      else if (f.familyBoundTo === "imageRightsRadio") ev[f.key] = boolStr(family.imageRights.radio);
      else ev[f.key] = g.answers[f.key] ?? "";
    }
    return ev;
  };

  const father = guardians[0];
  const addressValues: Record<string, string> = {};
  for (const f of pAdr) {
    if (f.familyBoundTo === "addressStreet") addressValues[f.key] = family.addressStreet ?? "";
    else if (f.familyBoundTo === "addressCity") addressValues[f.key] = family.addressCity ?? "";
    else if (f.familyBoundTo === "addressHood") addressValues[f.key] = family.addressHood ?? "";
    else if (f.familyBoundTo === "addressCountry") addressValues[f.key] = family.addressCountry ?? "";
    else addressValues[f.key] = father?.answers[f.key] ?? "";
  }

  return (
    <div className="space-y-8">
      {/* ───── Parents — père | mère, parallèle ───── */}
      <section>
        <SectionTitle icon={Users}>Parents</SectionTitle>
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {guardians.map((g) => {
            const vals = buildParentValues(g);
            // "Actuel(le)" is a mother-only field in Dars (marks the current
            // mother vs a previous spouse). Hide it for the father / others.
            const isMother = g.relation === "mere";
            return (
              <Panel key={g.guardianId} className="space-y-5">
                <div className="flex items-center gap-3 border-b border-[color:var(--color-border-subtle)] pb-4">
                  <Initials first={g.firstName} last={g.lastName} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-[color:var(--color-foreground)]">
                      {g.firstName} {g.lastName}
                    </p>
                    <p className="text-xs font-medium text-[color:var(--color-brand-600)]">
                      {g.relationLabel}
                    </p>
                  </div>
                </div>
                {parentGroups.map((grp) => (
                  <EditableGroup
                    key={grp.title}
                    title={grp.title}
                    fields={
                      isMother
                        ? grp.fields
                        : grp.fields.filter((f) => f.key !== "actuel")
                    }
                    rtl={grp.rtl}
                    initialValues={vals}
                    onSave={saveGuardianFiche.bind(null, g.userId)}
                  />
                ))}
              </Panel>
            );
          })}
        </div>
      </section>

      {/* ───── Adresse du foyer (partagée) ───── */}
      <section>
        <SectionTitle icon={Home}>Adresse du foyer</SectionTitle>
        <Panel>
          {father ? (
            <EditableGroup
              title="Adresse"
              fields={pAdr}
              initialValues={addressValues}
              onSave={saveGuardianFiche.bind(null, father.userId)}
            />
          ) : (
            <p className="text-sm text-[color:var(--color-foreground-subtle)]">—</p>
          )}
        </Panel>
      </section>

      {/* ───── Enfants ───── */}
      <section>
        <SectionTitle icon={Baby}>Enfants</SectionTitle>
        {currentStudents.length === 0 ? (
          <Panel>
            <p className="text-sm text-[color:var(--color-foreground-subtle)]">Aucun enfant inscrit.</p>
          </Panel>
        ) : (
          <div className="space-y-4">
            {currentStudents.map((s) => (
              <Panel key={s.id} className="space-y-5">
                <div className="flex items-center justify-between gap-3 border-b border-[color:var(--color-border-subtle)] pb-3">
                  <div className="flex items-center gap-2.5">
                    <Initials first={s.firstName} last={s.lastName} />
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--color-foreground)]">
                        {s.lastName} {s.firstName}
                      </p>
                      <p className="text-xs text-[color:var(--color-foreground-muted)]">
                        {s.className ?? "—"}
                        {s.yearLabel ? ` · ${s.yearLabel}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex rounded-full bg-[color:var(--color-success-soft)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-success-soft-fg)]">
                    Inscrit
                  </span>
                </div>
                {studentGroups.map((grp) => (
                  <EditableGroup
                    key={grp.title}
                    title={grp.title}
                    fields={grp.fields}
                    initialValues={s.answers}
                    onSave={saveStudentFiche.bind(null, s.id)}
                  />
                ))}

                {s.parcours.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                      Parcours scolaire
                    </h4>
                    <ul className="overflow-hidden rounded-md border border-[color:var(--color-border-subtle)]">
                      {s.parcours.map((y, idx) => (
                        <li
                          key={y.year}
                          className={
                            "grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 px-3 py-2 text-sm " +
                            (idx % 2 ? "bg-[color:var(--color-surface-sunken)]/40" : "")
                          }
                        >
                          <span className="tabular-nums text-[color:var(--color-foreground-muted)]">
                            {y.year}
                          </span>
                          <span className="font-medium text-[color:var(--color-foreground)]">
                            {y.className}
                          </span>
                          <span className="text-xs text-[color:var(--color-foreground-subtle)]">
                            {y.services || "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Panel>
            ))}
          </div>
        )}
      </section>

      {/* ───── Historique ───── */}
      {pastStudents.length > 0 && (
        <section>
          <SectionTitle icon={History}>Historique</SectionTitle>
          <Panel>
            <ul className="divide-y divide-[color:var(--color-border-subtle)]">
              {pastStudents.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex items-center gap-2.5">
                    <Initials first={s.firstName} last={s.lastName} />
                    <span className="text-sm font-medium text-[color:var(--color-foreground)]">
                      {s.lastName} {s.firstName}
                    </span>
                  </span>
                  <span className="text-xs text-[color:var(--color-foreground-muted)]">
                    {s.className ?? "—"}
                    {s.yearLabel ? ` · ${s.yearLabel}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      )}
    </div>
  );
}
