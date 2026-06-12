/**
 * Dars → EduLM  ·  Phase 1: families + parents + students + links
 *
 * Imports, for every student enrolled in the last N years (default: since
 * SYear 2021), the student, its parents (as DISABLED User + Guardian),
 * the Family that groups them (via Isc_Parent.Id_MainParent → the father),
 * and the StudentGuardian links.
 *
 * Idempotent — re-run safe. Anchors:
 *   Family.darsRootParentId, User.darsParentId, Student.darsStudentId.
 *
 * DRY RUN by default. Pass --confirm to write.
 *
 * Run:
 *   npx tsx scripts/dars-import/phase1-families.ts --tenant-name="Lycée Montaigne"
 *   npx tsx scripts/dars-import/phase1-families.ts --tenant-name="Lycée Montaigne" --confirm
 *   (optional) --since-year=2021
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID } from "./lib/dars-pool.js";
import { CodesTable } from "./lib/codes.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

// ── Dars row shapes (only the columns we read) ───────────────────────
type DStudent = {
  ID_Student: number;
  ID_Father: number | null;
  ID_Mother: number | null;
  ID_Gardian: number | null;
  FirstName: string | null;
  LastName: string | null;
  Gender: string | null;
  DateOfBirth: Date | string | null;
  BirthPlace: string | null;
  Id_Nation1: number | null;
  Id_Nation2: number | null;
  Id_Nation3: number | null;
  IdNumber: string | null;
  RegisterNum: string | null;
  IsExclArabic: boolean | null;
  IsExclSport: boolean | null;
};
type DParent = {
  ID_Parent: number;
  ParentCode: string | null;
  FirstName: string | null;
  LastName: string | null;
  Email: string | null;
  Id_Nation1: number | null;
  Id_Nation2: number | null;
  Id_FamilySituation: number | null;
  Id_Address: number | null;
  Id_MainParent: number | null;
  Actual: boolean | null;
};
type DAddress = {
  ID: number;
  Id_Town: number | null;
  Street: string | null;
  Building: string | null;
  AddressFloor: string | null;
  PlaceDetails: string | null;
};

// ── helpers ──────────────────────────────────────────────────────────
const joinName = (a?: string | null, b?: string | null) =>
  [a?.trim(), b?.trim()].filter(Boolean).join(" ") || null;

const clean = (s?: string | null) => {
  const v = (s ?? "").trim();
  return v === "--" || v === "" ? null : v;
};

function toGender(g: string | null): "MALE" | "FEMALE" | "OTHER" | null {
  if (!g) return null;
  const u = g.trim().toUpperCase();
  if (u === "M") return "MALE";
  if (u === "F") return "FEMALE";
  return "OTHER";
}

function toDate(v: Date | string | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const inList = (ids: number[]) => (ids.length ? ids.join(",") : "-1");

async function runChunked<T>(
  items: T[],
  size: number,
  label: string,
  fn: (item: T) => Promise<void>,
) {
  let done = 0;
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    await Promise.all(slice.map(fn));
    done += slice.length;
    process.stdout.write(`\r  ${label}: ${done}/${items.length}`);
  }
  process.stdout.write("\n");
}

// ── main ─────────────────────────────────────────────────────────────
async function main() {
  const { tenantName, confirm } = parseFlags();
  const sinceArg = process.argv.find((a) => a.startsWith("--since-year="));
  const sinceYear = sinceArg ? Number(sinceArg.split("=")[1]) : 2021;

  const tenant = await resolveTenant(prisma, tenantName);
  console.log(`Scope: students enrolled since SYear ${sinceYear}\n`);

  console.log("Loading Dars codes…");
  const codes = await CodesTable.load();
  console.log(
    `  Lebanese NAT id = ${codes.lebaneseNatId}; monoparental SIT ids = [${[...codes.monoParentalSitIds].join(", ")}]\n`,
  );

  // 1. In-scope students
  const students = await darsQuery<DStudent>(
    `SELECT ID_Student, ID_Father, ID_Mother, ID_Gardian, FirstName, LastName,
            Gender, DateOfBirth, BirthPlace, Id_Nation1, Id_Nation2, Id_Nation3,
            IdNumber, RegisterNum, IsExclArabic, IsExclSport
     FROM Isc_Student
     WHERE Id_College = ${DARS_COLLEGE_ID}
       AND ID_Student IN (
         SELECT DISTINCT ID_Student FROM Isc_StudentClass
         WHERE Id_College = ${DARS_COLLEGE_ID} AND SYear >= ${sinceYear}
       )`,
  );
  console.log(`Students in scope: ${students.length}`);

  // Currently-enrolled set → status ENROLLED. Match the Dars dashboard
  // exactly: only CONFIRMED registrations (Registered = 1) in the Actual
  // school year count as currently enrolled. (Registered = 0 rows are
  // pending/unconfirmed and become WITHDRAWN.)
  const currentRows = await darsQuery<{ ID_Student: number }>(
    `SELECT DISTINCT sc.ID_Student
     FROM Isc_StudentClass sc
     JOIN Isc_SchoolYear sy ON sy.SYear = sc.SYear AND sy.Id_College = sc.Id_College
     WHERE sc.Id_College = ${DARS_COLLEGE_ID} AND sy.Actual = 1 AND sc.Registered = 1`,
  );
  const currentSet = new Set(currentRows.map((r) => Number(r.ID_Student)));
  console.log(`Currently enrolled (Actual year, Registered=1): ${currentSet.size}`);

  // 2. Collect referenced parent ids
  const parentIds = new Set<number>();
  for (const s of students) {
    for (const id of [s.ID_Father, s.ID_Mother, s.ID_Gardian]) {
      if (id != null && Number(id) > 0) parentIds.add(Number(id));
    }
  }
  console.log(`Parents referenced: ${parentIds.size}`);

  // 3. Load those parents
  const parents = await darsQuery<DParent>(
    `SELECT ID_Parent, ParentCode, FirstName, LastName, Email, Id_Nation1, Id_Nation2,
            Id_FamilySituation, Id_Address, Id_MainParent, Actual
     FROM Isc_Parent
     WHERE Id_College = ${DARS_COLLEGE_ID} AND ID_Parent IN (${inList([...parentIds])})`,
  );
  const parentById = new Map<number, DParent>();
  for (const p of parents) parentById.set(Number(p.ID_Parent), p);

  // 4. Addresses + towns
  const addrIds = [...new Set(parents.map((p) => p.Id_Address).filter((x): x is number => x != null && x > 0))];
  const addresses = addrIds.length
    ? await darsQuery<DAddress>(
        `SELECT ID, Id_Town, Street, Building, AddressFloor, PlaceDetails
         FROM Isc_Address WHERE Id_College = ${DARS_COLLEGE_ID} AND ID IN (${inList(addrIds)})`,
      )
    : [];
  const addrById = new Map<number, DAddress>();
  for (const a of addresses) addrById.set(Number(a.ID), a);
  const townIds = [...new Set(addresses.map((a) => a.Id_Town).filter((x): x is number => x != null && x > 0))];
  const towns = townIds.length
    ? await darsQuery<{ Id_Town: number; TownName: string | null }>(
        `SELECT Id_Town, TownName FROM Isc_Town WHERE Id_College = ${DARS_COLLEGE_ID} AND Id_Town IN (${inList(townIds)})`,
      )
    : [];
  const townById = new Map<number, string>();
  for (const t of towns) townById.set(Number(t.Id_Town), clean(t.TownName) ?? "");

  // 5. Best phone per parent (prefer mobile = Id_Type 3, then anything)
  const phones = await darsQuery<{ Id_Parent: number; Id_Type: number; PhoneNum: string | null }>(
    `SELECT Id_Parent, Id_Type, PhoneNum FROM Isc_ParentPhone
     WHERE Id_College = ${DARS_COLLEGE_ID} AND Deleted = 0
       AND Id_Parent IN (${inList([...parentIds])})`,
  );
  const phoneByParent = new Map<number, string>();
  for (const ph of phones) {
    const num = clean(ph.PhoneNum);
    if (!num) continue;
    const pid = Number(ph.Id_Parent);
    const existing = phoneByParent.get(pid);
    // Prefer the first mobile (type 3); otherwise keep first seen.
    if (!existing || Number(ph.Id_Type) === 3) phoneByParent.set(pid, num);
  }

  // 6. Per-parent relation (pere / mere / tuteur) from student slots
  const parentRoles = new Map<number, Set<string>>();
  const addRole = (pid: number | null, role: string) => {
    if (pid == null || Number(pid) <= 0) return;
    const k = Number(pid);
    if (!parentRoles.has(k)) parentRoles.set(k, new Set());
    parentRoles.get(k)!.add(role);
  };
  for (const s of students) {
    addRole(s.ID_Father, "pere");
    addRole(s.ID_Mother, "mere");
    if (s.ID_Gardian && s.ID_Gardian !== s.ID_Father && s.ID_Gardian !== s.ID_Mother) {
      addRole(s.ID_Gardian, "tuteur");
    }
  }
  const relationFor = (pid: number): string => {
    const roles = parentRoles.get(pid);
    if (!roles) return "non_defini";
    if (roles.has("pere")) return "pere";
    if (roles.has("mere")) return "mere";
    if (roles.has("tuteur")) return "tuteur";
    return "non_defini";
  };

  // 7. Build families — group parents by root = Id_MainParent || ID_Parent
  const rootOf = (p: DParent) =>
    p.Id_MainParent && Number(p.Id_MainParent) > 0 ? Number(p.Id_MainParent) : Number(p.ID_Parent);
  const familyMembers = new Map<number, number[]>(); // root → [parentId,…]
  for (const p of parents) {
    const root = rootOf(p);
    if (!familyMembers.has(root)) familyMembers.set(root, []);
    familyMembers.get(root)!.push(Number(p.ID_Parent));
  }
  // monoParental per family = any member has a single-parent SIT code
  const familyMono = new Map<number, boolean>();
  for (const [root, members] of familyMembers) {
    const mono = members.some((pid) =>
      codes.isMonoParental(parentById.get(pid)?.Id_FamilySituation ?? null),
    );
    familyMono.set(root, mono);
  }

  function familyAddress(root: number) {
    // Use the root parent's address; fall back to any member with one.
    const candidates = [root, ...(familyMembers.get(root) ?? [])];
    for (const pid of candidates) {
      const p = parentById.get(pid);
      const a = p?.Id_Address ? addrById.get(Number(p.Id_Address)) : undefined;
      if (a) {
        // Rue = Street ONLY. Building / Floor have their own fields
        // (adresse_immeuble / adresse_etage) populated by the enrichment.
        const street = clean(a.Street);
        return {
          addressStreet: street || null,
          addressHood: clean(a.PlaceDetails),
          addressCity: a.Id_Town ? townById.get(Number(a.Id_Town)) || null : null,
          addressCountry: "Liban",
        };
      }
    }
    return { addressStreet: null, addressHood: null, addressCity: null, addressCountry: "Liban" };
  }

  // ── Plan summary ───────────────────────────────────────────────────
  const linkCount = students.reduce((acc, s) => {
    const unique = new Set(
      [s.ID_Father, s.ID_Mother, s.ID_Gardian]
        .filter((x): x is number => x != null && Number(x) > 0)
        .map(Number)
        .filter((id) => parentById.has(id)),
    );
    return acc + unique.size;
  }, 0);

  console.log("\n──────────── PLAN ────────────");
  console.log(`  Families:         ${familyMembers.size}`);
  console.log(`  Parents (User+Guardian): ${parents.length}`);
  console.log(`  Students:         ${students.length}`);
  console.log(`  Student-guardian links:  ${linkCount}`);
  console.log(`  Monoparental families:   ${[...familyMono.values()].filter(Boolean).length}`);
  console.log("──────────────────────────────\n");

  // Sample 3 families
  console.log("Sample families (first 3):");
  let shown = 0;
  for (const [root, members] of familyMembers) {
    if (shown >= 3) break;
    const r = parentById.get(root);
    const addr = familyAddress(root);
    console.log(`  • Family root #${root} — ${r ? joinName(r.FirstName, r.LastName) : "?"}  code F-${String(root).padStart(5, "0")}`);
    console.log(`      address: ${[addr.addressStreet, addr.addressHood, addr.addressCity].filter(Boolean).join(" · ") || "(none)"}  mono=${familyMono.get(root)}`);
    for (const pid of members) {
      const p = parentById.get(pid)!;
      console.log(`      - ${joinName(p.FirstName, p.LastName)} [${relationFor(pid)}]  lib=${codes.isLebanese(p.Id_Nation1, p.Id_Nation2)}  tel=${phoneByParent.get(pid) ?? "-"}  ${clean(p.Email) ?? "(synth email)"}`);
    }
    shown++;
  }
  console.log("");

  if (!confirm) {
    console.log("🟡 DRY RUN — nothing written. Re-run with --confirm to apply.");
    await closeDars();
    await prisma.$disconnect();
    return;
  }

  // ── Execute ────────────────────────────────────────────────────────
  console.log("🔴 CONFIRM — writing to EduLM…\n");

  // Pre-seed used emails with existing (kept) admin/teacher emails.
  const existingUsers = await prisma.user.findMany({
    where: { tenantId: tenant.id },
    select: { email: true },
  });
  const usedEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));
  const emailFor = (p: DParent): string => {
    const e = clean(p.Email)?.toLowerCase();
    if (e && !usedEmails.has(e)) {
      usedEmails.add(e);
      return e;
    }
    const synth = `dars-parent-${p.ID_Parent}@import.lyceemontaigne.local`;
    usedEmails.add(synth);
    return synth;
  };

  // (a) Families
  const familyIdByRoot = new Map<number, string>();
  const roots = [...familyMembers.keys()];
  await runChunked(roots, 25, "families", async (root) => {
    const r = parentById.get(root);
    const addr = familyAddress(root);
    const fam = await prisma.family.upsert({
      where: { darsRootParentId: root },
      update: {
        name: r ? `Famille ${clean(r.LastName) ?? ""}`.trim() : undefined,
        ...addr,
      },
      create: {
        tenantId: tenant.id,
        code: `F-${String(root).padStart(5, "0")}`,
        name: r ? `Famille ${clean(r.LastName) ?? ""}`.trim() : null,
        darsRootParentId: root,
        ...addr,
      },
      select: { id: true },
    });
    familyIdByRoot.set(root, fam.id);
  });

  // (b) Parents → User + Guardian
  const guardianIdByParent = new Map<number, string>();
  // Sort by ID_Parent so email dedup is deterministic (lower id keeps real email).
  const sortedParents = [...parents].sort((a, b) => Number(a.ID_Parent) - Number(b.ID_Parent));
  await runChunked(sortedParents, 20, "parents", async (p) => {
    const pid = Number(p.ID_Parent);
    const root = rootOf(p);
    const familyId = familyIdByRoot.get(root) ?? null;
    const email = emailFor(p);
    const user = await prisma.user.upsert({
      where: { darsParentId: pid },
      update: {
        firstName: clean(p.FirstName),
        lastName: clean(p.LastName),
        name: joinName(p.FirstName, p.LastName),
      },
      create: {
        tenantId: tenant.id,
        email,
        role: "PARENT",
        status: "DISABLED",
        locale: "fr",
        firstName: clean(p.FirstName),
        lastName: clean(p.LastName),
        name: joinName(p.FirstName, p.LastName),
        darsParentId: pid,
      },
      select: { id: true },
    });
    const guardian = await prisma.guardian.upsert({
      where: { userId: user.id },
      update: {
        familyId,
        relation: relationFor(pid),
        isLebanese: codes.isLebanese(p.Id_Nation1, p.Id_Nation2),
        nationality1: codes.label(p.Id_Nation1) || null,
        nationality2: codes.label(p.Id_Nation2) || null,
        monoParental: familyMono.get(root) ?? false,
        phone: phoneByParent.get(pid) ?? null,
      },
      create: {
        tenantId: tenant.id,
        userId: user.id,
        familyId,
        relation: relationFor(pid),
        isLebanese: codes.isLebanese(p.Id_Nation1, p.Id_Nation2),
        nationality1: codes.label(p.Id_Nation1) || null,
        nationality2: codes.label(p.Id_Nation2) || null,
        monoParental: familyMono.get(root) ?? false,
        phone: phoneByParent.get(pid) ?? null,
      },
      select: { id: true },
    });
    guardianIdByParent.set(pid, guardian.id);
  });

  // (c) Students
  const studentIdByDars = new Map<number, string>();
  await runChunked(students, 20, "students", async (s) => {
    const sid = Number(s.ID_Student);
    // Family via father → root; fall back to mother.
    let familyId: string | null = null;
    let familyRoot: number | null = null;
    for (const slot of [s.ID_Father, s.ID_Mother, s.ID_Gardian]) {
      const p = slot ? parentById.get(Number(slot)) : undefined;
      if (p) {
        familyRoot = rootOf(p);
        familyId = familyIdByRoot.get(familyRoot) ?? null;
        if (familyId) break;
      }
    }
    // Mirror the family address onto the student (the student form reads
    // Student.address/city/country directly).
    const addr = familyRoot != null ? familyAddress(familyRoot) : null;
    const studentAddress = addr
      ? [...new Set([addr.addressStreet, addr.addressHood].filter(Boolean))].join(", ") || null
      : null;
    const extras: Record<string, unknown> = {};
    if (codes.isLebanese(s.Id_Nation1, s.Id_Nation2)) extras.isLebanese = true;
    const nat2 = codes.label(s.Id_Nation2);
    const nat3 = codes.label(s.Id_Nation3);
    if (nat2) extras.nationality2 = nat2;
    if (nat3) extras.nationality3 = nat3;
    if (clean(s.IdNumber)) extras.idNumber = clean(s.IdNumber);
    if (clean(s.RegisterNum)) extras.registerNum = clean(s.RegisterNum);
    if (s.IsExclArabic) extras.exemptArabic = true;
    if (s.IsExclSport) extras.exemptSport = true;

    const data = {
      firstName: clean(s.FirstName) ?? "?",
      lastName: clean(s.LastName) ?? "?",
      dob: toDate(s.DateOfBirth),
      gender: toGender(s.Gender),
      placeOfBirth: clean(s.BirthPlace),
      nationality: codes.label(s.Id_Nation1) || null,
      address: studentAddress,
      city: addr?.addressCity ?? null,
      country: addr?.addressCountry ?? "Liban",
      status: currentSet.has(sid) ? ("ENROLLED" as const) : ("WITHDRAWN" as const),
    };
    const student = await prisma.student.upsert({
      where: { darsStudentId: sid },
      update: { ...data, familyId, customAnswers: extras as Prisma.InputJsonValue },
      create: { tenantId: tenant.id, darsStudentId: sid, familyId, customAnswers: extras as Prisma.InputJsonValue, ...data },
      select: { id: true },
    });
    studentIdByDars.set(sid, student.id);
  });

  // (d) StudentGuardian links
  type Link = { studentId: string; guardianId: string; isPrimary: boolean };
  const links: Link[] = [];
  for (const s of students) {
    const studentId = studentIdByDars.get(Number(s.ID_Student));
    if (!studentId) continue;
    const seen = new Set<number>();
    for (const slot of [s.ID_Father, s.ID_Mother, s.ID_Gardian]) {
      if (slot == null || Number(slot) <= 0) continue;
      const pid = Number(slot);
      if (seen.has(pid)) continue;
      seen.add(pid);
      const guardianId = guardianIdByParent.get(pid);
      if (!guardianId) continue;
      links.push({ studentId, guardianId, isPrimary: Number(s.ID_Gardian) === pid });
    }
  }
  await runChunked(links, 10, "links", async (l) => {
    await prisma.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId: l.studentId, guardianId: l.guardianId } },
      update: { isPrimary: l.isPrimary },
      create: l,
    });
  });

  console.log("\n✓ Phase 1 complete.");
  await closeDars();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nERROR:", e);
  await closeDars();
  await prisma.$disconnect();
  process.exit(1);
});
