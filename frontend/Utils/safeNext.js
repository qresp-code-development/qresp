// Post-login redirect targets, client side. Mirrors the backend's
// _safe_next_path: same-origin PATHS only — never a scheme, a host, a
// protocol-relative //, or a backslash trick — so a crafted link can never
// turn sign-in into an open redirect. The backend validates again on its own;
// this keeps the browser from even offering a bad target.
const safeNext = (value, fallback = "/") => {
  if (!value || typeof value !== "string") {
    return fallback;
  }
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("://")
  ) {
    return fallback;
  }
  return value;
};

// The provider entry points. Both are plain full-page navigations: the
// backend redirects to the identity provider and back to `next`.
export const providerHref = (provider, next) =>
  `/api/auth/${provider}?next=${encodeURIComponent(safeNext(next))}`;

export const loginHref = (next) =>
  `/login?next=${encodeURIComponent(safeNext(next))}`;

export default safeNext;
