import type { StaffTable } from "@siparis/shared";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusScreen } from "../../components/StatusScreen";
import { ApiRequestError } from "../../lib/api";
import styles from "./TablesPage.module.css";
import { qrImageSrc, useTableActions, useTables, type TableActions } from "./useTables";

type Confirming = { kind: "newQr" | "delete"; table: StaffTable } | null;

/** Turns a failed table change into a message for the staff. */
function useErrorText(actions: TableActions): string | null {
  const { t } = useTranslation();
  const error = [actions.create, actions.rename, actions.regenerateQr, actions.remove].find(
    (a) => a.isError,
  )?.error;
  if (!error) return null;
  if (error instanceof ApiRequestError && error.code === "CONFLICT") {
    return error.details?.["reason"] === "TABLE_LIMIT"
      ? t("tables.errors.limit")
      : t("tables.errors.duplicate");
  }
  return t("tables.errors.generic");
}

export function TablesPage() {
  const { t } = useTranslation();
  const tables = useTables();
  const actions = useTableActions();
  const errorText = useErrorText(actions);
  const [newName, setNewName] = useState("");
  const [confirming, setConfirming] = useState<Confirming>(null);

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

  const add = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    actions.create.mutate(name, { onSuccess: () => setNewName("") });
  };

  return (
    <main className={styles.page}>
      <title>{`${t("tables.title")} · ${t("common.appName")}`}</title>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("tables.title")}</h1>
        <form className={styles.add} onSubmit={add}>
          <label className="visually-hidden" htmlFor="new-table">
            {t("tables.newTable")}
          </label>
          <input
            id="new-table"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("tables.newTablePlaceholder")}
            maxLength={50}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!newName.trim() || actions.create.isPending}
          >
            + {t("tables.add")}
          </button>
        </form>
        {tables.data.length > 0 && (
          <Link to="/staff/tables/print" className="btn btn-secondary">
            🖨 {t("tables.printAll")}
          </Link>
        )}
      </div>

      {errorText && (
        <p className={styles.error} role="alert">
          {errorText}
        </p>
      )}

      {tables.data.length === 0 ? (
        <p className={styles.empty}>{t("tables.empty")}</p>
      ) : (
        <ul className={styles.grid}>
          {tables.data.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              actions={actions}
              onConfirm={(kind) => setConfirming({ kind, table })}
            />
          ))}
        </ul>
      )}

      {confirming?.kind === "newQr" && (
        <ConfirmDialog
          title={t("tables.newQrTitle", { table: confirming.table.name })}
          text={t("tables.newQrText")}
          confirmLabel={t("tables.newQrConfirm")}
          busy={actions.regenerateQr.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            actions.regenerateQr.mutate(confirming.table.id, {
              onSettled: () => setConfirming(null),
            })
          }
        />
      )}
      {confirming?.kind === "delete" && (
        <ConfirmDialog
          title={t("tables.deleteTitle", { table: confirming.table.name })}
          text={t("tables.deleteText")}
          confirmLabel={t("tables.confirmDelete")}
          busy={actions.remove.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            actions.remove.mutate(confirming.table.id, { onSettled: () => setConfirming(null) })
          }
        />
      )}
    </main>
  );
}

function TableCard({
  table,
  actions,
  onConfirm,
}: {
  table: StaffTable;
  actions: TableActions;
  onConfirm: (kind: "newQr" | "delete") => void;
}) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState<string | null>(null);

  const rename = (event: FormEvent) => {
    event.preventDefault();
    const name = renaming?.trim();
    if (!name) return;
    actions.rename.mutate({ id: table.id, name }, { onSuccess: () => setRenaming(null) });
  };

  return (
    <li className={styles.card} aria-label={table.name}>
      <img
        className={styles.qr}
        src={qrImageSrc(table.qrSvg)}
        alt={t("tables.qrAlt", { table: table.name })}
      />
      {renaming === null ? (
        <h2 className={styles.name}>{table.name}</h2>
      ) : (
        <form className={styles.rename} onSubmit={rename}>
          <input
            value={renaming}
            onChange={(e) => setRenaming(e.target.value)}
            aria-label={t("tables.tableName")}
            maxLength={50}
            autoFocus
          />
          <button type="submit" className={styles.tool} disabled={actions.rename.isPending}>
            {t("tables.save")}
          </button>
          <button type="button" className={styles.tool} onClick={() => setRenaming(null)}>
            {t("common.cancel")}
          </button>
        </form>
      )}
      <div className={styles.tools}>
        <Link
          to={`/staff/tables/print?table=${table.id}`}
          className={styles.tool}
          aria-label={`${t("tables.print")}: ${table.name}`}
        >
          {t("tables.print")}
        </Link>
        <a
          href={table.menuUrl}
          target="_blank"
          rel="noreferrer"
          className={styles.tool}
          aria-label={`${t("tables.openMenu")}: ${table.name}`}
        >
          {t("tables.openMenu")} ↗
        </a>
        <button
          type="button"
          className={styles.tool}
          onClick={() => setRenaming(table.name)}
          aria-label={`${t("tables.rename")}: ${table.name}`}
        >
          {t("tables.rename")}
        </button>
        <button
          type="button"
          className={styles.tool}
          onClick={() => onConfirm("newQr")}
          aria-label={`${t("tables.newQr")}: ${table.name}`}
        >
          {t("tables.newQr")}
        </button>
        <button
          type="button"
          className={`${styles.tool} ${styles.danger}`}
          onClick={() => onConfirm("delete")}
          aria-label={`${t("tables.delete")}: ${table.name}`}
        >
          {t("tables.delete")}
        </button>
      </div>
    </li>
  );
}
