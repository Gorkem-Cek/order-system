import { describe, expect, it } from "vitest";
import { formatCardNumber, formatCvc, formatExpiry } from "./card-format";

describe("formatCardNumber", () => {
  it("groups digits in fours and drops everything else", () => {
    expect(formatCardNumber("4242424242424242")).toBe("4242 4242 4242 4242");
    expect(formatCardNumber("4242-42a4")).toBe("4242 424");
    expect(formatCardNumber("1".repeat(25))).toBe("1111 1111 1111 1111 111");
  });
});

describe("formatExpiry", () => {
  it("inserts the slash after the month", () => {
    expect(formatExpiry("12")).toBe("12/");
    expect(formatExpiry("1229")).toBe("12/29");
    expect(formatExpiry("12/299")).toBe("12/29");
  });

  it("pads a single-digit month", () => {
    expect(formatExpiry("4")).toBe("04/");
    expect(formatExpiry("1")).toBe("1");
  });

  it("lets backspace remove the slash", () => {
    expect(formatExpiry("12", "12/")).toBe("12");
  });
});

describe("formatCvc", () => {
  it("keeps up to 4 digits", () => {
    expect(formatCvc("12a34 5")).toBe("1234");
  });
});
