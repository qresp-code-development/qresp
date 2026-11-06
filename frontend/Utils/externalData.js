// External data nodes: what may be stored, and what a reader is shown.
//
// An external node is a REFERENCE to data that lives somewhere else. Qresp
// does not hold the files, cannot check them, and must never present one as
// if it were a local Dataset. It is persisted as a `heads` record and there is
// no second model for it.

const HTTPS = /^https:\/\//i;

/**
 * Why a URL list cannot be saved, or "" if it can.
 *
 * HTTPS is required only for a URL that is NEW or CHANGED.
 *
 * That asymmetry is the whole point. A record written years ago may hold an
 * `http://` link, or none at all, and those records are still valid --
 * refusing to let a curator fix the LABEL of one because of a URL somebody
 * else typed long ago would make old records uneditable, which is a worse
 * outcome than an old link staying as it is. What a curator types TODAY is
 * held to today's rule.
 */
export const changedUrlProblem = (next, previous = []) => {
  const before = new Set((previous || []).map((url) => String(url).trim()));
  const offending = (next || [])
    .map((url) => String(url).trim())
    .filter(Boolean)
    .filter((url) => !before.has(url))
    .filter((url) => !HTTPS.test(url));
  if (!offending.length) return "";
  return (
    `Use an https:// link for external data. This one is not secure: ${offending[0]}`
  );
};

/**
 * The one-line note shown under an external node.
 *
 * Kept SHORT on purpose -- a node is a label on a graph, not a place to read a
 * description -- and never allowed to carry something that looks like a local
 * path or a credential. A `readme` is curator-written prose, so this only
 * trims and truncates it; it does not go looking for secrets, because a
 * blocklist that missed one would be worse than not implying there is a check.
 */
export const noteFor = (head, limit = 120) => {
  const text = String((head && head.readme) || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
};

/**
 * The URL shown on an external node, or "" when there is nothing safe to show.
 *
 * ONLY http(s) is displayed as a link target. A stored value that is a local
 * path, a file: URL, or anything else is not rendered -- Qresp would be
 * publishing a path from somebody's machine, which is not a reference anybody
 * else can follow and may say more about the curator's filesystem than they
 * intended.
 */
export const displayUrl = (head) => {
  const first = ((head && head.URLs) || [])
    .map((url) => String(url || "").trim())
    .filter(Boolean)[0];
  if (!first) return "";
  try {
    const parsed = new URL(first);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "";
    return first;
  } catch (e) {
    // Not a URL at all -- a bare path, most likely. Never shown.
    return "";
  }
};

/** What an external node is CALLED: its label, else its note, else its id. */
export const externalLabel = (head, id) => {
  const label = String((head && head.label) || "").trim();
  if (label) return label;
  const note = noteFor(head, 48);
  if (note) return note;
  return `External data (${id})`;
};
