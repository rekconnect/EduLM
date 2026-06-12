/**
 * Align EduLM transport with the Dars TRANSPORT dashboard (versement 54 =
 * 3e trimestre 2025-2026: 507 élèves · $162,705 brut · $155,960 net — the
 * dashboard's net already applies the discount % column, incl. 100%
 * exonerations the tarif Excel didn't carry).
 *
 * Three things, in one pass over bus_periods:
 *  1. SPLIT stored zone strings "Z<n> · Quartier" into zoneno (1-10) +
 *     quartier — for every period entry (new Zone/Quartier columns).
 *  2. MONEY from billing: for students billed on versement 54, set
 *     montant/net to the billing sums and remise to the effective %
 *     ((montant-net)/montant). For ASSIGNED students NOT billed on v54
 *     (activity-return keeps), clear montant/remise/net — the Dars
 *     transport dashboard doesn't count them.
 *  3. ADD the billed-but-unassigned students (matched into EduLM by name)
 *     with trajets/bus/quartier/station from their station rows.
 *
 * Dry-run by default; --confirm to write. --tenant-name required.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();
const PERIOD = "2025-2026|T3";
const VID = 54; // versement = 3e trimestre 2025-2026

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(|\)|-|'/g, " ")
    .replace(/\b(el|al)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

function splitZone(v: string | undefined): { zoneno: string; zone: string } {
  const t = (v ?? "").trim();
  const m = /^Z(10|[1-9])\s*·\s*(.*)$/.exec(t);
  if (m) return { zoneno: m[1]!, zone: m[2]!.trim() };
  return { zoneno: "", zone: t };
}

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  // ── Dars: v54 billing per student ──
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
  const sumM = [...money.values()].reduce((a, m) => a + m.montant, 0);
  const sumN = [...money.values()].reduce((a, m) => a + m.net, 0);
  console.log(`Dars v${VID}: ${money.size} élèves facturés · brut $${sumM.toLocaleString("en-US")} · net $${sumN.toLocaleString("en-US")}`);

  // Station rows of the billed students (trajets + bus + quartier + station),
  // used when we have to CREATE an EduLM assignment.
  const stations = await darsQuery<{
    Id_Eleve: number; Type_Trajet: string; Station: string | null;
    BusNo: string | null; Quartier: string | null; ZoneNo: string | null;
  }>(
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
    console.log("  (jointure quartier/zone indisponible — fallback sans: " + String(e).slice(0, 140) + ")");
    return darsQuery<{
      Id_Eleve: number; Type_Trajet: string; Station: string | null;
      BusNo: string | null; Quartier: string | null; ZoneNo: string | null;
    }>(
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
  const stByEleve = new Map<number, typeof stations>();
  for (const s of stations) {
    const arr = stByEleve.get(s.Id_Eleve) ?? [];
    arr.push(s);
    stByEleve.set(s.Id_Eleve, arr);
  }

  const darsNames = await darsQuery<{ ID_Student: number; FirstName: string; LastName: string }>(
    `SELECT ID_Student, FirstName, LastName FROM Isc_Student
     WHERE Id_College=${C} AND ID_Student IN (${[...money.keys()].join(",")})`,
  );
  const darsNameById = new Map(darsNames.map((n) => [Number(n.ID_Student), { first: n.FirstName ?? "", last: n.LastName ?? "" }]));

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

  type Update = { id: string; ca: Record<string, unknown>; label: string };
  const updates: Update[] = [];
  let zoneSplits = 0;
  let moneySet = 0;
  let moneyCleared = 0;
  const billedSeen = new Set<number>();

  for (const s of students) {
    const ca: Record<string, unknown> =
      s.customAnswers && typeof s.customAnswers === "object"
        ? { ...(s.customAnswers as Record<string, unknown>) }
        : {};
    if (typeof ca.bus_periods !== "string") continue;
    let periods: Record<string, Record<string, string>>;
    try {
      periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
    } catch {
      continue;
    }
    const before = JSON.stringify(periods);
    const notes: string[] = [];

    // 1. Zone split — every period entry.
    for (const key of Object.keys(periods)) {
      const p = periods[key]!;
      for (const dir of ["matin", "soir"] as const) {
        const zoneKey = `zone_${dir}`;
        const zonenoKey = `zoneno_${dir}`;
        if (p[zoneKey] && !p[zonenoKey]) {
          const { zoneno, zone } = splitZone(p[zoneKey]);
          if (zoneno) {
            p[zonenoKey] = zoneno;
            p[zoneKey] = zone;
            zoneSplits++;
          }
        }
      }
    }

    // 2. Money for the active period.
    const p = periods[PERIOD];
    if (p && (p.as === "yes" || p.rs === "yes")) {
      const did = Number(s.darsStudentId);
      const m = did ? money.get(did) : undefined;
      if (m) {
        billedSeen.add(did);
        const remise = m.montant > 0 && m.net < m.montant ? String(Math.round(((m.montant - m.net) / m.montant) * 100)) : "";
        if (p.montant !== String(m.montant) || p.net !== String(m.net) || (p.remise ?? "") !== remise) {
          notes.push(`money ${p.montant || "—"}/${p.net || "—"} → ${m.montant}/${m.net}${remise ? ` (-${remise}%)` : ""}`);
          p.montant = String(m.montant);
          p.net = String(m.net);
          p.remise = remise;
          moneySet++;
        }
      } else if ((p.montant ?? "") !== "" || (p.net ?? "") !== "" || (p.remise ?? "") !== "") {
        notes.push(`non facturé v${VID}: montant/net effacés (était ${p.montant || "—"}/${p.net || "—"})`);
        p.montant = "";
        p.net = "";
        p.remise = "";
        moneyCleared++;
      }
    }

    const after = JSON.stringify(periods);
    if (after !== before) {
      ca.bus_periods = after;
      updates.push({
        id: s.id,
        ca,
        label: `${s.lastName} ${s.firstName}${notes.length ? ` — ${notes.join(" · ")}` : " — zones séparées"}`,
      });
    }
  }

  // 3. Billed in Dars but no EduLM assignment → match by name, create.
  const toCreate: Update[] = [];
  const unmatchable: string[] = [];
  for (const [did, m] of money) {
    if (billedSeen.has(did)) continue;
    if (byDarsId.has(did)) {
      // EduLM knows the student but has no assignment — create on it.
    }
    const dn = darsNameById.get(did);
    const target =
      byDarsId.get(did) ??
      (dn ? (byName.get(norm(`${dn.last} ${dn.first}`)) ?? []).find(() => true) : undefined);
    if (!target) {
      unmatchable.push(`${dn ? `${dn.last} ${dn.first}` : `#${did}`} — net $${m.net}`);
      continue;
    }
    const rows = stByEleve.get(did) ?? [];
    const asRow = rows.find((r) => r.Type_Trajet === "AR" || r.Type_Trajet === "AS");
    const rsRow = rows.find((r) => r.Type_Trajet === "AR" || r.Type_Trajet === "RS");
    const remise = m.montant > 0 && m.net < m.montant ? String(Math.round(((m.montant - m.net) / m.montant) * 100)) : "";
    const ca: Record<string, unknown> =
      target.customAnswers && typeof target.customAnswers === "object"
        ? { ...(target.customAnswers as Record<string, unknown>) }
        : {};
    let periods: Record<string, Record<string, string>> = {};
    if (typeof ca.bus_periods === "string") {
      try {
        periods = JSON.parse(ca.bus_periods) as Record<string, Record<string, string>>;
      } catch { /* ignore */ }
    }
    if (periods[PERIOD]?.as === "yes" || periods[PERIOD]?.rs === "yes") continue; // already assigned, just unseen
    periods[PERIOD] = {
      ...(periods[PERIOD] ?? {}),
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
      remarques: periods[PERIOD]?.remarques ?? "",
      tel: periods[PERIOD]?.tel ?? "",
      montant: String(m.montant),
      remise,
      net: String(m.net),
    };
    ca.bus_periods = JSON.stringify(periods);
    toCreate.push({
      id: target.id,
      ca,
      label: `${target.lastName} ${target.firstName} — CRÉÉ: ${[asRow && `AS bus ${asRow.BusNo ?? "?"}`, rsRow && `RS bus ${rsRow.BusNo ?? "?"}`].filter(Boolean).join(" + ")} · ${asRow?.Quartier ?? rsRow?.Quartier ?? "?"} · net $${m.net}`,
    });
  }

  console.log(`\nMises à jour: ${updates.length} (zones séparées: ${zoneSplits} champs · montants synchronisés: ${moneySet} · montants effacés (non facturés v${VID}): ${moneyCleared})`);
  for (const u of updates.filter((x) => x.label.includes("—") && !x.label.endsWith("zones séparées")).slice(0, 40)) {
    console.log(`  ~ ${u.label}`);
  }
  console.log(`\nAffectations à créer: ${toCreate.length}`);
  for (const u of toCreate) console.log(`  + ${u.label}`);
  if (unmatchable.length) {
    console.log(`\nFacturés Dars INTROUVABLES dans EduLM (${unmatchable.length}) — à traiter manuellement:`);
    for (const u of unmatchable) console.log(`  ! ${u}`);
  }

  if (!confirm) {
    console.log("\nDRY-RUN: aucune écriture. Relancer avec --confirm.");
  } else {
    let done = 0;
    for (const u of [...updates, ...toCreate]) {
      await prisma.student.update({ where: { id: u.id }, data: { customAnswers: u.ca as Prisma.InputJsonValue } });
      done++;
      if (done % 50 === 0) console.log(`  …${done}`);
    }
    console.log(`\n✓ ${done} élèves mis à jour.`);
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
