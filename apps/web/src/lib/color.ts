const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** CSS variables for a café's brand colour, or none if the value isn't a #rrggbb colour. */
export function brandStyle(color: string): Record<string, string> {
  if (!HEX_COLOR.test(color)) return {};
  return { "--brand": color, "--brand-contrast": contrastText(color) };
}

/** Black or white text, whichever reads better on the given background (WCAG luminance). */
export function contrastText(hex: string): string {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.4 ? "#1f1a17" : "#ffffff";
}
