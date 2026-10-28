import type { PrismaClient } from "../../db";
import { Role } from "../../generated/prisma/client";

export function createCafesRepository(prisma: PrismaClient) {
  return {
    /** All cafés with their shared staff login, newest first. */
    listWithLogin() {
      return prisma.cafe.findMany({
        orderBy: { createdAt: "desc" },
        include: { users: { where: { role: Role.STAFF }, take: 1, orderBy: { createdAt: "asc" } } },
      });
    },

    findById(id: string) {
      return prisma.cafe.findUnique({ where: { id } });
    },

    slugExists(slug: string) {
      return prisma.cafe.count({ where: { slug } }).then((count) => count > 0);
    },

    createWithLogin(data: {
      name: string;
      slug: string;
      loginEmail: string;
      passwordHash: string;
    }) {
      return prisma.cafe.create({
        data: {
          name: data.name,
          slug: data.slug,
          users: {
            create: {
              email: data.loginEmail,
              name: data.name,
              role: Role.STAFF,
              passwordHash: data.passwordHash,
            },
          },
        },
        include: { users: true },
      });
    },

    update(id: string, data: { name?: string; isActive?: boolean }) {
      return prisma.cafe.update({
        where: { id },
        data,
        include: { users: { where: { role: Role.STAFF }, take: 1, orderBy: { createdAt: "asc" } } },
      });
    },

    /** Sets the password of every staff login of the café (one in the MVP). */
    updateStaffPasswordHash(cafeId: string, passwordHash: string) {
      return prisma.user
        .updateMany({ where: { cafeId, role: Role.STAFF }, data: { passwordHash } })
        .then((result) => result.count);
    },
  };
}

export type CafesRepository = ReturnType<typeof createCafesRepository>;
