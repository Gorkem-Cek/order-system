import {
  STAFF_EVENT_TYPES,
  STAFF_EVENTS_READY,
  staffEventSchema,
  type Order,
  type WaiterCall,
} from "@siparis/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useState } from "react";
import { activeOrdersKey, applyOrder } from "../orders/useOrders";
import { applyCall, removeCall, waiterCallsKey } from "../waiter-calls/useWaiterCalls";
import { useStaff } from "./staff-context";

export type StreamStatus = "connecting" | "live" | "reconnecting";

type Handlers = {
  onOrderCreated: (order: Order) => void;
  onWaiterCalled: (call: WaiterCall) => void;
};

/**
 * Subscribes to the café's live staff stream and keeps the board's caches up to date. After
 * every (re)connect the lists are refetched, so nothing that happened while offline is missed.
 */
export function useStaffStream(handlers: Handlers): StreamStatus {
  const { cafe, cafeQuery } = useStaff();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const onOrderCreated = useEffectEvent(handlers.onOrderCreated);
  const onWaiterCalled = useEffectEvent(handlers.onWaiterCalled);

  useEffect(() => {
    const source = new EventSource(`/api/staff/events${cafeQuery}`);

    source.addEventListener(STAFF_EVENTS_READY, () => {
      setStatus("live");
      void queryClient.invalidateQueries({ queryKey: activeOrdersKey(cafe.id) });
      void queryClient.invalidateQueries({ queryKey: waiterCallsKey(cafe.id) });
    });

    const onMessage = (message: MessageEvent<string>) => {
      const parsed = staffEventSchema.safeParse(JSON.parse(message.data));
      if (!parsed.success) return;
      const event = parsed.data;
      switch (event.type) {
        case "order.created":
          applyOrder(queryClient, cafe.id, event.order);
          onOrderCreated(event.order);
          break;
        case "order.updated":
          applyOrder(queryClient, cafe.id, event.order);
          break;
        case "waiterCall.called":
          applyCall(queryClient, cafe.id, event.call);
          onWaiterCalled(event.call);
          break;
        case "waiterCall.resolved":
          removeCall(queryClient, cafe.id, event.callId);
          break;
      }
    };
    for (const type of STAFF_EVENT_TYPES) source.addEventListener(type, onMessage);
    // EventSource reconnects by itself; this only updates the indicator.
    source.onerror = () => setStatus("reconnecting");

    return () => source.close();
  }, [cafe.id, cafeQuery, queryClient]);

  return status;
}
