import type { StaffEvent } from "@siparis/shared";
import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "./event-bus";

const event = { type: "order.created", order: {} } as StaffEvent;

describe("event bus", () => {
  it("delivers events only to subscribers of that café", () => {
    const bus = createEventBus();
    const mine = vi.fn();
    const theirs = vi.fn();
    bus.subscribe("cafe-a", mine);
    bus.subscribe("cafe-b", theirs);

    bus.publish("cafe-a", event);
    expect(mine).toHaveBeenCalledWith(event);
    expect(theirs).not.toHaveBeenCalled();
  });

  it("stops delivering after unsubscribe", () => {
    const bus = createEventBus();
    const listener = vi.fn();
    const unsubscribe = bus.subscribe("cafe-a", listener);
    unsubscribe();
    bus.publish("cafe-a", event);
    expect(listener).not.toHaveBeenCalled();
    expect(bus.subscriberCount("cafe-a")).toBe(0);
  });

  it("keeps delivering when one subscriber throws", () => {
    const bus = createEventBus();
    const healthy = vi.fn();
    bus.subscribe("cafe-a", () => {
      throw new Error("broken");
    });
    bus.subscribe("cafe-a", healthy);
    bus.publish("cafe-a", event);
    expect(healthy).toHaveBeenCalled();
  });
});
