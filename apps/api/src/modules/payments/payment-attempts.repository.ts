import type { PrismaClient } from "../../db";
import type { IyzicoMode, Prisma } from "../../generated/prisma/client";
import { insertOrderWithNextNumber, type NewOrder } from "../orders/orders.repository";

export type NewPaymentAttempt = {
  cafeId: string;
  tableId: string;
  tableName: string;
  qrToken: string;
  note: string | null;
  totalKurus: number;
  items: NewOrder["items"];
  iyzicoMode: IyzicoMode;
};

export function createPaymentAttemptsRepository(prisma: PrismaClient) {
  return {
    create(attempt: NewPaymentAttempt) {
      return prisma.paymentAttempt.create({
        data: { ...attempt, items: attempt.items as Prisma.InputJsonValue },
      });
    },

    setToken(id: string, iyzicoToken: string) {
      return prisma.paymentAttempt.update({ where: { id }, data: { iyzicoToken } });
    },

    /** With the café, whose iyzico keys confirm the payment. */
    findById(id: string) {
      return prisma.paymentAttempt.findUnique({
        where: { id },
        include: { cafe: true, order: true },
      });
    },

    /** Marks a still-pending attempt as failed; returns whether it was pending. */
    async markFailed(id: string, failureReason: string) {
      const { count } = await prisma.paymentAttempt.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "FAILED", failureReason },
      });
      return count === 1;
    },

    /**
     * Marks the attempt paid and creates its order in one transaction. Returns null when the
     * attempt was no longer pending (e.g. the callback and a status check raced), so an order
     * is never created twice.
     */
    completeWithOrder(
      id: string,
      paid: { paymentId: string; transactions: unknown },
      order: NewOrder,
    ) {
      return prisma.$transaction(async (tx) => {
        const { count } = await tx.paymentAttempt.updateMany({
          where: { id, status: "PENDING" },
          data: {
            status: "PAID",
            paymentId: paid.paymentId,
            transactions: paid.transactions as Prisma.InputJsonValue,
          },
        });
        if (count === 0) return null;
        const created = await insertOrderWithNextNumber(tx, order);
        await tx.paymentAttempt.update({ where: { id }, data: { orderId: created.id } });
        return created;
      });
    },
  };
}

export type PaymentAttemptsRepository = ReturnType<typeof createPaymentAttemptsRepository>;
