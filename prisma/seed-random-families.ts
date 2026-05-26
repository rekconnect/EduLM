/**
 * Seed ~500 random Lebanese families with complete dossier data so we
 * can exercise every report + filter end-to-end.
 *
 * - 500 PARENT users + Guardian + Family (with address + image rights)
 * - Each family gets 1-4 kids (weighted: 30% / 45% / 20% / 5%)
 * - Each kid gets a Student + Application with EVERY new dossier field
 *   populated: identity, FR+AR names, 1-2 nationalities, Lebanese
 *   passport when applicable, transport choices, restauration, scolarité
 *   antérieure, EBEP flags, niveau-conditional pedagogique answers,
 *   plus an emergency contact.
 * - Status distribution: 55% DRAFT, 30% SUBMITTED, 10% UNDER_REVIEW,
 *   5% ACCEPTED. tabsCompleted flipped fully green so the dossier
 *   list looks alive.
 *
 * Run:
 *   npx tsx prisma/seed-random-families.ts                 # default 500
 *   npx tsx prisma/seed-random-families.ts --count=100     # smaller
 *   npx tsx prisma/seed-random-families.ts --tenant=cmp... # explicit
 */

import { PrismaClient, type ApplicationStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── CLI args ──────────────────────────────────────────────────────

const COUNT_ARG = process.argv.find((a) => a.startsWith("--count="));
const TARGET_COUNT = COUNT_ARG ? parseInt(COUNT_ARG.split("=")[1] ?? "500", 10) : 500;
const TENANT_ARG = process.argv.find((a) => a.startsWith("--tenant="));
const EXPLICIT_TENANT_ID = TENANT_ARG ? TENANT_ARG.split("=")[1] : null;
const NAME_ARG = process.argv.find((a) => a.startsWith("--tenant-name="));
const EXPLICIT_TENANT_NAME = NAME_ARG ? NAME_ARG.split("=")[1] : null;
const LIST_ONLY = process.argv.includes("--list-tenants");

// Cycle selection — same pattern as tenant.
const CYCLE_ARG = process.argv.find((a) => a.startsWith("--cycle="));
const EXPLICIT_CYCLE_ID = CYCLE_ARG ? CYCLE_ARG.split("=")[1] : null;
const CYCLE_NAME_ARG = process.argv.find((a) =>
  a.startsWith("--cycle-name="),
);
const EXPLICIT_CYCLE_NAME = CYCLE_NAME_ARG
  ? CYCLE_NAME_ARG.split("=")[1]
  : null;
const LIST_CYCLES = process.argv.includes("--list-cycles");

// ── Reproducible pseudo-randomness ────────────────────────────────
// Same seed → same family tree, easier to compare reports.

let rngState = 42_424_242;
function rand(): number {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 0x100000000;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}
function maybe(p: number): boolean {
  return rand() < p;
}
function int(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function pickWeighted<T>(weighted: ReadonlyArray<[T, number]>): T {
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [val, w] of weighted) {
    r -= w;
    if (r <= 0) return val;
  }
  return weighted[weighted.length - 1]![0];
}

// ── Reference data ────────────────────────────────────────────────

const SURNAMES = [
  "El Kady", "Khoury", "Saad", "Aoun", "Hariri", "Sleiman", "Geagea",
  "Salameh", "Nasr", "Frangieh", "Gemayel", "Chamoun", "Sayegh", "Daher",
  "Najjar", "Mansour", "Karam", "Abou Khalil", "Tannous", "Maalouf",
  "Boutros", "Abi Ramia", "El Hage", "Sader", "Bou Saab", "Chaaban",
  "Fakhoury", "Habib", "Issa", "Jabre", "Kettaneh", "Lahoud", "Moukheiber",
  "Nakhle", "Obeid", "Pharaon", "Qassem", "Rizk", "Saadeh", "Tabet",
];
const SURNAMES_AR = [
  "القاضي", "الخوري", "سعد", "عون", "الحريري", "سليمان", "جعجع",
  "سلامة", "نصر", "فرنجية", "الجميل", "شمعون", "صايغ", "ضاهر",
  "النجار", "منصور", "كرم", "أبو خليل", "طنوس", "معلوف",
  "بطرس", "أبي رميا", "الحاج", "صادر", "بو صعب", "شعبان",
  "فاخوري", "حبيب", "عيسى", "جبر", "كتانة", "لحود", "مخيبر",
  "نخلة", "عبيد", "فرعون", "قاسم", "رزق", "سعادة", "تابت",
];

const FIRSTNAMES_M = [
  "Joseph", "Antoine", "Mark", "Charbel", "Elie", "Karim", "Sami",
  "Rami", "Tony", "Walid", "Bachir", "Wassim", "Fadi", "Nabil",
  "Roy", "Nadim", "Bassam", "Ziad", "Marwan", "Habib",
];
const FIRSTNAMES_F = [
  "Layla", "Maya", "Nour", "Rim", "Yasmine", "Sara", "Joelle",
  "Tania", "Carole", "Diana", "Hala", "Mireille", "Pascale", "Rana",
  "Salma", "Tatiana", "Nadine", "Lara", "Christelle", "Aline",
];
const FIRSTNAMES_M_AR = [
  "يوسف", "أنطوان", "مارك", "شربل", "إيلي", "كريم", "سامي",
  "رامي", "طوني", "وليد", "بشير", "وسيم", "فادي", "نبيل",
  "روي", "نديم", "بسام", "زياد", "مروان", "حبيب",
];
const FIRSTNAMES_F_AR = [
  "ليلى", "مايا", "نور", "ريم", "ياسمين", "سارة", "جويل",
  "تانيا", "كارول", "ديانا", "هلا", "ميرال", "باسكال", "رنا",
  "سلمى", "تاتيانا", "نادين", "لارا", "كريستيل", "ألين",
];

const CAZAS = [
  "Beyrouth", "Baabda", "Aley", "Chouf", "Matn", "Kesrouan", "Jbeil",
  "Batroun", "Bcharré", "Koura", "Zgharta", "Tripoli", "Akkar",
];
const VILLAGES_BY_CAZA: Record<string, string[]> = {
  Beyrouth: ["Achrafieh", "Hamra", "Ras Beirut", "Mar Mikhael", "Verdun"],
  Baabda: ["Hadath", "Hazmieh", "Yarzé", "Furn el Chebbak"],
  Aley: ["Bhamdoun", "Aaley", "Souk el Gharb"],
  Chouf: ["Beit Eddine", "Deir el Qamar", "Damour"],
  Matn: ["Mansourieh", "Dekwaneh", "Roumieh", "Antélias", "Jdeideh"],
  Kesrouan: ["Jounieh", "Faraya", "Kfardebian", "Zouk Mosbeh"],
  Jbeil: ["Byblos", "Annaya", "Aamchit"],
  Batroun: ["Batroun", "Kfar Helda", "Tannourine"],
  Bcharré: ["Bcharré", "Hadath el Jebbé"],
  Koura: ["Amioun", "Chekka"],
  Zgharta: ["Zgharta", "Ehden"],
  Tripoli: ["Tripoli", "Mina"],
  Akkar: ["Halba", "Berkayel"],
};
const STREETS = [
  "Rue de l'Indépendance", "Avenue Pierre Gemayel", "Rue Sursock",
  "Boulevard Pasteur", "Rue Bliss", "Rue Gouraud", "Avenue Charles Helou",
  "Rue Berlin", "Rue Spears", "Rue Tabaris",
];

const NIVEAUX = [
  "PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2",
  "6e", "5e", "4e", "3e", "2nde", "1ère", "Tle",
];

const PREV_SCHOOLS = [
  "Notre-Dame de Jamhour", "Collège Louise Wegmann", "Sagesse",
  "Antonine", "Champville", "Eastwood", "International College",
  "American Community School", "Collège Père Michel", "Lycée Verdun",
  "(autre / hors Liban)",
];

const SPECIALITES = [
  "LLCE anglais", "Physique-Chimie", "SVT", "Maths", "SES", "HGGSP", "HLP",
];
const STATUSES_WEIGHTED: ReadonlyArray<[ApplicationStatus, number]> = [
  ["DRAFT", 55],
  ["SUBMITTED", 30],
  ["UNDER_REVIEW", 10],
  ["ACCEPTED", 5],
];
const KIDS_WEIGHTED: ReadonlyArray<[number, number]> = [
  [1, 30],
  [2, 45],
  [3, 20],
  [4, 5],
];

// ── Helpers to fabricate per-row data ─────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30);
}

