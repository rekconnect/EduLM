/**
 * Import Dars family invoices into EduLM's existing billing module
 * (Invoice / InvoiceLine / Payment) — student/family billing, NO general ledger.
 *
 * GRAIN: one Dars header (Fct_Factures_Entete) = one (family × versement × currency).
 * Each header becomes ONE EduLM Invoice attached to the family's ELDEST student
 * (Invoice.studentId is required; family is transitive via Student.familyId).
 * Every child's lines are exploded into that invoice, each description prefixed
 * with the child's name. Money math is per-currency (USD + LBP), never summed
 * across — the parent invoices page already groups outstanding by currency.
 *
 * BALANCE: Dars has no payment table — paid/due is on the header.
 *   Total_a_payer_TTC = billed (= SUM(line.Net));  Restant_du = outstanding.
 *   paid = Total − Restant  → one aggregate Payment carries it so the UI's
 *   SUM(payments) balance math (= totalCents − paid = Restant×100) is exact.
 * DISCOUNTS/scholarships are already baked into line.Net → import Net as-is.
 *
 * Amounts are integer "cents" (×100) in BigInt columns (LBP tuition overflows int4).
 * Idempotent: upsert Invoice by darsInvoiceId, then replace its lines+payments in
 * one transaction. Re-runnable / extendable per --annee.
 *
 * Dry-run by default; --confirm to write. --tenant-name required.
 *   npx tsx scripts/dars-import/import-invoices-from-sql.ts \
 *     --tenant-name="Lycée Montaigne" [--annee=2026] [--confirm]
 *
 * --annee is the Dars ENDING year (2026 = academic "2025-2026", the current year).
 */
import { PrismaClient, InvoiceStatus, PaymentMethod } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const DEFAULT_ANNEE = 2026; // Dars ending year → academic "2025-2026"

const toCents = (v: unknown): bigint => BigInt(Math.round((Number(v) || 0) * 100));
const asDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
};

type Header = {
  ID: number;
  ID_Famille: number;
  ID_Versement: number;
  Numero: string;
  Date_facture: unknown;
  Date_echeance: unknown;
  Devise: string;
  Total_a_payer_TTC: number;
  Restant_du: number;
  Statut: string;
};
type Line = { ID_Entete: number; Id_Eleve: number | null; Net: number; typeDesc: string | null };

