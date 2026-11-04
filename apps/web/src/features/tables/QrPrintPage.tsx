import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { StatusScreen } from "../../components/StatusScreen";
import { useStaff } from "../staff/staff-context";
import styles from "./QrPrintPage.module.css";
import { qrImageSrc, useTables } from "./useTables";

/**
 * A print-ready sheet of table cards: every table, or just one with `?table=<id>`.
 * The staff top bar and this page's toolbar are hidden when printing.
 */
export function QrPrintPage() {
  const { t } = useTranslation();
  const { cafe } = useStaff();
  const tables = useTables();
  const [params] = useSearchParams();
  const only = params.get("table");

  if (tables.isPending) return <StatusScreen title={t("common.loading")} />;
  if (tables.isError) {
    return (
      <StatusScreen
        title={t("staff.errorTitle")}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void tables.refetch()}>
            {t("common.retry")}
          </button>
        }
      />
    );
  }

  const selected = only ? tables.data.filter((table) => table.id === only) : tables.data;

  return (
    <main className={styles.page}>
      <title>{`${t("qrPrint.title")} · ${cafe.name}`}</title>
      <div className={styles.toolbar}>
        <Link to="/staff/tables" className="btn btn-secondary">
          ← {t("qrPrint.back")}
        </Link>
        <p className={styles.hint}>{t("qrPrint.hint")}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.print()}
          disabled={selected.length === 0}
        >
          🖨 {t("qrPrint.print")}
        </button>
      </div>

      {selected.length === 0 ? (
        <p className={styles.empty}>{only ? t("qrPrint.notFound") : t("tables.empty")}</p>
      ) : (
        <div className={styles.sheet} data-single={selected.length === 1 || undefined}>
          {selected.map((table) => (
            <article key={table.id} className={styles.card} aria-label={table.name}>
              <p className={styles.cafe}>{cafe.name}</p>
              <img
                className={styles.qr}
                src={qrImageSrc(table.qrSvg)}
                alt={t("tables.qrAlt", { table: table.name })}
              />
              <h2 className={styles.table}>{table.name}</h2>
              {/* Printed cards greet guests in both languages, whatever the panel's language. */}
              <p className={styles.scan}>{t("qrPrint.scan", { lng: "tr" })}</p>
              <p className={styles.scanEn} lang="en">
                {t("qrPrint.scan", { lng: "en" })}
              </p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
