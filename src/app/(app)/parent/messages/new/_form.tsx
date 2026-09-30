"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { MESSAGE_BODY_MAX, MESSAGE_SUBJECT_MAX } from "@/lib/messaging-shared";
import { startThreadAsParent } from "../_actions";

export function NewMessageForm({ defaultSubject = "" }: { defaultSubject?: string }) {
  const t = useTranslations("messaging.parent");
  const router = useRouter();
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const s = subject.trim();
  const b = body.trim();
  const valid =
    s.length > 0 &&
    b.length > 0 &&
    subject.length <= MESSAGE_SUBJECT_MAX &&
    body.length <= MESSAGE_BODY_MAX;
  const bodyNearLimit = body.length > MESSAGE_BODY_MAX * 0.9;

  function submit() {
    if (pending) return;
    if (!valid) {
      toast.error(t("errNewInvalid"));
      return;
    }
    startTransition(async () => {
      try {
        const r = await startThreadAsParent({ subject: s, body: b });
        if (!r) return;
        if (r.ok && r.threadId) {
          toast.success(t("sentToast"));
          router.push(`/parent/messages/${r.threadId}`);
        } else {
          toast.error(t(!r.ok && r.error === "invalid" ? "errNewInvalid" : "errGeneric"));
        }
      } catch {
        toast.error(t("errGeneric"));
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
    >
      <Field label={t("subjectLabel")} htmlFor="msg-subject" required>
        <Input
          id="msg-subject"
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={MESSAGE_SUBJECT_MAX}
          placeholder={t("subjectPlaceholder")}
          autoFocus={!defaultSubject}
          autoComplete="off"
          required
          disabled={pending}
        />
        <p className="text-end text-xs tabular-nums text-[color:var(--color-foreground-subtle)]">
          {t("charCount", { count: subject.length, max: MESSAGE_SUBJECT_MAX })}
        </p>
      </Field>

      <Field label={t("bodyLabel")} htmlFor="msg-body" required>
        <Textarea
          id="msg-body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          rows={9}
          maxLength={MESSAGE_BODY_MAX}
          placeholder={t("bodyPlaceholder")}
          autoFocus={!!defaultSubject}
          required
          disabled={pending}
          className="resize-y"
        />
        {bodyNearLimit ? (
          <p
            className="text-end text-xs tabular-nums text-[color:var(--color-warning-soft-fg)]"
            aria-live="polite"
          >
            {t("charCount", { count: body.length, max: MESSAGE_BODY_MAX })}
          </p>
        ) : null}
      </Field>

      <div className="flex flex-col-reverse gap-3 border-t border-[color:var(--color-border-subtle)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[color:var(--color-foreground-subtle)]">{t("newPrivacy")}</p>
        <div className="flex items-center justify-end gap-2">
          <LinkButton
            href="/parent/messages"
            variant="secondary"
            size="sm"
            aria-disabled={pending}
            className={pending ? "pointer-events-none opacity-50" : undefined}
          >
            {t("cancel")}
          </LinkButton>
          <Button
            type="submit"
            size="sm"
            disabled={pending || !valid}
            aria-busy={pending}
            className="gap-1.5"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4 rtl:-scale-x-100" aria-hidden />
            )}
            {t("sendMessage")}
          </Button>
        </div>
      </div>
    </form>
  );
}
