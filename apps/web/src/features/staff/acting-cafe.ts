import { readStorage, removeStorage, writeStorage } from "../../lib/storage";

// Which café a super-admin is currently managing in the staff panel (per browser).
const ACTING_CAFE_KEY = "siparis.actingCafe";

export const readActingCafe = () => readStorage(ACTING_CAFE_KEY);
export const setActingCafe = (cafeId: string) => writeStorage(ACTING_CAFE_KEY, cafeId);
export const clearActingCafe = () => removeStorage(ACTING_CAFE_KEY);
