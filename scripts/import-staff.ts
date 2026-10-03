/**
 * Staff accounts from the School Management list (teachers_YYYY-YYYY.xlsx).
 *
 * Source of truth for personnel = Raed's School Management app export (the
 * Dars payroll tables are obsolete and are NOT consulted). Reads ONLY the
 * columns it needs — Nom, Prenom, Email Address, Personal Email, Type,
 * Fonction, Leaving — the workbook also carries password columns, which this
 * script never touches.
 *
 * Per active row (Type = Teacher | Administrator; AVS and "Leaving" skipped):
 *   - no account on the school e-mail → CREATE a TEACHER / STAFF user,
 *     ACTIVE, Microsoft sign-in only (no password);
 *   - PARENT account on that e-mail → DOUBLE PROFIL: add the staff hat
 *     (User.staffRole) — ONLY when the account is provably that person's
 *     (imported from Dars, or linked to a child, or already signed in with
 *     Microsoft). A self-registered parent account squatting a staff address
 *     is REPORTED and left alone. Any password is removed (→ Microsoft
 *     sign-in only; the shared initial password may have been "personalised"
 *     by whoever knew it) and sessions revoked. Status is never changed.
 *   - TEACHER / STAFF account → refresh the title (role left as is; a Type
 *     mismatch is reported);
 *   - SCHOOL_ADMIN → left alone (reported).
 * Also REPORTS (never writes): parent accounts under a PERSONAL e-mail that
 * match a staff name (candidates for a double profil — Raed confirms), and
 * school-e-mail parent accounts absent from the list (ex-staff?).
 *
 * All writes run in ONE transaction: either every account is created, or
 * none. DRY RUN by default — it prints exactly what --confirm would write.
 *
 *   npx tsx scripts/import-staff.ts
 *   npx tsx scripts/import-staff.ts --file "C:\\path\\teachers_2026-2027.xlsx" --tenant montaigne --confirm
 */
import ExcelJS from "exceljs";
import { PrismaClient, type Role, type StaffRole } from "@prisma/client";
import { hasProvenance, microsoftSsoConfigured } from "../src/lib/staff-identity";

const prisma = new PrismaClient();

const DEFAULT_FILE =
  "C:\\Users\\raede\\OneDrive - lycee-montaigne.edu.lb\\Documents\\GitHub\\School Management\\data\\teachers_2026-2027.xlsx";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}
const CONFIRM = process.argv.includes("--confirm");
// --prune: also REMOVE the staff hat of parent accounts that are no longer in
// the list (or flagged Leaving) — reported in the dry run like everything else.
const PRUNE = process.argv.includes("--prune");
const FILE = arg("file") ?? DEFAULT_FILE;
const TENANT_SLUG = arg("tenant") ?? "montaigne";

type StaffRow = {
  line: number;
  nom: string;
  prenom: string;
  email: string;
  personal: string;
  type: string;
  fonction: string;
  leaving: boolean;
};

/** Trim + drop zero-width / BOM characters that sneak into pasted names. */
const clean = (s: string) => s.replace(/[\u200B-\u200D\uFEFF\u2060]/g, "").trim();

/** ExcelJS cell → plain trimmed string (handles hyperlink / rich-text cells). */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return clean(v.text);
    if ("richText" in v && Array.isArray(v.richText)) return clean(v.richText.map((r) => r.text).join(""));
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return "";
  }
  return clean(String(v));
}

const TRUTHY = new Set(["1", "true", "yes", "oui", "x", "y", "o"]);