function randomDobForNiveau(niveau: string): Date {
  // Rough year offset from niveau → birth year (2026-05 reference).
  const map: Record<string, number> = {
    PS: 3, MS: 4, GS: 5, CP: 6, CE1: 7, CE2: 8, CM1: 9, CM2: 10,
    "6e": 11, "5e": 12, "4e": 13, "3e": 14, "2nde": 15, "1ère": 16, Tle: 17,
  };
  const age = map[niveau] ?? 10;
  const year = 2026 - age;
  const month = int(1, 12);
  const day = int(1, 28);
  return new Date(Date.UTC(year, month - 1, day));
}

function pedagogiqueForNiveau(niveau: string): Record<string, unknown> {
  const ce2_3eme = { arabe: maybe(0.6) ? "ALM" : "ALE" };
  const seconde = {
    lva: pick(["arabe", "anglais"]),
    lvb: pick(["arabe", "anglais", "espagnol"]),
    lvc: maybe(0.4) ? [pick(["arabe", "espagnol"])] : [],
    artsPlastiques: maybe(0.2),
    siCit: maybe(0.15),
    sectionInternationale: maybe(0.15),
  };
  const premiere = {
    specialites: pickN(SPECIALITES, 3),
    lva: pick(["arabe", "anglais"]),
    lvb: pick(["arabe", "anglais", "espagnol"]),
    lvc: maybe(0.3) ? [pick(["arabe", "espagnol"])] : [],
    artsPlastiques: maybe(0.2),
    bfi: maybe(0.1),
    complementLibanaisPhysique: maybe(0.2),
  };
  const tlSpecs = pickN(SPECIALITES, 2);
  const keepsMaths = tlSpecs.includes("Maths");
  const terminale = {
    specialites: tlSpecs,
    lva: pick(["arabe", "anglais"]),
    lvb: pick(["arabe", "anglais", "espagnol"]),
    lvc: maybe(0.3) ? [pick(["arabe", "espagnol"])] : [],
    artsPlastiques: maybe(0.2),
    mathsComplementaire: !keepsMaths && maybe(0.4),
    mathsExpertes: keepsMaths && maybe(0.4),
    complementLibanaisPhysiqueSvt: maybe(0.2),
  };
  return { ce2_3eme, seconde, premiere, terminale };
}

