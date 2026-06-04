import { PrismaClient } from "@prisma/client";
import { parseEntityFieldsConfig } from "../../src/lib/entity-fields.js";
import { parseFlags, resolveTenant } from "./lib/tenant.js";
const prisma = new PrismaClient();
async function main() {
  const { tenantName } = parseFlags();
  const tenant = await resolveTenant(prisma, tenantName);
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { parentFieldsConfig: true },
  });
  const cfg = parseEntityFieldsConfig(t?.parentFieldsConfig);
  const catName = new Map(cfg.categories.map((c) => [c.id, c.name]));
  console.log("Categories:", cfg.categories.map((c) => `${c.name}`).join(", "));
  console.log("\nFields:");
  for (const f of cfg.fields) {
    console.log(
      `  id=${f.id}  "${f.label}"  type=${f.type}  cat=${catName.get(f.categoryId) ?? "?"}  ${f.userBoundTo ? "user→" + f.userBoundTo : ""}${f.guardianBoundTo ? "guardian→" + f.guardianBoundTo : ""}${f.familyBoundTo ? "family→" + f.familyBoundTo : ""}`,
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
