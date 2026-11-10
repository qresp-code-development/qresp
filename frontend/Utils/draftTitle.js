// What a draft is called. Kept apart from serverDrafts (network calls) so the
// rules are the same everywhere, including where the network is mocked.

/** Titles compared the way a person reads them: case and spacing ignored. */
export const sameDraftTitle = (a, b) =>
  String(a || "").replace(/\s+/g, " ").trim().toLowerCase() ===
  String(b || "").replace(/\s+/g, " ").trim().toLowerCase();

/** True when a title is a real name, not the "Untitled draft" placeholder. */
export const isNamedDraftTitle = (title) =>
  Boolean(String(title || "").trim()) && !sameDraftTitle(title, "Untitled draft");
