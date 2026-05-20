"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateContactInfo } from "./_actions";

export function ContactForm({
  initial,
}: {
  initial: {
    address: string | null;
    phone: string | null;
    contactEmail: string | null;
    websiteUrl: string | null;
  };
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [address, setAddress] = useState(initial.address ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [contactEmail, setContactEmail] = useState(initial.contactEmail ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initial.websiteUrl ?? "");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.append("address", address);
    fd.append("phone", phone);
    fd.append("contactEmail", contactEmail);
    fd.append("websiteUrl", websiteUrl);

    startTransition(async () => {
      try {
        const result = await updateContactInfo(fd);
        if (result.ok) toast.success(t("updatedToast"));
        else toast.error(t("errorToast"));
      } catch {
        toast.error(t("errorToast"));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label={t("contact.address")} htmlFor="address">
        <Textarea
          id="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder={t("contact.addressPlaceholder")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("contact.phone")} htmlFor="phone">
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
            placeholder="+212 5 22 ..."
          />
        </Field>
        <Field label={t("contact.contactEmail")} htmlFor="contactEmail">
          <Input
            id="contactEmail"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            maxLength={200}
            placeholder="contact@school.example"
          />
        </Field>
      </div>

      <Field label={t("contact.websiteUrl")} htmlFor="websiteUrl">
        <Input
          id="websiteUrl"
          type="url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          maxLength={500}
          placeholder="https://www.school.example"
        />
      </Field>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={pending} className="gap-2">
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? tCommon("loading") : tCommon("save")}
        </Button>
      </div>
    </form>
  );
}
