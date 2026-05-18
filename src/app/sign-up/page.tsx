import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardBody } from "@/components/ui/card";
import { SignUpForm } from "./_form";

export default async function SignUpPage() {
  const h = await headers();
  const slug = h.get("x-tenant-slug");
  if (!slug) notFound();

  const t = await getTranslations("admissions");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t("signUpTitle")}</h1>
      <p className="mt-1 text-sm text-[color:var(--muted-fg)]">{t("signUpLead")}</p>
      <Card className="mt-6">
        <CardBody>
          <SignUpForm tenantSlug={slug} />
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm">
        <Link href={`/t/${slug}/sign-in`} className="text-[color:var(--muted-fg)] hover:underline">
          {t("signUpAlready")}
        </Link>
      </p>
    </main>
  );
}
