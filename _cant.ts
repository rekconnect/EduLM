import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { darsQuery, closeDars, DARS_COLLEGE_ID as C } from "./scripts/dars-import/lib/dars-pool.js";

type Cfg = {
  categories: Array<{ id: string; name: string; order?: number; active?: boolean }>;
  fields: Array<{ id?: string; key?: string; label?: string; categoryId?: string; active?: boolean; order?: number }>;
};

async function main() {
  const prisma = new PrismaClient({ datasourceUrl: `${process.env.DIRECT_URL}?connection_limit=4&pool_timeout=60` });
  const tenant = await prisma.tenant.findFirst({ where: { name: "Lycée Montaigne" } });
  const t = await prisma.tenant.findUnique({
    where: { id: tenant!.id },
    select: { parentFieldsConfig: true, studentFieldsConfig: true },
  });

  for (const [which, raw] of [["PARENT", t!.parentFieldsConfig], ["STUDENT", t!.studentFieldsConfig]] as const) {
    const cfg = raw as unknown as Cfg;
    const catName = (id?: string) => cfg.categories.find((c) => c.id === id)?.name ?? "?";
    console.log(`\n=== ${which} config: ${cfg.categories.map((c) => c.name).join(" · ")}`);
    const interesting = which === "PARENT"
      ? ["numero_registre", "lieu_registre", "caza_registre", "adresse_place_ar", "adresse_village_ar", "adresse_qaza_ar", "adresse_rue_ar", "adresse_immeuble_ar"]
      : ["classe", "etablissement", "niveau", "date_inscription"];
    for (const k of interesting) {
      const f = cfg.fields.find((x) => (x.key ?? x.id) === k);
      console.log(f
        ? `  ${k}: '${f.label}' · cat=${catName(f.categoryId)} · active=${f.active !== false} · order=${f.order}`
        : `  ${k}: ABSENT`);
    }
  }

  // Micheline / Saadallah
  const users = await prisma.user.findMany({
    where: {
      tenantId: tenant!.id,
      OR: [{ name: { contains: "Micheline", mode: "insensitive" } }, { name: { contains: "Saadallah", mode: "insensitive" } }],
    },
    select: { name: true, darsParentId: true, customAnswers: true },
  });
  console.log("\n=== Parents cités ===");
  for (const u of users) {
    const ca = (u.customAnswers ?? {}) as Record<string, unknown>;
    console.log(`  ${u.name} (#${u.darsParentId}): numero_registre='${ca.numero_registre ?? ""}' lieu_registre='${ca.lieu_registre ?? ""}' caza_registre='${ca.caza_registre ?? ""}' societe='${ca.societe ?? ""}' secteur='${ca.secteur_activite ?? ""}'`);
  }
  const ids = users.map((u) => u.darsParentId).filter(Boolean);
  if (ids.length) {
    const dars = await darsQuery<Record<string, unknown>>(
      `SELECT p.ID_Parent, p.LastName, p.RegisterNum, p.RegisterTown, p.RegisterTownAR, q.Qaza
       FROM Isc_Parent p LEFT JOIN Isc_Qaza q ON q.ID=p.Id_RegisterQaza
       WHERE p.Id_College=${C} AND p.ID_Parent IN (${ids.join(",")})`,
    );
    for (const r of dars) console.log("  Dars: " + JSON.stringify(r));
  }

  const all = await prisma.user.findMany({
    where: { tenantId: tenant!.id, darsParentId: { not: null } },
    select: { customAnswers: true },
  });
  const cnt = (k: string) => all.filter((u) => String(((u.customAnswers ?? {}) as Record<string, unknown>)[k] ?? "").trim() !== "").length;
  console.log(`\nCouverture: numero_registre ${cnt("numero_registre")} · lieu_registre ${cnt("lieu_registre")} · caza_registre ${cnt("caza_registre")} / ${all.length}`);
  await prisma.$disconnect();
  await closeDars();
}
main().catch(async (e) => { console.error("ERR:", String(e).slice(0, 300)); await closeDars(); process.exit(1); });
