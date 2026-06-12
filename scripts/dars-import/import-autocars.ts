/**
 * Prefill the EduLM fleet ("Listes des autocars") from Dars Trs_Autocar —
 * Numero, CodeType, Places/capacite, LicensePlate, Cylindre, Couleur,
 * DateAchat, AnneeFabr, Moteur, Fuel, Marque+Modele, Chaissis (VIN).
 * Skips numbers that already exist in EduLM. Dry-run; --confirm to write.
 */
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./lib/dars-pool.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";

const prisma = new PrismaClient();

const mapType = (v: string | null): string | null => {
  const t = (v ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/mini/.test(t)) return "minibus";
  if (/van/.test(t)) return "van";
  if (/bus/.test(t)) return "bus";
  return null;
};
const mapFuel = (v: string | null): string | null => {
  const t = (v ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/diesel|mazout|gasoil/.test(t)) return "diesel";
  if (/essence|petrol|gasoline/.test(t)) return "essence";
  if (/hybrid/.test(t)) return "hybride";
  if (/elec/.test(t)) return "electrique";
  return null;
};
const int = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const str = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s && s !== "0" ? s : null;
};

async function main() {
  const { tenantName, confirm } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  console.log(confirm ? "MODE: APPLY" : "MODE: DRY-RUN (pass --confirm to write)");

  const rows = await darsQuery<Record<string, unknown>>(
    `SELECT Numero, CodeType, capacite, Places, LicensePlate, Cylindre, Couleur,
            CONVERT(varchar(10), DateAchat, 120) AS DateAchat, AnneeFabr, Moteur,
            Fuel, Marque, Modele, Chaissis
     FROM Trs_Autocar WHERE Id_College=${C} ORDER BY Numero`,
  );
  console.log(`Dars Trs_Autocar: ${rows.length} bus`);

  const existing = new Set(
    (await prisma.autocar.findMany({ where: { tenantId: tenant.id }, select: { number: true } })).map(
      (a) => a.number,
    ),
  );

  let created = 0;
  for (const r of rows) {
    const number = String(r.Numero ?? "").trim();
    if (!number) continue;
    if (existing.has(number)) {
      console.log(`  = Bus ${number}: déjà dans EduLM — ignoré`);
      continue;
    }
    const modele = [str(r.Marque), str(r.Modele)].filter(Boolean).join(" ") || null;
    // Dars placeholders: capacite=100 on every row (default, not real) and
    // plates like "M000000"/"M" — don't import that noise.
    const plate0 = str(r.LicensePlate);
    const data = {
      tenantId: tenant.id,
      number,
      type: mapType(r.CodeType as string | null),
      capacity: int(r.Places),
      plate: plate0 && !/^m0*$/i.test(plate0) ? plate0 : null,
      cylinders: int(r.Cylindre),
      couleur: str(r.Couleur),
      dateAchat: str(r.DateAchat),
      moteur: str(r.Moteur),
      fuel: mapFuel(r.Fuel as string | null),
      modele,
      anneeFabrication: int(r.AnneeFabr),
      vin: str(r.Chaissis),
    };
    console.log(
      `  + Bus ${number}: ${data.type ?? "?"} · ${modele ?? "—"} · plaque ${data.plate ?? "—"} · ${data.capacity ?? "—"} places · ${data.fuel ?? "—"} · ${data.anneeFabrication ?? "—"}${data.vin ? ` · VIN ${data.vin}` : ""}`,
    );
    if (confirm) {
      await prisma.autocar.create({ data });
    }
    created++;
  }
  console.log(`\n${confirm ? "✓ créés" : "À créer"}: ${created}`);
  await prisma.$disconnect();
  await closeDars();
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await closeDars();
  process.exit(1);
});
