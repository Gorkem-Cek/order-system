import { createCafeRequestSchema, PASSWORD_MIN_LENGTH } from "@siparis/shared";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Sheet } from "../../components/Sheet";
import { ApiRequestError } from "../../lib/api";
import styles from "./AdminCafesPage.module.css";
import { Credentials } from "./Credentials";
import { TextField } from "./TextField";
import { generatePassword, slugify } from "./generate";
import type { AdminCafeActions } from "./useAdminCafes";

type Field = "name" | "slug" | "loginEmail" | "loginPassword";

export function CreateCafeSheet({
  create,
  onClose,
}: {
  create: AdminCafeActions["create"];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  // The slug follows the name until it's edited by hand.
  const [slug, setSlug] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState(generatePassword);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);

  const messages: Record<Field, string> = {
    name: t("admin.errors.name"),
    slug: t("admin.errors.slug"),
    loginEmail: t("admin.errors.email"),
    loginPassword: t("admin.errors.password", { min: PASSWORD_MIN_LENGTH }),
  };
  const currentSlug = slug ?? slugify(name);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = createCafeRequestSchema.safeParse({
      name,
      slug: currentSlug,
      loginEmail,
      loginPassword,
    });
    if (!parsed.success) {
      const found: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field;
        found[field] = messages[field];
      }
      setErrors(found);
      return;
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: (cafe) =>
        setDone({ email: cafe.loginEmail ?? loginEmail, password: loginPassword }),
      onError: (error) => {
        const field = error instanceof ApiRequestError ? error.details?.["field"] : undefined;
        if (field === "slug") setErrors({ slug: t("admin.errors.slugTaken") });
        if (field === "loginEmail") setErrors({ loginEmail: t("admin.errors.emailTaken") });
      },
    });
  };

  if (done) {
    return (
      <Sheet
        title={t("admin.createdTitle")}
        onClose={onClose}
        footer={
          <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
            {t("admin.done")}
          </button>
        }
      >
        <Credentials email={done.email} password={done.password} />
      </Sheet>
    );
  }

  const unexpected =
    create.isError && !(create.error instanceof ApiRequestError && create.error.details?.["field"]);

  return (
    <Sheet
      title={t("admin.newCafe")}
      onClose={onClose}
      footer={
        <button
          type="submit"
          form="create-cafe"
          className="btn btn-primary btn-block"
          disabled={create.isPending}
        >
          {create.isPending ? t("admin.creating") : t("admin.create")}
        </button>
      }
    >
      <form id="create-cafe" className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label={t("admin.name")}
          value={name}
          onChange={setName}
          error={errors.name}
          maxLength={100}
        />
        <TextField
          label={t("admin.slug")}
          hint={t("admin.slugHint", { slug: currentSlug || "…" })}
          value={currentSlug}
          onChange={(value) => setSlug(value.toLowerCase())}
          error={errors.slug}
          maxLength={50}
        />
        <TextField
          label={t("admin.loginEmail")}
          type="email"
          value={loginEmail}
          onChange={setLoginEmail}
          error={errors.loginEmail}
          maxLength={200}
        />
        <div className={styles.passwordRow}>
          <TextField
            label={t("admin.password")}
            value={loginPassword}
            onChange={setLoginPassword}
            error={errors.loginPassword}
            maxLength={200}
          />
          <button
            type="button"
            className={styles.tool}
            onClick={() => setLoginPassword(generatePassword())}
          >
            {t("admin.generate")}
          </button>
        </div>
        {unexpected && (
          <p className={styles.error} role="alert">
            {t("admin.errors.generic")}
          </p>
        )}
      </form>
    </Sheet>
  );
}
