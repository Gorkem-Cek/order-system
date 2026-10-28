import type { PrismaClient } from "../../db";

export function createSessionsRepository(prisma: PrismaClient) {
  return {
    create(data: { userId: string; tokenHash: string; expiresAt: Date }) {
      return prisma.session.create({ data });
    },

    findByTokenHash(tokenHash: string) {
      return prisma.session.findUnique({
        where: { tokenHash },
        include: { user: { include: { cafe: true } } },
      });
    },

    updateExpiry(id: string, expiresAt: Date) {
      return prisma.session.update({ where: { id }, data: { expiresAt } });
    },

    deleteById(id: string) {
      return prisma.session.deleteMany({ where: { id } });
    },

    deleteByTokenHash(tokenHash: string) {
      return prisma.session.deleteMany({ where: { tokenHash } });
    },

    /** Logs a user out everywhere, optionally keeping one session (the current one). */
    deleteForUser(userId: string, exceptSessionId?: string) {
      return prisma.session.deleteMany({
        where: { userId, ...(exceptSessionId && { id: { not: exceptSessionId } }) },
      });
    },

    deleteForCafe(cafeId: string) {
      return prisma.session.deleteMany({ where: { user: { cafeId } } });
    },
  };
}

export type SessionsRepository = ReturnType<typeof createSessionsRepository>;
