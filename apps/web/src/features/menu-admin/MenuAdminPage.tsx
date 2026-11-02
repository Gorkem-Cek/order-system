import { formatKurus, type MenuCategory, type MenuProduct } from "@siparis/shared";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusScreen } from "../../components/StatusScreen";
import { ApiRequestError } from "../../lib/api";
import styles from "./MenuAdminPage.module.css";
import { ProductEditor } from "./ProductEditor";
import { useMenuActions, useStaffMenu, type MenuActions } from "./useStaffMenu";

type Editing = { categoryId: string; product?: MenuProduct } | null;
type Confirming =
  { kind: "category"; category: MenuCategory } | { kind: "product"; product: MenuProduct } | null;

/** Moves item `index` one place up (-1) or down (+1); returns the new id order. */
function moved<T extends { id: string }>(items: T[], index: number, by: -1 | 1): string[] {
  const ids = items.map((i) => i.id);
  const target = index + by;
  [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
  return ids;
}

export function MenuAdminPage() {
  const { t } = useTranslation();
  const menu = useStaffMenu();
  const actions = useMenuActions();
  const [editing, setEditing] = useState<Editing>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [newCategory, setNewCategory] = useState("");

  if (menu.isPending) return <StatusScreen title={t("common.loading")} />;
  if (menu.isError) {
    return (
      <StatusScreen
        title={t("staff.errorTitle")}
        action={
          <button type="button" className="btn btn-primary" onClick={() => void menu.refetch()}>
            {t("common.retry")}
          </button>
        }
      />
    );
  }
  const categories = menu.data;

  const addCategory = (event: FormEvent) => {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    actions.createCategory.mutate(name, { onSuccess: () => setNewCategory("") });
  };

  const failed = Object.values(actions).some((a) => a.isError);

  return (
    <main className={styles.page}>
      <title>{`${t("menuAdmin.title")} · ${t("common.appName")}`}</title>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("menuAdmin.title")}</h1>
        <form className={styles.addCategory} onSubmit={addCategory}>
          <label className="visually-hidden" htmlFor="new-category">
            {t("menuAdmin.newCategory")}
          </label>
          <input
            id="new-category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder={t("menuAdmin.newCategoryPlaceholder")}
            maxLength={100}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!newCategory.trim() || actions.createCategory.isPending}
          >
            + {t("menuAdmin.addCategory")}
          </button>
        </form>
      </div>

      {failed && (
        <p className={styles.error} role="alert">
          {t("menuAdmin.errors.generic")}
        </p>
      )}

      {categories.length === 0 && <p className={styles.empty}>{t("menuAdmin.noCategories")}</p>}

      <div className={styles.categories}>
        {categories.map((category, index) => (
          <CategorySection
            key={category.id}
            category={category}
            first={index === 0}
            last={index === categories.length - 1}
            actions={actions}
            onMove={(by) => actions.reorderCategories.mutate(moved(categories, index, by))}
            onAddProduct={() => setEditing({ categoryId: category.id })}
            onEditProduct={(product) => setEditing({ categoryId: category.id, product })}
            onDeleteProduct={(product) => setConfirming({ kind: "product", product })}
            onDelete={() => setConfirming({ kind: "category", category })}
          />
        ))}
      </div>

      {editing && (
        <ProductEditor
          categories={categories}
          categoryId={editing.categoryId}
          product={editing.product}
          saveProduct={actions.saveProduct}
          onClose={() => {
            actions.saveProduct.reset();
            setEditing(null);
          }}
        />
      )}

      {confirming?.kind === "category" && (
        <ConfirmDialog
          title={t("menuAdmin.deleteCategoryTitle", { name: confirming.category.name })}
          text={t("menuAdmin.deleteCategoryText")}
          confirmLabel={t("menuAdmin.confirmDelete")}
          busy={actions.deleteCategory.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            actions.deleteCategory.mutate(confirming.category.id, {
              onSettled: () => setConfirming(null),
            })
          }
        />
      )}
      {confirming?.kind === "product" && (
        <ConfirmDialog
          title={t("menuAdmin.deleteProductTitle", { name: confirming.product.name })}
          text={t("menuAdmin.deleteProductText")}
          confirmLabel={t("menuAdmin.confirmDelete")}
          busy={actions.deleteProduct.isPending}
          onCancel={() => setConfirming(null)}
          onConfirm={() =>
            actions.deleteProduct.mutate(confirming.product.id, {
              onSettled: () => setConfirming(null),
            })
          }
        />
      )}
    </main>
  );
}

type CategorySectionProps = {
  category: MenuCategory;
  first: boolean;
  last: boolean;
  actions: MenuActions;
  onMove: (by: -1 | 1) => void;
  onAddProduct: () => void;
  onEditProduct: (product: MenuProduct) => void;
  onDeleteProduct: (product: MenuProduct) => void;
  onDelete: () => void;
};

