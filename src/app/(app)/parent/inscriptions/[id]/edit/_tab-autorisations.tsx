"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useField } from "@/components/dossier/tenant-config-context";
import { EditableField } from "@/components/dossier/preview-edit-mode-context";
import { saveAutorisationsTab } from "../../_actions";

type Initial = {
  imageRightsSite: boolean | null;
  imageRightsBook: boolean | null;
  imageRightsSocial: boolean | null;
  imageRightsRadio: boolean | null;
};

const IMAGE_KINDS = ["Site", "Book", "Social", "Radio"] as const;
type ImageKind = (typeof IMAGE_KINDS)[number];

const IMAGE_FIELD_KEY: Record<ImageKind, string> = {
  Site: "foyer.imageRights.site",
  Book: "foyer.imageRights.book",
  Social: "foyer.imageRights.social",
  Radio: "foyer.imageRights.radio",
};

/**
 * "Autorisations" tab — the four droits à l'image consents (site internet,
 * livre souvenir, réseaux sociaux, web radio). Lifted out of the Foyer tab
 * into its own tab. Saves to the Family row so siblings inherit.
 */
export function DossierTabAutorisations({
  applicationId,
  initial,
  disabled,
  editMode = false,
}: {
  applicationId: string;
  initial: Initial;
  disabled: boolean;
  editMode?: boolean;
}) {
  const t = useTranslations("dossierForms");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();

  const [imageRights, setImageRights] = useState({
    Site: initial.imageRightsSite,
    Book: initial.imageRightsBook,
    Social: initial.imageRightsSocial,
    Radio: initial.imageRightsRadio,
  });

  const fImageSite = useField("foyer.imageRights.site");
  const fImageBook = useField("foyer.imageRights.book");
  const fImageSocial = useField("foyer.imageRights.social");
  const fImageRadio = useField("foyer.imageRights.radio");
  const imageFieldByKind: Record<ImageKind, ReturnType<typeof useField>> = {
    Site: fImageSite,
    Book: fImageBook,
    Social: fImageSocial,
    Radio: fImageRadio,
  };

  function setImage(kind: ImageKind, val: boolean) {
    setImageRights((p) => ({ ...p, [kind]: val }));
  }

  function onSave() {
    if (editMode) {
      toast.info("Aperçu — modifications non enregistrées");
      return;
    }
    startTransition(async () => {
      const r = await saveAutorisationsTab(applicationId, {
        imageRightsSite: imageRights.Site,
        imageRightsBook: imageRights.Book,
        imageRightsSocial: imageRights.Social,
        imageRightsRadio: imageRights.Radio,
      });
      if (r.ok) toast.success(tCommon("saved"));
      else toast.error(t("saveError"));
    });
  }

  function ImageRightsRow({ kind }: { kind: ImageKind }) {
    const cfg = imageFieldByKind[kind];
    if (cfg?.hidden) return null;
    const v = imageRights[kind];
    return (
      <EditableField fieldKey={IMAGE_FIELD_KEY[kind]}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface)] px-3 py-2">
          <span className="text-sm font-medium text-[color:var(--color-foreground)]">
            {cfg?.label ?? t(`foyer.imageRights${kind}` as never)}
            {cfg?.required ? (
              <span className="ms-0.5 text-[color:var(--color-danger)]">*</span>
            ) : null}
          </span>
          <div className="inline-flex items-center gap-3">
            <label className="inline-flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={`image-${kind}`}
                checked={v === true}
                onChange={() => setImage(kind, true)}
                disabled={disabled}
              />
              {tCommon("yes")}
            </label>
            <label className="inline-flex items-center gap-1 text-sm">
              <input
                type="radio"
                name={`image-${kind}`}
                checked={v === false}
                onChange={() => setImage(kind, false)}
                disabled={disabled}
              />
              {tCommon("no")}
            </label>
          </div>
        </div>
      </EditableField>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t("foyer.imageRightsTitle")}
          description={t("foyer.imageRightsHint")}
        />
        <CardBody className="space-y-3">
          {IMAGE_KINDS.map((kind) => (
            <ImageRightsRow key={kind} kind={kind} />
          ))}
        </CardBody>
      </Card>

      {!disabled ? (
        <div className="flex justify-end">
          <Button type="button" onClick={onSave} disabled={pending} className="gap-2">
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {pending ? tCommon("saving") : tCommon("save")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
