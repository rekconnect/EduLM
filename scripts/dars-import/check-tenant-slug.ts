import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const t = await p.tenant.findMany({ select: { name: true, slug: true } });
  for (const x of t) console.log(`${x.name}  →  slug="${x.slug}"`);
  await p.$disconnect();
}
main().catch(async (e) => { console.error(e); await p.$disconnect(); process.exit(1); });
