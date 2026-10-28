import { describe, expect, it } from "vitest";
import { brandStyle, contrastText } from "./color";

describe("contrastText", () => {
  it("uses white on dark colours and dark text on light ones", () => {
    expect(contrastText("#7c4a2d")).toBe("#ffffff");
    expect(contrastText("#000000")).toBe("#ffffff");
    expect(contrastText("#ffd54f")).toBe("#1f1a17");
    expect(contrastText("#ffffff")).toBe("#1f1a17");
  });
});

describe("brandStyle", () => {
  it("sets the brand variables for a valid colour", () => {
    expect(brandStyle("#1D4ED8")).toEqual({ "--brand": "#1D4ED8", "--brand-contrast": "#ffffff" });
  });

  it("ignores anything that isn't #rrggbb", () => {
    expect(brandStyle("red; background: url(x)")).toEqual({});
    expect(brandStyle("#fff")).toEqual({});
  });
});
