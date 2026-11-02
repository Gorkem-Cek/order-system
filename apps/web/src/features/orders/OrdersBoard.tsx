import type { Order } from "@siparis/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusScreen } from "../../components/StatusScreen";
import { createChime } from "../../lib/chime";
import { readStorage, writeStorage } from "../../lib/storage";
import { useStaff } from "../staff/staff-context";
import { OrderCard } from "./OrderCard";
import styles from "./OrdersBoard.module.css";
import { activeOrdersKey, useActiveOrders, useOrderStream } from "./useOrders";

const MUTE_KEY = "siparis.board.muted";
/** How long a newly arrived order stays highlighted if nobody touches it. */
const FRESH_MS = 2 * 60_000;

const COLUMNS = ["NEW", "PREPARING"] as const;

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function OrdersBoard() {
  const { t } = useTranslation();
  const { cafe } = useStaff();
  const queryClient = useQueryClient();
  const orders = useActiveOrders();
  const now = useNow(30_000);

  const [chime] = useState(createChime);
  const [soundReady, setSoundReady] = useState(false);
  const [muted, setMuted] = useState(() => readStorage(MUTE_KEY) === "1");
  const [freshUntil, setFreshUntil] = useState<Record<string, number>>({});

  const stream = useOrderStream((order: Order) => {
    setFreshUntil((current) => ({ ...current, [order.id]: Date.now() + FRESH_MS }));
    if (!muted) chime.play();
  });

  const unhighlight = (orderId: string) =>
    setFreshUntil((current) => {
      const next = { ...current };
      delete next[orderId];
      return next;
    });

  const byStatus = useMemo(() => {
    const list = orders.data ?? [];
    return {
      NEW: list.filter((o) => o.status === "NEW"),
      PREPARING: list.filter((o) => o.status === "PREPARING"),
    };
  }, [orders.data]);

  const enableSound = async () => {
    if (await chime.unlock()) {
      setSoundReady(true);
      setMuted(false);
      writeStorage(MUTE_KEY, "0");
      chime.play();
    }
  };
  const toggleMute = () => {
    setMuted((m) => {
      writeStorage(MUTE_KEY, m ? "0" : "1");
      return !m;
    });
  };

  if (orders.isPending) return <StatusScreen title={t("common.loading")} />;
  if (orders.isError) {
    return (
      <StatusScreen
        title={t("staff.errorTitle")}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void orders.refetch()}>
            {t("common.retry")}
          </button>
        }
      />
    );
  }

  const newCount = byStatus.NEW.length;

  return (
    <main className={styles.board}>
      <title>
        {newCount > 0
          ? `(${newCount}) ${t("board.title")} · ${cafe.name}`
          : `${t("board.title")} · ${cafe.name}`}
      </title>

      <div className={styles.toolbar}>
        <h1 className={styles.title}>{t("board.title")}</h1>
        <span className={styles.connection} data-status={stream} role="status">
          <span className={styles.dot} aria-hidden="true" />
          {t(`board.connection.${stream}`)}
        </span>
        <span className={styles.spacer} />
        {chime.isSupported() &&
          (soundReady ? (
            <button type="button" className={styles.toolButton} onClick={toggleMute}>
              {muted ? `🔕 ${t("board.soundOff")}` : `🔔 ${t("board.soundOn")}`}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => void enableSound()}>
              🔔 {t("board.soundEnable")}
            </button>
          ))}
      </div>

      <div className={styles.columns}>
        {COLUMNS.map((status) => (
          <section key={status} className={styles.column} aria-labelledby={`column-${status}`}>
            <h2 id={`column-${status}`} className={styles.columnTitle}>
              {t(`board.columns.${status}`)}
              <span className={styles.count}>{byStatus[status].length}</span>
            </h2>
            {byStatus[status].length === 0 ? (
              <p className={styles.empty}>{t(`board.empty.${status}`)}</p>
            ) : (
              <div className={styles.cards}>
                {byStatus[status].map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    now={now}
                    fresh={(freshUntil[order.id] ?? 0) > now}
                    onHandled={() => unhighlight(order.id)}
                    onConflict={() =>
                      void queryClient.invalidateQueries({ queryKey: activeOrdersKey(cafe.id) })
                    }
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
