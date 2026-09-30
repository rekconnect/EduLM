"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Lock, LockOpen, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { MESSAGE_BODY_MAX } from "@/lib/messaging-shared";
import { replyAsSchool, setThreadStatus } from "../_actions";

function errorKey(err: string): string {
  switch (err) {
    case "invalid":
      return "errInvalid";
    case "not-found":
      return "errNotFound";
    default:
      return "errGeneric";
  }
}

/** Staff reply composer at the bottom of a conversation. */
export function ThreadReply({
  threadId,
  closed,
  allowReplies,
  parentName,
}: {
  threadId: string;
  closed: boolean;
  allowReplies: boolean;
  parentName: string;
}) {
  const t = useTranslations("messaging.thread");
  const router = useRouter();
  const id = useId();
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();

  const trimmed = body.trim();
  const canSend = !pending && trimmed.length > 0 && trimmed.length <= MESSAGE_BODY_MAX;
  const nearLimit = body.length > MESSAGE_BODY_MAX * 0.8;

  function send() {
    if (!canSend) return;
    start(async () => {
      try {
        const r = await replyAsSchool(threadId, trimmed);
        if (r.ok) {
          setBody("");
          toast.success(t("replySent"));
          router.refresh();
        } else {
          toast.error(t(errorKey(r.error)));
        }
      } catch {
        toast.error(t("errGeneric"));
      }
    });
  }

  const hint = closed ? t("replyHintReopens") : !allowReplies ? t("replyHintNoReplies") : null;

  return (
    <Card>
      <CardBody className="space-y-3">
        <label
          htmlFor={id}
          className="block text-sm font-medium text-[color:var(--color-foreground)]"
        >
          {t("replyLabel", { name: parentName })}
        </label>
        <Textarea
          id={id}
          value={body}
          rows={5}
          maxLength={MESSAGE_BODY_MAX}
          placeholder={t("replyPlaceholder")}
          disabled={pending}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          className="resize-y"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5 text-xs text-[color:var(--color-foreground-subtle)]">
            {hint ? <p className="text-[color:var(--color-foreground-muted)]">{hint}</p> : null}
            <p>
              {t("shortcutHint")}
              {nearLimit ? (
                <span className="ms-2 tabular-nums">
                  {t("charCount", { count: body.length, max: MESSAGE_BODY_MAX })}
                </span>
              ) : null}
            </p>
          </div>
          <Button type="button" onClick={send} disabled={!canSend} className="gap-2">
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4 rtl:-scale-x-100" aria-hidden />
            )}
            {t("sendReply")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/** "Clôturer" / "Rouvrir" toggle in the conversation header. */
export function ThreadStatusButton({
  threadId,
  closed,
}: {
  threadId: string;
  closed: boolean;
}) {
  const t = useTranslations("messaging.thread");
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      try {
        const r = await setThreadStatus(threadId, closed ? "OPEN" : "CLOSED");
        if (r.ok) {
          toast.success(closed ? t("reopenedToast") : t("closedToast"));
          router.refresh();
        } else {
          toast.error(t(errorKey(r.error)));
        }
      } catch {
        toast.error(t("errGeneric"));
      }
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={toggle}
      disabled={pending}
      className="gap-2"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : closed ? (
        <LockOpen className="size-4" aria-hidden />
      ) : (
        <Lock className="size-4" aria-hidden />
      )}
      {closed ? t("reopen") : t("close")}
    </Button>
  );
}
