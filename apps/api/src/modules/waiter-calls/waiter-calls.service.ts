import {
  WAITER_CALL_COOLDOWN_SECONDS,
  type WaiterCall,
  type WaiterCallResponse,
} from "@siparis/shared";
import type { EventBus } from "../../lib/event-bus";
import { AppError, notFound } from "../../lib/errors";
import { WaiterCallStatus } from "../../generated/prisma/client";
import type { MenuService } from "../menu/menu.service";
import type { WaiterCallsRepository } from "./waiter-calls.repository";

type CallRow = {
  id: string;
  createdAt: Date;
  lastCalledAt: Date;
  callCount: number;
  table: { name: string };
};

function toWaiterCall(call: CallRow): WaiterCall {
  return {
    id: call.id,
    tableName: call.table.name,
    createdAt: call.createdAt.toISOString(),
    lastCalledAt: call.lastCalledAt.toISOString(),
    callCount: call.callCount,
  };
}

const COOLDOWN_MS = WAITER_CALL_COOLDOWN_SECONDS * 1000;

export function createWaiterCallsService(deps: {
  calls: WaiterCallsRepository;
  menuService: MenuService;
  events: EventBus;
  now?: () => Date;
}) {
  const { calls, menuService, events } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    /**
     * A guest pressed "Garson çağır". A table can call once per cooldown; if it already has
     * an open call, that call is re-raised instead of creating a second one.
     */
    async callWaiter(qrToken: string): Promise<WaiterCallResponse> {
      const table = await menuService.resolveTable(qrToken);
      const at = now();

      const call = await calls.withTableLock(table.id, async (scope) => {
        const latest = await scope.findLatest();
        const sinceLast = latest ? at.getTime() - latest.lastCalledAt.getTime() : Infinity;
        if (sinceLast < COOLDOWN_MS) {
          throw new AppError(429, "WAITER_CALL_COOLDOWN", "Waiter was called recently", {
            retryAfterSeconds: Math.ceil((COOLDOWN_MS - sinceLast) / 1000),
          });
        }
        return latest?.status === WaiterCallStatus.OPEN
          ? scope.repeat(latest.id, at)
          : scope.create(table.cafeId, at);
      });

      events.publish(table.cafeId, { type: "waiterCall.called", call: toWaiterCall(call) });
      return { cooldownSeconds: WAITER_CALL_COOLDOWN_SECONDS };
    },

    async listOpen(cafeId: string): Promise<WaiterCall[]> {
      return (await calls.listOpen(cafeId)).map(toWaiterCall);
    },

    /** Staff acknowledged the call. Resolving an already-resolved call is a no-op. */
    async resolve(cafeId: string, callId: string): Promise<void> {
      if (await calls.resolve(cafeId, callId, now())) {
        events.publish(cafeId, { type: "waiterCall.resolved", callId });
        return;
      }
      if (!(await calls.exists(cafeId, callId))) throw notFound("Waiter call");
    },
  };
}

export type WaiterCallsService = ReturnType<typeof createWaiterCallsService>;
