// Shared frontend helpers

// Convex HTTP actions are served on the .convex.site domain,
// not on the .convex.cloud client API domain.
export function convexSiteUrl(): string {
  const url = import.meta.env.VITE_CONVEX_URL || "https://quick-ox-60.eu-west-1.convex.cloud";
  return url.replace(".convex.cloud", ".convex.site");
}

export function money(v: number): string {
  return `€ ${(v || 0).toFixed(2).replace(".", ",")}`;
}

// Parse dates stored as DD.MM.YYYY (de-AT) or YYYY-MM-DD
export function parseAppDate(s: string): Date | null {
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
