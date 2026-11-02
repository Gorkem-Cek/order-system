import type { MenuCategory, MenuProduct } from "@siparis/shared";
import { useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Sheet } from "../../components/Sheet";
import {
  emptyGroup,
  emptyOption,
  emptyProductForm,
  formToInput,
  productToForm,
  type GroupForm,
  type OptionForm,
  type ProductForm,
} from "./product-form";
import styles from "./ProductEditor.module.css";
import { ProductImageField } from "./ProductImageField";
import type { MenuActions } from "./useStaffMenu";

type ProductEditorProps = {
  categories: MenuCategory[];
  categoryId: string;
  /** The product being edited; a new one is created when missing. */
  product?: MenuProduct;
  saveProduct: MenuActions["saveProduct"];
  uploadImage: MenuActions["uploadImage"];
  removeImage: MenuActions["removeImage"];
  onClose: () => void;
};

export function ProductEditor({
  categories,
  categoryId,
  product,
  saveProduct,
  uploadImage,
  removeImage,
  onClose,
}: ProductEditorProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [form, setForm] = useState<ProductForm>(() =>
    product ? productToForm(product, categoryId) : emptyProductForm(categoryId),
  );
  const [submitted, setSubmitted] = useState(false);
  const result = formToInput(form);
  const errors = submitted && !result.ok ? result.errors : {};

  const set = (patch: Partial<ProductForm>) => setForm((f) => ({ ...f, ...patch }));
  const setGroup = (g: number, patch: Partial<GroupForm>) =>
    setForm((f) => ({ ...f, groups: f.groups.map((x, i) => (i === g ? { ...x, ...patch } : x)) }));
  const setOption = (g: number, o: number, patch: Partial<OptionForm>) =>
    setForm((f) => ({
      ...f,
      groups: f.groups.map((x, i) =>
        i === g
          ? { ...x, options: x.options.map((y, j) => (j === o ? { ...y, ...patch } : y)) }
          : x,
      ),
    }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!result.ok || saveProduct.isPending) return;
    saveProduct.mutate(
      { ...(product && { id: product.id }), input: result.input },
      { onSuccess: onClose },
    );
  };

  const field = (path: string) => ({
    id: `${formId}-${path}`,
    "aria-invalid": errors[path] ? true : undefined,
    "aria-describedby": errors[path] ? `${formId}-${path}-error` : undefined,
  });
  const error = (path: string) =>
    errors[path] && (
      <span id={`${formId}-${path}-error`} className={styles.error}>
        {t(`productEditor.errors.${errors[path]}`)}
      </span>
    );

  return (
    <Sheet
      title={product ? t("productEditor.editTitle") : t("productEditor.newTitle")}
      onClose={onClose}
      footer={
        <div className={styles.footer}>
          {saveProduct.isError && (
            <p className={styles.saveError} role="alert">
              {t("menuAdmin.errors.generic")}
            </p>
          )}
          <button
            type="submit"
            form={formId}
            className="btn btn-primary btn-block"
            disabled={saveProduct.isPending}
          >
            {saveProduct.isPending ? t("productEditor.saving") : t("productEditor.save")}
          </button>
        </div>
      }
    >
      <form id={formId} className={styles.form} onSubmit={submit} noValidate>
        {product ? (
          <ProductImageField
            productId={product.id}
            productName={product.name}
            imageUrl={product.imageUrl}
            uploadImage={uploadImage}
            removeImage={removeImage}
          />
        ) : (
          <p className={styles.hint}>{t("productEditor.image.afterSave")}</p>
        )}
        <div className={styles.field}>
          <label htmlFor={`${formId}-name`}>{t("productEditor.name")}</label>
          <input
            {...field("name")}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            maxLength={100}
          />
          {error("name")}
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor={`${formId}-price`}>{t("productEditor.price")}</label>
            <input
              {...field("price")}
              value={form.price}
              onChange={(e) => set({ price: e.target.value })}
              inputMode="decimal"
              placeholder={t("productEditor.pricePlaceholder")}
            />
            {error("price")}
          </div>
          <div className={styles.field}>
            <label htmlFor={`${formId}-category`}>{t("productEditor.category")}</label>
            <select
              id={`${formId}-category`}
              value={form.categoryId}
              onChange={(e) => set({ categoryId: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor={`${formId}-description`}>{t("productEditor.description")}</label>
          <textarea
            id={`${formId}-description`}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            maxLength={500}
            rows={2}
          />
        </div>

        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.isAvailable}
            onChange={(e) => set({ isAvailable: e.target.checked })}
          />
          {t("productEditor.available")}
        </label>

        <fieldset className={styles.groups}>
          <legend className={styles.groupsTitle}>{t("productEditor.optionGroups")}</legend>
          <p className={styles.hint}>{t("productEditor.optionGroupsHint")}</p>

          {form.groups.map((group, g) => (
            <div
              key={group.key}
              className={styles.group}
              role="group"
              aria-label={group.name || `${t("productEditor.optionGroups")} ${g + 1}`}
            >
              <div className={styles.groupHeader}>
                <div className={styles.field}>
                  <label htmlFor={`${formId}-groups.${g}.name`}>
                    {t("productEditor.groupName")}
                  </label>
                  <input
                    {...field(`groups.${g}.name`)}
                    value={group.name}
                    onChange={(e) => setGroup(g, { name: e.target.value })}
                    placeholder={t("productEditor.groupNamePlaceholder")}
                    maxLength={100}
                  />
                  {error(`groups.${g}.name`)}
                </div>
                <div className={`${styles.field} ${styles.narrow}`}>
                  <label htmlFor={`${formId}-groups.${g}.maxSelect`}>
                    {t("productEditor.maxSelect")}
                  </label>
                  <input
                    {...field(`groups.${g}.maxSelect`)}
                    type="number"
                    min={1}
                    max={group.options.length}
                    value={group.maxSelect}
                    onChange={(e) => setGroup(g, { maxSelect: e.target.value })}
                  />
                  {error(`groups.${g}.maxSelect`)}
                </div>
              </div>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={group.required}
                  onChange={(e) => setGroup(g, { required: e.target.checked })}
                />
                {t("productEditor.required")}
              </label>

              <ul className={styles.options}>
                {group.options.map((option, o) => (
                  <li key={option.key} className={styles.option}>
                    <div className={styles.field}>
                      <label htmlFor={`${formId}-groups.${g}.options.${o}.name`}>
                        {t("productEditor.optionName")}
                      </label>
                      <input
                        {...field(`groups.${g}.options.${o}.name`)}
                        value={option.name}
                        onChange={(e) => setOption(g, o, { name: e.target.value })}
                        placeholder={t("productEditor.optionNamePlaceholder")}
                        maxLength={100}
                      />
                      {error(`groups.${g}.options.${o}.name`)}
                    </div>
                    <div className={`${styles.field} ${styles.narrow}`}>
                      <label htmlFor={`${formId}-groups.${g}.options.${o}.price`}>
                        {t("productEditor.optionPrice")}
                      </label>
                      <input
                        {...field(`groups.${g}.options.${o}.price`)}
                        value={option.price}
                        onChange={(e) => setOption(g, o, { price: e.target.value })}
                        inputMode="decimal"
                      />
                      {error(`groups.${g}.options.${o}.price`)}
                    </div>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={option.isAvailable}
                        onChange={(e) => setOption(g, o, { isAvailable: e.target.checked })}
                      />
                      {t("productEditor.optionAvailable")}
                    </label>
                    <button
                      type="button"
                      className={styles.remove}
                      onClick={() =>
                        setGroup(g, { options: group.options.filter((_, j) => j !== o) })
                      }
                      disabled={group.options.length === 1}
                      aria-label={`${t("productEditor.removeOption")}: ${option.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <div className={styles.groupActions}>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => setGroup(g, { options: [...group.options, emptyOption()] })}
                >
                  + {t("productEditor.addOption")}
                </button>
                <button
                  type="button"
                  className={`${styles.link} ${styles.danger}`}
                  onClick={() => set({ groups: form.groups.filter((_, i) => i !== g) })}
                >
                  {t("productEditor.removeGroup")}
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => set({ groups: [...form.groups, emptyGroup()] })}
          >
            + {t("productEditor.addGroup")}
          </button>
        </fieldset>
      </form>
    </Sheet>
  );
}
