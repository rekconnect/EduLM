import { db } from "@/lib/db";

/**
 * Detailed (row-level) report registry.
 *
 * Each report is a single object: id + metadata + which filters it accepts +
 * a `run()` that returns columns + rows. The preview page, the Excel route,
 * and the PDF print view all consume the SAME definition, so adding a new
 * report (e.g. "élèves nés avant 2010", "familles sans email") is one object
 * here — it then shows up everywhere automatically.
 *
 * `run()` MUST be called inside `runWithTenant(...)` — it uses the auto-scoped
 * `db`, so every query is already tenant-bound.
 */

export type ReportFilterKind = "year" | "class" | "month" | "nationality";
export type ReportColumn = { key: string; header: string; width?: number };
export type ReportRow = Record<string, string | number>;
export type ReportRunOpts = {
  yearId?: string;
  classId?: string;
  month?: string;
  nationality?: string;
};
export type ResolvedReport = {
  columns: ReportColumn[];
  rows: ReportRow[];
  filterSummary: string;
};
export type ReportDef = {
  id: string;
  title: string;
  description: string;
  group: "Élèves" | "Services" | "Familles" | "Comptes";
  filters: ReportFilterKind[];
  run: (opts: ReportRunOpts) => Promise<ResolvedReport>;
};

const PLACEHOLDER_DOMAIN = "@import.lyceemontaigne.local";

// ───────────────────────── helpers ─────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function realEmail(email: string | null | undefined): string {
  if (!email) return "";
  return email.endsWith(PLACEHOLDER_DOMAIN) ? "" : email;
}

function fullName(
  u: { firstName: string | null; lastName: string | null; name: string | null },
): string {
  const fromParts = [u.lastName, u.firstName].filter(Boolean).join(" ").trim();
  return fromParts || (u.name ?? "").trim();
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

const GENDER: Record<string, string> = {
  MALE: "M",
  FEMALE: "F",
  OTHER: "Autre",
};
const STATUT: Record<string, string> = {
  ENROLLED: "Inscrit",
  WITHDRAWN: "Parti",
  PROSPECT: "Prospect",
  GRADUATED: "Diplômé",
};

const isYes = (v: unknown) =>
  typeof v === "string" && /^(yes|oui|true|1)$/i.test(v.trim());

/** yes_no customAnswers value → Oui / Non / — (em dash when unanswered). */
function ynLabel(v: unknown): string {
  if (isYes(v)) return "Oui";
  if (typeof v === "string" && v.trim()) return "Non";
  return "—";
}

/** Set of services a student had for a given academic-year label. */
function servicesForYear(
  ca: Record<string, unknown>,
  yearLabel: string,
  isActiveYear: boolean,
): Set<string> {
  const out = new Set<string>();
  const raw = ca.services_by_year;
  if (typeof raw === "string") {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      const s = map[yearLabel];
      if (typeof s === "string")
        s.split(",").map((x) => x.trim()).forEach((t) => t && out.add(t));
    } catch {
      /* ignore */
    }
  }
  // Current-year flags (set from billing) — belt-and-suspenders for the
  // active year in case the per-year history backfill hasn't been run.
  if (isActiveYear) {
    if (isYes(ca.autocar)) out.add("Transport");
    if (isYes(ca.repas_chaud)) out.add("Cantine");
    if (isYes(ca.collations)) out.add("Collation");
  }
  return out;
}

type GContact = { name: string; mobile: string; email: string };
type GuardianLite = {
  relation: string | null;
  phone: string | null;
  user: {
    firstName: string | null;
    lastName: string | null;
    name: string | null;
    email: string;
  };
};
function pickGuardian(guardians: GuardianLite[], relation: string): GContact {
  const g = guardians.find((x) => x.relation === relation);
  if (!g) return { name: "", mobile: "", email: "" };
  return {
    name: fullName(g.user),
    mobile: g.phone ?? "",
    email: realEmail(g.user.email),
  };
}

async function resolveYear(yearId?: string) {
  const years = await db.academicYear.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, label: true, isActive: true, startDate: true },
  });
  return (
    (yearId && years.find((y) => y.id === yearId)) ||
    years.find((y) => y.isActive) ||
    years[0] ||
    null
  );
}

