import {
  formatKurus,
  ITEM_NOTE_MAX_LENGTH,
  type MenuOptionGroup,
  type MenuProduct,
} from "@siparis/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QuantityStepper } from "../../components/QuantityStepper";
import { Sheet } from "../../components/Sheet";
import type { CartLine } from "../cart/cart";
import { useCart } from "../cart/cart-context";
import styles from "./ProductSheet.module.css";

type ProductSheetProps = {
  product: MenuProduct;
  /** When set, the sheet edits this cart line instead of adding a new one. */
  editing?: CartLine;
  onClose: () => void;
};

type Selection = Record<string, string[]>;

function initialSelection(product: MenuProduct, optionIds: string[] = []): Selection {
  return Object.fromEntries(
    product.optionGroups.map((group) => [
      group.id,
      group.options.filter((o) => optionIds.includes(o.id)).map((o) => o.id),
    ]),
  );
}

/** Single required choice → radio buttons; everything else → checkboxes. */
const isRadioGroup = (group: MenuOptionGroup) => group.minSelect >= 1 && group.maxSelect === 1;

function useGroupHint() {
  const { t } = useTranslation();
  return (group: MenuOptionGroup) => {
    const { minSelect: min, maxSelect: max } = group;
    if (min === max)
      return min === 1 ? t("product.chooseOne") : t("product.chooseExactly", { count: min });
    if (min === 0) return t("product.chooseUpTo", { count: max });
    return t("product.chooseBetween", { min, max });
  };
}

export function ProductSheet({ product, editing, onClose }: ProductSheetProps) {
  const { t } = useTranslation();
  const groupHint = useGroupHint();
  const { dispatch } = useCart();
  const [selection, setSelection] = useState(() => initialSelection(product, editing?.optionIds));
  const [quantity, setQuantity] = useState(editing?.quantity ?? 1);
  const [note, setNote] = useState(editing?.note ?? "");

  const toggle = (group: MenuOptionGroup, optionId: string) => {
    setSelection((current) => {
      const picked = current[group.id] ?? [];
      let next: string[];
      if (picked.includes(optionId))
        next = isRadioGroup(group) ? picked : picked.filter((id) => id !== optionId);
      else if (group.maxSelect === 1) next = [optionId];
      else if (picked.length < group.maxSelect) next = [...picked, optionId];
      else next = picked;
      return { ...current, [group.id]: next };
    });
  };

  const selectedIds = product.optionGroups.flatMap((g) => selection[g.id] ?? []);
  const unitPrice =
    product.priceKurus +
    product.optionGroups
      .flatMap((g) => g.options)
      .filter((o) => selectedIds.includes(o.id))
      .reduce((sum, o) => sum + o.priceDeltaKurus, 0);
  const missing = product.optionGroups.filter((g) => (selection[g.id]?.length ?? 0) < g.minSelect);
  const price = formatKurus(unitPrice * quantity);

  const submit = () => {
    const line = { productId: product.id, quantity, optionIds: selectedIds, note: note.trim() };
    dispatch(editing ? { type: "replace", key: editing.key, line } : { type: "add", line });
    onClose();
  };

  return (
    <Sheet
      title={product.name}
      onClose={onClose}
      footer={
        <div className={styles.footer}>
          {missing.length > 0 && (
            <p className={styles.missing} role="status">
              {t("product.missingChoice", { groups: missing.map((g) => g.name).join(", ") })}
            </p>
          )}
          <div className={styles.actions}>
            <QuantityStepper value={quantity} onChange={setQuantity} label={product.name} />
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={submit}
              disabled={missing.length > 0}
            >
              {editing ? t("product.update", { price }) : t("product.add", { price })}
            </button>
          </div>
        </div>
      }
    >
      {product.imageUrl && <img className={styles.image} src={product.imageUrl} alt="" />}
      {product.description && <p className={styles.description}>{product.description}</p>}
      <p className={styles.basePrice}>{formatKurus(product.priceKurus)}</p>

      {product.optionGroups.map((group) => {
        const picked = selection[group.id] ?? [];
        const radio = isRadioGroup(group);
        const atMax = picked.length >= group.maxSelect && group.maxSelect > 1;
        return (
          <fieldset key={group.id} className={styles.group}>
            <legend className={styles.groupLegend}>
              <span className={styles.groupName}>{group.name}</span>
              <span className={group.minSelect > 0 ? styles.required : styles.optional}>
                {group.minSelect > 0 ? t("product.required") : t("product.optional")}
              </span>
            </legend>
            <p className={styles.groupHint}>{groupHint(group)}</p>
            <ul className={styles.options}>
              {group.options.map((option) => {
                const checked = picked.includes(option.id);
                const disabled = !option.isAvailable || (!checked && atMax);
                return (
                  <li key={option.id}>
                    <label className={styles.option} data-disabled={disabled || undefined}>
                      <input
                        type={radio ? "radio" : "checkbox"}
                        name={group.id}
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(group, option.id)}
                      />
                      <span className={styles.optionName}>{option.name}</span>
                      <span className={styles.optionPrice}>
                        {!option.isAvailable
                          ? t("product.optionUnavailable")
                          : option.priceDeltaKurus > 0 && `+${formatKurus(option.priceDeltaKurus)}`}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}

      <label className={styles.noteLabel}>
        {t("product.note")}
        <textarea
          className={styles.note}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("product.notePlaceholder")}
          maxLength={ITEM_NOTE_MAX_LENGTH}
          rows={2}
        />
      </label>
    </Sheet>
  );
}
