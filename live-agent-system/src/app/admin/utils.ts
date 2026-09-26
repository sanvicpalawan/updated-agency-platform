export type Period = "24h" | "7d" | "30d";
export const PERIODS: Record<Period, { label: string; milliseconds: number }> = {
  "24h": { label: "Last 24 hours", milliseconds: 86_400_000 },
  "7d": { label: "Last 7 days", milliseconds: 7 * 86_400_000 },
  "30d": { label: "Last 30 days", milliseconds: 30 * 86_400_000 },
};
export const number = (n: number) => n.toLocaleString("en-US");
export const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
export const shortDate = (date: string) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const clock = (date: string) => new Date(date).toLocaleTimeString("en-GB", { hour12: false });
export const fullDate = (date: string) => new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
export function relative(date: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
export function inPeriod(date: string, period: Period, previous = false): boolean {
  const age = Date.now() - new Date(date).getTime();
  const duration = PERIODS[period].milliseconds;
  return previous ? age >= duration && age < duration * 2 : age >= 0 && age < duration;
}
export function contrast(color: string): string {
  const rgb = color.replace("#", "");
  const r = parseInt(rgb.slice(0, 2), 16), g = parseInt(rgb.slice(2, 4), 16), b = parseInt(rgb.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#172014" : "#ffffff";
}
export function download(content: string, filename: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(rows: unknown[][]): string {
  return rows.map((row) => row.map((cell) => {
    let text = String(cell ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "The action could not be completed. Please try again.";