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
