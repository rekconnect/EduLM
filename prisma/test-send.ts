/**
 * Quick mailer pipe test. Sends one real email to confirm Resend is wired.
 *
 * Usage:
 *   npx tsx prisma/test-send.ts your-email@example.com
 *
 * IMPORTANT: when AUTH_EMAIL_FROM="onboarding@resend.dev" (Resend's testing
 * sender), Resend ONLY delivers to the address you used to sign up for Resend.
 * Other recipients silently fail. Use your own email here.
 */

import { resolve } from "node:path";

async function main() {
  const to = process.argv[2];
  if (!to || !to.includes("@")) {
    console.error("Usage: npx tsx prisma/test-send.ts your-email@example.com");
    process.exit(1);
  }

  // Load .env manually — tsx doesn't auto-load it the way `next dev` does.
  // Node 21.7+ ships process.loadEnvFile.
  try {
    process.loadEnvFile?.(resolve(process.cwd(), ".env"));
  } catch (e) {
    console.warn("Couldn't load .env:", (e as Error).message);
  }

  // Dynamic import AFTER env is loaded, so the mailer reads RESEND_API_KEY.
  const { isMailerConfigured, sendMail, htmlLayout } = await import(
    "../src/lib/mailer"
  );

  console.log(
    `Mailer configured: ${isMailerConfigured() ? "YES (will send via Resend)" : "NO (console fallback)"}`,
  );
  console.log(`From: ${process.env.AUTH_EMAIL_FROM ?? "(default)"}`);
  console.log(`To:   ${to}`);
  console.log("");

  const result = await sendMail({
    to,
    subject: `[EduLM test] Pipe vérifié — ${new Date().toISOString()}`,
    tag: "test-send",
    html: htmlLayout({
      heading: "Test EduLM",
      intro: "Si vous lisez ceci dans votre boîte mail, le pipe Resend fonctionne.",
      bodyHtml: `<p style="font-size:14px;color:#27272a">Envoyé depuis <code>prisma/test-send.ts</code> à ${new Date().toLocaleString("fr-FR")}.</p>`,
      footer: "Email de test — vous pouvez le supprimer.",
    }),
  });

  console.log("Result:", result);
  if (result.sent) {
    console.log(`\n✓ Sent (id=${result.id}) — check your inbox (and spam folder).`);
  } else if (result.reason === "no-config") {
    console.log(`\n✗ Mailer still not configured. Confirm .env has RESEND_API_KEY set.`);
  } else {
    console.log(`\n✗ Resend rejected: ${result.error}`);
    console.log(`   With onboarding@resend.dev you can only send to your own Resend signup email.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
