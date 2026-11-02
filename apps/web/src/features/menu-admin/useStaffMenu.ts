import {
  menuCategorySchema,
  menuProductSchema,
  staffMenuResponseSchema,
  type MenuCategory,
  type ProductInputData,
} from "@siparis/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useStaff } from "../staff/staff-context";

export const staffMenuKey = (cafeId: string) => ["staff", cafeId, "menu"] as const;

export function useStaffMenu() {
  const { cafe, staffFetch } = useStaff();
  return useQuery({
    queryKey: staffMenuKey(cafe.id),
    queryFn: async () => (await staffFetch("/staff/menu", staffMenuResponseSchema)).categories,
  });
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

/** A menu change that reloads the menu when it's done (also after a failure). */
function useMenuMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const { cafe } = useStaff();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: staffMenuKey(cafe.id) }),
  });
}

/** Every menu change the staff can make. */
export function useMenuActions() {
  const { cafe, staffFetch } = useStaff();
  const queryClient = useQueryClient();
  const key = staffMenuKey(cafe.id);

  return {
    createCategory: useMenuMutation((name: string) =>
      staffFetch("/staff/categories", menuCategorySchema, json("POST", { name })),
    ),
    renameCategory: useMenuMutation(({ id, name }: { id: string; name: string }) =>
      staffFetch(`/staff/categories/${id}`, z.undefined(), json("PATCH", { name })),
    ),
    deleteCategory: useMenuMutation((id: string) =>
      staffFetch(`/staff/categories/${id}`, z.undefined(), { method: "DELETE" }),
    ),
    reorderCategories: useMenuMutation((ids: string[]) => {
      // Show the new order straight away; the reload confirms it.
      queryClient.setQueryData<MenuCategory[]>(
        key,
        (categories) => categories && ids.flatMap((id) => categories.filter((c) => c.id === id)),
      );
      return staffFetch("/staff/categories/order", z.undefined(), json("PUT", { ids }));
    }),
    reorderProducts: useMenuMutation(
      ({ categoryId, ids }: { categoryId: string; ids: string[] }) => {
        queryClient.setQueryData<MenuCategory[]>(key, (categories) =>
          categories?.map((c) =>
            c.id === categoryId
              ? { ...c, products: ids.flatMap((id) => c.products.filter((p) => p.id === id)) }
              : c,
          ),
        );
        return staffFetch(
          `/staff/categories/${categoryId}/products/order`,
          z.undefined(),
          json("PUT", { ids }),
        );
      },
    ),
    saveProduct: useMenuMutation(({ id, input }: { id?: string; input: ProductInputData }) =>
      id
        ? staffFetch(`/staff/products/${id}`, menuProductSchema, json("PUT", input))
        : staffFetch("/staff/products", menuProductSchema, json("POST", input)),
    ),
    setAvailability: useMenuMutation(
      ({ id, isAvailable }: { id: string; isAvailable: boolean }) => {
        queryClient.setQueryData<MenuCategory[]>(key, (categories) =>
          categories?.map((c) => ({
            ...c,
            products: c.products.map((p) => (p.id === id ? { ...p, isAvailable } : p)),
          })),
        );
        return staffFetch(
          `/staff/products/${id}/availability`,
          menuProductSchema,
          json("PATCH", { isAvailable }),
        );
      },
    ),
    deleteProduct: useMenuMutation((id: string) =>
      staffFetch(`/staff/products/${id}`, z.undefined(), { method: "DELETE" }),
    ),
  };
}

export type MenuActions = ReturnType<typeof useMenuActions>;
