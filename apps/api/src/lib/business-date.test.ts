import { describe, expect, it } from "vitest";
import { businessDate } from "./business-date";

describe("businessDate", () => {
  it("uses the Istanbul calendar day (UTC+3)", () => {
    expect(businessDate(new Date("2026-10-28T12:00:00Z")).toISOString()).toBe(
      "2026-10-28T00:00:00.000Z",
    );
    // 21:30 UTC is already 00:30 the next day in Istanbul.
    expect(businessDate(new Date("2026-10-28T21:30:00Z")).toISOString()).toBe(
      "2026-10-29T00:00:00.000Z",
    );
    expect(businessDate(new Date("2026-10-28T20:59:59Z")).toISOString()).toBe(
      "2026-10-28T00:00:00.000Z",
    );
  });
});
