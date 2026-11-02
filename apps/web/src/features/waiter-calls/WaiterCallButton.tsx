import { waiterCallResponseSchema } from "@siparis/shared";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, ApiRequestError } from "../../lib/api";
import { readStorage, writeStorage } from "../../lib/storage";
import styles from "./WaiterCallButton.module.css";

const storageKey = (qrToken: string) => `siparis.waiterCall.${qrToken}`;

/** "Garson çağır" for guests; the cooldown is kept across reloads and enforced by the API. */
export function WaiterCallButton({ qrToken }: { qrToken: string }) {
  const { t } = useTranslation();
  const [until, setUntil] = useState(() => Number(readStorage(storageKey(qrToken))) || 0);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  const coolingDown = remaining > 0;

  // Tick once a second while cooling down.
  useEffect(() => {
    if (!coolingDown) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [coolingDown]);

  const coolDown = (seconds: number) => {
    const at = Date.now();
    writeStorage(storageKey(qrToken), String(at + seconds * 1000));
    setNow(at);
    setUntil(at + seconds * 1000);
  };

  const call = useMutation({
    mutationFn: () =>
      apiFetch(`/menu/${encodeURIComponent(qrToken)}/waiter-call`, waiterCallResponseSchema, {
        method: "POST",
      }),
    onSuccess: ({ cooldownSeconds }) => {
      coolDown(cooldownSeconds);
      setMessage({ text: t("waiter.called") });
    },
    onError: (error) => {
      const retryAfter = error instanceof ApiRequestError && error.details?.retryAfterSeconds;
      if (error instanceof ApiRequestError && error.code === "WAITER_CALL_COOLDOWN") {
        coolDown(typeof retryAfter === "number" ? retryAfter : 60);
        setMessage({ text: t("waiter.alreadyCalled") });
      } else {
        setMessage({ text: t("waiter.error"), error: true });
      }
    },
  });

  return (
    <>
      <button
        type="button"
        className={styles.button}
        onClick={() => call.mutate()}
        disabled={coolingDown || call.isPending}
        aria-label={coolingDown ? t("waiter.waitLabel", { seconds: remaining }) : t("waiter.call")}
      >
        <span aria-hidden="true">🛎️</span>
        <span className={styles.label}>
          {coolingDown ? t("waiter.wait", { seconds: remaining }) : t("waiter.call")}
        </span>
      </button>
      {message && (
        <p className={styles.message} data-error={message.error || undefined} role="status">
          {message.text}
        </p>
      )}
    </>
  );
}
