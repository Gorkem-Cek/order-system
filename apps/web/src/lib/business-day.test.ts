import { describe, expect, it } from "vitest";
import { addDays, businessDay } from "./business-day";

describe("businessDay", () => {
  it("uses the Istanbul calendar day", () => {
    // 22:30 UTC is already 01:30 the next day in Istanbul (UTC+3).
    expect(businessDay(new Date("2026-11-03T22:30:00Z"))).toBe("2026-11-04");
    expect(businessDay(new Date("2026-11-03T20:59:00Z"))).toBe("2026-11-03");
  });
});

describe("addDays", () => {
  it("moves across months and years", () => {
    expect(addDays("2026-11-04", -1)).toBe("2026-11-03");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-04", -6)).toBe("2026-10-29");
  });
});
