/** Format helpers for HTML date inputs — local time, never UTC-shifted. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Value for `<input type="datetime-local">`. */
export function toLocalDatetimeValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Value for `<input type="date">` / `?week=` params. */
export function toLocalDateValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
