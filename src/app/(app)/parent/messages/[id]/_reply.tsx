"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { MESSAGE_BODY_MAX } from "@/lib/messaging-shared";
import { replyAsParent } from "../_actions";

function errorKey(code: string): string {
  switch (code) {
    case "invalid":
      return "errReplyInvalid";
    case "not-found":
      return "errNotFound";
    case "replies-disabled":
      return "errRepliesDisabled";
    case "closed":
      return "errClosed";
    default:
      return "errGeneric";
  }
}

/** Reply composer — only rendered when the thread is open and accepts replies. */
export function ReplyBox({ threadId }: { threadId: string }) {
  const t = useTranslations("messaging.parent");
  const router = useRouter();
  const inputId = useId();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const trimmed = body.trim();
  const nearLimit = body.length > MESSAGE_BODY_MAX * 0.9;
  const canSend = trimmed.length > 0 && body.length <= MESSAGE_BODY_MAX && !pending;

  function submit() {
    if (!canSend) return;
    startTransition(async () => {
      try {
        const r = await replyAsParent(threadId, trimmed);
        if (!r) return;
        if (r.ok) {
          setBody("");
          toast.success(t("replySentToast"));
          router.refresh();
        } else {
          toast.error(t(errorKey(r.error)));
          // Thread state changed under us (closed / replies disabled) → show it.
          if (r.error === "closed" || r.error === "replies-disabled") router.refresh();
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
      className="rounded-card border border-[color:var(--color-border-subtle)] bg-[color:var(--color-surface-raised)] p-3 shadow-card transition-shadow duration-200 ease-out focus-within:border-[color:var(--color-brand-200)] focus-within:shadow-[var(--shadow-card-hover)] sm:p-4"
    >
      <label
        htmlFor={inputId}
        className="mb-2 block text-sm font-medium text-[color:var(--color-foreground)]"
      >
        {t("replyLabel")}
      </label>
      <Textarea
        id={inputId}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        rows={4}
        maxLength={MESSAGE_BODY_MAX}
        placeholder={t("replyPlaceholder")}
        disabled={pending}
        className="resize-y text-[color:var(--color-foreground)]"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5 text-xs text-[color:var(--color-foreground-subtle)]">
          <p className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            {t("replyPrivacy")}
          </p>
          {nearLimit ? (
            <p className="tabular-nums text-[color:var(--color-warning-soft-fg)]" aria-live="polite">
              {t("charCount", { count: body.length, max: MESSAGE_BODY_MAX })}
            </p>
          ) : (
            <p className="hidden sm:block">{t("shortcutHint")}</p>
          )}
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={!canSend}
          aria-busy={pending}
          className="ms-auto gap-1.5"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4 rtl:-scale-x-100" aria-hidden />
          )}
          {t("send")}
        </Button>
      </div>
    </form>
  );
}

/**
 * Rendered only on the visit that flipped the thread to "read": refreshes the
 * server tree once so the layout's unread badge drops immediately (layouts
 * are not re-rendered on a plain client navigation).
 */
export function SeenSync() {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    router.refresh();
  }, [router]);
  return null;
}
