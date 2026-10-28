import { CAFE_ID_HEADER, type SessionUser, type StaffCafe } from "@siparis/shared";
import { createContext, useContext } from "react";
import type { ZodType } from "zod";
import { apiFetch } from "../../lib/api";

export type StaffContextValue = {
  user: SessionUser;
  cafe: StaffCafe;
  /** apiFetch for staff routes; adds X-Cafe-Id when a super-admin is acting as a café. */
  staffFetch: <T>(path: string, schema: ZodType<T>, init?: RequestInit) => Promise<T>;
  /** Query-string suffix for URLs that can't carry headers (EventSource). */
  cafeQuery: string;
};

export const StaffContext = createContext<StaffContextValue | null>(null);

export function useStaff(): StaffContextValue {
  const value = useContext(StaffContext);
  if (!value) throw new Error("useStaff must be used inside the staff layout");
  return value;
}

/** Builds staffFetch for a user, optionally acting as the given café (super-admin). */
export function createStaffFetch(actingCafeId: string | null): StaffContextValue["staffFetch"] {
  return (path, schema, init = {}) =>
    apiFetch(path, schema, {
      ...init,
      headers: { ...(actingCafeId && { [CAFE_ID_HEADER]: actingCafeId }), ...init.headers },
    });
}
