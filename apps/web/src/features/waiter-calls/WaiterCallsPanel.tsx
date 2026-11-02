import type { WaiterCall } from "@siparis/shared";
import { useTranslation } from "react-i18next";
import styles from "./WaiterCallsPanel.module.css";
import { useResolveWaiterCall } from "./useWaiterCalls";

/** Open waiter calls, shown above the order board. Renders nothing when there are none. */
export function WaiterCallsPanel({ calls, now }: { calls: WaiterCall[]; now: number }) {
  const { t } = useTranslation();
  const resolve = useResolveWaiterCall();
  if (calls.length === 0) return null;

  return (
    <section className={styles.panel} aria-labelledby="waiter-calls-title">
      <h2 id="waiter-calls-title" className={styles.title}>
        🛎️ {t("waiterCalls.title")}
        <span className={styles.count}>{calls.length}</span>
      </h2>
      <ul className={styles.list}>
        {calls.map((call) => {
          const minutes = Math.floor((now - new Date(call.createdAt).getTime()) / 60_000);
          return (
            <li key={`${call.id}-${call.callCount}`} className={styles.call}>
              <span className={styles.text}>
                <strong>{t("waiterCalls.calling", { table: call.tableName })}</strong>
                <span className={styles.meta}>
                  {minutes < 1 ? t("board.justNow") : t("board.minutesAgo", { count: minutes })}
                  {call.callCount > 1 && ` · ${t("waiterCalls.repeat", { count: call.callCount })}`}
                </span>
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => resolve.mutate(call.id)}
                disabled={resolve.isPending && resolve.variables === call.id}
                aria-label={`${t("waiterCalls.done")}: ${call.tableName}`}
              >
                {t("waiterCalls.done")}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