async function main() {
  const { tenantName, confirm } = parseFlags();
  const anneeArg = process.argv.find((a) => a.startsWith("--annee="));
  const ANNEE = anneeArg ? Number(anneeArg.split("=")[1]) : DEFAULT_ANNEE;
  const yearLabel = `${ANNEE - 1}-${ANNEE}`;
  // Dars stops maintaining Restant_du once a year closes (it reads back as fully
  // UNPAID), so --settled marks every invoice paid (balance 0) — use it for any
  // PAST year to avoid showing false back-debt. The current year keeps real balances.
  const settled = process.argv.includes("--settled");
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");
  console.log(`Année Dars ${ANNEE} → année scolaire ${yearLabel}${settled ? " · SOLDÉ (historique)" : " · soldes réels"}`);

  const year = await prisma.academicYear.findFirst({
    where: { tenantId: tenant.id, label: yearLabel },
    select: { id: true },
  });
  if (!year) {
    console.error(`AcademicYear "${yearLabel}" introuvable — créez-la d'abord.`);
    process.exit(1);
  }
  const admin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "SCHOOL_ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) {
    console.error("Aucun SCHOOL_ADMIN pour Payment.recordedById.");
    process.exit(1);
  }
  console.log(`Paiements importés au nom de: ${admin.email}`);

  // Family map: darsRootParentId → { familyId, students[] }
  const families = await prisma.family.findMany({
    where: { tenantId: tenant.id, darsRootParentId: { not: null } },
    select: {
      id: true,
      darsRootParentId: true,
      students: { select: { id: true, darsStudentId: true, firstName: true, lastName: true, dob: true } },
    },
  });
  const famByDars = new Map<number, (typeof families)[number]>();
  const studentByDars = new Map<number, { firstName: string; lastName: string }>();
  const studentToFamily = new Map<number, (typeof families)[number]>();
  for (const f of families) {
    if (f.darsRootParentId != null) famByDars.set(Number(f.darsRootParentId), f);
    for (const s of f.students) {
      if (s.darsStudentId != null) {
        studentByDars.set(Number(s.darsStudentId), { firstName: s.firstName, lastName: s.lastName });
        studentToFamily.set(Number(s.darsStudentId), f);
      }
    }
  }

  // ── Dars: headers + lines for this Annee ──
  const scope = `v.Annee=${ANNEE} AND e.Statut IN ('EMI','ANU')`;
  const headers = await darsQuery<Header>(
    `SELECT e.ID, e.ID_Famille, e.ID_Versement, e.Numero, e.Date_facture, e.Date_echeance,
            e.Devise, e.Total_a_payer_TTC, e.Restant_du, e.Statut
     FROM Fct_Factures_Entete e
     JOIN Fct_Versement v ON v.ID = e.ID_Versement AND v.Id_College = ${C}
     WHERE e.Id_College = ${C} AND ${scope}`,
  );
  const lines = await darsQuery<Line>(
    `SELECT l.ID_Entete, l.Id_Eleve, l.Net, tt.Description AS typeDesc
     FROM Fct_Eleve_Tarif l
     JOIN Fct_Factures_Entete e ON e.ID = l.ID_Entete AND e.Id_College = ${C}
     JOIN Fct_Versement v ON v.ID = e.ID_Versement AND v.Id_College = ${C}
     LEFT JOIN Fct_Tarif_Classe tc ON tc.ID = l.Id_Tarif_Classe AND tc.Id_College = ${C}
     LEFT JOIN Fct_Type_Tarif tt ON tt.ID = tc.Id_Tarif AND tt.Id_College = ${C}
     WHERE l.Id_College = ${C} AND ${scope}`,
  );
  console.log(`Dars: ${headers.length} factures · ${lines.length} lignes`);

  const linesByHeader = new Map<number, Line[]>();
  for (const l of lines) {
    const arr = linesByHeader.get(Number(l.ID_Entete)) ?? [];
    arr.push(l);
    linesByHeader.set(Number(l.ID_Entete), arr);
  }

  type Built = {
    header: Header;
    studentId: string;
    lines: { description: string; amountCents: bigint }[];
    totalCents: bigint;
    paidCents: bigint;
    status: InvoiceStatus;
  };
  const built: Built[] = [];
  const skipped: string[] = [];

  for (const h of headers) {
    const headerLines = linesByHeader.get(Number(h.ID)) ?? [];
    let fam = famByDars.get(Number(h.ID_Famille));
    if (!fam) {
      // Fallback for Dars family ids that don't match any darsRootParentId
      // (restructured families): resolve the family via a line's student.
      for (const l of headerLines) {
        if (l.Id_Eleve != null) {
          const viaStudent = studentToFamily.get(Number(l.Id_Eleve));
          if (viaStudent) {
            fam = viaStudent;
            break;
          }
        }
      }
    }
    if (!fam || fam.students.length === 0) {
      skipped.push(`facture ${h.Numero} — famille Dars ${h.ID_Famille} introuvable/sans élève`);
      continue;
    }
    // Eldest student = smallest dob (nulls last).
    const eldest = [...fam.students].sort((a, b) => {
      if (!a.dob) return 1;
      if (!b.dob) return -1;
      return a.dob.getTime() - b.dob.getTime();
    })[0]!;

    const invLines = headerLines.map((l) => {
      const kid = l.Id_Eleve != null ? studentByDars.get(Number(l.Id_Eleve)) : undefined;
      const who = kid ? `${kid.lastName} ${kid.firstName}` : "";
      const what = (l.typeDesc ?? "Frais").trim();
      return {
        description: who ? `${who} — ${what}` : what,
        amountCents: toCents(l.Net),
      };
    });

    const total = Number(h.Total_a_payer_TTC) || 0;
    const restant = settled ? 0 : Number(h.Restant_du) || 0;
    let status: InvoiceStatus;
    if (h.Statut === "ANU") status = InvoiceStatus.CANCELLED;
    else if (restant <= 0) status = InvoiceStatus.PAID;
    else if (restant >= total) status = InvoiceStatus.ISSUED;
    else status = InvoiceStatus.PARTIALLY_PAID;

    built.push({
      header: h,
      studentId: eldest.id,
      lines: invLines,
      totalCents: toCents(total),
      paidCents: toCents(total - restant),
      status,
    });
  }

  // ── Report (per currency) ──
  const byCur = new Map<string, { n: number; billed: bigint; paid: bigint }>();
  for (const b of built) {
    const c = byCur.get(b.header.Devise) ?? { n: 0, billed: 0n, paid: 0n };
    c.n++;
    c.billed += b.totalCents;
    c.paid += b.paidCents;
    byCur.set(b.header.Devise, c);
  }
  console.log(`\nÀ importer: ${built.length} factures (${skipped.length} ignorées)`);
  for (const [cur, c] of byCur) {
    const fmt = (v: bigint) => (Number(v) / 100).toLocaleString("fr-FR");
    console.log(`  ${cur}: ${c.n} factures · facturé ${fmt(c.billed)} · payé ${fmt(c.paid)} · dû ${fmt(c.billed - c.paid)}`);
  }
  if (skipped.length) {
    console.log(`\nIgnorées (${skipped.length}) — à traiter manuellement:`);
    skipped.slice(0, 20).forEach((s) => console.log(`  ! ${s}`));
    if (skipped.length > 20) console.log(`  … (+${skipped.length - 20})`);
  }
  // Sample
  const sample = built[0];
  if (sample) {
    console.log(`\nExemple: facture ${sample.header.Numero} (${sample.header.Devise}) — ${sample.status}`);
    sample.lines.slice(0, 5).forEach((l) => console.log(`   ${l.description}: ${Number(l.amountCents) / 100}`));
  }

  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
    await prisma.$disconnect();
    await closeDars();
    return;
  }

  // Idempotency: drop existing invoices for these Dars ids first (cascade →
  // lines + payments), then bulk-insert — far fewer round-trips than per-invoice.
  const darsIds = built.map((b) => Number(b.header.ID));
  const del = await prisma.invoice.deleteMany({
    where: { tenantId: tenant.id, darsInvoiceId: { in: darsIds } },
  });
  if (del.count) console.log(`Remplacement: ${del.count} factures existantes supprimées.`);

  const chunk = <T>(arr: T[], n: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };
  const issuedOf = (h: Header) => asDate(h.Date_facture) ?? new Date(`${ANNEE - 1}-09-01`);

  // 1. Invoices (Prisma generates the cuid ids).
  for (const c of chunk(built, 1000)) {
    await prisma.invoice.createMany({
      data: c.map((b) => ({
        tenantId: tenant.id,
        studentId: b.studentId,
        academicYearId: year.id,
        number: b.header.Numero,
        darsInvoiceId: Number(b.header.ID),
        issuedAt: issuedOf(b.header),
        dueAt: asDate(b.header.Date_echeance),
        currency: b.header.Devise,
        totalCents: b.totalCents,
        status: b.status,
        notes: `Dars · famille ${b.header.ID_Famille} · versement ${b.header.ID_Versement}`,
      })),
    });
  }
  // 2. Resolve the new invoice ids by darsInvoiceId for the FK on lines/payments.
  const created = await prisma.invoice.findMany({
    where: { tenantId: tenant.id, darsInvoiceId: { in: darsIds } },
    select: { id: true, darsInvoiceId: true },
  });
  const idByDars = new Map(created.map((i) => [i.darsInvoiceId, i.id]));
  // 3. Lines.
  const allLines = built.flatMap((b) => {
    const invoiceId = idByDars.get(Number(b.header.ID));
    return invoiceId
      ? b.lines.map((l) => ({ invoiceId, description: l.description, amountCents: l.amountCents, quantity: 1 }))
      : [];
  });
  for (const c of chunk(allLines, 2000)) await prisma.invoiceLine.createMany({ data: c });
  // 4. One aggregate payment per invoice that has a non-zero paid amount.
  const allPays = built.flatMap((b) => {
    const invoiceId = idByDars.get(Number(b.header.ID));
    return invoiceId && b.paidCents !== 0n
      ? [{
          tenantId: tenant.id,
          invoiceId,
          amountCents: b.paidCents,
          method: PaymentMethod.OTHER,
          paidAt: issuedOf(b.header),
          recordedById: admin.id,
          reference: "Importé de Dars",
        }]
      : [];
  });
  for (const c of chunk(allPays, 2000)) await prisma.payment.createMany({ data: c });

  console.log(
    `\n✓ ${built.length} factures · ${allLines.length} lignes · ${allPays.length} paiements importés pour ${yearLabel}.`,
  );
  await prisma.$disconnect();
  await closeDars();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await closeDars();
  process.exit(1);
});
