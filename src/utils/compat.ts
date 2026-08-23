/** Compatibility helpers kept deliberately within the iOS 12 JavaScript baseline. */
export function clonePlainData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function recordFromPairs<T>(pairs: ReadonlyArray<readonly [string, T]>): Record<string, T> {
  return pairs.reduce<Record<string, T>>((record, [key, value]) => {
    record[key] = value;
    return record;
  }, {});
}

const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDateForDisplay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getDate()} ${shortMonths[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateTimeForDisplay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const hour = date.getHours();
  const minutes = date.getMinutes() < 10 ? `0${date.getMinutes()}` : String(date.getMinutes());
  return `${formatDateForDisplay(date)}, ${hour % 12 || 12}:${minutes} ${hour < 12 ? "am" : "pm"}`;
}
