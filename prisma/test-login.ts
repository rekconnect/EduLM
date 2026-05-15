import { unscopedDb } from "../src/lib/db";
import bcrypt from "bcryptjs";

const PASSWORD = "edulm-demo-2026";

async function tryLogin(email: string) {
  const db = unscopedDb();
  try {
    const users = await db.user.findMany({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, tenantId: true, role: true, status: true, passwordHash: true },
    });
    console.log(`\nemail=${email}: found ${users.length} row(s)`);
    for (const u of users) {
      const hashLen = u.passwordHash?.length ?? 0;
      const ok = u.passwordHash ? await bcrypt.compare(PASSWORD, u.passwordHash) : false;
      console.log(
        `  - id=${u.id.slice(0, 8)}… role=${u.role} tenantId=${u.tenantId ?? "(null)"} status=${u.status} hashLen=${hashLen} verify(${PASSWORD})=${ok ? "✓" : "✗"}`,
      );
    }
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  await tryLogin("super@edulm.app");
  await tryLogin("admin@montaigne.edu.lb");
  await tryLogin("claire.dupont@montaigne.edu.lb");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
