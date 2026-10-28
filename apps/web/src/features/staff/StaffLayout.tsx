import { adminCafesResponseSchema, CAFE_ID_QUERY, staffCafeSchema } from "@siparis/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useNavigate } from "react-router";
import { LanguageToggle } from "../../components/LanguageToggle";
import { StatusScreen } from "../../components/StatusScreen";
import { apiFetch } from "../../lib/api";
import { brandStyle } from "../../lib/color";
import { readStorage, removeStorage, writeStorage } from "../../lib/storage";
import { useLogout, useSession } from "../auth/useSession";
import { createStaffFetch, StaffContext, type StaffContextValue } from "./staff-context";
import styles from "./StaffLayout.module.css";

const ACTING_CAFE_KEY = "siparis.actingCafe";

/** Wraps every /staff page: requires a login and resolves which café is being managed. */
export function StaffLayout() {
  const { t } = useTranslation();
  const session = useSession();
  const [actingCafeId, setActingCafeId] = useState(() => readStorage(ACTING_CAFE_KEY));

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
  if (user.role === "SUPER_ADMIN" && !actingCafeId) {
    return (
      <CafePicker
        onPick={(id) => {
          writeStorage(ACTING_CAFE_KEY, id);
          setActingCafeId(id);
        }}
      />
    );
  }

  const switchCafe =
    user.role === "SUPER_ADMIN"
      ? () => {
          removeStorage(ACTING_CAFE_KEY);
          setActingCafeId(null);
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
    queryKey: ["staff", actingCafeId ?? user.cafeId, "cafe"],
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
            <span className={styles.logo} aria-hidden="true">
              ☕
            </span>
            <span className={styles.cafeName}>{cafe.data.name}</span>
            {!cafe.data.isActive && <span className={styles.inactive}>{t("staff.inactive")}</span>}
          </div>
          <nav className={styles.nav} aria-label={t("staff.navigation")}>
            <span className={styles.navLink} aria-current="page">
              {t("staff.nav.orders")}
            </span>
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

/** Lets a super-admin choose which café's panel to open. */
function CafePicker({ onPick }: { onPick: (cafeId: string) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useLogout();
  const cafes = useQuery({
    queryKey: ["admin", "cafes"],
    queryFn: () => apiFetch("/admin/cafes", adminCafesResponseSchema),
  });

  return (
    <main className={styles.picker}>
      <div className={styles.pickerHeader}>
        <h1>{t("staff.pickCafe")}</h1>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            logout.mutate(undefined, {
              onSettled: () => void navigate("/staff/login", { replace: true }),
            })
          }
        >
          {t("staff.logout")}
        </button>
      </div>
      {cafes.isPending && <p>{t("common.loading")}</p>}
      {cafes.isError && <p role="alert">{t("staff.errorTitle")}</p>}
      <ul className={styles.cafeList}>
        {cafes.data?.cafes.map((cafe) => (
          <li key={cafe.id}>
            <button type="button" className={styles.cafeButton} onClick={() => onPick(cafe.id)}>
              <span className={styles.cafeButtonName}>{cafe.name}</span>
              <span className={styles.cafeButtonMeta}>
                {cafe.slug}
                {!cafe.isActive && ` · ${t("staff.inactive")}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
