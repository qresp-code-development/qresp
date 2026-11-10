// Building a browsable URL from the paper's file-server path plus a stored
// relative path.
//
// This used to be `server + "/" + imageFile` at four call sites, which broke
// in three ways:
//   * the file server path is EMPTY until "Save File Server" is pressed, so
//     a chart applied from folder analysis produced "/figures/x.png" — a
//     path on the Qresp origin, which silently 404s as a blank image;
//   * manually picked paths arrive with a leading slash (Scraper.node strips
//     the server prefix and leaves one) while analyzed paths do not, so the
//     result was inconsistent — ".../DOI//figures/x.png";
//   * spaces and other URL-significant characters in real folder names were
//     never encoded.
//
// Returns "" when it cannot build a real absolute URL, so callers can render
// an explicit fallback instead of a broken <img>.

const trimSlashes = (value) => String(value || "").replace(/^\/+|\/+$/g, "");

// A stored path is a RELATIVE POSIX path inside the paper's folder. Anything
// that could escape it, or point somewhere else entirely, is refused rather
// than pasted onto the root and sent to a server.
const REJECTED = /(^[a-z][a-z0-9+.-]*:)|\\/i;

export const isSafeRelativePath = (relative) => {
  const path = String(relative || "");
  if (!path.trim()) return false;
  if (REJECTED.test(path)) return false;
  return !trimSlashes(path)
    .split("/")
    .some((segment) => segment === "..");
};

export const buildFileUrl = (base, relative) => {
  const root = String(base || "").replace(/\/+$/, "");
  const path = trimSlashes(relative);
  if (!root || !path || !isSafeRelativePath(relative)) {
    return "";
  }
  // Encode each SEGMENT, so separators survive but spaces, #, ? and friends
  // inside a name do not break the URL.
  const encoded = path
    .split("/")
    .map((segment) => {
      try {
        // Leave an already-encoded segment alone rather than double-encoding.
        return decodeURIComponent(segment) === segment
          ? encodeURIComponent(segment)
          : segment;
      } catch (err) {
        return encodeURIComponent(segment);
      }
    })
    .join("/");
  return `${root}/${encoded}`;
};

/**
 * Would this URL be blocked by the browser before the network is touched?
 *
 * An `https://` Qresp page may not load an `http://` sub-resource: the browser
 * refuses it as mixed content, the `<img>` fires `onerror`, and the failure is
 * indistinguishable from a 404 or an untrusted certificate from inside the
 * page. It is NOT indistinguishable to a reader, though, because the fix is a
 * different one: the file server's saved URL needs `https`, and no amount of
 * trusting a certificate or checking the file exists will help.
 *
 * Returns false when it cannot tell (no `window`, an unparseable URL), so a
 * caller falls back to the general message rather than asserting a cause it
 * has not established.
 *
 * `pageUrl` defaults to the current page and exists so this can be reasoned
 * about — and tested — without reaching for a global that jsdom will not let
 * anyone redefine.
 */
export const isMixedContent = (url, pageUrl) => {
  const page =
    pageUrl ||
    (typeof window !== "undefined" && window.location
      ? window.location.href
      : "");
  if (!page) return false;
  try {
    if (new URL(page).protocol !== "https:") return false;
    return new URL(url, page).protocol === "http:";
  } catch (err) {
    return false;
  }
};

// The containing directory of a stored file, as a browsable URL.
export const buildDirectoryUrl = (base, relative) => {
  const path = trimSlashes(relative);
  const cut = path.lastIndexOf("/");
  return buildFileUrl(base, cut === -1 ? "" : path.slice(0, cut));
};

// A file in a GitHub or GitLab repository links to its page there
// (.../blob/<commit>/path), which is right for a script but is an HTML page,
// not the image, so a figure is drawn from the host's raw file instead.
export const rawFileUrl = (url) =>
  String(url || "")
    .replace(/^https:\/\/(?:www\.)?github\.com\/([^/]+\/[^/]+)\/blob\//i, "https://raw.githubusercontent.com/$1/")
    .replace(/^(https:\/\/(?:www\.)?gitlab\.com\/.+?)\/-\/blob\//i, "$1/-/raw/");

// The URL to DRAW a stored image from (see rawFileUrl).
export const buildImageUrl = (base, relative) => rawFileUrl(buildFileUrl(base, relative));

// Browsers cannot draw a PDF in an <img>; PDF figures need the PDF viewer.
export const isPdfFile = (path) =>
  /\.pdf$/i.test(String(path || "").split(/[?#]/)[0]);

export default buildFileUrl;