function pickN<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rand() * copy.length);
    out.push(copy[idx]!);
    copy.splice(idx, 1);
  }
  return out;
}

function scolariteData(niveau: string): Record<string, unknown> {
  const previousSchool = pick(PREV_SCHOOLS);
  const previousNetwork = previousSchool.startsWith("(") ? "autre" : pick(["MLF", "AEFE", "autre"]);
  return {
    previousSchool,
    previousClass: niveau,
    previousNetwork,
    attendedMlfBefore: previousNetwork === "MLF",
    history: [],
    ebepPrevious: maybe(0.1),
    ebepPreviousFlags: { PAI: maybe(0.05), PAP: false, PPS: false, PPRE: false, AESH: false },
    ebepCurrent: maybe(0.08),
    ebepCurrentFlags: { PAI: maybe(0.04), PAP: false, PPS: false, PPRE: false, AESH: false },
    bilansRealises: {
      orthophonique: maybe(0.1),
      psychologique: maybe(0.05),
      psychomoteur: false,
      psychoPediatrique: false,
    },
    dispenseLibanais: maybe(0.05) ? "oui" : "non",
    entryDate: "2026-09-01",
    section: "",
  };
}

function transportData(niveau: string): Record<string, unknown> {
  const isMaternelle = ["PS", "MS", "GS"].includes(niveau);
  const modeAller = pickWeighted([
    ["bus", 65] as const,
    ["parents", 35] as const,
  ]);
  const modeRetour = pickWeighted([
    ["bus", 60] as const,
    ["parents", 40] as const,
  ]);
  return {
    modeAller,
    modeRetour,
    hasAlternateAddress: false,
    altCaza: "",
    altVillage: "",
    altStreet: "",
    altBuilding: "",
    altFloor: "",
    altDetails: "",
    altNotes: "",
    // Collation mandatory in maternelle; ~50% otherwise.
    collation: isMaternelle ? true : maybe(0.5),
    cantine: maybe(0.7),
  };
}

