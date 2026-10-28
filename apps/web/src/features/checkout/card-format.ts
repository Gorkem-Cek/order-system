/** "4242424242424242" → "4242 4242 4242 4242" (max 19 digits). */
export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** "1229" → "12/29"; a leading single digit above 1 becomes a month: "4" → "04/". */
export function formatExpiry(value: string, previous = ""): string {
  let digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 1 && Number(digits) > 1) digits = `0${digits}`;
  // Let backspace remove the slash instead of re-adding it.
  const deleting = value.length < previous.length;
  if (digits.length >= 2 && !(deleting && digits.length === 2)) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return digits;
}

export function formatCvc(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}
