import type {
  AdminCafe,
  CafeImageKind,
  CreateCafeRequest,
  StaffCafe,
  UpdateCafeRequest,
  UpdateCafeSettingsRequest,
} from "@siparis/shared";
import { conflict, notFound } from "../../lib/errors";
import { processImage } from "../../lib/images";
import { hashPassword } from "../../lib/password";
import { newImageKey, type FileStorage } from "../../lib/storage";
import type { SessionsRepository } from "../auth/sessions.repository";
import type { UsersRepository } from "../auth/users.repository";
import type { CafesRepository } from "./cafes.repository";

type CafeRow = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  coverUrl: string | null;
  primaryColor: string;
  isActive: boolean;
  createdAt: Date;
};

function toAdminCafe(cafe: CafeRow & { users: { email: string }[] }): AdminCafe {
  return {
    id: cafe.id,
    name: cafe.name,
    slug: cafe.slug,
    isActive: cafe.isActive,
    createdAt: cafe.createdAt.toISOString(),
    loginEmail: cafe.users[0]?.email ?? null,
  };
}

function toStaffCafe(cafe: CafeRow): StaffCafe {
  return {
    id: cafe.id,
    name: cafe.name,
    slug: cafe.slug,
    logoUrl: cafe.logoUrl,
    coverUrl: cafe.coverUrl,
    primaryColor: cafe.primaryColor,
    isActive: cafe.isActive,
  };
}

/** Longest side of each stored café image: logos are shown small, covers span the screen. */
const IMAGE_MAX_SIZE: Record<CafeImageKind, number> = { logo: 512, cover: 1600 };
const IMAGE_FIELD = { logo: "logoUrl", cover: "coverUrl" } as const;

export function createCafesService(deps: {
  cafes: CafesRepository;
  users: UsersRepository;
  sessions: SessionsRepository;
  storage: FileStorage;
}) {
  const { cafes, users, sessions, storage } = deps;

  const cafeOf = async (id: string) => {
    const cafe = await cafes.findById(id);
    if (!cafe) throw notFound("Café");
    return cafe;
  };

  return {
    async list(): Promise<AdminCafe[]> {
      return (await cafes.listWithLogin()).map(toAdminCafe);
    },

    async create(input: CreateCafeRequest): Promise<AdminCafe> {
      if (await cafes.slugExists(input.slug)) {
        throw conflict("slug", "A café with this slug already exists");
      }
      if (await users.emailExists(input.loginEmail)) {
        throw conflict("loginEmail", "This email is already in use");
      }
      const cafe = await cafes.createWithLogin({
        name: input.name,
        slug: input.slug,
        loginEmail: input.loginEmail,
        passwordHash: await hashPassword(input.loginPassword),
      });
      return toAdminCafe(cafe);
    },

    /** Renames and/or (de)activates a café. Deactivating logs its staff out immediately. */
    async update(id: string, input: UpdateCafeRequest): Promise<AdminCafe> {
      if (!(await cafes.findById(id))) throw notFound("Café");
      const cafe = await cafes.update(id, input);
      if (input.isActive === false) await sessions.deleteForCafe(id);
      return toAdminCafe(cafe);
    },

    /** Resets the café's shared login password and logs its staff out everywhere. */
    async resetPassword(id: string, newPassword: string): Promise<void> {
      if (!(await cafes.findById(id))) throw notFound("Café");
      const updated = await cafes.updateStaffPasswordHash(id, await hashPassword(newPassword));
      if (updated === 0) throw notFound("Café login");
      await sessions.deleteForCafe(id);
    },

    async getForStaff(id: string): Promise<StaffCafe> {
      return toStaffCafe(await cafeOf(id));
    },

    async updateSettings(id: string, input: UpdateCafeSettingsRequest): Promise<StaffCafe> {
      await cafeOf(id);
      return toStaffCafe(await cafes.updateBranding(id, input));
    },

    /** Replaces the logo or cover; the old file is deleted once the new one is in place. */
    async setImage(id: string, kind: CafeImageKind, upload: Buffer): Promise<StaffCafe> {
      const cafe = await cafeOf(id);
      const image = await processImage(upload, { maxSize: IMAGE_MAX_SIZE[kind] });
      const url = await storage.put(
        newImageKey(`cafes/${id}`, kind),
        image.data,
        image.contentType,
      );
      const updated = await cafes.updateBranding(id, { [IMAGE_FIELD[kind]]: url });
      const previous = cafe[IMAGE_FIELD[kind]];
      if (previous) await storage.removeByUrl(previous);
      return toStaffCafe(updated);
    },

    async removeImage(id: string, kind: CafeImageKind): Promise<StaffCafe> {
      const cafe = await cafeOf(id);
      const updated = await cafes.updateBranding(id, { [IMAGE_FIELD[kind]]: null });
      const previous = cafe[IMAGE_FIELD[kind]];
      if (previous) await storage.removeByUrl(previous);
      return toStaffCafe(updated);
    },
  };
}

export type CafesService = ReturnType<typeof createCafesService>;