function CategorySection({
  category,
  first,
  last,
  actions,
  onMove,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onDelete,
}: CategorySectionProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState<string | null>(null);
  const deleteError =
    actions.deleteCategory.error instanceof ApiRequestError &&
    actions.deleteCategory.variables === category.id &&
    actions.deleteCategory.error.code === "CONFLICT";

  const rename = (event: FormEvent) => {
    event.preventDefault();
    const name = renaming?.trim();
    if (!name) return;
    actions.renameCategory.mutate(
      { id: category.id, name },
      { onSuccess: () => setRenaming(null) },
    );
  };

  return (
    <section className={styles.category} aria-label={category.name}>
      <header className={styles.categoryHeader}>
        {renaming === null ? (
          <h2 className={styles.categoryName}>{category.name}</h2>
        ) : (
          <form className={styles.rename} onSubmit={rename}>
            <input
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
              aria-label={t("menuAdmin.categoryName")}
              maxLength={100}
              autoFocus
            />
            <button type="submit" className="btn btn-primary">
              {t("menuAdmin.save")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setRenaming(null)}>
              {t("common.cancel")}
            </button>
          </form>
        )}
        <div className={styles.tools}>
          <button
            type="button"
            className={styles.icon}
            onClick={() => onMove(-1)}
            disabled={first}
            aria-label={`${t("menuAdmin.moveUp")}: ${category.name}`}
          >
            ↑
          </button>
          <button
            type="button"
            className={styles.icon}
            onClick={() => onMove(1)}
            disabled={last}
            aria-label={`${t("menuAdmin.moveDown")}: ${category.name}`}
          >
            ↓
          </button>
          <button type="button" className={styles.tool} onClick={() => setRenaming(category.name)}>
            {t("menuAdmin.rename")}
          </button>
          <button
            type="button"
            className={`${styles.tool} ${styles.danger}`}
            onClick={onDelete}
            aria-label={`${t("menuAdmin.deleteCategory")}: ${category.name}`}
          >
            {t("menuAdmin.delete")}
          </button>
        </div>
      </header>

      {deleteError && (
        <p className={styles.error} role="alert">
          {t("menuAdmin.categoryNotEmpty")}
        </p>
      )}

      {category.products.length === 0 ? (
        <p className={styles.emptyCategory}>{t("menuAdmin.emptyCategory")}</p>
      ) : (
        <ul className={styles.products}>
          {category.products.map((product, index) => (
            <li
              key={product.id}
              className={styles.product}
              data-sold-out={!product.isAvailable || undefined}
            >
              <div className={styles.productText}>
                <span className={styles.productName}>{product.name}</span>
                <span className={styles.productMeta}>
                  {formatKurus(product.priceKurus)}
                  {product.optionGroups.length > 0 &&
                    ` · ${t("menuAdmin.optionGroups", { count: product.optionGroups.length })}`}
                </span>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={product.isAvailable}
                  onChange={(e) =>
                    actions.setAvailability.mutate({
                      id: product.id,
                      isAvailable: e.target.checked,
                    })
                  }
                  aria-label={`${t("menuAdmin.onSale")}: ${product.name}`}
                />
                <span>{product.isAvailable ? t("menuAdmin.onSale") : t("menuAdmin.soldOut")}</span>
              </label>
              <div className={styles.tools}>
                <button
                  type="button"
                  className={styles.icon}
                  onClick={() =>
                    actions.reorderProducts.mutate({
                      categoryId: category.id,
                      ids: moved(category.products, index, -1),
                    })
                  }
                  disabled={index === 0}
                  aria-label={`${t("menuAdmin.moveUp")}: ${product.name}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.icon}
                  onClick={() =>
                    actions.reorderProducts.mutate({
                      categoryId: category.id,
                      ids: moved(category.products, index, 1),
                    })
                  }
                  disabled={index === category.products.length - 1}
                  aria-label={`${t("menuAdmin.moveDown")}: ${product.name}`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.tool}
                  onClick={() => onEditProduct(product)}
                  aria-label={`${t("menuAdmin.edit")}: ${product.name}`}
                >
                  {t("menuAdmin.edit")}
                </button>
                <button
                  type="button"
                  className={`${styles.tool} ${styles.danger}`}
                  onClick={() => onDeleteProduct(product)}
                  aria-label={`${t("menuAdmin.delete")}: ${product.name}`}
                >
                  {t("menuAdmin.delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className={styles.addProduct} onClick={onAddProduct}>
        + {t("menuAdmin.addProduct")}
      </button>
    </section>
  );
}
