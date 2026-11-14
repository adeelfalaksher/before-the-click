export function authDestination(value: string | null): string {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u0020\u007f]/.test(value)) return "/console";
  const base = "https://before-the-click.invalid";
  const url = new URL(value, base);
  if (url.origin !== base || !["/console", "/join", "/auth/reset"].includes(url.pathname)) return "/console";
  return url.pathname + url.search;
}
