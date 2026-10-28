import { createContext, useContext, type Dispatch } from "react";
import type { CartAction, CartState } from "./cart";

export type CartContextValue = { cart: CartState; dispatch: Dispatch<CartAction> };

export const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside <CartProvider>");
  return value;
}
