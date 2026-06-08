import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  IdCard,
  User,
  BookOpen,
  Bus,
  Languages,
  Users,
  Baby,
  CalendarDays,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FicheTabs, type FicheTab } from "@/components/fiche/fiche-tabs";
import { EditableGroup } from "@/components/fiche/editable-group";
import { StudentYearView } from "@/components/fiche/student-year-view";
import type { EntityFieldsConfig, FieldDef } from "@/lib/entity-fields";
import { db } from "@/lib/db";
import { withTenantSession } from "@/lib/session";
import {
  deleteStudent,
  saveStudentFicheFields,
  saveStudentIdentity,
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

    const generalFields = fieldsInCat(studentFieldsConfig, "Info générale");
    const scolariteFields = fieldsInCat(studentFieldsConfig, "Scolarité");
    const servicesFields = fieldsInCat(studentFieldsConfig, "Services");
    const autorisationsFields = fieldsInCat(studentFieldsConfig, "Autorisations");
    const arabeFields = fieldsInCat(studentFieldsConfig, "Info Arabe");

    const saveFiche = saveStudentFicheFields.bind(null, student.id);
    const saveIdentity = saveStudentIdentity.bind(null, student.id);
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

    const tabs: FicheTab[] = [
      {
        id: "identite",
        label: "Identité",
        icon: <IdCard className="size-4" />,
        content: card(
          <StudentIdentitySection initial={studentIdentity} onSave={saveIdentity} />,
        ),
      },
    ];
    if (generalFields.length > 0)
      tabs.push({
        id: "general",
        label: "Info générale",
        icon: <User className="size-4" />,
        content: card(
          <EditableGroup
            title="Info générale"
            fields={generalFields}
            initialValues={initialStudentAnswers}
            onSave={saveFiche}
          />,
        ),
      });
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
    tabs.push({
      id: "services",
      label: "Services & autorisations",
      icon: <Bus className="size-4" />,
      content: card(
        <div className="space-y-6">
          {servicesFields.length > 0 ? (
            <EditableGroup
              title="Services"
              fields={servicesFields}
              initialValues={initialStudentAnswers}
              onSave={saveFiche}
            />
          ) : null}
          {autorisationsFields.length > 0 ? (
            <EditableGroup
              title="Autorisations"
              fields={autorisationsFields}
              initialValues={initialStudentAnswers}
              onSave={saveFiche}
            />
          ) : null}
          {parcours.length > 0 ||
          Object.keys(registrationByYear).length > 0 ? (
            <div className="border-t border-[color:var(--color-border-subtle)] pt-5">
              <StudentYearView
                parcours={parcours}
                registrationByYear={registrationByYear}
              />
            </div>
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
