import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const p = new PrismaClient();
async function main() {
  const email = process.argv[2] ?? "raed.elkady@outlook.com";
  const pw = process.argv[3] ?? "Montaigne2026";
  const hash = await bcrypt.hash(pw, 10);
  const r = await p.user.updateMany({
    where: { email },
    data: { passwordHash: hash, status: "ACTIVE", mustChangePassword: true },
  });
  const ok = await bcrypt.compare(pw, hash);
  console.log(`Reset ${r.count} account(s) for ${email}`);
  console.log(`Password set to "${pw}" (verify hash: ${ok}), status ACTIVE, mustChangePassword true.`);
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
