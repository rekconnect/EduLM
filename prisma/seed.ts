import { PrismaClient, Role, StudentStatus, TenantPlan, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "edulm-demo-2026";

async function hash(pw: string) {
  return bcrypt.hash(pw, 10);
}

async function main() {
  console.log("→ seeding Lycée Montaigne demo tenant…");

  const passwordHash = await hash(DEMO_PASSWORD);

  // ── Tenant ───────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "montaigne" },
    update: {},
    create: {
      slug: "montaigne",
      name: "Lycée Montaigne",
      defaultLocale: "fr",
      enabledLocales: ["fr", "en", "ar"],
      plan: TenantPlan.STARTER,
    },
  });

  // ── Super admin (tenant-less, runs the SaaS) ─────────────────────
  // tenantId is nullable so we can't use the compound unique index for upsert.
  const existingSuper = await prisma.user.findFirst({
    where: { email: "super@edulm.app", tenantId: null },
  });
  if (!existingSuper) {
    await prisma.user.create({
      data: {
        email: "super@edulm.app",
        passwordHash,
        role: Role.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        name: "Super Admin",
        locale: "fr",
      },
    });
  }

  // ── School admin ─────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "admin@montaigne.edu.lb" } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "admin@montaigne.edu.lb",
      passwordHash,
      role: Role.SCHOOL_ADMIN,
      status: UserStatus.ACTIVE,
      name: "Directrice",
      locale: "fr",
    },
  });

  // ── Teachers ─────────────────────────────────────────────────────
  const teachers = await Promise.all(
    [
      { email: "claire.dupont@montaigne.edu.lb", name: "Claire Dupont" },
      { email: "marc.haddad@montaigne.edu.lb", name: "Marc Haddad" },
    ].map((t) =>
      prisma.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: t.email } },
        update: {},
        create: {
          tenantId: tenant.id,
          email: t.email,
          passwordHash,
          role: Role.TEACHER,
          status: UserStatus.ACTIVE,
          name: t.name,
          locale: "fr",
        },
      }),
    ),
  );

  // ── Academic year + classes ──────────────────────────────────────
  const year = await prisma.academicYear.upsert({
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

  const classes = await Promise.all(
    [
      { level: "CM2", section: "A", name: "CM2-A" },
      { level: "6ème", section: "A", name: "6ème-A" },
      { level: "6ème", section: "B", name: "6ème-B" },
    ].map((c) =>
      prisma.class.upsert({
        where: {
          tenantId_academicYearId_level_section: {
            tenantId: tenant.id,
            academicYearId: year.id,
            level: c.level,
            section: c.section,
          },
        },
        update: {},
        create: {
          tenantId: tenant.id,
          academicYearId: year.id,
          level: c.level,
          section: c.section,
          name: c.name,
        },
      }),
    ),
  );

  // ── Parents + students + enrollment ──────────────────────────────
  // Idempotency guard: skip the family block if students were already seeded.
  const existingStudentCount = await prisma.student.count({ where: { tenantId: tenant.id } });
  const families = existingStudentCount > 0 ? [] : [
    {
      parent: { email: "sami.kassem@example.com", name: "Sami Kassem" },
      children: [
        { firstName: "Layla", lastName: "Kassem", dob: new Date("2014-03-12"), classIdx: 0 },
        { firstName: "Karim", lastName: "Kassem", dob: new Date("2012-11-04"), classIdx: 1 },
      ],
    },
    {
      parent: { email: "rania.nasr@example.com", name: "Rania Nasr" },
      children: [
        { firstName: "Joseph", lastName: "Nasr", dob: new Date("2013-07-22"), classIdx: 2 },
      ],
    },
  ];

  if (existingStudentCount > 0) {
    console.log(`(${existingStudentCount} students already seeded for ${tenant.slug} — skipping family block)`);
  }

  for (const family of families) {
    const parentUser = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: family.parent.email } },
      update: {},
      create: {
        tenantId: tenant.id,
        email: family.parent.email,
        passwordHash,
        role: Role.PARENT,
        status: UserStatus.ACTIVE,
        name: family.parent.name,
        locale: "fr",
      },
    });

    const guardian = await prisma.guardian.upsert({
      where: { userId: parentUser.id },
      update: {},
      create: {
        tenantId: tenant.id,
        userId: parentUser.id,
        relation: "parent",
      },
    });

    for (const child of family.children) {
      const student = await prisma.student.create({
        data: {
          tenantId: tenant.id,
          firstName: child.firstName,
          lastName: child.lastName,
          dob: child.dob,
          status: StudentStatus.ENROLLED,
        },
      });

      await prisma.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: guardian.id,
          isPrimary: true,
        },
      });

      const klass = classes[child.classIdx];
      if (!klass) continue;

      await prisma.enrollment.create({
        data: {
          tenantId: tenant.id,
          studentId: student.id,
          classId: klass.id,
          academicYearId: year.id,
        },
      });
    }
  }

  console.log("✔ seed complete\n");
  console.log("Demo accounts (all password = " + DEMO_PASSWORD + "):");
  console.log("  super@edulm.app             — SUPER_ADMIN");
  console.log("  admin@montaigne.edu.lb      — SCHOOL_ADMIN");
  console.log("  claire.dupont@montaigne.edu.lb — TEACHER");
  console.log("  marc.haddad@montaigne.edu.lb   — TEACHER");
  console.log("  sami.kassem@example.com     — PARENT (2 children)");
  console.log("  rania.nasr@example.com      — PARENT (1 child)");
  console.log(`\nTenant slug: ${tenant.slug}  (dev URL: http://localhost:3000/t/${tenant.slug}/...)`);

  void teachers;
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
