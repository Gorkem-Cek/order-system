import {
  staffCafeSchema,
  type CafeImageKind,
  type StaffCafe,
  type UpdateCafeSettingsRequest,
} from "@siparis/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { staffCafeKey, useStaff } from "../staff/staff-context";

/** Changes to the café's branding; each one updates the panel (top bar colour, logo) at once. */
export function useCafeSettingsActions() {
  const { cafe, staffFetch } = useStaff();
  const queryClient = useQueryClient();
  const onSuccess = (updated: StaffCafe) => {
    queryClient.setQueryData(staffCafeKey(cafe.id), updated);
    // The super-admin's café list shows names too.
    void queryClient.invalidateQueries({ queryKey: ["admin", "cafes"] });
  };

  return {
    update: useMutation({
      mutationFn: (body: UpdateCafeSettingsRequest) =>
        staffFetch("/staff/cafe", staffCafeSchema, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      onSuccess,
    }),
    uploadImage: useMutation({
      mutationFn: ({ kind, file }: { kind: CafeImageKind; file: File }) => {
        const body = new FormData();
        body.append("image", file);
        return staffFetch(`/staff/cafe/images/${kind}`, staffCafeSchema, { method: "POST", body });
      },
      onSuccess,
    }),
    removeImage: useMutation({
      mutationFn: (kind: CafeImageKind) =>
        staffFetch(`/staff/cafe/images/${kind}`, staffCafeSchema, { method: "DELETE" }),
      onSuccess,
    }),
  };
}

export type CafeSettingsActions = ReturnType<typeof useCafeSettingsActions>;
