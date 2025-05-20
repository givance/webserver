/**
 * Formats a number as currency in USD.
 * @param amount - The amount to format in cents
 * @returns A formatted string with the currency symbol and proper decimal places
 */
export function formatCurrency(amount: number): string {
  const dollars = amount / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(dollars);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
