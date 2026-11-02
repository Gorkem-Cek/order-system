import { describe, expect, it } from "vitest";
import { formatKurus, kurusToInput, parseLiraInput } from "./money";

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

describe("kurusToInput", () => {
  it("drops zero decimals and keeps the rest", () => {
    expect(kurusToInput(4000)).toBe("40");
    expect(kurusToInput(12050)).toBe("120,50");
    expect(kurusToInput(12005)).toBe("120,05");
    expect(kurusToInput(0)).toBe("0");
  });
});

describe("parseLiraInput", () => {
  it.each([
    ["120", 12000],
    ["120,5", 12050],
    ["120,50", 12050],
    ["1.250,00", 125000],
    ["1.250", 125000],
    ["120.50", 12050],
    ["120.5", 12050],
    [" ₺ 45 ", 4500],
    ["45 TL", 4500],
    ["0", 0],
    ["0,05", 5],
  ])("parses %s", (input, kurus) => {
    expect(parseLiraInput(input)).toBe(kurus);
  });

  it.each(["", "abc", "12,345", "-5", "1,2,3", "12.3.4"])("rejects %s", (input) => {
    expect(parseLiraInput(input)).toBeNull();
  });

  it("round-trips with kurusToInput", () => {
    for (const kurus of [0, 5, 4000, 12050, 125000]) {
      expect(parseLiraInput(kurusToInput(kurus))).toBe(kurus);
    }
  });
});
