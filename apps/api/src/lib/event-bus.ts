import type { StaffEvent } from "@siparis/shared";

type Listener = (event: StaffEvent) => void;

/**
 * In-process pub/sub of staff events per café. Fine for a single API instance; running
 * several instances would need a shared channel (e.g. Postgres LISTEN/NOTIFY) behind the
 * same interface.
 */
export function createEventBus() {
  const listeners = new Map<string, Set<Listener>>();

  return {
    publish(cafeId: string, event: StaffEvent): void {
      for (const listener of listeners.get(cafeId) ?? []) {
        try {
          listener(event);
        } catch {
          // One broken subscriber must not stop the others.
        }
      }
    },

    /** Returns a function that unsubscribes. */
    subscribe(cafeId: string, listener: Listener): () => void {
      let set = listeners.get(cafeId);
      if (!set) listeners.set(cafeId, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(cafeId);
      };
    },

    subscriberCount(cafeId: string): number {
      return listeners.get(cafeId)?.size ?? 0;
    },
  };
}

export type EventBus = ReturnType<typeof createEventBus>;