async function readStaff(file: string): Promise<StaffRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Workbook has no sheet");
  const header = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => header.set(cellText(cell.value), col));
  for (const h of ["Nom", "Prenom", "Email Address", "Type"]) {
    if (!header.has(h)) throw new Error(`Missing column "${h}"`);
  }
  const rows: StaffRow[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const get = (name: string) => {
      const c = header.get(name);
      return c ? cellText(row.getCell(c).value) : "";
    };
    const nom = get("Nom");
    const prenom = get("Prenom");
    if (!nom && !prenom) return;
    rows.push({
      line: n,
      nom,
      prenom,
      email: get("Email Address").toLowerCase(),
      personal: get("Personal Email").toLowerCase(),
      type: get("Type"),
      fonction: get("Fonction"),
      leaving: TRUTHY.has(get("Leaving").toLowerCase()),
    });
  });
  return rows;
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
const STOP = new Set(["el", "al", "de", "abou", "abi", "bou", "abu"]);
const nameKey = (first: string, last: string) =>
  `${norm(first)}|${norm(last).split(" ").filter((w) => w && !STOP.has(w)).join(" ")}`;

/** Fonction from the list, else a generic title — never blank, so a hat made
 *  by this import stays distinguishable from a console-made one (no title). */
function titleFor(row: StaffRow): string {
  return row.fonction || (row.type === "Teacher" ? "Enseignant·e" : "Personnel administratif");
}

function hatFor(type: string): StaffRole | null {
  if (type === "Teacher") return "TEACHER";
  if (type === "Administrator") return "STAFF";
  return null; // AVS and anything else: not school personnel accounts
}

