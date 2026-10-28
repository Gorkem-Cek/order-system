import { describe, expect, it } from "vitest";
import { formatKurus } from "./money";

describe("formatKurus", () => {
  it("formats kuruş as Turkish lira", () => {
    expect(formatKurus(1250)).toBe("₺12,50");
    expect(formatKurus(125000)).toBe("₺1.250,00");
    expect(formatKurus(0)).toBe("₺0,00");
  });

  it("rejects non-integer amounts", () => {
    expect(() => formatKurus(12.5)).toThrow(TypeError);
  });
});
