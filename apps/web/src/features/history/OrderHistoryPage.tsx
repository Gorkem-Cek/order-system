import { formatKurus, ORDER_STATUSES, type Order, type OrderStatus } from "@siparis/shared";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { addDays, businessDay } from "../../lib/business-day";
import styles from "./OrderHistoryPage.module.css";
import { useOrderHistory, type HistoryFilter } from "./useOrderHistory";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Reads the filter from the URL, so refreshing or sharing the page keeps it. */
function readFilter(params: URLSearchParams, today: string): HistoryFilter {
  const day = (key: string) => {
    const value = params.get(key);
    return value && DAY.test(value) ? value : today;
  };
  const status = params.get("status");
  const page = Number(params.get("page"));
  return {
    from: day("from"),
    to: day("to"),
    status: ORDER_STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : null,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function OrderHistoryPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const today = businessDay();
  const filter = readFilter(params, today);
  const history = useOrderHistory(filter);

  /** Changing a filter goes back to the first page. */
  const update = (changes: Partial<HistoryFilter>) => {
    const next = { ...filter, page: 1, ...changes };
    const search = new URLSearchParams({ from: next.from, to: next.to });
    if (next.status) search.set("status", next.status);
    if (next.page > 1) search.set("page", String(next.page));
    setParams(search, { replace: true });
  };

  const presets = [
    { label: t("history.today"), from: today, to: today },
    { label: t("history.yesterday"), from: addDays(today, -1), to: addDays(today, -1) },
    { label: t("history.last7"), from: addDays(today, -6), to: today },
    { label: t("history.last30"), from: addDays(today, -29), to: today },
  ];

  const data = history.data;
  const first = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? first + data.orders.length - 1 : 0;

  return (
    <main className={styles.page}>
      <title>{`${t("history.title")} · ${t("common.appName")}`}</title>
      <h1 className={styles.title}>{t("history.title")}</h1>

      <div className={styles.filters}>
        <div className={styles.presets} role="group" aria-label={t("history.quickRange")}>
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={styles.preset}
              aria-pressed={filter.from === preset.from && filter.to === preset.to}
              onClick={() => update({ from: preset.from, to: preset.to })}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className={styles.field}>
          <span>{t("history.from")}</span>
          <input
            type="date"
            value={filter.from}
            max={today}
            onChange={(e) => {
              const from = e.target.value;
              if (DAY.test(from)) update({ from, to: from > filter.to ? from : filter.to });
            }}
          />
        </label>
        <label className={styles.field}>
          <span>{t("history.to")}</span>
          <input
            type="date"
            value={filter.to}
            max={today}
            onChange={(e) => {
              const to = e.target.value;
              if (DAY.test(to)) update({ to, from: to < filter.from ? to : filter.from });
            }}
          />
        </label>
        <label className={styles.field}>
          <span>{t("history.status")}</span>
          <select
            value={filter.status ?? ""}
            onChange={(e) => update({ status: (e.target.value || null) as OrderStatus | null })}
          >
            <option value="">{t("history.allStatuses")}</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`history.statuses.${status}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {history.isPending && <p className={styles.message}>{t("common.loading")}</p>}
      {history.isError && (
        <div className={styles.message} role="alert">
          <p>{t("history.error")}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void history.refetch()}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {data && data.total === 0 && <p className={styles.message}>{t("history.empty")}</p>}

      {data && data.total > 0 && (
        <>
          <p className={styles.count} aria-live="polite">
            {t("history.showing", { first, last, total: data.total })}
          </p>
          <ul className={styles.list} aria-busy={history.isFetching}>
            {data.orders.map((order) => (
              <HistoryRow key={order.id} order={order} />
            ))}
          </ul>
          {data.total > data.pageSize && (
            <nav className={styles.pager} aria-label={t("history.pages")}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={data.page === 1}
                onClick={() => update({ page: data.page - 1 })}
              >
                ← {t("history.previous")}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={last >= data.total}
                onClick={() => update({ page: data.page + 1 })}
              >
                {t("history.next")} →
              </button>
            </nav>
          )}
        </>
      )}
    </main>
  );
}

function HistoryRow({ order }: { order: Order }) {
  const { t, i18n } = useTranslation();
  const created = new Date(order.createdAt);
  const when = created.toLocaleString(i18n.language === "en" ? "en-GB" : "tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const summary = order.items.map((i) => `${i.quantity}× ${i.productName}`).join(", ");

  return (
    <li className={styles.row} data-status={order.status}>
      <details>
        <summary className={styles.summary}>
          <span className={styles.number}>#{order.orderNumber}</span>
          <time className={styles.when} dateTime={order.createdAt}>
            {when}
          </time>
          <span className={styles.tableName}>{order.tableName}</span>
          <span className={styles.itemsSummary}>{summary}</span>
          <span className={styles.total}>{formatKurus(order.totalKurus)}</span>
          <span className={styles.status}>{t(`history.statuses.${order.status}`)}</span>
        </summary>
        <div className={styles.details}>
          <ul className={styles.items}>
            {order.items.map((item) => (
              <li key={item.id}>
                <span>
                  {item.quantity} × {item.productName}
                  {item.selectedOptions.length > 0 && (
                    <span className={styles.muted}>
                      {" "}
                      ({item.selectedOptions.map((o) => o.option).join(", ")})
                    </span>
                  )}
                  {item.note && <span className={styles.muted}> “{item.note}”</span>}
                </span>
                <span>{formatKurus(item.unitPriceKurus * item.quantity)}</span>
              </li>
            ))}
          </ul>
          {order.note && (
            <p>
              <strong>{t("board.orderNote")}:</strong> {order.note}
            </p>
          )}
        </div>
      </details>
    </li>
  );
}