async function main() {
  console.log(CONFIRM ? "== WRITE mode ==" : "== DRY RUN (pass --confirm to write) ==");
  console.log("file:", FILE);
  const tenant = await prisma.tenant.findFirst({
    where: { slug: TENANT_SLUG },
    select: { id: true, name: true, staffEmailDomains: true },
  });
  if (!tenant) throw new Error(`Tenant "${TENANT_SLUG}" not found`);
  const tenantId = tenant.id;
  const domains = tenant.staffEmailDomains.map((d) => d.toLowerCase());
  if (!domains.length) throw new Error("Tenant.staffEmailDomains is empty — set the school's staff e-mail domain first");
  const schoolEmail = (e: string) =>
    /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) && domains.some((d) => e.endsWith("@" + d));

  const staff = await readStaff(FILE);
  const [users, tombstones] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true, email: true, role: true, status: true, staffRole: true, staffTitle: true,
        firstName: true, lastName: true, passwordHash: true, mustChangePassword: true, darsParentId: true,
        guardianProfile: { select: { _count: { select: { childLinks: true } } } },
        accounts: { where: { provider: "microsoft-entra-id" }, select: { id: true }, take: 1 },
      },
    }),
    prisma.user.findMany({ where: { tenantId, deletedAt: { not: null } }, select: { email: true } }),
  ]);
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const tombstoned = new Set(tombstones.map((u) => u.email.toLowerCase()));
  const parentsByName = new Map<string, typeof users>();
  for (const u of users) {
    if (u.role !== "PARENT") continue;
    const k = nameKey(u.firstName ?? "", u.lastName ?? "");
    if (k !== "|") parentsByName.set(k, [...(parentsByName.get(k) ?? []), u]);
  }

  type Create = { row: StaffRow; role: Role };
  type Hat = { row: StaffRow; userId: string; hat: StaffRole; previous: StaffRole | null; clearSharedPassword: boolean; disabled: boolean };
  type Refresh = { row: StaffRow; userId: string; title: string | null };
  const create: Create[] = [];
  const addHat: Hat[] = [];
  const refresh: Refresh[] = [];
  const skipped: Record<string, number> = {};
  const notes: string[] = [];
  const suspicious: string[] = [];
  const confirmCandidates: string[] = [];
  const seenEmails = new Set<string>();
  const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);

  for (const row of staff) {
    const who = `${row.prenom} ${row.nom} <${row.email || "no e-mail"}> (line ${row.line})`;
    const hat = hatFor(row.type);
    if (!hat) { skip(`type ${row.type || "(blank)"}`); continue; }
    if (row.leaving) {
      skip("flagged Leaving");
      if (row.email && byEmail.has(row.email)) notes.push(`LEAVING but has an account — disable it when they go: ${who}`);
      continue;
    }
    if (!row.email) { skip("no school e-mail"); continue; }
    if (!schoolEmail(row.email)) { skip("not a valid school-domain e-mail"); notes.push(`skipped, e-mail not on the staff domain / malformed: ${who}`); continue; }
    if (seenEmails.has(row.email)) { skip("duplicate e-mail in the list"); notes.push(`duplicate e-mail in the list, second row ignored: ${who}`); continue; }
    seenEmails.add(row.email);
    if (tombstoned.has(row.email)) {
      skip("soft-deleted account holds this e-mail");
      notes.push(`a DELETED account still holds this e-mail — restore or purge it from Parents › Supprimés first: ${who}`);
      continue;
    }

    const existing = byEmail.get(row.email);
    if (!existing) {
      create.push({ row, role: hat });
    } else if (existing.role === "PARENT") {
      if (!hasProvenance(existing)) {
        skip("self-registered parent on a staff address (verify)");
        suspicious.push(`${who} — parent account with no Dars origin, no child and no Microsoft sign-in: verify it is really this person before giving it staff access`);
        continue;
      }
      if (existing.staffRole === hat) {
        refresh.push({ row, userId: existing.id, title: titleFor(row) });
      } else {
        addHat.push({
          row, userId: existing.id, hat, previous: existing.staffRole,
          // A staff identity on the school domain is Microsoft-only: any
          // password is removed (the shared initial one may have been
          // "personalised" by whoever knew it) and sessions are revoked —
          // only when Microsoft sign-in is configured.
          clearSharedPassword: existing.passwordHash !== null && microsoftSsoConfigured(),
          disabled: existing.status === "DISABLED",
        });
      }
    } else if (existing.role === "TEACHER" || existing.role === "STAFF") {
      refresh.push({ row, userId: existing.id, title: titleFor(row) });
      if (existing.role !== hat) notes.push(`role mismatch (left unchanged): ${who} is ${existing.role} in EduLM but "${row.type}" in the list`);
    } else {
      notes.push(`${existing.role} account left alone: ${who}`);
    }

    // Report-only: a parent account under another e-mail that matches this name.
    const matches = (parentsByName.get(nameKey(row.prenom, row.nom)) ?? []).filter((p) => p.email.toLowerCase() !== row.email);
    for (const p of matches) {
      const viaList = row.personal && p.email.toLowerCase() === row.personal ? " (= Personal Email in the list)" : "";
      confirmCandidates.push(`${row.prenom} ${row.nom} <${row.email}>  ↔  parent account <${p.email}>${viaList}`);
    }
  }

  const listEmails = new Set(staff.map((s) => s.email).filter(Boolean));
  const leavingEmails = new Set(staff.filter((s) => s.leaving).map((s) => s.email));
  // Only hats this import made (they carry a title) and that no live grant
  // still needs: console-made hats (no title) belong to their grant.
  const grantedEmails = new Set(
    (await prisma.adminGrant.findMany({ where: { tenantId }, select: { email: true } })).map((g) => g.email.toLowerCase()),
  );
  const prune = users.filter(
    (u) =>
      u.role === "PARENT" &&
      u.staffRole !== null &&
      u.staffTitle !== null &&
      !grantedEmails.has(u.email.toLowerCase()) &&
      (!listEmails.has(u.email.toLowerCase()) || leavingEmails.has(u.email.toLowerCase())),
  );
  const exStaff = users.filter((u) => u.role === "PARENT" && schoolEmail(u.email.toLowerCase()) && !listEmails.has(u.email.toLowerCase()));

  console.log(`\nstaff rows: ${staff.length} | EduLM users scanned: ${users.length}`);
  console.log(`\nCREATE ${create.length} account(s) (Microsoft sign-in only):`);
  for (const c of create) console.log(`  + ${c.role.padEnd(7)} ${c.row.prenom} ${c.row.nom} <${c.row.email}>${c.row.fonction ? ` — ${c.row.fonction}` : ""}`);
  console.log(`\nDOUBLE PROFIL ${addHat.length} parent account(s) → add staff hat:`);
  for (const a of addHat) {
    const flags = [
      a.previous ? `hat ${a.previous} → ${a.hat}` : null,
      a.clearSharedPassword ? "password removed → Microsoft sign-in only" : "no password (already Microsoft-only)",
      a.disabled ? "ACCOUNT DISABLED — hat inert until activated from Comptes" : null,
    ].filter(Boolean).join("; ");
    console.log(`  ~ ${a.hat.padEnd(7)} ${a.row.prenom} ${a.row.nom} <${a.row.email}> — ${titleFor(a.row)}  [${flags}]`);
  }
  if (!microsoftSsoConfigured()) {
    console.log("  (Microsoft sign-in is NOT configured in this environment → no password is removed)");
  }
  console.log(`
${PRUNE ? "PRUNE" : "WOULD PRUNE (pass --prune)"} ${prune.length} staff hat(s) of parents no longer in the list / leaving:`);
  for (const u of prune) console.log(`  - ${u.staffRole?.padEnd(7)} ${u.firstName ?? ""} ${u.lastName ?? ""} <${u.email}>${u.staffTitle ? ` — ${u.staffTitle}` : ""}`);
  console.log(`\nREFRESH title only: ${refresh.length}`);
  for (const r of refresh) console.log(`  = ${r.row.prenom} ${r.row.nom} <${r.row.email}>${r.title ? ` — ${r.title}` : " (no Fonction in the list: title kept)"}`);
  console.log(`\nSKIPPED: ${JSON.stringify(skipped)}`);
  if (suspicious.length) { console.log(`\n⚠ SUSPICIOUS — NOT touched (${suspicious.length}):`); for (const n of suspicious) console.log(`  ! ${n}`); }
  if (notes.length) { console.log(`\nNOTES:`); for (const n of notes) console.log(`  ! ${n}`); }
  console.log(`\nTO CONFIRM — staff whose PARENT account uses another e-mail (nothing done; merge later if confirmed): ${confirmCandidates.length}`);
  for (const c of confirmCandidates) console.log(`  ? ${c}`);
  console.log(`\nSCHOOL-E-MAIL PARENT ACCOUNTS NOT IN THE LIST (ex-staff? move to a personal e-mail before IT closes the mailbox): ${exStaff.length}`);
  for (const u of exStaff) console.log(`  ? ${u.firstName ?? ""} ${u.lastName ?? ""} <${u.email}> status=${u.status}`);

  if (!CONFIRM) { console.log("\n(dry run — nothing written)"); return; }

  await prisma.$transaction(
    async (tx) => {
      for (const c of create) {
        await tx.user.create({
          data: {
            tenantId, email: c.row.email, role: c.role, status: "ACTIVE", locale: "fr",
            firstName: c.row.prenom || null, lastName: c.row.nom || null,
            name: [c.row.prenom, c.row.nom].filter(Boolean).join(" ") || null,
            staffTitle: c.row.fonction || null,
          },
        });
      }
      for (const a of addHat) {
        await tx.user.update({
          where: { id: a.userId, tenantId },
          data: {
            staffRole: a.hat,
            staffTitle: titleFor(a.row),
            ...(a.clearSharedPassword
              ? { passwordHash: null, mustChangePassword: false, sessionsInvalidBefore: new Date() }
              : {}),
          },
        });
      }
      for (const r of refresh) {
        if (r.title) await tx.user.update({ where: { id: r.userId, tenantId }, data: { staffTitle: r.title } });
      }
      if (PRUNE) {
        for (const u of prune) {
          await tx.user.update({ where: { id: u.id, tenantId }, data: { staffRole: null, staffTitle: null } });
        }
      }
    },
    { timeout: 120_000 },
  );
  console.log(`
WRITTEN: ${create.length} created, ${addHat.length} double profils, ${refresh.filter((r) => r.title).length} titles refreshed${PRUNE ? `, ${prune.length} hats pruned` : ""}.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
