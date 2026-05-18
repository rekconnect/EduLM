import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { dirFor, isLocale, DEFAULT_LOCALE } from "@/i18n/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduLM",
  description: "Portail parents — inscriptions, finance, communication.",
  appleWebApp: { capable: true, title: "EduLM", statusBarStyle: "default" },
};

export const viewport = {
  themeColor: "#1e40af",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const localeRaw = await getLocale();
  const locale = isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;
  const messages = await getMessages();
  const dir = dirFor(locale);

  return (
    <html lang={locale} dir={dir}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
