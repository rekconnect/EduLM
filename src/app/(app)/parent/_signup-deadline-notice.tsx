import { getLocale, getTranslations } from "next-intl/server";
import { Hourglass } from "lucide-react";
import { unscopedDb } from "@/lib/db";
import { getSignupDeadlineForUser } from "@/lib/signup-retention";

/**
 * Tells a self-registered family, on its own pages, that the account is
 * deleted automatically if no dossier is started in time (the school's
 * "Comptes sans dossier" delay — src/lib/signup-retention.ts). There is no
 * e-mail warning, so this notice IS the warning.
 *
 * Renders nothing when the rule does not apply to this account: rule off or
 * suspended, a dossier exists, the school created or confirmed the account.
 *
 * Safe to render as a nested async component: every read here names the
 * tenant explicitly instead of relying on the request's tenant context.
 */
export async function SignupDeadlineNotice({
  userId,
  tenantId,
}: {
  userId: string;
  tenantId: string;
}) {
  const now = new Date();
  const deadline = await getSignupDeadlineForUser(userId, tenantId, now);
  if (!deadline) return null;

  const [t, locale, tenant] = await Promise.all([
    getTranslations("parent"),
    getLocale(),
    unscopedDb().tenant.findUnique({
      where: { id: tenantId },
      select: { timeZone: true },
    }),
  ]);

  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-[color:var(--color-warning)]/30 bg-[color:var(--color-warning-soft)] px-4 py-3 text-sm text-[color:var(--color-warning-soft-fg)]"
    >
      <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">
          {deadline <= now
            ? t("signupDeadlinePassedTitle")
            : t("signupDeadlineTitle", {
                date: formatDay(deadline, locale, tenant?.timeZone),
              })}
        </p>
        <p className="mt-0.5">{t("signupDeadlineBody")}</p>
      </div>
    </div>
  );
}

/**
 * The calendar day of the deadline, in the school's time zone. The account is
 * never deleted before the deadline instant, so "before <this day>" always
 * leaves the family at least what the notice promises.
 */
function formatDay(d: Date, locale: string, timeZone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "long",
      timeZone: timeZone || "UTC",
    }).format(d);
  } catch {
    // Unknown time zone name stored on the tenant.
    return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(d);
  }
}
