import { productInputSchema } from "@siparis/shared";
import { describe, expect, it } from "vitest";
import { ids, menuFixture } from "../../test/menu-fixture";
import {
  emptyGroup,
  emptyOption,
  emptyProductForm,
  formToInput,
  productToForm,
  type ProductForm,
} from "./product-form";

const latte = menuFixture.categories[0]!.products[1]!;

describe("productToForm / formToInput", () => {
  it("round-trips a product, keeping option ids and prices", () => {
    const result = formToInput(productToForm(latte, ids.hot));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toEqual({
      categoryId: ids.hot,
      name: "Latte",
      description: null,
      priceKurus: 16000,
      isAvailable: true,
      optionGroups: [
        {
          id: ids.sizeGroup,
          name: "Boyut",
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: ids.small, name: "Küçük", priceDeltaKurus: 0, isAvailable: true },
            { id: ids.large, name: "Büyük", priceDeltaKurus: 4000, isAvailable: true },
          ],
        },
        {
          id: ids.extrasGroup,
          name: "Ekstralar",
          minSelect: 0,
          maxSelect: 2,
          options: [
            { id: ids.shot, name: "Ekstra shot", priceDeltaKurus: 3500, isAvailable: true },
            { id: ids.caramel, name: "Karamel şurubu", priceDeltaKurus: 2000, isAvailable: false },
          ],
        },
      ],
    });
    // What the form produces is what the API accepts.
    expect(productInputSchema.safeParse(result.input).success).toBe(true);
  });

  it("parses Turkish prices and trims text", () => {
    const form: ProductForm = {
      ...emptyProductForm(ids.hot),
      name: "  Mocha ",
      description: "   ",
      price: "1.250,50",
    };
    expect(formToInput(form)).toMatchObject({
      ok: true,
      input: { name: "Mocha", description: null, priceKurus: 125050 },
    });
  });

  it("reports every invalid field", () => {
    const group = {
      ...emptyGroup(),
      maxSelect: "5",
      options: [{ ...emptyOption(), price: "abc" }],
    };
    const result = formToInput({ ...emptyProductForm(ids.hot), price: "", groups: [group] });
    expect(result).toEqual({
      ok: false,
      errors: {
        name: "name",
        price: "price",
        "groups.0.name": "groupName",
        "groups.0.options.0.name": "optionName",
        "groups.0.options.0.price": "optionPrice",
        "groups.0.maxSelect": "maxSelect",
      },
    });
  });

  it("makes optional groups min 0 and keeps a required minimum above 1", () => {
    const form = productToForm(latte, ids.hot);
    form.groups[0] = { ...form.groups[0]!, required: false };
    form.groups[1] = { ...form.groups[1]!, required: true, minSelect: 2 };
    const result = formToInput(form);
    expect(result.ok && result.input.optionGroups?.map((g) => [g.minSelect, g.maxSelect])).toEqual([
      [0, 1],
      [2, 2],
    ]);
  });
});
