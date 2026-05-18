/**
 * Bulk demo seed for Lycée Montaigne. Layers on top of the basic seed:
 *
 * - All 15 French school levels (PS → Terminale) × 1-2 random sections,
 *   for both academic years (2025-2026 + 2026-2027).
 * - ~25 teachers with Franco-Lebanese names.
 * - ~250 parent accounts (some with siblings).
 * - ~300 students enrolled in the active year (2025-2026).
 *
 * Idempotent guard: skips if the tenant already has > 80 students. Use the
 * --force flag to layer additional families on top anyway.
 *
 * Run with:  npx tsx prisma/seed-large.ts
 *      or:  npx tsx prisma/seed-large.ts --force
 */
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");
const DEMO_PASSWORD = "edulm-demo-2026";

// Deterministic PRNG so re-running with --force doesn't randomly diverge.
let seed = 1337;
function rand() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}
function randInt(min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

// ── Level / section data ─────────────────────────────────────────

const LEVELS = [
  { level: "PS", age: 3, sections: 1 },
  { level: "MS", age: 4, sections: 1 },
  { level: "GS", age: 5, sections: 1 },
  { level: "CP", age: 6, sections: 2 },
  { level: "CE1", age: 7, sections: 2 },
  { level: "CE2", age: 8, sections: 2 },
  { level: "CM1", age: 9, sections: 2 },
  { level: "CM2", age: 10, sections: 2 },
  { level: "6ème", age: 11, sections: 2 },
  { level: "5ème", age: 12, sections: 2 },
  { level: "4ème", age: 13, sections: 2 },
  { level: "3ème", age: 14, sections: 2 },
  { level: "Seconde", age: 15, sections: 1 },
  { level: "Première", age: 16, sections: 1 },
  { level: "Terminale", age: 17, sections: 1 },
] as const;

const SECTIONS = ["A", "B", "C"] as const;

// ── Names ────────────────────────────────────────────────────────

const MALE_FIRST = [
  "Adam", "Ali", "Antoine", "Charbel", "Elie", "Fady", "Gabriel", "Georges",
  "Hadi", "Hassan", "Hicham", "Ibrahim", "Jad", "Joseph", "Karim", "Khalil",
  "Marc", "Michel", "Mounir", "Nabil", "Naji", "Nicolas", "Omar", "Paul",
  "Pierre", "Rabih", "Raed", "Riad", "Roy", "Sami", "Tarek", "Tony",
  "Walid", "Wissam", "Youssef", "Ziad",
];

const FEMALE_FIRST = [
  "Aline", "Aya", "Carla", "Carole", "Christine", "Claire", "Diana", "Elena",
  "Elsa", "Farah", "Faten", "Hala", "Joelle", "Joumana", "Karine", "Lara",
  "Layla", "Leila", "Lina", "Maria", "Mariam", "Maya", "Nada", "Najwa",
  "Nour", "Pamela", "Rana", "Rania", "Reem", "Rita", "Sandra", "Sarah",
  "Tania", "Yara", "Yasmina", "Zeina",
];

const LAST_NAMES = [
  "Abboud", "Abi-Nader", "Abou-Khalil", "Achkar", "Akl", "Antoun", "Aoun",
  "Assaf", "Aziz", "Bardawil", "Bassil", "Boutros", "Chamoun", "Chaoul",
  "Choueiry", "Daher", "Dagher", "Doumit", "El-Achkar", "El-Hage", "El-Khoury",
  "Fares", "Geagea", "Ghorayeb", "Gemayel", "Habib", "Haddad", "Hajj",
  "Hanna", "Harb", "Hashem", "Hayek", "Helou", "Issa", "Jabbour", "Karam",
  "Khalil", "Khoury", "Lahoud", "Maalouf", "Mansour", "Matar", "Mawad",
  "Mouawad", "Nahas", "Nassar", "Nehme", "Obeid", "Rahme", "Raji", "Rizk",
  "Saad", "Saade", "Sader", "Salameh", "Salem", "Samaha", "Sfeir", "Sleiman",
  "Tabet", "Tannous", "Yazbeck", "Younes", "Zakhour",
];

const RELATIONS = ["père", "mère", "tuteur"] as const;

// ── Helpers ──────────────────────────────────────────────────────

function slugifyEmail(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function randomDob(age: number, year: number): Date {
  // Born in [year - age - 1, year - age + 1] roughly — picks a date in
  // the school year that fits the level.
  const yearBorn = year - age;
  const month = randInt(0, 11);
  const day = randInt(1, 28);
  return new Date(Date.UTC(yearBorn, month, day));
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log("→ Large seed: Lycée Montaigne");

  const tenant = await prisma.tenant.findUnique({ where: { slug: "montaigne" } });
  if (!tenant) {
    throw new Error("Run `npm run db:seed` first to create the Montaigne tenant.");
  }

  const existingStudents = await prisma.student.count({ where: { tenantId: tenant.id } });
  if (existingStudents > 80 && !FORCE) {
    console.log(`(tenant already has ${existingStudents} students — pass --force to add more)`);
    return;
  }
  console.log(`  existing students: ${existingStudents}`);

  // ── Academic years ──────────────────────────────────────────
  const year2526 = await prisma.academicYear.upsert({
    where: { tenantId_label: { tenantId: tenant.id, label: "2025-2026" } },
    update: { isActive: true },
    create: {
      tenantId: tenant.id,
      label: "2025-2026",
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-06-30"),
      isActive: true,
    },
  });
  const year2627 = await prisma.academicYear.upsert({
    where: { tenantId_label: { tenantId: tenant.id, label: "2026-2027" } },
    update: {},
    create: {
      tenantId: tenant.id,
      label: "2026-2027",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-06-30"),
      isActive: false,
    },
  });
  console.log(`  ✓ Academic years ensured`);

  // ── Classes for both years ──────────────────────────────────
  let classesCreated = 0;
  const classesByYear: Record<string, { id: string; level: string; section: string }[]> = {
    [year2526.id]: [],
    [year2627.id]: [],
  };
  for (const year of [year2526, year2627]) {
    for (const lv of LEVELS) {
      for (let i = 0; i < lv.sections; i++) {
        const section = SECTIONS[i]!;
        const created = await prisma.class.upsert({
          where: {
            tenantId_academicYearId_level_section: {
              tenantId: tenant.id,
              academicYearId: year.id,
              level: lv.level,
              section,
            },
          },
          update: {},
          create: {
            tenantId: tenant.id,
            academicYearId: year.id,
            level: lv.level,
            section,
            name: `${lv.level}-${section}`,
          },
          select: { id: true, level: true, section: true },
        });
        classesByYear[year.id]!.push(created);
        classesCreated++;
      }
    }
  }
  console.log(`  ✓ ${classesCreated} class slots ensured (both years)`);

  // ── Teachers ────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  let teachersCreated = 0;
  const teacherCount = 25;
  for (let i = 0; i < teacherCount; i++) {
    const female = rand() > 0.5;
    const first = pick(female ? FEMALE_FIRST : MALE_FIRST);
    const last = pick(LAST_NAMES);
    const email = `${slugifyEmail(first)}.${slugifyEmail(last)}.t${i}@montaigne.edu.lb`;
    const exists = await prisma.user.findFirst({
      where: { tenantId: tenant.id, email },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        name: `${first} ${last}`,
        passwordHash,
        role: "TEACHER" as Role,
        status: "ACTIVE",
        locale: "fr",
        emailVerified: new Date(),
      },
    });
    teachersCreated++;
  }
  console.log(`  ✓ ${teachersCreated} new teachers created`);

  // ── Parents + Students + Enrollments ────────────────────────
  // Strategy: build ~200 families. Each family has 1 primary parent (with
  // user account + guardian row) and 1-3 children. Children are spread
  // across the levels with slight clustering by family for realism.
  const targetFamilies = 200;
  const startYear = 2025;
  const activeClasses = classesByYear[year2526.id]!;
  // Group classes by level for level-bound enrollment.
  const classesByLevel = new Map<string, { id: string; level: string; section: string }[]>();
  for (const c of activeClasses) {
    if (!classesByLevel.has(c.level)) classesByLevel.set(c.level, []);
    classesByLevel.get(c.level)!.push(c);
  }

  let parentsCreated = 0;
  let studentsCreated = 0;
  let enrollmentsCreated = 0;

  for (let f = 0; f < targetFamilies; f++) {
    const familyLast = pick(LAST_NAMES);
    const primaryFemale = rand() > 0.45;
    const primaryFirst = pick(primaryFemale ? FEMALE_FIRST : MALE_FIRST);
    const parentEmail = `${slugifyEmail(primaryFirst)}.${slugifyEmail(familyLast)}.${f}@example.com`;

    let parent = await prisma.user.findFirst({
      where: { tenantId: tenant.id, email: parentEmail },
      select: { id: true, guardianProfile: { select: { id: true } } },
    });
    let guardianId: string;
    if (!parent) {
      const created = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: parentEmail,
          name: `${primaryFirst} ${familyLast}`,
          passwordHash,
          role: "PARENT" as Role,
          status: "ACTIVE",
          locale: "fr",
          emailVerified: new Date(),
        },
        select: { id: true },
      });
      const guardian = await prisma.guardian.create({
        data: {
          tenantId: tenant.id,
          userId: created.id,
          relation: primaryFemale ? "mère" : pick(RELATIONS),
        },
        select: { id: true },
      });
      guardianId = guardian.id;
      parentsCreated++;
    } else {
      if (parent.guardianProfile) {
        guardianId = parent.guardianProfile.id;
      } else {
        const g = await prisma.guardian.create({
          data: {
            tenantId: tenant.id,
            userId: parent.id,
            relation: pick(RELATIONS),
          },
          select: { id: true },
        });
        guardianId = g.id;
      }
    }

    // 1-3 children, weighted toward 1.
    const childCount = rand() < 0.65 ? 1 : rand() < 0.85 ? 2 : 3;
    // Pick a base level for the eldest, then siblings are 1-3 levels younger.
    const baseLevelIdx = randInt(0, LEVELS.length - 1);
    for (let c = 0; c < childCount; c++) {
      const levelIdx = Math.max(0, baseLevelIdx - c);
      const lv = LEVELS[levelIdx]!;
      const sectionList = classesByLevel.get(lv.level) ?? [];
      if (sectionList.length === 0) continue;
      const klass = pick(sectionList);

      const female = rand() > 0.5;
      const childFirst = pick(female ? FEMALE_FIRST : MALE_FIRST);
      // Avoid sibling name clash within same family
      const student = await prisma.student.create({
        data: {
          tenantId: tenant.id,
          firstName: childFirst,
          lastName: familyLast,
          dob: randomDob(lv.age, startYear),
          status: "ENROLLED",
        },
        select: { id: true },
      });
      await prisma.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId,
          isPrimary: c === 0,
        },
      });
      // Enroll for current year only. Use upsert in case the unique
      // (studentId, academicYearId) collides (shouldn't, but defensive).
      await prisma.enrollment.upsert({
        where: {
          studentId_academicYearId: { studentId: student.id, academicYearId: year2526.id },
        },
        update: { classId: klass.id },
        create: {
          tenantId: tenant.id,
          studentId: student.id,
          classId: klass.id,
          academicYearId: year2526.id,
        },
      });
      studentsCreated++;
      enrollmentsCreated++;
    }
  }

  console.log(`  ✓ ${parentsCreated} new parents, ${studentsCreated} new students, ${enrollmentsCreated} new enrollments`);

  // ── Summary ─────────────────────────────────────────────────
  const [tFinal, sFinal, pFinal, eFinal, cFinal] = await Promise.all([
    prisma.user.count({ where: { tenantId: tenant.id, role: "TEACHER" } }),
    prisma.student.count({ where: { tenantId: tenant.id } }),
    prisma.user.count({ where: { tenantId: tenant.id, role: "PARENT" } }),
    prisma.enrollment.count({ where: { tenantId: tenant.id } }),
    prisma.class.count({ where: { tenantId: tenant.id } }),
  ]);
  console.log(`\n✔ Done. Totals for ${tenant.name}:`);
  console.log(`  Teachers:    ${tFinal}`);
  console.log(`  Parents:     ${pFinal}`);
  console.log(`  Students:    ${sFinal}`);
  console.log(`  Classes:     ${cFinal}`);
  console.log(`  Enrollments: ${eFinal}`);
  console.log(`\nAll new users have password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
