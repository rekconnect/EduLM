import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  IdCard,
  BookOpen,
  Bus,
  Languages,
  Users,
  Baby,
  CalendarDays,
  ArrowRight,
  ShieldCheck,
  GraduationCap,
  HeartPulse,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FicheTabs, type FicheTab } from "@/components/fiche/fiche-tabs";
import { EditableGroup } from "@/components/fiche/editable-group";
import { StudentYearView } from "@/components/fiche/student-year-view";
import {
  AuthorizedPersons,
  type AuthorizedPerson,
} from "@/components/fiche/authorized-persons";
import { PedagogicalInfo } from "@/components/fiche/pedagogical-info";
import { fieldsForLevel } from "@/components/fiche/pedagogical-fields";
import {
  MedicalSection,
  type MedicalRecordData,
  type ImmunizationData,
  type VisitData,
} from "@/components/fiche/medical-section";
import type { EntityFieldsConfig, FieldDef } from "@/lib/entity-fields";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import {
  deleteStudent,
  saveAuthorizedPersons,
  saveStudentFicheFields,
  saveStudentIdentity,
  saveStudentMedicalRecord,
  saveStudentRegistrationYear,
} from "../_actions";
import { StudentIdentitySection, type StudentIdentity } from "./_identity-card";
import { GuardianManager, type ParentOption } from "./_guardian-link";
import { loadEntityFieldsConfig } from "../../settings/_actions";
import { ArabicFicheView, type ArabicSection } from "./_arabic-view";

/** Custom student fields for one category (excludes dossier-bound mirrors). */
function fieldsInCat(config: EntityFieldsConfig, name: string): FieldDef[] {
  const cat = config.categories.find((c) => c.name === name);
  if (!cat) return [];
  return config.fields
    .filter(
      (f) => f.categoryId === cat.id && f.active !== false && !f.dossierBoundTo,
    )
    .sort((a, b) => a.order - b.order);
}

