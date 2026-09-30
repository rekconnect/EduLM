"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  FileImage,
  FileText,
  Loader2,
  MessageSquareReply,
  Paperclip,
  Send,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { RecipientPicker } from "@/components/messaging/recipient-picker";
import { cn } from "@/lib/utils";
import {
  isDirectAudience,
  isEmptyAudience,
  MESSAGE_ATTACHMENT_MAX_BYTES,
  MESSAGE_BODY_MAX,
  MESSAGE_MAX_ATTACHMENTS,
  MESSAGE_SUBJECT_MAX,
  type AudiencePreview,
  type AudienceSpec,
  type PickerClass,
  type PickerEstablishment,
} from "@/lib/messaging-shared";
import { previewAudience, sendBroadcast } from "../_actions";

/** Above this many recipients, ask for an explicit confirmation. */
const CONFIRM_THRESHOLD = 30;

/**
 * Attachments travel inside the server-action request body, which
 * next.config caps at 4 MB (and Vercel hard-rejects ~4.5 MB) — so the
 * COMBINED size must stay under that ceiling, minus headroom for the text
 * fields and multipart framing. Drop this once uploads go direct-to-storage.
 */
const TOTAL_ATTACHMENTS_MAX_BYTES = 4 * 1024 * 1024 - 128 * 1024;

/** Mirrors the server allow-list in src/lib/storage.ts (no SVG / HTML). */
const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/tiff",
  "image/bmp",
]);

const SEND_ERROR_KEY: Record<string, string> = {
  invalid: "errInvalid",
  "no-audience": "errNoAudience",
  "forbidden-all": "errForbiddenAll",
  "too-many-files": "errTooManyFilesServer",
  "file-too-large": "errFileTooLargeServer",
  "no-storage": "errNoStorage",
  "no-recipients": "errNoRecipients",
  "file-type": "errFileTypeServer",
  "upload-failed": "errUploadFailed",
  "send-failed": "errSendFailedNothingSent",
};

function fileKey(f: File): string {
  return `${f.name}:${f.size}:${f.lastModified}`;
}

