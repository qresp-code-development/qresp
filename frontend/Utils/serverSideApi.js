// SERVER-SIDE ONLY: which base URL should getServerSideProps use for /api
// fetches?
//
// Pages receive a public `server` query param (e.g. the staging origin
// https://localhost:8443 or a federated Qresp node). Inside the Docker gui
// container that public origin is NOT reachable for local/same-origin
// targets — "localhost" is the gui container itself, not the host tunnel or
// nginx. Such targets are therefore rewritten to the internal backend URL
// from QRESP_INTERNAL_API_URL (e.g. http://backend:5000, compose service
// name). External federation nodes keep being fetched directly, unchanged.
//
// The env var is intentionally NOT NEXT_PUBLIC_*: it never reaches the
// browser, and the public `server` value components render with is not
// touched by this helper.

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const stripTrailingSlash = (value) => value.replace(/\/+$/, "");

const isLocalHostname = (hostname) =>
  LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");

// A parsed http(s) target that is this deployment: a local hostname, or the
// host the request itself arrived on.
const isOwnTarget = (ctx, parsed) => {
  const requestHost = String(
    (ctx &&
      ctx.req &&
      (ctx.req.headers["x-forwarded-host"] || ctx.req.headers.host)) ||
      ""
  ).toLowerCase();
  const sameAsRequest =
    requestHost.length > 0 && parsed.host.toLowerCase() === requestHost;
  return isLocalHostname(parsed.hostname.toLowerCase()) || sameAsRequest;
};

const resolveServerSideApiBase = (ctx, serverParam) => {
  const internal =
    stripTrailingSlash((process.env.QRESP_INTERNAL_API_URL || "").trim()) ||
    null;

  const raw = (serverParam || "").trim();
  if (!raw) {
    // No server given: prefer the internal backend; otherwise null keeps the
    // page's existing catch/error path (same net behavior as before).
    return internal;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (err) {
    // Unparseable input is never used as a fetch target.
    return internal;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    // No ftp:, file:, javascript: or other schemes, ever.
    return internal;
  }

  if (isOwnTarget(ctx, parsed)) {
    // Same-origin / local target: not reachable from inside the container.
    // Without the env var configured, fall back to the original behavior.
    return internal || stripTrailingSlash(raw);
  }

  // External federation node: use it as-is.
  return stripTrailingSlash(raw);
};

/**
 * SERVER-SIDE ONLY: request headers that carry the reader's session to the
 * fetch target chosen by `resolveServerSideApiBase`.
 *
 * Private records are readable only by the accounts they are shared with, so
 * a server-side fetch of one must present the reader's own session cookie.
 * The cookie is forwarded ONLY when the target is this deployment's own
 * backend (the same cases `resolveServerSideApiBase` rewrites to the
 * internal URL); an external federation node never receives it.
 */
const sessionHeadersFor = (ctx, serverParam) => {
  const cookie = ctx && ctx.req && ctx.req.headers && ctx.req.headers.cookie;
  if (!cookie) return {};
  const raw = (serverParam || "").trim();
  if (!raw) return { cookie };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (err) {
    return { cookie };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { cookie };
  }
  return isOwnTarget(ctx, parsed) ? { cookie } : {};
};

/**
 * SERVER-SIDE ONLY: the public origin this request arrived on, e.g.
 * "https://localhost:8443".
 *
 * `getServerSideProps` runs before any browser code, so `window.location`
 * does not exist there -- which is why the Explorer's default redirect used
 * to be built from the federation registry alone and could never include the
 * node the reader was actually on.
 *
 * Reads the same headers `resolveServerSideApiBase` already trusts. They are
 * settable by a proxy, and that is the point: nginx is what knows the public
 * origin. A forged value cannot do much here -- the only use is deciding
 * whether to add a SAME-ORIGIN node to a search list, and
 * `buildQrespServerList` adds one only when the origin is local, so a forged
 * remote host adds nothing and a forged local one names the reader's own
 * machine.
 *
 * Returns "" when the host header is missing, which callers treat as "no
 * origin to add" rather than guessing one.
 */
const requestOrigin = (ctx) => {
  const headers = (ctx && ctx.req && ctx.req.headers) || {};
  const host = String(
    headers["x-forwarded-host"] || headers.host || ""
  ).trim();
  if (!host) return "";
  // A proxy may send a list; the first entry is the client-facing one.
  const forwardedProto = String(headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const socket = (ctx && ctx.req && (ctx.req.socket || ctx.req.connection)) || {};
  const proto =
    forwardedProto || (socket.encrypted ? "https" : "http");
  return stripTrailingSlash(`${proto}://${host}`);
};

export { resolveServerSideApiBase, requestOrigin, sessionHeadersFor };