/** Filter options for the report's filter form. */
export async function loadYears() {
  return db.academicYear.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, label: true, isActive: true },
  });
}
export async function loadClassesForYear(yearId: string) {
  return db.class.findMany({
    where: { academicYearId: yearId },
    select: { id: true, name: true, level: true, section: true },
    orderBy: [{ level: "asc" }, { section: "asc" }],
  });
}

export const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** Parse a 1–12 month string; fall back to the current month. */
function clampMonth(month?: string): number {
  const n = Number(month);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
  return new Date().getMonth() + 1;
}

/** A student's nationality (customAnswers label first, then the column). */
function nationalityOf(ca: Record<string, unknown>, fallback: string | null): string {
  return str(ca.nationalite) || (fallback ?? "");
}

/** Distinct nationalities present in a year's cohort — feeds the filter. */
export async function loadNationalities(yearId: string): Promise<string[]> {
  const cohort = await db.student.findMany({
    where: { enrollments: { some: { academicYearId: yearId } } },
    select: { nationality: true, customAnswers: true },
  });
  const set = new Set<string>();
  for (const s of cohort) {
    const nat = nationalityOf(
      (s.customAnswers ?? {}) as Record<string, unknown>,
      s.nationality,
    );
    if (nat) set.add(nat);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
}

// Shared enrollment → student query (optionally filtered by class / service).
async function loadStudentEnrollments(yearId: string, classId?: string) {
  const rows = await db.enrollment.findMany({
    where: { academicYearId: yearId, ...(classId ? { classId } : {}) },
    select: {
      studentId: true,
      class: { select: { name: true, level: true } },
      student: {
        select: {
          firstName: true,
          lastName: true,
          dob: true,
          gender: true,
          nationality: true,
          status: true,
          customAnswers: true,
          family: {
            select: {
              code: true,
              guardians: {
                select: {
                  relation: true,
                  phone: true,
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                      name: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  rows.sort(
    (a, b) =>
      a.class.name.localeCompare(b.class.name, "fr") ||
      a.student.lastName.localeCompare(b.student.lastName, "fr") ||
      a.student.firstName.localeCompare(b.student.firstName, "fr"),
  );
  return rows;
}

// Shared family query + derived contact parts (directory + emails-manquants).
async function loadFamilies() {
  return db.family.findMany({
    select: {
      code: true,
      addressStreet: true,
      addressHood: true,
      addressCity: true,
      addressCountry: true,
      imageRightsSite: true,
      imageRightsBook: true,
      imageRightsSocial: true,
      imageRightsRadio: true,
      guardians: {
        select: {
          relation: true,
          phone: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              name: true,
              email: true,
            },
          },
        },
      },
      students: {
        select: {
          firstName: true,
          lastName: true,
          enrollments: {
            where: { academicYear: { isActive: true } },
            select: { class: { select: { name: true } } },
            take: 1,
          },
        },
      },
    },
  });
}
type FamilyRaw = Awaited<ReturnType<typeof loadFamilies>>[number];
function familyParts(f: FamilyRaw) {
  const pere = pickGuardian(f.guardians, "pere");
  const mere = pickGuardian(f.guardians, "mere");
  const adresse = [
    f.addressStreet,
    f.addressHood,
    f.addressCity,
    f.addressCountry,
  ]
    .filter(Boolean)
    .join(", ");
  const enfants = f.students
    .map((s) => {
      const cls = s.enrollments[0]?.class.name;
      return `${s.lastName} ${s.firstName}${cls ? ` (${cls})` : ""}`;
    })
    .join(" · ");
  return { pere, mere, adresse, enfants, nb: f.students.length };
}

// ───────────────────────── column sets ─────────────────────────

const ELEVE_COLS: ReportColumn[] = [
  { key: "classe", header: "Classe", width: 14 },
  { key: "niveau", header: "Niveau", width: 12 },
  { key: "nom", header: "Nom", width: 18 },
  { key: "prenom", header: "Prénom", width: 18 },
  { key: "naissance", header: "Date de naissance", width: 16 },
  { key: "genre", header: "Genre", width: 8 },
  { key: "nationalite", header: "Nationalité", width: 16 },
  { key: "statut", header: "Statut", width: 10 },
  { key: "pere", header: "Père", width: 20 },
  { key: "mobilePere", header: "Mobile père", width: 16 },
  { key: "mere", header: "Mère", width: 20 },
  { key: "mobileMere", header: "Mobile mère", width: 16 },
  { key: "email", header: "Email contact", width: 26 },
];

function eleveRow(e: Awaited<ReturnType<typeof loadStudentEnrollments>>[number]): ReportRow {
  const st = e.student;
  const ca = (st.customAnswers ?? {}) as Record<string, unknown>;
  const guardians = st.family?.guardians ?? [];
  const pere = pickGuardian(guardians, "pere");
  const mere = pickGuardian(guardians, "mere");
  return {
    classe: e.class.name,
    niveau: e.class.level,
    nom: st.lastName,
    prenom: st.firstName,
    naissance: fmtDate(st.dob),
    genre: st.gender ? GENDER[st.gender] ?? "" : "",
    nationalite: str(ca.nationalite) || (st.nationality ?? ""),
    statut: STATUT[st.status] ?? st.status,
    pere: pere.name,
    mobilePere: pere.mobile,
    mere: mere.name,
    mobileMere: mere.mobile,
    email: pere.email || mere.email,
  };
}

function serviceCols(withDetails: boolean): ReportColumn[] {
  const base: ReportColumn[] = [
    { key: "classe", header: "Classe", width: 14 },
    { key: "nom", header: "Nom", width: 18 },
    { key: "prenom", header: "Prénom", width: 18 },
  ];
  if (withDetails)
    base.push(
      { key: "aller", header: "Aller", width: 14 },
      { key: "retour", header: "Retour", width: 14 },
      { key: "adresseTransport", header: "Adresse transport", width: 30 },
    );
  base.push(
    { key: "pere", header: "Père", width: 20 },
    { key: "mobilePere", header: "Mobile père", width: 16 },
    { key: "mere", header: "Mère", width: 20 },
    { key: "mobileMere", header: "Mobile mère", width: 16 },
    { key: "email", header: "Email contact", width: 26 },
  );
  return base;
}

function makeServiceReport(
  id: string,
  title: string,
  token: "Transport" | "Cantine" | "Collation",
  withDetails: boolean,
): ReportDef {
  return {
    id,
    title,
    description: `Élèves inscrits au service « ${token.toLowerCase()} » avec contacts parents.`,
    group: "Services",
    filters: ["year", "class"],
    run: async ({ yearId, classId }) => {
      const year = await resolveYear(yearId);
      const cols = serviceCols(withDetails);
      if (!year) return { columns: cols, rows: [], filterSummary: "Aucune année" };
      const all = await loadStudentEnrollments(year.id, classId);
      const rows: ReportRow[] = [];
      for (const e of all) {
        const ca = (e.student.customAnswers ?? {}) as Record<string, unknown>;
        const svc = servicesForYear(ca, year.label, year.isActive);
        if (!svc.has(token)) continue;
        const guardians = e.student.family?.guardians ?? [];
        const pere = pickGuardian(guardians, "pere");
        const mere = pickGuardian(guardians, "mere");
        const row: ReportRow = {
          classe: e.class.name,
          nom: e.student.lastName,
          prenom: e.student.firstName,
          pere: pere.name,
          mobilePere: pere.mobile,
          mere: mere.name,
          mobileMere: mere.mobile,
          email: pere.email || mere.email,
        };
        if (withDetails) {
          row.aller = str(ca.transport_aller);
          row.retour = str(ca.transport_retour);
          row.adresseTransport = isYes(ca.transport_adresse_diff)
            ? [
                ca.transport_rue,
                ca.transport_immeuble,
                ca.transport_etage,
                ca.transport_village,
                ca.transport_caza,
              ]
                .map(str)
                .filter(Boolean)
                .join(", ")
            : "";
        }
        rows.push(row);
      }
      let summary = `Année ${year.label}`;
      if (classId) {
        const c = await db.class.findUnique({
          where: { id: classId },
          select: { name: true },
        });
        if (c) summary += ` · Classe ${c.name}`;
      }
      summary += ` · ${rows.length} élève(s)`;
      return { columns: cols, rows, filterSummary: summary };
    },
  };
}

// ───────────────────────── reports ─────────────────────────

export const REPORTS: ReportDef[] = [
  {
    id: "eleves",
    title: "Liste des élèves",
    description:
      "Tous les élèves d'une année (ou d'une classe) avec date de naissance, nationalité, statut et contacts parents.",
    group: "Élèves",
    filters: ["year", "class"],
    run: async ({ yearId, classId }) => {
      const year = await resolveYear(yearId);
      if (!year)
        return { columns: ELEVE_COLS, rows: [], filterSummary: "Aucune année" };
      const list = await loadStudentEnrollments(year.id, classId);
      let summary = `Année ${year.label}`;
      if (classId) {
        const c = await db.class.findUnique({
          where: { id: classId },
          select: { name: true },
        });
        if (c) summary += ` · Classe ${c.name}`;
      }
      summary += ` · ${list.length} élève(s)`;
      return { columns: ELEVE_COLS, rows: list.map(eleveRow), filterSummary: summary };
    },
  },

  {
    id: "nouveaux",
    title: "Nouveaux inscrits",
    description:
      "Élèves présents l'année sélectionnée et jamais inscrits une année antérieure — les vrais nouveaux entrants.",
    group: "Élèves",
    filters: ["year", "class"],
    run: async ({ yearId, classId }) => {
      const year = await resolveYear(yearId);
      if (!year)
        return { columns: ELEVE_COLS, rows: [], filterSummary: "Aucune année" };
      const cohort = await loadStudentEnrollments(year.id, classId);
      // Students with any enrollment in an EARLIER academic year.
      const prior = await db.enrollment.findMany({
        where: { academicYear: { startDate: { lt: year.startDate } } },
        select: { studentId: true },
      });
      const priorIds = new Set(prior.map((p) => p.studentId));
      const fresh = cohort.filter((e) => !priorIds.has(e.studentId));
      let summary = `Nouveaux · Année ${year.label}`;
      if (classId) {
        const c = await db.class.findUnique({
          where: { id: classId },
          select: { name: true },
        });
        if (c) summary += ` · Classe ${c.name}`;
      }
      summary += ` · ${fresh.length} élève(s)`;
      return { columns: ELEVE_COLS, rows: fresh.map(eleveRow), filterSummary: summary };
    },
  },

  {
    id: "anniversaires",
    title: "Anniversaires du mois",
    description:
      "Élèves dont l'anniversaire tombe dans le mois choisi, triés par jour — avec contacts parents.",
    group: "Élèves",
    filters: ["year", "month"],
    run: async ({ yearId, month }) => {
      const cols: ReportColumn[] = [
        { key: "jour", header: "Jour", width: 8 },
        { key: "classe", header: "Classe", width: 14 },
        { key: "nom", header: "Nom", width: 18 },
        { key: "prenom", header: "Prénom", width: 18 },
        { key: "naissance", header: "Date de naissance", width: 16 },
        { key: "pere", header: "Père", width: 20 },
        { key: "mobilePere", header: "Mobile père", width: 16 },
        { key: "mere", header: "Mère", width: 20 },
        { key: "mobileMere", header: "Mobile mère", width: 16 },
      ];
      const year = await resolveYear(yearId);
      const m = clampMonth(month);
      if (!year)
        return { columns: cols, rows: [], filterSummary: "Aucune année" };
      const cohort = await loadStudentEnrollments(year.id);
      const rows: ReportRow[] = cohort
        .filter((e) => e.student.dob && e.student.dob.getUTCMonth() + 1 === m)
        .sort(
          (a, b) =>
            (a.student.dob?.getUTCDate() ?? 0) -
            (b.student.dob?.getUTCDate() ?? 0),
        )
        .map((e) => {
          const guardians = e.student.family?.guardians ?? [];
          const pere = pickGuardian(guardians, "pere");
          const mere = pickGuardian(guardians, "mere");
          return {
            jour: e.student.dob?.getUTCDate() ?? 0,
            classe: e.class.name,
            nom: e.student.lastName,
            prenom: e.student.firstName,
            naissance: fmtDate(e.student.dob),
            pere: pere.name,
            mobilePere: pere.mobile,
            mere: mere.name,
            mobileMere: mere.mobile,
          };
        });
      return {
        columns: cols,
        rows,
        filterSummary: `${MONTHS_FR[m - 1]} · Année ${year.label} · ${rows.length} élève(s)`,
      };
    },
  },

  {
    id: "eleves-nationalite",
    title: "Élèves par nationalité",
    description:
      "Élèves d'une année groupés par nationalité — filtrable sur une nationalité précise.",
    group: "Élèves",
    filters: ["year", "nationality"],
    run: async ({ yearId, nationality }) => {
      const cols: ReportColumn[] = [
        { key: "nationalite", header: "Nationalité", width: 16 },
        { key: "classe", header: "Classe", width: 14 },
        { key: "nom", header: "Nom", width: 18 },
        { key: "prenom", header: "Prénom", width: 18 },
        { key: "naissance", header: "Date de naissance", width: 16 },
        { key: "genre", header: "Genre", width: 8 },
        { key: "pere", header: "Père", width: 20 },
        { key: "mobilePere", header: "Mobile père", width: 16 },
        { key: "mere", header: "Mère", width: 20 },
        { key: "mobileMere", header: "Mobile mère", width: 16 },
      ];
      const year = await resolveYear(yearId);
      if (!year)
        return { columns: cols, rows: [], filterSummary: "Aucune année" };
      const cohort = await loadStudentEnrollments(year.id);
      const list = cohort
        .map((e) => ({
          e,
          nat:
            nationalityOf(
              (e.student.customAnswers ?? {}) as Record<string, unknown>,
              e.student.nationality,
            ) || "Non renseignée",
        }))
        .filter((x) => (nationality ? x.nat === nationality : true))
        .sort(
          (a, b) =>
            a.nat.localeCompare(b.nat, "fr") ||
            a.e.student.lastName.localeCompare(b.e.student.lastName, "fr"),
        );
      const rows: ReportRow[] = list.map(({ e, nat }) => {
        const guardians = e.student.family?.guardians ?? [];
        const pere = pickGuardian(guardians, "pere");
        const mere = pickGuardian(guardians, "mere");
        return {
          nationalite: nat,
          classe: e.class.name,
          nom: e.student.lastName,
          prenom: e.student.firstName,
          naissance: fmtDate(e.student.dob),
          genre: e.student.gender ? GENDER[e.student.gender] ?? "" : "",
          pere: pere.name,
          mobilePere: pere.mobile,
          mere: mere.name,
          mobileMere: mere.mobile,
        };
      });
      return {
        columns: cols,
        rows,
        filterSummary: `Année ${year.label}${nationality ? ` · ${nationality}` : ""} · ${rows.length} élève(s)`,
      };
    },
  },

  {
    id: "partis",
    title: "Élèves partis",
    description:
      "Élèves inscrits l'année précédente et non réinscrits l'année sélectionnée — avec dernière classe et motif de départ.",
    group: "Élèves",
    filters: ["year"],
    run: async ({ yearId }) => {
      const cols: ReportColumn[] = [
        { key: "derniereClasse", header: "Dernière classe", width: 16 },
        { key: "nom", header: "Nom", width: 18 },
        { key: "prenom", header: "Prénom", width: 18 },
        { key: "dateDepart", header: "Date de départ", width: 16 },
        { key: "raison", header: "Raison du départ", width: 24 },
        { key: "pere", header: "Père", width: 20 },
        { key: "mobilePere", header: "Mobile père", width: 16 },
        { key: "mere", header: "Mère", width: 20 },
        { key: "mobileMere", header: "Mobile mère", width: 16 },
      ];
      const year = await resolveYear(yearId);
      if (!year)
        return { columns: cols, rows: [], filterSummary: "Aucune année" };
      const years = await db.academicYear.findMany({
        orderBy: { startDate: "desc" },
        select: { id: true, label: true, startDate: true },
      });
      const prevYear = years.find((y) => y.startDate < year.startDate);
      if (!prevYear)
        return {
          columns: cols,
          rows: [],
          filterSummary: `Aucune année antérieure à ${year.label}`,
        };
      const activeIds = new Set(
        (
          await db.enrollment.findMany({
            where: { academicYearId: year.id },
            select: { studentId: true },
          })
        ).map((e) => e.studentId),
      );
      const prevEnr = await loadStudentEnrollments(prevYear.id);
      const rows: ReportRow[] = prevEnr
        .filter((e) => !activeIds.has(e.studentId))
        .map((e) => {
          const ca = (e.student.customAnswers ?? {}) as Record<string, unknown>;
          const guardians = e.student.family?.guardians ?? [];
          const pere = pickGuardian(guardians, "pere");
          const mere = pickGuardian(guardians, "mere");
          return {
            derniereClasse: e.class.name,
            nom: e.student.lastName,
            prenom: e.student.firstName,
            dateDepart: str(ca.date_depart),
            raison: str(ca.raison_depart) || str(ca.raison_depart_detail),
            pere: pere.name,
            mobilePere: pere.mobile,
            mere: mere.name,
            mobileMere: mere.mobile,
          };
        });
      return {
        columns: cols,
        rows,
        filterSummary: `Non réinscrits après ${prevYear.label} · ${rows.length} élève(s)`,
      };
    },
  },

  {
    id: "sortie",
    title: "Autorisation de sortie",
    description:
      "Élèves autorisés (ou non) à quitter seuls l'établissement — pour le contrôle aux sorties.",
    group: "Élèves",
    filters: ["year", "class"],
    run: async ({ yearId, classId }) => {
      const cols: ReportColumn[] = [
        { key: "classe", header: "Classe", width: 14 },
        { key: "nom", header: "Nom", width: 18 },
        { key: "prenom", header: "Prénom", width: 18 },
        { key: "quitterSeul", header: "Quitter seul", width: 14 },
        { key: "pere", header: "Père", width: 20 },
        { key: "mobilePere", header: "Mobile père", width: 16 },
        { key: "mere", header: "Mère", width: 20 },
        { key: "mobileMere", header: "Mobile mère", width: 16 },
      ];
      const year = await resolveYear(yearId);
      if (!year)
        return { columns: cols, rows: [], filterSummary: "Aucune année" };
      const cohort = await loadStudentEnrollments(year.id, classId);
      const rows: ReportRow[] = cohort.map((e) => {
        const ca = (e.student.customAnswers ?? {}) as Record<string, unknown>;
        const guardians = e.student.family?.guardians ?? [];
        const pere = pickGuardian(guardians, "pere");
        const mere = pickGuardian(guardians, "mere");
        return {
          classe: e.class.name,
          nom: e.student.lastName,
          prenom: e.student.firstName,
          quitterSeul: ynLabel(ca.quitter_seul),
          pere: pere.name,
          mobilePere: pere.mobile,
          mere: mere.name,
          mobileMere: mere.mobile,
        };
      });
      let summary = `Année ${year.label}`;
      if (classId) {
        const c = await db.class.findUnique({
          where: { id: classId },
          select: { name: true },
        });
        if (c) summary += ` · Classe ${c.name}`;
      }
      summary += ` · ${rows.length} élève(s)`;
      return { columns: cols, rows, filterSummary: summary };
    },
  },

  makeServiceReport("transport", "Transport (autocar)", "Transport", true),
  makeServiceReport("cantine", "Cantine (repas chaud)", "Cantine", false),
  makeServiceReport("collation", "Collation", "Collation", false),

  {
    id: "familles",
    title: "Annuaire des familles",
    description:
      "Toutes les familles avec père / mère (nom, mobile, email), adresse, nombre et noms des enfants.",
    group: "Familles",
    filters: [],
    run: async () => {
      const cols: ReportColumn[] = [
        { key: "code", header: "Code", width: 12 },
        { key: "pere", header: "Père", width: 20 },
        { key: "mobilePere", header: "Mobile père", width: 16 },
        { key: "emailPere", header: "Email père", width: 26 },
        { key: "mere", header: "Mère", width: 20 },
        { key: "mobileMere", header: "Mobile mère", width: 16 },
        { key: "emailMere", header: "Email mère", width: 26 },
        { key: "adresse", header: "Adresse", width: 30 },
        { key: "nbEnfants", header: "Nb enfants", width: 10 },
        { key: "enfants", header: "Enfants", width: 40 },
      ];
      const families = await loadFamilies();
      const rows: ReportRow[] = families
        .map((f) => {
          const p = familyParts(f);
          return {
            code: f.code,
            pere: p.pere.name,
            mobilePere: p.pere.mobile,
            emailPere: p.pere.email,
            mere: p.mere.name,
            mobileMere: p.mere.mobile,
            emailMere: p.mere.email,
            adresse: p.adresse,
            nbEnfants: p.nb,
            enfants: p.enfants,
          };
        })
        .sort((a, b) => String(a.code).localeCompare(String(b.code), "fr"));
      return {
        columns: cols,
        rows,
        filterSummary: `${rows.length} famille(s)`,
      };
    },
  },

  {
    id: "emails-manquants",
    title: "Familles sans email",
    description:
      "Familles dont ni le père ni la mère n'a d'adresse email valide — à relancer pour ouvrir l'accès au portail.",
    group: "Familles",
    filters: [],
    run: async () => {
      const cols: ReportColumn[] = [
        { key: "code", header: "Code", width: 12 },
        { key: "pere", header: "Père", width: 22 },
        { key: "mobilePere", header: "Mobile père", width: 16 },
        { key: "mere", header: "Mère", width: 22 },
        { key: "mobileMere", header: "Mobile mère", width: 16 },
        { key: "adresse", header: "Adresse", width: 30 },
        { key: "nbEnfants", header: "Nb enfants", width: 10 },
        { key: "enfants", header: "Enfants", width: 40 },
      ];
      const families = await loadFamilies();
      const rows: ReportRow[] = families
        .map((f) => ({ f, p: familyParts(f) }))
        .filter(({ p }) => !p.pere.email && !p.mere.email)
        .map(({ f, p }) => ({
          code: f.code,
          pere: p.pere.name,
          mobilePere: p.pere.mobile,
          mere: p.mere.name,
          mobileMere: p.mere.mobile,
          adresse: p.adresse,
          nbEnfants: p.nb,
          enfants: p.enfants,
        }))
        .sort((a, b) => String(a.code).localeCompare(String(b.code), "fr"));
      return {
        columns: cols,
        rows,
        filterSummary: `${rows.length} famille(s) sans email`,
      };
    },
  },

  {
    id: "familles-multi",
    title: "Familles multi-enfants",
    description:
      "Fratries de 2 enfants ou plus dans l'établissement — utile pour les remises fratrie.",
    group: "Familles",
    filters: [],
    run: async () => {
      const cols: ReportColumn[] = [
        { key: "code", header: "Code", width: 12 },
        { key: "nbEnfants", header: "Nb enfants", width: 10 },
        { key: "pere", header: "Père", width: 22 },
        { key: "mobilePere", header: "Mobile père", width: 16 },
        { key: "mere", header: "Mère", width: 22 },
        { key: "mobileMere", header: "Mobile mère", width: 16 },
        { key: "enfants", header: "Enfants", width: 44 },
      ];
      const families = await loadFamilies();
      const rows: ReportRow[] = families
        .map((f) => ({ f, p: familyParts(f) }))
        .filter(({ p }) => p.nb >= 2)
        .map(({ f, p }) => ({
          code: f.code,
          nbEnfants: p.nb,
          pere: p.pere.name,
          mobilePere: p.pere.mobile,
          mere: p.mere.name,
          mobileMere: p.mere.mobile,
          enfants: p.enfants,
        }))
        .sort(
          (a, b) =>
            Number(b.nbEnfants) - Number(a.nbEnfants) ||
            String(a.code).localeCompare(String(b.code), "fr"),
        );
      return {
        columns: cols,
        rows,
        filterSummary: `${rows.length} famille(s) avec 2 enfants ou plus`,
      };
    },
  },

  {
    id: "autorisations-image",
    title: "Autorisations image manquantes",
    description:
      "Familles n'ayant répondu à aucune des autorisations d'image (site, livre, réseaux, radio) — consentement à recueillir.",
    group: "Familles",
    filters: [],
    run: async () => {
      const cols: ReportColumn[] = [
        { key: "code", header: "Code", width: 12 },
        { key: "pere", header: "Père", width: 22 },
        { key: "mobilePere", header: "Mobile père", width: 16 },
        { key: "emailPere", header: "Email père", width: 26 },
        { key: "mere", header: "Mère", width: 22 },
        { key: "mobileMere", header: "Mobile mère", width: 16 },
        { key: "enfants", header: "Enfants", width: 40 },
      ];
      const families = await loadFamilies();
      const rows: ReportRow[] = families
        .filter(
          (f) =>
            f.imageRightsSite == null &&
            f.imageRightsBook == null &&
            f.imageRightsSocial == null &&
            f.imageRightsRadio == null,
        )
        .map((f) => {
          const p = familyParts(f);
          return {
            code: f.code,
            pere: p.pere.name,
            mobilePere: p.pere.mobile,
            emailPere: p.pere.email,
            mere: p.mere.name,
            mobileMere: p.mere.mobile,
            enfants: p.enfants,
          };
        })
        .sort((a, b) => String(a.code).localeCompare(String(b.code), "fr"));
      return {
        columns: cols,
        rows,
        filterSummary: `${rows.length} famille(s) sans réponse aux autorisations image`,
      };
    },
  },

  {
    id: "parents",
    title: "Comptes parents",
    description:
      "Tous les comptes parents : nom, relation, email, téléphone, statut du compte, nombre d'enfants.",
    group: "Comptes",
    filters: [],
    run: async () => {
      const cols: ReportColumn[] = [
        { key: "nom", header: "Nom", width: 22 },
        { key: "relation", header: "Relation", width: 12 },
        { key: "email", header: "Email", width: 28 },
        { key: "telephone", header: "Téléphone", width: 16 },
        { key: "statut", header: "Statut", width: 12 },
        { key: "nbEnfants", header: "Nb enfants", width: 10 },
        { key: "codeFamille", header: "Code famille", width: 14 },
      ];
      const STATUS_FR: Record<string, string> = {
        ACTIVE: "Actif",
        INVITED: "Invité",
        DISABLED: "Désactivé",
      };
      const parents = await db.user.findMany({
        where: { role: "PARENT" },
        select: {
          firstName: true,
          lastName: true,
          name: true,
          email: true,
          status: true,
          guardianProfile: {
            select: {
              relation: true,
              phone: true,
              family: { select: { code: true } },
              childLinks: { select: { studentId: true } },
            },
          },
        },
      });
      const rows: ReportRow[] = parents
        .map((p) => ({
          nom: fullName(p),
          relation: p.guardianProfile?.relation ?? "",
          email: realEmail(p.email),
          telephone: p.guardianProfile?.phone ?? "",
          statut: STATUS_FR[p.status] ?? p.status,
          nbEnfants: p.guardianProfile?.childLinks.length ?? 0,
          codeFamille: p.guardianProfile?.family?.code ?? "",
        }))
        .sort((a, b) => String(a.nom).localeCompare(String(b.nom), "fr"));
      return {
        columns: cols,
        rows,
        filterSummary: `${rows.length} compte(s)`,
      };
    },
  },
];

export function getReport(id: string): ReportDef | undefined {
  return REPORTS.find((r) => r.id === id);
}

export function reportGroups(): Array<{ group: string; reports: ReportDef[] }> {
  const order = ["Élèves", "Services", "Familles", "Comptes"];
  return order
    .map((group) => ({ group, reports: REPORTS.filter((r) => r.group === group) }))
    .filter((g) => g.reports.length > 0);
}
