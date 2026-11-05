import { CAFE_ID_QUERY, staffCafeSchema } from "@siparis/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router";
import { LanguageToggle } from "../../components/LanguageToggle";
import { StatusScreen } from "../../components/StatusScreen";
import { brandStyle } from "../../lib/color";
import { useLogout, useSession } from "../auth/useSession";
import { clearActingCafe, readActingCafe } from "./acting-cafe";
import {
  createStaffFetch,
  StaffContext,
  staffCafeKey,
  type StaffContextValue,
} from "./staff-context";
import styles from "./StaffLayout.module.css";

/** Wraps every /staff page: requires a login and resolves which café is being managed. */
export function StaffLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const [actingCafeId] = useState(readActingCafe);

  if (session.isPending) return <StatusScreen title={t("common.loading")} />;
  if (session.isError) {
    return (
      <StatusScreen
        title={t("staff.errorTitle")}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void session.refetch()}>
            {t("common.retry")}
          </button>
        }
      />
    );
  }
  if (!session.data) return <Navigate to="/staff/login" replace />;

  const user = session.data;
  // A super-admin picks the café to manage on the admin page.
  if (user.role === "SUPER_ADMIN" && !actingCafeId) return <Navigate to="/admin" replace />;

  const switchCafe =
    user.role === "SUPER_ADMIN"
      ? () => {
          clearActingCafe();
          void navigate("/admin");
        }
      : undefined;

  return (
    <StaffShell
      user={user}
      actingCafeId={user.role === "SUPER_ADMIN" ? actingCafeId : null}
      onSwitchCafe={switchCafe}
    />
  );
}

function StaffShell({
  user,
  actingCafeId,
  onSwitchCafe,
}: {
  user: StaffContextValue["user"];
  actingCafeId: string | null;
  onSwitchCafe: (() => void) | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogout();
  const staffFetch = useMemo(() => createStaffFetch(actingCafeId), [actingCafeId]);
  const cafe = useQuery({
    queryKey: staffCafeKey(actingCafeId ?? user.cafeId),
    queryFn: () => staffFetch("/staff/cafe", staffCafeSchema),
  });

  if (cafe.isPending) return <StatusScreen title={t("common.loading")} />;
  if (cafe.isError) {
    return (
      <StatusScreen
        title={t("staff.errorTitle")}
        action={
          onSwitchCafe ? (
            <button type="button" className="btn btn-primary" onClick={onSwitchCafe}>
              {t("staff.switchCafe")}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => void cafe.refetch()}>
              {t("common.retry")}
            </button>
          )
        }
      />
    );
  }

  const value: StaffContextValue = {
    user,
    cafe: cafe.data,
    staffFetch,
    cafeQuery: actingCafeId ? `?${CAFE_ID_QUERY}=${encodeURIComponent(actingCafeId)}` : "",
  };

  return (
    <StaffContext value={value}>
      <div className={styles.shell} style={brandStyle(cafe.data.primaryColor)}>
        <header className={styles.topbar}>
          <div className={styles.cafe}>
            {cafe.data.logoUrl ? (
              <img className={styles.logo} src={cafe.data.logoUrl} alt="" />
            ) : (
              <span className={styles.logo} aria-hidden="true">
                ☕
              </span>
            )}
            <span className={styles.cafeName}>{cafe.data.name}</span>
            {!cafe.data.isActive && <span className={styles.inactive}>{t("staff.inactive")}</span>}
          </div>
          <nav className={styles.nav} aria-label={t("staff.navigation")}>
            <NavLink to="/staff" end className={styles.navLink}>
              {t("staff.nav.orders")}
            </NavLink>
            <NavLink to="/staff/history" className={styles.navLink}>
              {t("staff.nav.history")}
            </NavLink>
            <NavLink to="/staff/menu" className={styles.navLink}>
              {t("staff.nav.menu")}
            </NavLink>
            <NavLink to="/staff/tables" className={styles.navLink}>
              {t("staff.nav.tables")}
            </NavLink>
            <NavLink to="/staff/settings" className={styles.navLink}>
              {t("staff.nav.settings")}
            </NavLink>
          </nav>
          <div className={styles.actions}>
            {onSwitchCafe && (
              <button type="button" className={styles.action} onClick={onSwitchCafe}>
                {t("staff.switchCafe")}
              </button>
            )}
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
        <Outlet />
      </div>
    </StaffContext>
  );
}
