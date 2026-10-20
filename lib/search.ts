/**
 * Search helpers for the directory pages.
 *
 * User input goes straight into a PostgREST `ilike` pattern, so strip the
 * characters PostgREST reads as syntax (comma/parens separate filters,
 * `*`, `%` and `_` are wildcards, quotes end a token).
 */
export function sanitizeQuery(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .replace(/[%,_()"'*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Wrap a sanitized query for an ilike filter. */
export function likePattern(query: string): string {
  return `%${query}%`;
}
