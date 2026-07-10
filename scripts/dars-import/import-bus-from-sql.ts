/**
 * Rebuild bus_periods[<active year>|T3] for every transport rider, DIRECTLY
 * from DARSMontaigne SQL — no Excel export needed.
 *
 * The billed station rows of the current transport versement (default 54 =
 * 3e trimestre 2025-2026) are the source of truth for who rides and on which
 * bus/zone/station:
 *   Fct_Factures_Entete(ID_Versement) → Fct_Eleve_Tarif(Id_Eleve_Station)
 *     → Trs_Eleve_Station → Trs_Circuit(Numero = bus no)
 *     → Isc_Town / Trs_Zone (quartier + zone no)
 * Matched to EduLM by darsStudentId (name fallback). montant/net/remise come
 * from the same versement's billing.
 *
 * Idempotent: only the TARGET period is rewritten; any other period entries in
 * bus_periods are preserved. Safe to re-run.
 *
 * ⚠️ phase1-families REPLACES Student.customAnswers on every re-import, which
 * WIPES bus_periods. This script MUST therefore run after phase1 on every
 * re-import and every annual rollover — it's the transport half of the runbook.
 *
 * Dry-run by default; --confirm to write. --tenant-name required.
 *   npx tsx scripts/dars-import/import-bus-from-sql.ts \
 *     --tenant-name="Lycée Montaigne" [--versement=54] [--confirm]
 *
 * NOTE: --versement defaults to 54 (T3 2025-2026). Bump it at annual rollover,
 * just like phase2-enrollment's --syear default.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

const DEFAULT_VERSEMENT = 54; // 3e trimestre 2025-2026
const TRIM = "T3"; // the trimester the /transport table shows by default

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(|\)|-|'/g, " ")
    .replace(/\b(el|al)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

type Period = Record<string, string>;
type Periods = Record<string, Period>;

function parsePeriods(ca: Record<string, unknown>): Periods {
  if (typeof ca.bus_periods !== "string") return {};
  try {
    const v = JSON.parse(ca.bus_periods);
    return v && typeof v === "object" ? (v as Periods) : {};
  } catch {
    return {};
  }
}

async function main() {
  const { tenantName, confirm } = parseFlags();
  const vArg = process.argv.find((a) => a.startsWith("--versement="));
  const VID = vArg ? Number(vArg.split("=")[1]) : DEFAULT_VERSEMENT;
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  const activeYear = await prisma.academicYear.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { label: true },
  });
  if (!activeYear) {
    console.error("No active academic year — set one first (/admin/years).");
    process.exit(1);
  }
  const PERIOD = `${activeYear.label}|${TRIM}`;
  console.log(`Cible: bus_periods["${PERIOD}"] · versement ${VID}`);

  // ── Dars: billing per student for this versement (montant/net) ──
  const bill = await darsQuery<{ Id_Eleve: number; Montant: number; Net: number }>(
    `SELECT f.Id_Eleve, f.Montant, f.Net
     FROM Fct_Eleve_Tarif f
     JOIN Fct_Factures_Entete fe ON fe.ID=f.ID_Entete AND fe.Id_College=${C} AND fe.ID_Versement=${VID}
     JOIN Trs_Eleve_Station es ON es.ID=f.Id_Eleve_Station AND es.Id_College=${C}
     WHERE f.Id_College=${C}`,
  );
  const money = new Map<number, { montant: number; net: number }>();
  for (const b of bill) {
    const m = money.get(b.Id_Eleve) ?? { montant: 0, net: 0 };
    m.montant += Number(b.Montant) || 0;
    m.net += Number(b.Net) || 0;
    money.set(b.Id_Eleve, m);
  }
  const sumN = [...money.values()].reduce((a, m) => a + m.net, 0);
  console.log(
    `Dars v${VID}: ${money.size} élèves facturés transport · net $${sumN.toLocaleString("en-US")}`,
  );
  if (money.size === 0) {
    console.error(
      `Aucun élève facturé sur le versement ${VID}. Vérifiez --versement (au rollover il change).`,
    );
    await prisma.$disconnect();
    await closeDars();
    process.exit(1);
  }

  // ── Dars: station rows (trajet + bus + quartier + zone + station) of the
  //    billed students. Quartier/zone via Isc_Town → Trs_Zone; falls back to
  //    bus-only if that join is unavailable in this backup. ──
  type Row = {
    Id_Eleve: number;
    Type_Trajet: string;
    Station: string | null;
    BusNo: string | null;
    Quartier: string | null;
    ZoneNo: string | null;
  };
  const stations = await darsQuery<Row>(
    `SELECT es.Id_Eleve, es.Type_Trajet, es.Station,
            CAST(c.Numero AS varchar(10)) AS BusNo,
            t.TownName AS Quartier, z.ligne AS ZoneNo
     FROM Trs_Eleve_Station es
     JOIN Fct_Eleve_Tarif f ON f.Id_Eleve_Station = es.ID AND f.Id_College=${C}
     JOIN Fct_Factures_Entete fe ON fe.ID=f.ID_Entete AND fe.Id_College=${C} AND fe.ID_Versement=${VID}
     LEFT JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID=es.Id_Circuit
     LEFT JOIN Isc_Town t ON t.Id_Town = es.Id_Quartier
     LEFT JOIN Trs_Zone z ON z.ID = t.Id_ZoneBus
     WHERE es.Id_College=${C}`,
  ).catch(async (e) => {
    console.log(`  (jointure quartier/zone indisponible — fallback bus seul: ${String(e).slice(0, 120)})`);
    return darsQuery<Row>(
      `SELECT es.Id_Eleve, es.Type_Trajet, es.Station,
              CAST(c.Numero AS varchar(10)) AS BusNo,
              NULL AS Quartier, NULL AS ZoneNo
       FROM Trs_Eleve_Station es
       JOIN Fct_Eleve_Tarif f ON f.Id_Eleve_Station = es.ID AND f.Id_College=${C}
       JOIN Fct_Factures_Entete fe ON fe.ID=f.ID_Entete AND fe.Id_College=${C} AND fe.ID_Versement=${VID}
       LEFT JOIN Trs_Circuit c ON c.Id_College=${C} AND c.ID=es.Id_Circuit
       WHERE es.Id_College=${C}`,
    );
  });
  const stByEleve = new Map<number, Row[]>();
  for (const s of stations) {
    const arr = stByEleve.get(s.Id_Eleve) ?? [];
    arr.push(s);
    stByEleve.set(s.Id_Eleve, arr);
  }

  const darsNames = await darsQuery<{ ID_Student: number; FirstName: string; LastName: string }>(
    `SELECT ID_Student, FirstName, LastName FROM Isc_Student
     WHERE Id_College=${C} AND ID_Student IN (${[...money.keys()].join(",")})`,
  );
  const darsNameById = new Map(
    darsNames.map((n) => [Number(n.ID_Student), { first: n.FirstName ?? "", last: n.LastName ?? "" }]),
  );

  // ── EduLM students ──
  const students = await prisma.student.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, firstName: true, lastName: true, darsStudentId: true, customAnswers: true },
  });
  const byDarsId = new Map<number, (typeof students)[number]>();
  const byName = new Map<string, (typeof students)[number][]>();
  for (const s of students) {
    const did = Number(s.darsStudentId);
    if (did) byDarsId.set(did, s);
    const k = norm(`${s.lastName} ${s.firstName}`);
    byName.set(k, [...(byName.get(k) ?? []), s]);
  }

  type Update = { id: string; ca: Prisma.InputJsonValue; label: string };
  const updates: Update[] = [];
  const unmatchable: string[] = [];

  for (const [did, m] of money) {
    const dn = darsNameById.get(did);
    const target =
      byDarsId.get(did) ??
      (dn ? (byName.get(norm(`${dn.last} ${dn.first}`)) ?? [])[0] : undefined);
    if (!target) {
      unmatchable.push(`${dn ? `${dn.last} ${dn.first}` : `#${did}`} — net $${m.net}`);
      continue;
    }

    const rows = stByEleve.get(did) ?? [];
    const asRow = rows.find((r) => r.Type_Trajet === "AR" || r.Type_Trajet === "AS");
    const rsRow = rows.find((r) => r.Type_Trajet === "AR" || r.Type_Trajet === "RS");
    const remise =
      m.montant > 0 && m.net < m.montant
        ? String(Math.round(((m.montant - m.net) / m.montant) * 100))
        : "";

    const ca: Record<string, unknown> =
      target.customAnswers && typeof target.customAnswers === "object"
        ? { ...(target.customAnswers as Record<string, unknown>) }
        : {};
    const periods = parsePeriods(ca);
    const prev = periods[PERIOD] ?? {};
    periods[PERIOD] = {
      as: asRow ? "yes" : "",
      rs: rsRow ? "yes" : "",
      car_matin: asRow?.BusNo?.trim() ?? "",
      zoneno_matin: asRow?.ZoneNo?.trim() ?? "",
      zone_matin: asRow?.Quartier?.trim() ?? "",
      station_matin: asRow?.Station?.trim() ?? "",
      car_soir: rsRow?.BusNo?.trim() ?? "",
      zoneno_soir: rsRow?.ZoneNo?.trim() ?? "",
      zone_soir: rsRow?.Quartier?.trim() ?? "",
      station_soir: rsRow?.Station?.trim() ?? "",
      remarques: prev.remarques ?? "", // preserve any hand-entered notes
      tel: prev.tel ?? "",
      montant: String(m.montant),
      remise,
      net: String(m.net),
    };
    ca.bus_periods = JSON.stringify(periods);

    const trajets = [
      asRow && `AS bus ${asRow.BusNo ?? "?"}`,
      rsRow && `RS bus ${rsRow.BusNo ?? "?"}`,
    ]
      .filter(Boolean)
      .join(" + ");
    updates.push({
      id: target.id,
      ca: ca as Prisma.InputJsonValue,
      label: `${target.lastName} ${target.firstName} — ${trajets || "aucun trajet?"} · ${
        asRow?.Quartier ?? rsRow?.Quartier ?? "?"
      } · net $${m.net}`,
    });
  }

  console.log(`\nAffectations à écrire: ${updates.length}`);
  for (const u of updates.slice(0, 25)) console.log(`  + ${u.label}`);
  if (updates.length > 25) console.log(`  … (+${updates.length - 25} autres)`);
  if (unmatchable.length) {
    console.log(
      `\nFacturés Dars INTROUVABLES dans EduLM (${unmatchable.length}) — à traiter manuellement:`,
    );
    for (const u of unmatchable) console.log(`  ! ${u}`);
  }

  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
  } else {
    let done = 0;
    for (const u of updates) {
      await prisma.student.update({ where: { id: u.id }, data: { customAnswers: u.ca } });
      if (++done % 50 === 0) console.log(`  …${done}`);
    }
    console.log(`\n✓ ${done} élèves — transport reconstruit pour ${PERIOD}.`);
  }

  await prisma.$disconnect();
  await closeDars();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await closeDars();
  process.exit(1);
});
