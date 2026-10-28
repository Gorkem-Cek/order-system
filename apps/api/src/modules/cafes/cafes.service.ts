import type { AdminCafe, CreateCafeRequest, StaffCafe, UpdateCafeRequest } from "@siparis/shared";
import { conflict, notFound } from "../../lib/errors";
import { hashPassword } from "../../lib/password";
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

export function createCafesService(deps: {
  cafes: CafesRepository;
  users: UsersRepository;
  sessions: SessionsRepository;
}) {
  const { cafes, users, sessions } = deps;

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
      const cafe = await cafes.findById(id);
      if (!cafe) throw notFound("Café");
      return toStaffCafe(cafe);
    },
  };
}

export type CafesService = ReturnType<typeof createCafesService>;
