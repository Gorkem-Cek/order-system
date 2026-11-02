import {
  kurusToInput,
  MAX_PRICE_KURUS,
  parseLiraInput,
  type MenuProduct,
  type ProductInputData,
} from "@siparis/shared";

// Editable state of the product editor. Prices are kept as typed text ("120,50") and only
// turned into kuruş when saving.

export type OptionForm = {
  key: string;
  id?: string;
  name: string;
  price: string;
  isAvailable: boolean;
};

export type GroupForm = {
  key: string;
  id?: string;
  name: string;
  required: boolean;
  /** Kept from the product when it needs more than one choice; the editor only toggles 0/1. */
  minSelect: number;
  maxSelect: string;
  options: OptionForm[];
};

export type ProductForm = {
  categoryId: string;
  name: string;
  description: string;
  price: string;
  isAvailable: boolean;
  groups: GroupForm[];
};

export type FormErrorKey =
  "name" | "price" | "groupName" | "optionName" | "optionPrice" | "maxSelect";

/** Field path → which error to show, e.g. "groups.0.options.1.price" → "optionPrice". */
export type FormErrors = Record<string, FormErrorKey>;

let keyCounter = 0;
export const newKey = () => `k${++keyCounter}`;

export const emptyOption = (): OptionForm => ({
  key: newKey(),
  name: "",
  price: "0",
  isAvailable: true,
});

export const emptyGroup = (): GroupForm => ({
  key: newKey(),
  name: "",
  required: true,
  minSelect: 1,
  maxSelect: "1",
  options: [emptyOption(), emptyOption()],
});

export function emptyProductForm(categoryId: string): ProductForm {
  return { categoryId, name: "", description: "", price: "", isAvailable: true, groups: [] };
}

export function productToForm(product: MenuProduct, categoryId: string): ProductForm {
  return {
    categoryId,
    name: product.name,
    description: product.description ?? "",
    price: kurusToInput(product.priceKurus),
    isAvailable: product.isAvailable,
    groups: product.optionGroups.map((group) => ({
      key: newKey(),
      id: group.id,
      name: group.name,
      required: group.minSelect > 0,
      minSelect: group.minSelect,
      maxSelect: String(group.maxSelect),
      options: group.options.map((option) => ({
        key: newKey(),
        id: option.id,
        name: option.name,
        price: kurusToInput(option.priceDeltaKurus),
        isAvailable: option.isAvailable,
      })),
    })),
  };
}

const validPrice = (text: string): number | null => {
  const kurus = parseLiraInput(text);
  return kurus !== null && kurus <= MAX_PRICE_KURUS ? kurus : null;
};

/** Checks the form and builds the API body, or returns which fields are wrong. */
export function formToInput(
  form: ProductForm,
): { ok: true; input: ProductInputData } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = "name";
  const price = validPrice(form.price);
  if (price === null) errors.price = "price";

  const optionGroups = form.groups.map((group, g) => {
    if (!group.name.trim()) errors[`groups.${g}.name`] = "groupName";
    const options = group.options.map((option, o) => {
      if (!option.name.trim()) errors[`groups.${g}.options.${o}.name`] = "optionName";
      const delta = validPrice(option.price);
      if (delta === null) errors[`groups.${g}.options.${o}.price`] = "optionPrice";
      return {
        ...(option.id && { id: option.id }),
        name: option.name.trim(),
        priceDeltaKurus: delta ?? 0,
        isAvailable: option.isAvailable,
      };
    });
    const minSelect = group.required ? Math.max(1, group.minSelect) : 0;
    const maxSelect = Number(group.maxSelect);
    if (
      !Number.isInteger(maxSelect) ||
      maxSelect < Math.max(1, minSelect) ||
      maxSelect > options.length
    ) {
      errors[`groups.${g}.maxSelect`] = "maxSelect";
    }
    return {
      ...(group.id && { id: group.id }),
      name: group.name.trim(),
      minSelect,
      maxSelect,
      options,
    };
  });

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    input: {
      categoryId: form.categoryId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      priceKurus: price ?? 0,
      isAvailable: form.isAvailable,
      optionGroups,
    },
  };
}
