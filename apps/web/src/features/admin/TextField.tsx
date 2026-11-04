import { useId } from "react";
import styles from "./AdminCafesPage.module.css";

type TextFieldProps = {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  type?: string;
  maxLength?: number;
};

/** A labelled input whose hint and error are announced with it. */
export function TextField({
  label,
  hint,
  value,
  onChange,
  error,
  type = "text",
  maxLength,
}: TextFieldProps) {
  const id = useId();
  const described = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
        autoComplete="off"
        spellCheck={false}
      />
      {hint && (
        <span id={`${id}-hint`} className={styles.fieldHint}>
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className={styles.fieldError}>
          {error}
        </span>
      )}
    </div>
  );
}
