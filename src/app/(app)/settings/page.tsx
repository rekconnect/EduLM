import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Building2,
  CreditCard,
  Hash,
  IdCard,
  MapPin,
  Network,
  Palette,
  Receipt,
  School,
  Send,
  SlidersHorizontal,
  SunMoon,
  Users,
  type LucideIcon,
} from "lucide-react";
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
import { FieldsEditorTabs } from "./_fields-editor-tabs";
import {
  listEstablishments,
  loadEntityFieldsConfig,
  loadParentCreateConfig,
  loadStudentCreateConfig,
  loadTenantSettings,
} from "./_actions";

/**
 * Settings are grouped into five categories. Each category is its own
 * tab navigated via `?tab=`. Server-rendered so it's bookmarkable and
 * doesn't ship JS for the navigation itself.
 *
 * Admin sees all five. Non-admin (PARENT, TEACHER) only ever sees the
 * Appearance tab and we collapse the nav to a single item — no point
 * showing categories they can't open.
 */
const CATEGORIES = [
  "identity",
  "billing",
  "structure",
  "forms",
  "appearance",
] as const;
type Category = (typeof CATEGORIES)[number];

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  identity: IdCard,
  billing: CreditCard,
  structure: Network,
  forms: SlidersHorizontal,
  appearance: SunMoon,
};

function parseCategory(raw: string | undefined, isAdmin: boolean): Category {
  if (!isAdmin) return "appearance";
  if (raw && (CATEGORIES as readonly string[]).includes(raw)) {
    return raw as Category;
  }
  return "identity";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
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
  const currentTab = parseCategory(tab, isAdmin);

  // Only load the data needed for the active tab. Saves a few DB
  // round-trips when admin sits on Appearance or Identity.
  const needsTenant =
    isAdmin &&
    (currentTab === "identity" ||
      currentTab === "billing" ||
      currentTab === "structure");
  const needsEstablishments = isAdmin && currentTab === "structure";
  const needsParentFields = isAdmin && currentTab === "forms";
  const needsStudentFields = isAdmin && currentTab === "forms";
  const needsParentCreate = isAdmin && currentTab === "forms";

  const [
    tenant,
    establishments,
    parentFields,
    studentFields,
    parentCreateConfig,
    studentCreateConfig,
  ] = await Promise.all([
    needsTenant ? loadTenantSettings() : Promise.resolve(null),
    needsEstablishments
      ? listEstablishments()
      : Promise.resolve([] as EstablishmentRow[]),
    needsParentFields
      ? loadEntityFieldsConfig("parent")
      : Promise.resolve({ categories: [], fields: [] }),
    needsStudentFields
      ? loadEntityFieldsConfig("student")
      : Promise.resolve({ categories: [], fields: [] }),
    needsParentCreate ? loadParentCreateConfig() : Promise.resolve(null),
    needsParentCreate ? loadStudentCreateConfig() : Promise.resolve(null),
  ]);

  const visibleCategories: Category[] = isAdmin ? [...CATEGORIES] : ["appearance"];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <PageHeader title={t("title")} description={t("description")} />

      <div className="mt-6 grid gap-8 md:grid-cols-[220px_1fr]">
        <SettingsNav
          categories={visibleCategories}
          current={currentTab}
          t={(key: string) => t(key)}
        />

        <div className="space-y-6">
          {currentTab === "identity" && isAdmin && tenant ? (
            <>
              <CategoryHeader
                title={t("category.identity.title")}
                description={t("category.identity.description")}
              />
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
            </>
          ) : null}

          {currentTab === "billing" && isAdmin && tenant ? (
            <>
              <CategoryHeader
                title={t("category.billing.title")}
                description={t("category.billing.description")}
              />
              <SettingsSection
                icon={Receipt}
                title={t("billing.title")}
                description={t("billing.description")}
              >
                <BillingDefaultsForm
                  initial={{
                    defaultCurrency: tenant.defaultCurrency,
                    defaultInvoiceDueOffsetDays:
                      tenant.defaultInvoiceDueOffsetDays,
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
            </>
          ) : null}

          {currentTab === "structure" && isAdmin && tenant ? (
            <>
              <CategoryHeader
                title={t("category.structure.title")}
                description={t("category.structure.description")}
              />
              <SettingsSection
                icon={School}
                title={t("establishments.title")}
                description={t("establishments.description")}
              >
                <EstablishmentsForm
                  initial={establishments.map((e) => ({
                    id: e.id,
                    name: e.name,
                    // `levels` comes back as Json — coerce defensively.
                    levels: Array.isArray(e.levels)
                      ? (e.levels.filter((x) => typeof x === "string") as string[])
                      : [],
                    order: e.order,
                    isActive: e.isActive,
                  }))}
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
            </>
          ) : null}

          {currentTab === "forms" && isAdmin ? (
            <>
              <CategoryHeader
                title={t("category.forms.title")}
                description={t("category.forms.description")}
              />
              <SettingsSection
                icon={Users}
                title={t("formFields.title")}
                description={t("formFields.description")}
              >
                <FieldsEditorTabs
                  studentInitial={studentFields}
                  parentInitial={parentFields}
                  parentCreateInitial={parentCreateConfig}
                  studentCreateInitial={studentCreateConfig}
                />
              </SettingsSection>
            </>
          ) : null}

          {currentTab === "appearance" ? (
            <>
              <CategoryHeader
                title={t("category.appearance.title")}
                description={t("category.appearance.description")}
              />
              <SettingsSection
                icon={SunMoon}
                title={t("appearance.title")}
                description={t("appearance.description")}
              >
                <AppearancePicker />
              </SettingsSection>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function SettingsNav({
  categories,
  current,
  t,
}: {
  categories: Category[];
  current: Category;
  t: (key: string) => string;
}) {
  return (
    <aside className="md:sticky md:top-6 md:self-start">
      <nav aria-label={t("navLabel")} className="space-y-0.5">
        {categories.map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          const active = cat === current;
          return (
            <Link
              key={cat}
              href={cat === "identity" ? "/settings" : `/settings?tab=${cat}`}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "flex items-center gap-2.5 rounded-md bg-[color:var(--color-brand-50)] px-3 py-2 text-sm font-medium text-[color:var(--color-brand-700)] transition-colors"
                  : "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-foreground)]"
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {t(`category.${cat}.title`)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function CategoryHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header>
      <h1 className="text-xl font-semibold text-[color:var(--color-foreground)]">
        {title}
      </h1>
      <p className="mt-1 text-sm text-[color:var(--color-foreground-muted)]">
        {description}
      </p>
    </header>
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
