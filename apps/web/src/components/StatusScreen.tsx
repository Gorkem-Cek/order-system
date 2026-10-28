import type { ReactNode } from "react";
import styles from "./StatusScreen.module.css";

/** Full-page message for loading, error and "not available" states. */
export function StatusScreen({
  title,
  text,
  icon,
  action,
}: {
  title: string;
  text?: string;
  icon?: string;
  action?: ReactNode;
}) {
  return (
    <main className={styles.screen}>
      {icon && (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      )}
      <h1 className={styles.title}>{title}</h1>
      {text && <p className={styles.text}>{text}</p>}
      {action}
    </main>
  );
}
