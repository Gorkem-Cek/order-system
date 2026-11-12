import type { AdminCafe } from "@siparis/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { LanguageToggle } from "../../components/LanguageToggle";
import { StatusScreen } from "../../components/StatusScreen";
import { useLogout, useSession } from "../auth/useSession";
import { setActingCafe } from "../staff/acting-cafe";
import styles from "./AdminCafesPage.module.css";
import { CreateCafeSheet } from "./CreateCafeSheet";
import { PaymentSettingsSheet } from "./PaymentSettingsSheet";
import { ResetPasswordSheet } from "./ResetPasswordSheet";
import { useAdminCafeActions, useAdminCafes } from "./useAdminCafes";

type Dialog =
  | { kind: "create" }
  | { kind: "password"; cafe: AdminCafe }
  | { kind: "payment"; cafe: AdminCafe }
  | { kind: "deactivate"; cafe: AdminCafe }
  | null;

/** The super-admin's home: every café, and the tools to manage them. */
export function AdminCafesPage() {
  const { t } = useTranslation();
  const session = useSession();

  if (session.isPending) return <StatusScreen title={t("common.loading")} />;
  if (!session.data) return <Navigate to="/staff/login" replace />;
  if (session.data.role !== "SUPER_ADMIN") return <Navigate to="/staff" replace />;
  return <CafesList />;
}

function CafesList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogout();
  const cafes = useAdminCafes();
  const actions = useAdminCafeActions();
  const [dialog, setDialog] = useState<Dialog>(null);

  const open = (cafe: AdminCafe) => {
    setActingCafe(cafe.id);
    void navigate("/staff");
  };
  const created = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === "en" ? "en-GB" : "tr-TR");

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            ☕
          </span>
          {t("common.appName")}
          <span className={styles.badge}>{t("admin.badge")}</span>
        </span>
        <div className={styles.actions}>
          <LanguageToggle className={styles.action} />
          <button
            type="button"
            className={styles.action}
            onClick={() =>
              logout.mutate(undefined, {
                onSettled: () => void navigate("/staff/login", { replace: true }),
              })
            }
          >
            {t("staff.logout")}
          </button>
        </div>
      </header>

      <main className={styles.page}>
        <title>{`${t("admin.title")} · ${t("common.appName")}`}</title>
        <div className={styles.header}>
          <h1 className={styles.title}>{t("admin.title")}</h1>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setDialog({ kind: "create" })}
          >
            + {t("admin.newCafe")}
          </button>
        </div>

        {cafes.isPending && <p className={styles.message}>{t("common.loading")}</p>}
        {cafes.isError && (
          <div className={styles.message} role="alert">
            <p>{t("staff.errorTitle")}</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void cafes.refetch()}
            >
              {t("common.retry")}
            </button>
          </div>
        )}
        {actions.update.isError && (
          <p className={styles.error} role="alert">
            {t("admin.errors.generic")}
          </p>
        )}
        {cafes.data?.length === 0 && <p className={styles.message}>{t("admin.empty")}</p>}

        <ul className={styles.list}>
          {cafes.data?.map((cafe) => (
            <li
              key={cafe.id}
              className={styles.cafe}
              aria-label={cafe.name}
              data-inactive={!cafe.isActive || undefined}
            >
              <div className={styles.info}>
                <span className={styles.name}>
                  {cafe.name}
                  <span className={styles.status}>
                    {cafe.isActive ? t("admin.active") : t("admin.inactive")}
                  </span>
                </span>
                <span className={styles.meta}>
                  {cafe.slug} · {cafe.loginEmail ?? t("admin.noLogin")} ·{" "}
                  {t("admin.created", { date: created(cafe.createdAt) })}
                </span>
                <span className={styles.paymentBadge} data-mode={cafe.paymentMode ?? "NONE"}>
                  {cafe.paymentMode
                    ? t("admin.payment.badge", {
                        mode: t(`admin.payment.modes.${cafe.paymentMode}`),
                      })
                    : t("admin.payment.badgeNone")}
                </span>
              </div>
              <div className={styles.tools}>
                <button type="button" className="btn btn-primary" onClick={() => open(cafe)}>
                  {t("admin.openPanel")}
                </button>
                <button
                  type="button"
                  className={styles.tool}
                  onClick={() => setDialog({ kind: "payment", cafe })}
                  aria-label={`${t("admin.payment.open")}: ${cafe.name}`}
                >
                  {t("admin.payment.open")}
                </button>
                <button
                  type="button"
                  className={styles.tool}
                  onClick={() => setDialog({ kind: "password", cafe })}
                  disabled={!cafe.loginEmail}
                  aria-label={`${t("admin.resetPassword")}: ${cafe.name}`}
                >
                  {t("admin.resetPassword")}
                </button>
                {cafe.isActive ? (
                  <button
                    type="button"
                    className={`${styles.tool} ${styles.danger}`}
                    onClick={() => setDialog({ kind: "deactivate", cafe })}
                    aria-label={`${t("admin.deactivate")}: ${cafe.name}`}
                  >
                    {t("admin.deactivate")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.tool}
                    disabled={actions.update.isPending}
                    onClick={() => actions.update.mutate({ id: cafe.id, isActive: true })}
                    aria-label={`${t("admin.activate")}: ${cafe.name}`}
                  >
                    {t("admin.activate")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </main>

      {dialog?.kind === "create" && (
        <CreateCafeSheet create={actions.create} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "payment" && (
        <PaymentSettingsSheet cafe={dialog.cafe} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "password" && (
        <ResetPasswordSheet
          cafe={dialog.cafe}
          resetPassword={actions.resetPassword}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "deactivate" && (
        <ConfirmDialog
          title={t("admin.deactivateTitle", { name: dialog.cafe.name })}
          text={t("admin.deactivateText")}
          confirmLabel={t("admin.deactivateConfirm")}
          busy={actions.update.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={() =>
            actions.update.mutate(
              { id: dialog.cafe.id, isActive: false },
              { onSettled: () => setDialog(null) },
            )
          }
        />
      )}
    </div>
  );
}