function financeData(): Record<string, unknown> {
  return {
    acknowledgedReglementInterieur: true,
    acknowledgedReglementFinancier: true,
    acknowledgedDroitsEntreeMlf: true,
    comiteParents: maybe(0.7),
    caisseLbp: pick(["", "3000000", "6000000", "9000000", "none", "autre"]),
    caisseLbpAutreAmount: "",
    caisseUsd: pick(["", "30", "60", "90", "none"]),
    caisseUsdAutreAmount: "",
  };
}

function sanitizedEmail(firstName: string, lastName: string, idx: number): string {
  const fn = slugify(firstName);
  const ln = slugify(lastName);
  return `${fn}.${ln}.${idx}@example-glfl.lb`;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log(`🌱 Seeding ${TARGET_COUNT} random families.\n`);

  // List all tenants up-front so the operator always knows what's in
  // the DB before any writes happen.
  const allTenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  if (allTenants.length === 0) {
    console.error("No tenant found in DB. Aborting.");
    process.exit(1);
  }
  console.log("Tenants in DB:");
  for (const t of allTenants) {
    console.log(`  • ${t.name}  (${t.slug})  [id: ${t.id}]`);
  }
  console.log("");

  if (LIST_ONLY) return;

  // Resolution order:
  //   1. --tenant=<id>          (most explicit)
  //   2. --tenant-name=<query>  (case-insensitive contains match)
  //   3. exactly one tenant in DB → use it
  //   4. otherwise → REFUSE and ask the operator to choose
  let tenant: { id: string; name: string } | null = null;
  if (EXPLICIT_TENANT_ID) {
    tenant = allTenants.find((x) => x.id === EXPLICIT_TENANT_ID) ?? null;
    if (!tenant) {
      console.error(`No tenant with id "${EXPLICIT_TENANT_ID}". Aborting.`);
      process.exit(1);
    }
  } else if (EXPLICIT_TENANT_NAME) {
    const q = EXPLICIT_TENANT_NAME.toLowerCase();
    const matches = allTenants.filter((x) =>
      x.name.toLowerCase().includes(q),
    );
    if (matches.length === 0) {
      console.error(`No tenant name matches "${EXPLICIT_TENANT_NAME}". Aborting.`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.error(
        `Multiple tenants match "${EXPLICIT_TENANT_NAME}":`,
        matches.map((m) => m.name).join(", "),
      );
      console.error("Refine --tenant-name or use --tenant=<id> instead. Aborting.");
      process.exit(1);
    }
    tenant = matches[0]!;
  } else if (allTenants.length === 1) {
    tenant = allTenants[0]!;
  } else {
    console.error(
      "Multiple tenants exist — pick one explicitly to avoid seeding the wrong school:",
    );
    console.error("  npx tsx prisma/seed-random-families.ts --tenant-name=Montaigne");
    console.error(`  npx tsx prisma/seed-random-families.ts --tenant=<id>`);
    process.exit(1);
  }
  console.log(`✓ Seeding into: ${tenant.name} (${tenant.id})\n`);

  // List every cycle the tenant has, then resolve the target with the
  // same rules as the tenant selector. Refuses to guess when multiple
  // exist — too easy to seed into the wrong campaign otherwise.
  const allCycles = await prisma.admissionCycle.findMany({
    where: { tenantId: tenant.id },
    orderBy: { openAt: "desc" },
    select: {
      id: true,
      label: true,
      targetYearLabel: true,
      isActive: true,
      openAt: true,
    },
  });
  console.log(
    allCycles.length === 0
      ? "No cycles in this tenant yet — one will be created."
      : "Cycles in this tenant:",
  );
  for (const c of allCycles) {
    const open = c.openAt.toISOString().slice(0, 10);
    console.log(
      `  • ${c.label}  (${c.targetYearLabel})  opens ${open}  ${c.isActive ? "[active]" : "[inactive]"}  [id: ${c.id}]`,
    );
  }
  console.log("");

  if (LIST_CYCLES) return;

  let cycle:
    | { id: string; label: string; targetYearLabel: string }
    | null = null;
  if (EXPLICIT_CYCLE_ID) {
    cycle = allCycles.find((c) => c.id === EXPLICIT_CYCLE_ID) ?? null;
    if (!cycle) {
      console.error(`No cycle with id "${EXPLICIT_CYCLE_ID}" in this tenant. Aborting.`);
      process.exit(1);
    }
  } else if (EXPLICIT_CYCLE_NAME) {
    const q = EXPLICIT_CYCLE_NAME.toLowerCase();
    const matches = allCycles.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.targetYearLabel.toLowerCase().includes(q),
    );
    if (matches.length === 0) {
      console.error(`No cycle matches "${EXPLICIT_CYCLE_NAME}". Aborting.`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.error(
        `Multiple cycles match "${EXPLICIT_CYCLE_NAME}":`,
        matches.map((m) => `${m.label} (${m.targetYearLabel})`).join(", "),
      );
      console.error("Refine --cycle-name or use --cycle=<id>. Aborting.");
      process.exit(1);
    }
    cycle = matches[0]!;
  } else if (allCycles.length === 0) {
    // No cycles at all — auto-create a placeholder for next school year.
    const created = await prisma.admissionCycle.create({
      data: {
        tenantId: tenant.id,
        label: "Seed 2026-2027",
        targetYearLabel: "2026-2027",
        openAt: new Date("2026-01-01"),
        closeAt: new Date("2026-08-31"),
        schoolStartDate: new Date("2026-09-01"),
        currency: "USD",
        isActive: true,
      },
      select: { id: true, label: true, targetYearLabel: true },
    });
    cycle = created;
    console.log(`Created placeholder cycle: ${cycle.label}`);
  } else if (allCycles.length === 1) {
    cycle = allCycles[0]!;
  } else {
    console.error(
      "Multiple cycles exist — pick one explicitly to avoid seeding the wrong one:",
    );
    console.error("  npx tsx prisma/seed-random-families.ts --tenant-name=... --cycle-name=<query>");
    console.error("  npx tsx prisma/seed-random-families.ts --tenant-name=... --cycle=<id>");
    process.exit(1);
  }
  console.log(`✓ Seeding into cycle: ${cycle.label} (${cycle.targetYearLabel})\n`);

  // Establishments — group niveaux into Maternelle / Élémentaire /
  // Collège / Lycée. Reuse if already present, otherwise create.
  const targetEsts = [
    { name: "Maternelle", levels: ["PS", "MS", "GS"], order: 0 },
    { name: "Élémentaire", levels: ["CP", "CE1", "CE2", "CM1", "CM2"], order: 1 },
    { name: "Collège", levels: ["6e", "5e", "4e", "3e"], order: 2 },
    { name: "Lycée", levels: ["2nde", "1ère", "Tle"], order: 3 },
  ];
  const ests: { id: string; name: string; levels: string[] }[] = [];
  for (const t of targetEsts) {
    const found = await prisma.establishment.findUnique({
      where: { tenantId_name: { tenantId: tenant.id, name: t.name } },
      select: { id: true, levels: true },
    });
    if (found) {
      const levels = Array.isArray(found.levels)
        ? (found.levels.filter((x) => typeof x === "string") as string[])
        : [];
      ests.push({ id: found.id, name: t.name, levels: levels.length > 0 ? levels : t.levels });
    } else {
      const created = await prisma.establishment.create({
        data: {
          tenantId: tenant.id,
          name: t.name,
          levels: t.levels,
          order: t.order,
          isActive: true,
        },
        select: { id: true },
      });
      ests.push({ id: created.id, name: t.name, levels: t.levels });
    }
  }
  console.log(`Establishments ready: ${ests.map((e) => e.name).join(", ")}\n`);

  // Find niveau → establishmentId mapping.
  const niveauToEst: Record<string, string> = {};
  for (const est of ests) {
    for (const lv of est.levels) niveauToEst[lv] = est.id;
  }

  // Pre-hash a single password for speed (all seeded parents share it).
  const passwordHash = await bcrypt.hash("password123", 10);

  // Track family-code allocation manually to skip the increment dance.
  let familyCodeNext =
    (
      await prisma.family.aggregate({
        where: { tenantId: tenant.id },
        _count: { _all: true },
      })
    )._count._all + 1;

  let createdParents = 0;
  let createdKids = 0;

  const start = Date.now();
  for (let i = 0; i < TARGET_COUNT; i++) {
    const lastName = pick(SURNAMES);
    const lastNameAr = SURNAMES_AR[SURNAMES.indexOf(lastName)] ?? lastName;
    const isMale = maybe(0.5);
    const firstName = pick(isMale ? FIRSTNAMES_M : FIRSTNAMES_F);
    const firstNameAr =
      (isMale ? FIRSTNAMES_M_AR : FIRSTNAMES_F_AR)[
        (isMale ? FIRSTNAMES_M : FIRSTNAMES_F).indexOf(firstName)
      ] ?? firstName;

    const email = sanitizedEmail(firstName, lastName, i);
    const caza = pick(CAZAS);
    const village = pick(VILLAGES_BY_CAZA[caza] ?? ["Centre"]);
    const street = pick(STREETS);
    const isLebanese = maybe(0.85);
    const monoParental = maybe(0.07);

    // Skip if email collides — unlikely, but be defensive.
    const dupe = await prisma.user.findFirst({
      where: { email, tenantId: tenant.id },
      select: { id: true },
    });
    if (dupe) continue;

    // 1. User + Guardian + Family (one tx so all rollback if any fail).
    const familyCode = `F-${String(familyCodeNext).padStart(4, "0")}`;
    familyCodeNext++;

    const { user, family } = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          firstName,
          lastName,
          name: `${firstName} ${lastName}`,
          passwordHash,
          role: "PARENT",
          status: "ACTIVE",
          locale: "fr",
          emailVerified: new Date(),
        },
        select: { id: true },
      });
      const fam = await tx.family.create({
        data: {
          tenantId: tenant.id,
          code: familyCode,
          name: `Famille ${lastName}`,
          addressStreet: `${int(1, 200)} ${street}`,
          addressHood: village,
          addressCity: caza,
          addressCountry: "Liban",
          imageRightsSite: maybe(0.7),
          imageRightsBook: maybe(0.85),
          imageRightsSocial: maybe(0.5),
          imageRightsRadio: maybe(0.6),
          imageRightsAnsweredAt: new Date(),
        },
        select: { id: true },
      });
      await tx.guardian.create({
        data: {
          tenantId: tenant.id,
          userId: u.id,
          familyId: fam.id,
          relation: isMale ? "Père" : "Mère",
        },
      });
      return { user: u, family: fam };
    });
    createdParents++;

    // 2. Kids — 1 to 4 with weighted distribution.
    const nKids = pickWeighted(KIDS_WEIGHTED);
    for (let k = 0; k < nKids; k++) {
      const kidIsMale = maybe(0.5);
      const kidFirstName = pick(kidIsMale ? FIRSTNAMES_M : FIRSTNAMES_F);
      const kidFirstNameAr =
        (kidIsMale ? FIRSTNAMES_M_AR : FIRSTNAMES_F_AR)[
          (kidIsMale ? FIRSTNAMES_M : FIRSTNAMES_F).indexOf(kidFirstName)
        ] ?? kidFirstName;
      const niveau = pick(NIVEAUX);
      const establishmentId = niveauToEst[niveau]!;
      const dob = randomDobForNiveau(niveau);
      const kidLebanese = maybe(0.85);
      const status = pickWeighted(STATUSES_WEIGHTED);

      const dossierAnswers = {
        foyer: {
          building: `Imm. ${int(1, 30)}`,
          floor: String(int(0, 12)),
          details: "",
          notes: "",
        },
        scolarite: scolariteData(niveau),
        pedagogique: pedagogiqueForNiveau(niveau),
        transport: transportData(niveau),
        finance: financeData(),
        validation: { acknowledged: status !== "DRAFT" },
      };

      const allTabsDone = status !== "DRAFT";

      const app = await prisma.application.create({
        data: {
          tenantId: tenant.id,
          cycleId: cycle.id,
          submittedByUserId: user.id,
          childFirstName: kidFirstName,
          childLastName: lastName,
          childDob: dob,
          childGender: kidIsMale ? "MALE" : "FEMALE",
          childIsLebanese: kidLebanese,
          childPassportLebanese: kidLebanese
            ? `${int(10000000, 99999999)}`
            : null,
          childNationality: kidLebanese ? null : pick(["Française", "Syrienne", "Jordanienne", "Américaine"]),
          childNationality2: !kidLebanese && maybe(0.3) ? "Libanaise" : null,
          childPlaceOfBirth: pick(VILLAGES_BY_CAZA.Beyrouth ?? ["Beyrouth"]),
          childBirthCountry: kidLebanese ? "Liban" : pick(["France", "Syrie", "Émirats arabes unis"]),
          childFirstNameAr: kidFirstNameAr,
          childLastNameAr: lastNameAr,
          establishmentId,
          niveau,
          requestedLevel: niveau,
          primaryParentName: `${firstName} ${lastName}`,
          primaryParentEmail: email,
          monoParental,
          submitterRelation: isMale ? "pere" : "mere",
          submitterIsLebanese: isLebanese,
          submitterPassportLebanese: isLebanese
            ? `${int(10000000, 99999999)}`
            : null,
          submitterNationality: isLebanese ? null : pick(["Française", "Syrienne"]),
          submitterNationality2: null,
          dossierAnswers: dossierAnswers as never,
          tabsCompleted: (allTabsDone
            ? {
                eleve: true,
                responsables: true,
                foyer: true,
                scolarite: true,
                transport: true,
                contacts: true,
                validation: true,
              }
            : { eleve: maybe(0.7), responsables: maybe(0.5) }) as never,
          status,
          submittedAt: status !== "DRAFT" ? new Date() : null,
          // Emergency contact (urgence).
          contacts: {
            create: [
              {
                tenantId: tenant.id,
                kind: "URGENCE",
                order: 0,
                firstName: pick(FIRSTNAMES_M.concat(FIRSTNAMES_F)),
                lastName: pick(SURNAMES),
                relation: pick(["oncle", "tante", "grand_pere", "grand_mere", "cousin"]),
                phoneMobile: `+961 ${int(70, 81)} ${int(100000, 999999)}`,
                phoneHome: null,
              },
            ],
          },
        },
        select: { id: true },
      });
      createdKids++;

      // For ACCEPTED apps, also create a Student linked to the family.
      if (status === "ACCEPTED") {
        await prisma.student.create({
          data: {
            tenantId: tenant.id,
            familyId: family.id,
            firstName: kidFirstName,
            lastName,
            dob,
            gender: kidIsMale ? "MALE" : "FEMALE",
            // resultingStudentId linking is skipped for brevity — admin
            // can backfill later if needed.
          },
        });
        await prisma.application.update({
          where: { id: app.id },
          data: { /* link kept loose */ },
        });
      }
    }

    if ((i + 1) % 50 === 0) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  ${i + 1}/${TARGET_COUNT} families seeded (${elapsed}s)`);
    }
  }

  console.log(
    `\n✓ Done. ${createdParents} parents · ${createdKids} kids · ${((Date.now() - start) / 1000).toFixed(1)}s`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
