/**
 * Set a new password for an account, from the command line. For owner/admin
 * recovery — the password value is typed by the operator in their own
 * terminal and is bcrypt-hashed before storage (never logged).
 *
 *   npx tsx --env-file=.env scripts/reset-password.ts --email=administrator@lycee-montaigne.edu.lb --password="NewPasswordHere"
 *
 * If the same email exists at several tenants, add --tenant-slug=<slug>.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const arg = (k: string) => {
  const p = process.argv.find((a) => a.startsWith(`--${k}=`));
  return p ? p.split("=").slice(1).join("=").replace(/^["']|["']$/g, "") : "";
};

async function main() {
  const email = arg("email").toLowerCase().trim();
  const password = arg("password");
  const slug = arg("tenant-slug").toLowerCase().trim();
  if (!email || !password) {
    console.error('Usage: --email=... --password="..." [--tenant-slug=...]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const prisma = new PrismaClient({
    datasourceUrl: `${process.env.DIRECT_URL}?connection_limit=4&pool_timeout=60`,
  });
  const matches = await prisma.user.findMany({
    where: { email, ...(slug ? { tenant: { slug } } : {}) },
    select: { id: true, role: true, tenant: { select: { slug: true } } },
  });
  if (matches.length === 0) {
    console.error(`No account found for ${email}${slug ? ` at tenant ${slug}` : ""}.`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(
      `${matches.length} accounts share this email — re-run with --tenant-slug=<slug>:\n` +
        matches.map((m) => `  ${m.role} @ ${m.tenant?.slug ?? "(no tenant)"}`).join("\n"),
    );
    process.exit(1);
  }

  const u = matches[0]!;
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: u.id },
    data: { passwordHash, status: "ACTIVE", mustChangePassword: false },
  });
  console.log(`✓ Password updated for ${email} (${u.role}${u.tenant ? ` @ ${u.tenant.slug}` : ""}).`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error("ERR:", String(e).slice(0, 300));
  process.exit(1);
});
