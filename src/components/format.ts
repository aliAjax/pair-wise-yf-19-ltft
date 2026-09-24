/** ISO 时间 -> 本地可读时间 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** 当前本地时间的 datetime-local 输入框默认值 */
export function nowLocalInput(): string {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** datetime-local 值 -> ISO；无法解析时回退当前时间 */
export function toISO(localInput: string): string {
  if (!localInput) return new Date().toISOString();
  const date = new Date(localInput);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
