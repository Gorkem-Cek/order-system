import type { PrismaClient } from "../../db";

export function createUsersRepository(prisma: PrismaClient) {
  return {
    findByEmailWithCafe(email: string) {
      return prisma.user.findUnique({ where: { email }, include: { cafe: true } });
    },

    findById(id: string) {
      return prisma.user.findUnique({ where: { id } });
    },

    emailExists(email: string) {
      return prisma.user.count({ where: { email } }).then((count) => count > 0);
    },

    updatePasswordHash(id: string, passwordHash: string) {
      return prisma.user.update({ where: { id }, data: { passwordHash } });
    },
  };
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;
