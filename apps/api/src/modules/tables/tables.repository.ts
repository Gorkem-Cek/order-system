import type { PrismaClient } from "../../db";
import { WaiterCallStatus } from "../../generated/prisma/client";

export function createTablesRepository(prisma: PrismaClient) {
  return {
    list(cafeId: string) {
      return prisma.table.findMany({ where: { cafeId } });
    },

    count(cafeId: string) {
      return prisma.table.count({ where: { cafeId } });
    },

    find(cafeId: string, id: string) {
      return prisma.table.findFirst({ where: { id, cafeId } });
    },

    /** Case-insensitive, so "masa 1" and "Masa 1" count as the same name. */
    findByName(cafeId: string, name: string) {
      return prisma.table.findFirst({
        where: { cafeId, name: { equals: name, mode: "insensitive" } },
      });
    },

    create(cafeId: string, name: string, qrToken: string) {
      return prisma.table.create({ data: { cafeId, name, qrToken } });
    },

    update(id: string, data: { name?: string; qrToken?: string }) {
      return prisma.table.update({ where: { id }, data });
    },

    /**
     * Deletes the table and its waiter calls; its orders stay (they keep the table's name).
     * Returns the ids of the calls that were still open, so staff screens can drop them.
     */
    delete(id: string) {
      return prisma.$transaction(async (tx) => {
        const open = await tx.waiterCall.findMany({
          where: { tableId: id, status: WaiterCallStatus.OPEN },
          select: { id: true },
        });
        await tx.table.delete({ where: { id } });
        return open.map((call) => call.id);
      });
    },
  };
}

export type TablesRepository = ReturnType<typeof createTablesRepository>;
