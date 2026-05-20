import { getTranslations } from "next-intl/server";
import { Building2, Hash, MapPin, Palette, Receipt, School, Send, SunMoon, UserCircle, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { requireUser } from "@/lib/session";
import { unscopedDb } from "@/lib/db";
import { AppearancePicker } from "./_appearance";
import { GeneralForm } from "./_general";
import { BrandingForm } from "./_branding";
import { ContactForm } from "./_contact";
import { BillingDefaultsForm } from "./_billing-defaults";
import { EmailDefaultsForm } from "./_email";
import { FamilyCodeForm } from "./_family-code";
import { EstablishmentsForm, type EstablishmentRow } from "./_establishments";
import { FieldsConfigForm } from "./_fields-config";
import {
  listEstablishments,
  loadEntityFieldsConfig,
  loadTenantSettings,
} from "./_actions";

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("settings");

  let tenantName = "";
  if (user.tenantId) {
    const tenant = await unscopedDb().tenant.findUnique({
      where: { id: user.tenantId },
      select: { name: true },
    });
    tenantName = tenant?.name ?? "";
  }

  const isAdmin = user.role === "SCHOOL_ADMIN";
  const [tenant, establishments, parentFields, studentFields] = await Promise.all([
    isAdmin ? loadTenantSettings() : Promise.resolve(null),
    isAdmin ? listEstablishments() : Promise.resolve([] as EstablishmentRow[]),
    isAdmin ? loadEntityFieldsConfig("parent") : Promise.resolve({ categories: [], fields: [] }),
    isAdmin ? loadEntityFieldsConfig("student") : Promise.resolve({ categories: [], fields: [] }),
  ]);

  return (
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <PageHeader title={t("title")} description={t("description")} />

        {isAdmin && tenant ? (
          <>
            <SettingsSection
              icon={Building2}
              title={t("general.title")}
              description={t("general.description")}
            >
              <GeneralForm
                initial={{
                  name: tenant.name,
                  defaultLocale: tenant.defaultLocale,
                  enabledLocales: tenant.enabledLocales,
                  timeZone: tenant.timeZone,
                }}
              />
            </SettingsSection>

            <SettingsSection
              icon={Palette}
              title={t("branding.title")}
              description={t("branding.description")}
            >
              <BrandingForm
                initial={{
                  brandLight: tenant.brandLight,
                  brandDark: tenant.brandDark,
                  logoUrl: tenant.logoUrl,
                }}
              />
            </SettingsSection>

            <SettingsSection
              icon={MapPin}
              title={t("contact.title")}
              description={t("contact.description")}
            >
              <ContactForm
                initial={{
                  address: tenant.address,
                  phone: tenant.phone,
                  contactEmail: tenant.contactEmail,
                  websiteUrl: tenant.websiteUrl,
                }}
              />
            </SettingsSection>

            <SettingsSection
              icon={Receipt}
              title={t("billing.title")}
              description={t("billing.description")}
            >
              <BillingDefaultsForm
                initial={{
                  defaultCurrency: tenant.defaultCurrency,
                  defaultInvoiceDueOffsetDays: tenant.defaultInvoiceDueOffsetDays,
                  invoiceFooterText: tenant.invoiceFooterText,
                  invoiceNumberPrefix: tenant.invoiceNumberPrefix,
                  invoiceNumberPadding: tenant.invoiceNumberPadding,
                }}
              />
            </SettingsSection>

            <SettingsSection
              icon={Send}
              title={t("email.title")}
              description={t("email.description")}
            >
              <EmailDefaultsForm
                initial={{
                  emailSenderName: tenant.emailSenderName,
                  emailSignature: tenant.emailSignature,
                }}
              />
            </SettingsSection>

            <SettingsSection
              icon={Hash}
              title={t("familyCode.title")}
              description={t("familyCode.description")}
            >
              <FamilyCodeForm
                initial={{
                  familyCodePrefix: tenant.familyCodePrefix,
                  familyCodePadding: tenant.familyCodePadding,
                  familyCodeNextSequence: tenant.familyCodeNextSequence,
                }}
              />
            </SettingsSection>

            <SettingsSection
              icon={School}
              title={t("establishments.title")}
              description={t("establishments.description")}
            >
              <EstablishmentsForm
                initial={establishments.map((e) => ({
                  id: e.id,
                  name: e.name,
                  // `levels` comes back as Json — coerce to string[] defensively.
                  levels: Array.isArray(e.levels)
                    ? (e.levels.filter((x) => typeof x === "string") as string[])
                    : [],
                  order: e.order,
                  isActive: e.isActive,
                }))}
              />
            </SettingsSection>

            <SettingsSection
              icon={UserCircle}
              title={t("parentFields.title")}
              description={t("parentFields.description")}
            >
              <FieldsConfigForm entity="parent" initial={parentFields} />
            </SettingsSection>

            <SettingsSection
              icon={Users}
              title={t("studentFields.title")}
              description={t("studentFields.description")}
            >
              <FieldsConfigForm entity="student" initial={studentFields} />
            </SettingsSection>
          </>
        ) : null}

        <SettingsSection
          icon={SunMoon}
          title={t("appearance.title")}
          description={t("appearance.description")}
        >
          <AppearancePicker />
        </SettingsSection>
      </main>
  );
}

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] shadow-card">
      <header className="flex items-start gap-3 border-b border-[color:var(--color-border-subtle)] px-6 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]">
          <Icon className="size-4" aria-hidden />
        </div>
        <div>
          <h2 className="text-base font-semibold text-[color:var(--color-foreground)]">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-[color:var(--color-foreground-muted)]">
            {description}
          </p>
        </div>
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}
