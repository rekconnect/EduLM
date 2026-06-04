import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const p = new PrismaClient();
async function main() {
  const email = process.argv[2] ?? "raed.elkady@outlook.com";
  const pw = process.argv[3] ?? "Montaigne2026";
  const u = await p.user.findFirst({
    where: { email },
    select: { email: true, status: true, mustChangePassword: true, passwordHash: true, tenantId: true },
  });
  if (!u) { console.log("NO USER FOUND for", email); await p.$disconnect(); return; }
  const hasHash = !!u.passwordHash;
  const matches = hasHash ? await bcrypt.compare(pw, u.passwordHash!) : false;
  console.log(`email:              ${u.email}`);
  console.log(`status:             ${u.status}`);
  console.log(`mustChangePassword: ${u.mustChangePassword}`);
  console.log(`has passwordHash:   ${hasHash}`);
  console.log(`tenantId:           ${u.tenantId}`);
  console.log(`"${pw}" matches:    ${matches}`);
  // How many users share this email (ambiguous-login check)?
  const dupes = await p.user.count({ where: { email } });
  console.log(`accounts with this email: ${dupes}`);
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
