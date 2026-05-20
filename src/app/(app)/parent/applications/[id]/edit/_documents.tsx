"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RequiredDocument } from "@/lib/admission-fields";
import {
  uploadApplicationDocument,
  deleteApplicationDocument,
} from "../../_actions";

export type UploadedDocSummary = {
  filename: string;
  fileSizeBytes: number;
  downloadUrl: string | null;
};

export function DocumentsSection({
  applicationId,
  requirements,
  uploads,
}: {
  applicationId: string;
  requirements: RequiredDocument[];
  uploads: Record<string, UploadedDocSummary | undefined>;
}) {
  const t = useTranslations("admissions");

  if (requirements.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-foreground-subtle)]">
        {t("requiredDocsParentHeading")}
      </p>
      <ul className="space-y-3">
        {requirements.map((req) => (
          <li key={req.id}>
            <DocumentSlot
              applicationId={applicationId}
              requirement={req}
              upload={uploads[req.id]}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DocumentSlot({
  applicationId,
  requirement,
  upload,
}: {
  applicationId: string;
  requirement: RequiredDocument;
  upload: UploadedDocSummary | undefined;
}) {
  const t = useTranslations("admissions");
  const [uploading, startUpload] = useTransition();
  const [deleting, startDelete] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    startUpload(async () => {
      try {
        const result = await uploadApplicationDocument(
          applicationId,
          requirement.id,
          fd,
        );
        if (result.ok) {
          toast.success(t("requiredDocsUploadedToast", { filename: result.filename }));
        } else {
          toast.error(t(`requiredDocsUploadError_${result.error}`));
        }
      } catch {
        toast.error(t("requiredDocsUploadError_upload-failed"));
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  function onDelete() {
    startDelete(async () => {
      try {
        const result = await deleteApplicationDocument(
          applicationId,
          requirement.id,
        );
        if (result.ok) {
          toast.success(t("requiredDocsDeletedToast"));
        } else {
          toast.error(t("requiredDocsDeleteError"));
        }
      } catch {
        toast.error(t("requiredDocsDeleteError"));
      }
    });
  }

  const hasUpload = !!upload;
  const busy = uploading || deleting;

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-md border px-4 py-3",
        hasUpload
          ? "border-[color:var(--color-success)]/30 bg-[color:var(--color-success-soft)]"
          : requirement.required
            ? "border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-raised)]"
            : "border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)]",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          hasUpload
            ? "bg-[color:var(--color-success)] text-white"
            : "bg-[color:var(--color-brand-50)] text-[color:var(--color-brand-600)]",
        )}
      >
        {hasUpload ? (
          <CheckCircle2 className="size-4" aria-hidden />
        ) : (
          <FileText className="size-4" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[color:var(--color-foreground)]">
          {requirement.label}
          {requirement.required ? (
            <span className="ms-1 text-[color:var(--color-danger)]">*</span>
          ) : null}
        </p>
        {requirement.hint ? (
          <p className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">
            {requirement.hint}
          </p>
        ) : null}
        {hasUpload ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-[color:var(--color-success-soft-fg)]">
            <FileText className="size-3" aria-hidden />
            <span className="truncate">{upload.filename}</span>
            <span className="text-[color:var(--color-foreground-subtle)]">
              · {formatBytes(upload.fileSizeBytes)}
            </span>
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {hasUpload && upload.downloadUrl ? (
          <a
            href={upload.downloadUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={t("requiredDocsDownload")}
            className="inline-flex size-8 items-center justify-center rounded-md text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-surface-hover)] hover:text-[color:var(--color-foreground)]"
          >
            <Download className="size-3.5" aria-hidden />
          </a>
        ) : null}

        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            hasUpload
              ? "border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] text-[color:var(--color-foreground)] hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-hover)]"
              : "bg-[color:var(--color-brand-500)] text-[color:var(--color-foreground-onbrand)] hover:bg-[color:var(--color-brand-600)]",
            busy && "pointer-events-none opacity-60",
          )}
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-3.5" aria-hidden />
          )}
          {uploading
            ? t("requiredDocsUploading")
            : hasUpload
              ? t("requiredDocsReplace")
              : t("requiredDocsUpload")}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={requirement.acceptedTypes || undefined}
            onChange={onFileChange}
            disabled={busy}
          />
        </label>

        {hasUpload ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            aria-label={t("requiredDocsDelete")}
            className="inline-flex size-8 items-center justify-center rounded-md text-[color:var(--color-foreground-muted)] transition-colors hover:bg-[color:var(--color-danger-soft)] hover:text-[color:var(--color-danger)] disabled:opacity-60"
          >
            {deleting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-3.5" aria-hidden />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
