import { isMailerConfigured } from "../src/lib/mailer";
import {
  sendApplicationSubmittedEmail,
  sendApplicationDecidedEmail,
  sendInvoiceIssuedEmail,
  sendPaymentReceiptEmail,
  sendContactMessageEmail,
  sendAnnouncementEmail,
} from "../src/lib/emails/notifications";

async function main() {
  console.log(`Mailer configured: ${isMailerConfigured() ? "YES" : "NO (fallback to console)"}`);
  console.log("");

  const tenantName = "Lycée Montaigne";

  console.log("--- 1) applicationSubmitted (to admin) ---");
  console.log(
    await sendApplicationSubmittedEmail({
      to: { email: "admin@montaigne.edu.lb", name: "Directrice" },
      tenantName,
      childFirstName: "Yara",
      childLastName: "Test",
      requestedLevel: "6ème",
      submittedByName: "Test Parent",
      applicationId: "app-test-id",
    }),
  );

  console.log("\n--- 2) applicationDecided ACCEPTED (to parent) ---");
  console.log(
    await sendApplicationDecidedEmail({
      to: { email: "parent@example.com", name: "Test Parent" },
      tenantName,
      decision: "ACCEPTED",
      childFirstName: "Yara",
      childLastName: "Test",
      decisionNote: "Bienvenue à Montaigne !",
      applicationId: "app-test-id",
    }),
  );

  console.log("\n--- 3) invoiceIssued ---");
  console.log(
    await sendInvoiceIssuedEmail({
      to: { email: "parent@example.com", name: "Test Parent" },
      tenantName,
      invoiceNumber: "INV-2526-0001",
      studentName: "Layla Kassem",
      totalCents: 350000,
      currency: "USD",
      dueAt: new Date("2025-10-15"),
      invoiceId: "inv-test-id",
    }),
  );

  console.log("\n--- 4) paymentReceipt ---");
  console.log(
    await sendPaymentReceiptEmail({
      to: { email: "parent@example.com", name: "Test Parent" },
      tenantName,
      invoiceNumber: "INV-2526-0001",
      studentName: "Layla Kassem",
      amountCents: 150000,
      currency: "USD",
      remainingCents: 200000,
      paymentMethod: "BANK_TRANSFER",
      paymentDate: new Date(),
    }),
  );

  console.log("\n--- 5) contactMessage (to admin) ---");
  console.log(
    await sendContactMessageEmail({
      to: { email: "admin@montaigne.edu.lb" },
      tenantName,
      fromName: "Sami Kassem",
      fromEmail: "sami.kassem@example.com",
      subject: "Question facture",
      body: "Bonjour, est-il possible d'échelonner ?",
      messageId: "msg-test-id",
    }),
  );

  console.log("\n--- 6) announcement (broadcast) ---");
  console.log(
    await sendAnnouncementEmail({
      to: [{ email: "p1@example.com" }, { email: "p2@example.com" }],
      tenantName,
      title: "Vacances de la Toussaint",
      body: "Les vacances commencent le 18 octobre.\n\nBonne pause à toutes et tous.",
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