export function MessageComposer({
  establishments,
  levels,
  classes,
  allowAll,
  storageEnabled,
  initialAudience,
  initialLabels,
}: {
  establishments: PickerEstablishment[];
  levels: string[];
  classes: PickerClass[];
  allowAll: boolean;
  storageEnabled: boolean;
  initialAudience: AudienceSpec;
  initialLabels?: Record<string, string>;
}) {
  const t = useTranslations("messaging.compose");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  const [audience, setAudience] = useState<AudienceSpec>(initialAudience);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  // null = follow the audience (ON for individual parents/families, OFF for
  // groups) until the user flips the checkbox themselves.
  const [repliesOverride, setRepliesOverride] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowReplies = repliesOverride ?? isDirectAudience(audience);
  const audienceEmpty = isEmptyAudience(audience);
  const canSend = !!subject.trim() && !!body.trim() && !audienceEmpty;
  const filesLocked = !storageEnabled || pending;

  function formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) {
      return t("sizeKb", {
        size: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
          Math.max(1, Math.round(bytes / 1024)),
        ),
      });
    }
    return t("sizeMb", {
      size: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
        bytes / (1024 * 1024),
      ),
    });
  }

  function addFiles(list: FileList | File[]) {
    if (filesLocked) return;
    const next = [...files];
    const seen = new Set(next.map(fileKey));
    const errors: string[] = [];
    let total = next.reduce((s, f) => s + f.size, 0);
    for (const f of Array.from(list)) {
      if (seen.has(fileKey(f))) continue;
      if (!ACCEPTED_TYPES.has(f.type)) {
        errors.push(t("errFileType", { name: f.name }));
        continue;
      }
      if (f.size > MESSAGE_ATTACHMENT_MAX_BYTES) {
        errors.push(
          t("errFileTooLarge", { name: f.name, size: formatSize(MESSAGE_ATTACHMENT_MAX_BYTES) }),
        );
        continue;
      }
      if (next.length >= MESSAGE_MAX_ATTACHMENTS) {
        errors.push(t("errTooManyFiles", { max: MESSAGE_MAX_ATTACHMENTS }));
        break;
      }
      if (total + f.size > TOTAL_ATTACHMENTS_MAX_BYTES) {
        errors.push(
          t("errTotalTooLarge", {
            name: f.name,
            size: formatSize(TOTAL_ATTACHMENTS_MAX_BYTES),
          }),
        );
        continue;
      }
      next.push(f);
      seen.add(fileKey(f));
      total += f.size;
    }
    setFiles(next);
    setFileErrors(errors);
  }

  function removeFile(key: string) {
    setFiles((prev) => prev.filter((f) => fileKey(f) !== key));
    setFileErrors([]);
  }

  function onSend() {
    if (!canSend || pending) return;
    start(async () => {
      // Use the picker's live count; if it is still computing, ask directly.
      let count: number | null = preview?.count ?? null;
      if (count === null) {
        try {
          count = (await previewAudience(audience)).count;
        } catch {
          count = null;
        }
      }
      if (count === 0) {
        toast.error(t("errNoRecipients"));
        return;
      }
      if (count !== null && count > CONFIRM_THRESHOLD) {
        if (!window.confirm(t("confirmLarge", { count }))) return;
      }

      const fd = new FormData();
      fd.set("subject", subject.trim());
      fd.set("body", body.trim());
      fd.set("allowReplies", allowReplies ? "true" : "false");
      fd.set("audience", JSON.stringify(audience));
      for (const f of files) fd.append("files", f);

      try {
        const res = await sendBroadcast(fd);
        if (res.ok) {
          toast.success(t("sentToast"));
          router.push(`/admin/messages/sent/${res.broadcastId}`);
        } else {
          toast.error(t(SEND_ERROR_KEY[res.error] ?? "errGeneric"));
        }
      } catch {
        // A thrown action is usually the request-body ceiling (attachments).
        toast.error(files.length ? t("errSendFailedFiles") : t("errGeneric"));
      }
    });
  }

  const bodyNearLimit = body.length > MESSAGE_BODY_MAX * 0.9;
  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  return (
    <Card>
      <CardHeader title={t("cardTitle")} description={t("cardDescription")} />
      <CardBody className="space-y-6">
        {/* Recipients */}
        <div className="space-y-2">
          <div>
            <h3 className="text-sm font-medium text-[color:var(--color-foreground)]">
              {t("recipients")}
              <span className="ms-0.5 text-[color:var(--color-danger)]">*</span>
            </h3>
            <p className="mt-0.5 text-xs text-[color:var(--color-foreground-muted)]">
              {t("recipientsHint")}
            </p>
          </div>
          <RecipientPicker
            establishments={establishments}
            levels={levels}
            classes={classes}
            value={audience}
            onChange={setAudience}
            allowAll={allowAll}
            disabled={pending}
            initialLabels={initialLabels}
            onPreview={setPreview}
          />
        </div>

        {/* Subject */}
        <Field label={t("subject")} htmlFor="msg-subject" required>
          <Input
            id="msg-subject"
            value={subject}
            maxLength={MESSAGE_SUBJECT_MAX}
            placeholder={t("subjectPlaceholder")}
            disabled={pending}
            onChange={(e) => setSubject(e.target.value)}
          />
        </Field>

        {/* Body */}
        <div className="space-y-1.5">
          <Field label={t("body")} htmlFor="msg-body" required>
            <Textarea
              id="msg-body"
              rows={10}
              value={body}
              maxLength={MESSAGE_BODY_MAX}
              placeholder={t("bodyPlaceholder")}
              disabled={pending}
              onChange={(e) => setBody(e.target.value)}
              className="resize-y leading-relaxed"
            />
          </Field>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-[color:var(--color-foreground-subtle)]">{t("bodyHint")}</span>
            <span
              className={cn(
                "shrink-0 tabular-nums transition-colors duration-150 ease-out",
                bodyNearLimit
                  ? "text-[color:var(--color-warning-soft-fg)]"
                  : "text-[color:var(--color-foreground-subtle)]",
              )}
              aria-live="polite"
            >
              {t("charCount", {
                count: new Intl.NumberFormat(locale).format(body.length),
                max: new Intl.NumberFormat(locale).format(MESSAGE_BODY_MAX),
              })}
            </span>
          </div>
        </div>

        {/* Attachments */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <label
              htmlFor="msg-files"
              className="block text-sm font-medium text-[color:var(--color-foreground)]"
            >
              {t("attachments")}
            </label>
            {files.length > 0 ? (
              <span className="text-xs tabular-nums text-[color:var(--color-foreground-subtle)]">
                {t("attachmentsTotal", {
                  count: files.length,
                  max: MESSAGE_MAX_ATTACHMENTS,
                  size: formatSize(totalBytes),
                })}
              </span>
            ) : null}
          </div>
          <div
            onDragOver={(e) => {
              if (filesLocked) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              if (filesLocked) return;
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
            className={cn(
              "rounded-lg border border-dashed px-4 py-3 transition-colors duration-150 ease-out",
              dragOver
                ? "border-[color:var(--color-brand-500)] bg-[color:var(--color-brand-50)]/60"
                : "border-[color:var(--color-border-strong)]",
              !storageEnabled && "bg-[color:var(--color-surface-sunken)]",
            )}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-2"
                disabled={filesLocked || files.length >= MESSAGE_MAX_ATTACHMENTS}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="size-4" aria-hidden />
                {t("addFiles")}
              </Button>
              <span className="text-xs text-[color:var(--color-foreground-subtle)]">
                {storageEnabled
                  ? t("attachmentsHint", {
                      max: MESSAGE_MAX_ATTACHMENTS,
                      size: formatSize(TOTAL_ATTACHMENTS_MAX_BYTES),
                    })
                  : t("storageDisabled")}
              </span>
            </div>
            <input
              ref={fileInputRef}
              id="msg-files"
              type="file"
              multiple
              accept="application/pdf,image/*"
              disabled={filesLocked}
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                // Reset so re-picking the same file fires onChange again.
                e.target.value = "";
              }}
            />

            {files.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {files.map((f) => {
                  const key = fileKey(f);
                  const Icon = f.type === "application/pdf" ? FileText : FileImage;
                  return (
                    <li
                      key={key}
                      className="flex items-center gap-3 rounded-md border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] px-3 py-2 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
                    >
                      <Icon
                        className="size-4 shrink-0 text-[color:var(--color-brand-600)]"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--color-foreground)]">
                        {f.name}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-[color:var(--color-foreground-subtle)]">
                        {formatSize(f.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(key)}
                        disabled={pending}
                        aria-label={t("removeFile", { name: f.name })}
                        className="rounded p-1 text-[color:var(--color-foreground-subtle)] transition-colors duration-150 ease-out hover:bg-[color:var(--color-surface-sunken)] hover:text-[color:var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {fileErrors.length > 0 ? (
              <ul role="alert" className="mt-3 space-y-1">
                {fileErrors.map((msg, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-xs text-[color:var(--color-danger)]"
                  >
                    <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                    {msg}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        {/* Allow replies */}
        <label
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors duration-150 ease-out",
            allowReplies
              ? "border-[color:var(--color-brand-500)]/40 bg-[color:var(--color-brand-50)]/50"
              : "border-[color:var(--color-border-subtle)] hover:bg-[color:var(--color-surface-sunken)]",
            pending && "cursor-not-allowed opacity-60",
          )}
        >
          <input
            type="checkbox"
            checked={allowReplies}
            disabled={pending}
            onChange={(e) => setRepliesOverride(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-[color:var(--color-border-strong)] accent-[color:var(--color-brand-600)]"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--color-foreground)]">
              <MessageSquareReply
                className="size-4 text-[color:var(--color-brand-600)]"
                aria-hidden
              />
              {t("allowReplies")}
            </span>
            <span className="mt-0.5 block text-xs text-[color:var(--color-foreground-muted)]">
              {t("allowRepliesHint")}
            </span>
            {repliesOverride === null ? (
              <span className="mt-0.5 block text-xs text-[color:var(--color-foreground-subtle)]">
                {t("allowRepliesAuto")}
              </span>
            ) : null}
          </span>
        </label>

        {/* Footer */}
        <div className="flex flex-col-reverse gap-3 border-t border-[color:var(--color-border-subtle)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[color:var(--color-foreground-subtle)]">
            {canSend ? t("privacyNote") : t("incomplete")}
          </p>
          <Button
            type="button"
            onClick={onSend}
            disabled={!canSend || pending}
            className="gap-2 sm:min-w-40"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4 rtl:-scale-x-100" aria-hidden />
            )}
            {pending
              ? t("sending")
              : preview && preview.count > 0
                ? t("sendCount", { count: preview.count })
                : t("send")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
