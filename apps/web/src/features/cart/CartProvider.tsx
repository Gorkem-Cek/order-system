import { useEffect, useReducer, type ReactNode } from "react";
import { readStorage, writeStorage } from "../../lib/storage";
import { cartReducer, cartStorageKey, parseStoredCart } from "./cart";
import { CartContext } from "./cart-context";

/** Holds the cart for one table and keeps it in localStorage, so a refresh doesn't lose it. */
export function CartProvider({ qrToken, children }: { qrToken: string; children: ReactNode }) {
  const [cart, dispatch] = useReducer(cartReducer, qrToken, (token) =>
    parseStoredCart(readStorage(cartStorageKey(token))),
  );

  useEffect(() => {
    writeStorage(cartStorageKey(qrToken), JSON.stringify(cart));
  }, [qrToken, cart]);

  return <CartContext value={{ cart, dispatch }}>{children}</CartContext>;
}
