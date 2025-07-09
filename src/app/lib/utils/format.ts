/**
 * Formats a number as currency in USD.
 * @param amount - The amount to format in cents
 * @returns A formatted string with the currency symbol and proper decimal places
 */
export function formatCurrency(amount: number): string {
  const dollars = amount / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDistanceToNowLocal(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  // Convert to local timezone by creating a new date with the same timestamp
  // This ensures the relative time calculation is done from the user's local time
  const now = new Date();
  const localDate = new Date(d.getTime());

  // Calculate the difference in milliseconds
  const diffInMs = now.getTime() - localDate.getTime();

  // Convert to different units
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  // Format the relative time
  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'}`;
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'}`;
  } else if (diffInDays < 30) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'}`;
  } else {
    // For longer periods, use a more readable format
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
      return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'}`;
    } else {
      const diffInYears = Math.floor(diffInMonths / 12);
      return `${diffInYears} year${diffInYears === 1 ? '' : 's'}`;
    }
  }
}
