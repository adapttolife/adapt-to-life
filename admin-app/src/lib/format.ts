// Formatting lives in one place so a number never renders two ways on two
// pages — the fastest way to make a console feel untrustworthy.

export const money = (n: number) =>
  "$" + Math.round(n || 0).toLocaleString("en-US");

export const count = (n: number) => (n || 0).toLocaleString("en-US");

export function ago(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const plural = (n: number, word: string) =>
  `${count(n)} ${word}${n === 1 ? "" : "s"}`;
