import type { PrismaClient } from "../../db";
import { WaiterCallStatus } from "../../generated/prisma/client";

const withTable = { table: { select: { name: true } } };

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Queries for one table, run inside a transaction that holds that table's lock. */
function tableScope(tx: Tx, tableId: string) {
  return {
    /** The call the table made most recently, open or not (for the cooldown). */
    findLatest() {
      return tx.waiterCall.findFirst({
        where: { tableId },
        orderBy: { lastCalledAt: "desc" },
        include: withTable,
      });
    },
    create(cafeId: string, at: Date) {
      return tx.waiterCall.create({
        data: { cafeId, tableId, createdAt: at, lastCalledAt: at },
        include: withTable,
      });
    },
    repeat(id: string, at: Date) {
      return tx.waiterCall.update({
        where: { id },
        data: { lastCalledAt: at, callCount: { increment: 1 } },
        include: withTable,
      });
    },
  };
}

export type TableCallScope = ReturnType<typeof tableScope>;

export function createWaiterCallsRepository(prisma: PrismaClient) {
  return {
    /** Runs `fn` with a per-table advisory lock, so simultaneous presses can't race. */
    withTableLock<T>(tableId: string, fn: (scope: TableCallScope) => Promise<T>): Promise<T> {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`waiter:${tableId}`}))`;
        return fn(tableScope(tx, tableId));
      });
    },

    listOpen(cafeId: string) {
      return prisma.waiterCall.findMany({
        where: { cafeId, status: WaiterCallStatus.OPEN },
        orderBy: { createdAt: "asc" },
        include: withTable,
      });
    },

    /** Resolves an open call of the café; returns whether there was one. */
    async resolve(cafeId: string, id: string, at: Date) {
      const { count } = await prisma.waiterCall.updateMany({
        where: { id, cafeId, status: WaiterCallStatus.OPEN },
        data: { status: WaiterCallStatus.RESOLVED, resolvedAt: at },
      });
      return count === 1;
    },

    exists(cafeId: string, id: string) {
      return prisma.waiterCall.count({ where: { id, cafeId } }).then((count) => count > 0);
    },
  };
}

export type WaiterCallsRepository = ReturnType<typeof createWaiterCallsRepository>;