function toAnswers(ca: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (ca && typeof ca === "object") {
    for (const [k, v] of Object.entries(ca as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
      else if (v != null) out[k] = String(v);
    }
  }
  return out;
}

/** Parse the authorized-persons / emergency-contacts list off a guardian. */
function parsePersons(ca: unknown): AuthorizedPerson[] {
  if (!ca || typeof ca !== "object") return [];
  const raw = (ca as Record<string, unknown>).authorized_persons;
  if (typeof raw !== "string") return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((p) => ({
        relation: String(p?.relation ?? ""),
        name: String(p?.name ?? ""),
        phone: String(p?.phone ?? ""),
        emergency: !!p?.emergency,
      }))
      .filter((p) => p.name);
  } catch {
    return [];
  }
}

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return withTenantSession(async (user) => {
    const t = await getTranslations("students");
    const tCommon = await getTranslations("common");

    const [student, availableParentsRaw, studentFieldsConfig] =
      await Promise.all([
        db.student.findUnique({
          where: { id },
          include: {
            family: { select: { code: true } },
            guardianLinks: {
              include: {
                guardian: {
                  select: {
                    id: true,
                    userId: true,
                    relation: true,
                    user: {
                      select: { email: true, name: true, customAnswers: true },
                    },
                  },
                },
              },
            },
            enrollments: {
              include: {
                class: { select: { name: true, level: true } },
                academicYear: {
                  select: { label: true, isActive: true, startDate: true },
                },
              },
              orderBy: { academicYear: { startDate: "desc" } },
            },
          },
        }),
        db.user.findMany({
          where: { role: "PARENT", status: { in: ["ACTIVE", "INVITED"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true },
        }),
        loadEntityFieldsConfig("student"),
      ]);

    if (!student) notFound();

    // Siblings = other students in the same family.
    const siblings = student.familyId
      ? await db.student.findMany({
          where: { familyId: student.familyId, NOT: { id } },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            status: true,
            enrollments: {
              where: { academicYear: { isActive: true } },
              select: { class: { select: { name: true } } },
              take: 1,
            },
          },
        })
      : [];

    // Medical data — sensitive, only loaded (and the tab only shown) for admins.
    const isAdmin = user.role === "SCHOOL_ADMIN";
    const [medRecord, medImms, medVisits] = isAdmin
      ? await Promise.all([
          db.studentMedicalRecord.findUnique({ where: { studentId: id } }),
          db.studentImmunization.findMany({
            where: { studentId: id },
            orderBy: { darsImmunizationId: "asc" },
          }),
          db.medicalVisit.findMany({
            where: { studentId: id },
            orderBy: { visitDate: "desc" },
          }),
        ])
      : [null, [], []];

    const initialStudentAnswers = toAnswers(student.customAnswers);

    // Per-year billing services + registration snapshots → year-aware view.
    let servicesByYear: Record<string, string> = {};
    let registrationByYear: Record<string, Record<string, string>> = {};
    try {
      if (initialStudentAnswers.services_by_year)
        servicesByYear = JSON.parse(initialStudentAnswers.services_by_year);
    } catch {
      /* ignore */
    }
    try {
      if (initialStudentAnswers.registration_by_year)
        registrationByYear = JSON.parse(
          initialStudentAnswers.registration_by_year,
        );
    } catch {
      /* ignore */
    }
    const parcours = student.enrollments.map((e) => ({
      year: e.academicYear.label,
      className: e.class.name,
      level: e.class.level,
      services: servicesByYear[e.academicYear.label] ?? "",
    }));

    // Active-year level drives the level-aware "Renseignements pédagogiques".
    const activeLevel =
      student.enrollments.find((e) => e.academicYear.isActive)?.class.level ??
      student.enrollments[0]?.class.level ??
      "";

    // Bus assignment (set by the bus admin on /transport) — read-only here.
    // Per-trimester storage (bus_periods JSON): show the active year's latest
    // trimester that has data; fall back to the pre-period flat keys.
    const activeYearLabel =
      student.enrollments.find((e) => e.academicYear.isActive)?.academicYear
        .label ?? "";
    let busPeriod: Record<string, string> = {};
    let busPeriodLabel = "";
    try {
      const periods = JSON.parse(
        initialStudentAnswers.bus_periods ?? "{}",
      ) as Record<string, Record<string, string>>;
      for (const t of ["T3", "T2", "T1"]) {
        const p = periods[`${activeYearLabel}|${t}`];
        if (p && (p.as === "yes" || p.rs === "yes")) {
          busPeriod = p;
          busPeriodLabel = `Trimestre ${t.slice(1)}`;
          break;
        }
      }
    } catch {
      /* ignore */
    }
    if (!busPeriodLabel && (initialStudentAnswers.bus_as || initialStudentAnswers.bus_rs)) {
      busPeriod = {
        as: initialStudentAnswers.bus_as ?? "",
        rs: initialStudentAnswers.bus_rs ?? "",
        car_matin: initialStudentAnswers.bus_car_matin ?? "",
        zone_matin: initialStudentAnswers.bus_zone_matin ?? "",
        station_matin: initialStudentAnswers.bus_station_matin ?? "",
        car_soir: initialStudentAnswers.bus_car_soir ?? "",
        zone_soir: initialStudentAnswers.bus_zone_soir ?? "",
        station_soir: initialStudentAnswers.bus_station_soir ?? "",
        remarques: initialStudentAnswers.bus_remarques ?? "",
      };
      busPeriodLabel = "Trimestre 3";
    }
    const matinParts = [
      busPeriod.car_matin ? `Bus ${busPeriod.car_matin}` : "",
      busPeriod.zone_matin,
      busPeriod.station_matin,
    ].filter(Boolean);
    const soirParts = [
      busPeriod.car_soir ? `Bus ${busPeriod.car_soir}` : "",
      busPeriod.zone_soir,
      busPeriod.station_soir,
    ].filter(Boolean);
    const busInfo = (
      [
        ["Période", busPeriodLabel],
        [
          "AS — Aller (matin)",
          busPeriod.as === "yes" ? matinParts.join(" · ") || "Oui" : "",
        ],
        [
          "RS — Retour (soir)",
          busPeriod.rs === "yes" ? soirParts.join(" · ") || "Oui" : "",
        ],
        ["Remarques", busPeriod.remarques],
      ] as Array<[string, string | undefined]>
    ).filter(([, v]) => v && v.trim()) as Array<[string, string]>;

    const generalFields = fieldsInCat(studentFieldsConfig, "Info générale");
    const scolariteFields = fieldsInCat(studentFieldsConfig, "Scolarité");
    // Services (transport mode/address) AND authorizations are YEAR-SPECIFIC —
    // e.g. 2025-2026 transport "Avec parent" while the 2026-2027 re-registration
    // draft differs, or auth "Oui" this year and still "Non" in next year's
    // draft. A single editable value can only hold one year's answer and gets
    // polluted by the latest draft, so both are edited per-year (a pencil per
    // year) inside StudentYearView only — never shown twice as flat groups.
    const arabeFields = fieldsInCat(studentFieldsConfig, "Info Arabe");

    const saveFiche = saveStudentFicheFields.bind(null, student.id);
    const saveIdentity = saveStudentIdentity.bind(null, student.id);
    const saveRegYear = saveStudentRegistrationYear.bind(null, student.id);

    // Authorized pickup persons + emergency contacts live on the anchor
    // guardian (imported per Dars parent). Read from the guardian that has
    // them, else the father, else the primary/first — and edit that same anchor.
    const apAnchor =
      student.guardianLinks.find(
        (l) => parsePersons(l.guardian.user.customAnswers).length > 0,
      ) ??
      student.guardianLinks.find((l) => l.guardian.relation === "pere") ??
      student.guardianLinks.find((l) => l.isPrimary) ??
      student.guardianLinks[0];
    const authorizedPersons = apAnchor
      ? parsePersons(apAnchor.guardian.user.customAnswers)
      : [];
    const saveAuthorized = apAnchor
      ? saveAuthorizedPersons.bind(null, student.id, apAnchor.guardian.userId)
      : undefined;
    const studentIdentity: StudentIdentity = {
      firstName: student.firstName,
      lastName: student.lastName,
      dob: student.dob ? student.dob.toISOString().slice(0, 10) : "",
      status: student.status,
      gender: student.gender ?? "",
      nationality: student.nationality ?? "",
      placeOfBirth: student.placeOfBirth ?? "",
      address: student.address ?? "",
      city: student.city ?? "",
      postalCode: student.postalCode ?? "",
      country: student.country ?? "",
      previousSchool: student.previousSchool ?? "",
      emergencyContact: student.emergencyContact ?? "",
      internalNotes: student.internalNotes ?? "",
    };

    // Arabic "Info Arabe" — aggregated from the father guardian + family.
    const fatherCa = toAnswers(
      student.guardianLinks.find((l) => l.guardian.relation === "pere")
        ?.guardian.user.customAnswers,
    );
    const arabicSections: ArabicSection[] = [
      {
        title: "معلومات الأب والقيد",
        rows: [
          {
            label: "اسم الأب",
            value: [fatherCa.prenom_ar, fatherCa.nom_ar]
              .filter(Boolean)
              .join(" "),
          },
          { label: "اسم الجدّ", value: fatherCa.nom_pere_ar ?? "" },
          { label: "قضاء القيد", value: fatherCa.caza_registre ?? "" },
          { label: "مكان القيد", value: fatherCa.lieu_registre ?? "" },
        ],
      },
      {
        title: "العنوان",
        rows: [
          { label: "المبنى", value: fatherCa.adresse_immeuble_ar ?? "" },
          { label: "الشارع", value: fatherCa.adresse_rue_ar ?? "" },
          { label: "تفاصيل المكان", value: fatherCa.adresse_place_ar ?? "" },
          { label: "البلدة", value: fatherCa.adresse_village ?? "" },
          { label: "القضاء", value: fatherCa.adresse_qaza ?? "" },
          { label: "العنوان البريدي", value: fatherCa.adresse_bp ?? "" },
        ],
      },
    ];

    // Parents available to link.
    const linkedParentUserIds = new Set(
      student.guardianLinks.map((l) => l.guardian.userId),
    );
    const availableParents: ParentOption[] = availableParentsRaw.filter(
      (p) => !linkedParentUserIds.has(p.id),
    );

    const boundDelete = deleteStudent.bind(null, id);

    const card = (children: React.ReactNode) => (
      <Card>
        <CardBody>{children}</CardBody>
      </Card>
    );

    // Identité + Info générale share one tab: the built-in identity card on
    // top, then the custom fields — minus the ones the card already shows
    // (nationalité, lieu de naissance), so nothing appears twice.
    const IDENTITY_DUPLICATES = new Set(["nationalite", "lieu_naissance"]);
    const complementFields = generalFields.filter(
      (f) => !IDENTITY_DUPLICATES.has(f.key),
    );
    const tabs: FicheTab[] = [
      {
        id: "identite",
        label: "Identité & infos",
        icon: <IdCard className="size-4" />,
        content: card(
          <div className="space-y-6">
            <StudentIdentitySection
              initial={studentIdentity}
              onSave={saveIdentity}
            />
            {complementFields.length > 0 ? (
              <div className="border-t border-[color:var(--color-border-subtle)] pt-5">
                <EditableGroup
                  title="Informations complémentaires"
                  fields={complementFields}
                  initialValues={initialStudentAnswers}
                  onSave={saveFiche}
                />
              </div>
            ) : null}
          </div>,
        ),
      },
    ];
    if (scolariteFields.length > 0)
      tabs.push({
        id: "scolarite",
        label: "Scolarité",
        icon: <BookOpen className="size-4" />,
        content: card(
          <EditableGroup
            title="Scolarité"
            fields={scolariteFields}
            initialValues={initialStudentAnswers}
            onSave={saveFiche}
          />,
        ),
      });
    if (fieldsForLevel(activeLevel).length > 0)
      tabs.push({
        id: "pedago",
        label: "Renseignements pédagogiques",
        icon: <GraduationCap className="size-4" />,
        content: card(
          <PedagogicalInfo
            level={activeLevel}
            initial={initialStudentAnswers}
            onSave={user.role === "SCHOOL_ADMIN" ? saveFiche : undefined}
          />,
        ),
      });
    tabs.push({
      id: "services",
      label: "Services & autorisations",
      icon: <Bus className="size-4" />,
      content: card(
        <div className="space-y-6">
          {busInfo.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-[0.7rem] font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
                Affectation bus
              </h4>
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {busInfo.map(([l, v]) => (
                  <div key={l} className="min-w-0">
                    <dt className="text-xs text-[color:var(--color-foreground-muted)]">{l}</dt>
                    <dd className="text-sm font-medium text-[color:var(--color-foreground)]">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {parcours.length > 0 ||
          Object.keys(registrationByYear).length > 0 ? (
            <StudentYearView
              parcours={parcours}
              registrationByYear={registrationByYear}
              fallback={initialStudentAnswers}
              onSaveYear={saveRegYear}
            />
          ) : busInfo.length === 0 ? (
            <p className="text-sm text-[color:var(--color-foreground-subtle)]">
              Aucune inscription — les services et autorisations s'affichent par
              année une fois l'élève inscrit.
            </p>
          ) : null}
        </div>,
      ),
    });
    tabs.push({
      id: "arabe",
      label: "Info Arabe",
      icon: <Languages className="size-4" />,
      content: card(
        <div className="space-y-6">
          {arabeFields.length > 0 ? (
            <EditableGroup
              title="معلومات التلميذ"
              fields={arabeFields}
              initialValues={initialStudentAnswers}
              onSave={saveFiche}
              rtl
            />
          ) : null}
          <ArabicFicheView sections={arabicSections} />
        </div>,
      ),
    });
    tabs.push({
      id: "parents",
      label: "Parents",
      icon: <Users className="size-4" />,
      badge: student.guardianLinks.length,
      content: card(
        <GuardianManager
          studentId={id}
          guardians={student.guardianLinks.map((l) => ({
            guardianId: l.guardianId,
            parentUserId: l.guardian.userId,
            name: l.guardian.user.name,
            email: l.guardian.user.email,
            isPrimary: l.isPrimary,
          }))}
          availableParents={availableParents}
          canEdit={user.role === "SCHOOL_ADMIN"}
        />,
      ),
    });
    tabs.push({
      id: "freres",
      label: "Frères / sœurs",
      icon: <Baby className="size-4" />,
      badge: siblings.length,
      content: card(
        siblings.length === 0 ? (
          <p className="text-sm text-[color:var(--color-foreground-subtle)]">
            Aucun frère ou sœur dans la même famille.
          </p>
        ) : (
          <ul className="space-y-1">
            {siblings.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/students/${s.id}`}
                  className="group flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[color:var(--color-surface-hover)]"
                >
                  <span className="font-medium text-[color:var(--color-foreground)]">
                    {s.lastName} {s.firstName}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-[color:var(--color-foreground-muted)]">
                    {s.enrollments[0]?.class.name ?? "—"}
                    <ArrowRight
                      className="size-3.5 text-[color:var(--color-foreground-subtle)] transition-transform group-hover:translate-x-0.5 group-hover:text-[color:var(--color-brand-600)]"
                      aria-hidden
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ),
      ),
    });
    if (isAdmin) {
      const recordData: MedicalRecordData = {
        bloodType: medRecord?.bloodType ?? "",
        diabetic: medRecord?.diabetic ?? false,
        asthma: medRecord?.asthma ?? false,
        epilepsy: medRecord?.epilepsy ?? false,
        scoliosis: medRecord?.scoliosis ?? false,
        favism: medRecord?.favism ?? false,
        hemophilia: medRecord?.hemophilia ?? false,
        cardiacProblem: medRecord?.cardiacProblem ?? false,
        allergies: medRecord?.allergies ?? "",
        medications: medRecord?.medications ?? "",
        hospitalization: medRecord?.hospitalization ?? "",
        surgeries: medRecord?.surgeries ?? "",
        majorIllnesses: medRecord?.majorIllnesses ?? "",
        chronicIllness: medRecord?.chronicIllness ?? "",
        familyHistory: medRecord?.familyHistory ?? "",
        specialNeeds: medRecord?.specialNeeds ?? "",
        remarks: medRecord?.remarks ?? "",
        pediatricianName: medRecord?.pediatricianName ?? "",
        pediatricianPhone: medRecord?.pediatricianPhone ?? "",
        allowEmergencyMeasures: medRecord?.allowEmergencyMeasures ?? null,
        allowDoctorExam: medRecord?.allowDoctorExam ?? null,
        allowParacetamol: medRecord?.allowParacetamol ?? null,
        allowMedicalTreatment: medRecord?.allowMedicalTreatment ?? null,
        unfitForSports: medRecord?.unfitForSports ?? false,
        unfitDuration: medRecord?.unfitDuration ?? "",
        unfitReason: medRecord?.unfitReason ?? "",
      };
      // Unnamed technical rows (Dars ids 19/128 — date fields, no vaccine
      // label) are hidden unless actually checked.
      const immData: ImmunizationData[] = medImms
        .filter((i) => i.done || !i.vaccine.startsWith("Vaccin #"))
        .map((i) => ({
          id: i.id,
          vaccine: i.vaccine,
          done: i.done,
          month: i.month,
          year: i.year,
          notes: i.notes ?? "",
        }));
      const visitData: VisitData[] = medVisits.map((v) => ({
        id: v.id,
        date: v.visitDate.toISOString().slice(0, 10),
        yearLabel: v.yearLabel ?? "",
        heightCm: v.heightCm,
        weightKg: v.weightKg,
        bp: [v.bpHigh, v.bpLow].filter(Boolean).join("/"),
        visionOd: v.visionOd ?? "",
        visionOg: v.visionOg ?? "",
        exam: v.exam ?? "",
        plan: v.plan ?? "",
        followUp: v.followUp ?? "",
        remarks: v.remarks ?? "",
        details:
          v.details && typeof v.details === "object" && !Array.isArray(v.details)
            ? Object.entries(v.details as Record<string, string>)
            : [],
      }));
      const hasAlert =
        !!recordData.allergies ||
        recordData.asthma ||
        recordData.diabetic ||
        recordData.epilepsy ||
        recordData.cardiacProblem;
      tabs.push({
        id: "sante",
        label: "Santé",
        icon: <HeartPulse className="size-4" />,
        badge: hasAlert ? "!" : undefined,
        content: card(
          <MedicalSection
            record={recordData}
            immunizations={immData}
            visits={visitData}
            onSave={saveStudentMedicalRecord.bind(null, student.id)}
          />,
        ),
      });
    }
    tabs.push({
      id: "autorisees",
      label: "Personnes autorisées",
      icon: <ShieldCheck className="size-4" />,
      badge: authorizedPersons.length || undefined,
      content: card(
        <AuthorizedPersons
          initial={authorizedPersons}
          onSave={user.role === "SCHOOL_ADMIN" ? saveAuthorized : undefined}
        />,
      ),
    });
    tabs.push({
      id: "inscriptions",
      label: "Inscriptions",
      icon: <CalendarDays className="size-4" />,
      content: card(
        student.enrollments.length === 0 ? (
          <p className="text-sm text-[color:var(--color-foreground-subtle)]">
            {t("noEnrollments")}
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {student.enrollments.map((e) => (
              <li key={e.id} className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{e.class.name}</span>{" "}
                  <span className="text-[color:var(--color-foreground-muted)]">
                    {e.academicYear.label}
                  </span>
                </span>
                {e.academicYear.isActive ? (
                  <span className="rounded-full border border-[color:var(--color-border-subtle)] px-2 py-0.5 text-xs">
                    Active
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ),
      ),
    });

    return (
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <PageHeader
          title={`${student.lastName} ${student.firstName}`}
          description={
            student.family?.code
              ? `${t("editTitle")} · Code famille ${student.family.code}`
              : t("editTitle")
          }
          action={
            <Link
              href="/students"
              className="text-sm text-[color:var(--color-foreground-muted)] hover:underline"
            >
              ← {tCommon("back")}
            </Link>
          }
        />

        <FicheTabs tabs={tabs} />

        {user.role === "SCHOOL_ADMIN" ? (
          <form action={boundDelete} className="flex justify-end">
            <Button variant="danger" size="sm" type="submit">
              {tCommon("delete")}
            </Button>
          </form>
        ) : null}
      </main>
    );
  });
}
