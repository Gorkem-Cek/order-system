import { useEffect, useEffectEvent, useId, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import styles from "./Sheet.module.css";

type SheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Sticky area at the bottom, e.g. the main action button. */
  footer?: ReactNode;
};

/** A modal bottom sheet on phones and a centred dialog on wider screens. */
export function Sheet({ title, onClose, children, footer }: SheetProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") onClose();
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const listener = (event: KeyboardEvent) => onKeyDown(event);
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            ×
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>
  );
}
