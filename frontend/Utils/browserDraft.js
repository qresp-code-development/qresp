import WebStore from "./Persist";

const CURATOR_DRAFT_KEY = "state";

const getBrowserDraft = () => WebStore.get(CURATOR_DRAFT_KEY);

const saveBrowserDraft = (draft) => {
  if (!draft || typeof draft !== "object") return false;
  WebStore.set(CURATOR_DRAFT_KEY, draft);
  return true;
};

const clearBrowserDraft = () => WebStore.remove(CURATOR_DRAFT_KEY);

const hasBrowserDraft = () => Boolean(getBrowserDraft());

const summarizeBrowserDraft = (draft = getBrowserDraft()) => {
  if (!draft || typeof draft !== "object") return null;
  const title =
    (draft.referenceInfo && draft.referenceInfo.title) ||
    // A short-lived intermediate draft shape stored the primary title under
    // publicationInfo; keep reading it as a fallback.
    (draft.publicationInfo && draft.publicationInfo.title) ||
    (draft.paperInfo &&
      draft.paperInfo.tags &&
      draft.paperInfo.tags.join(", ")) ||
    "";
  const sections = [
    draft.charts && draft.charts.length > 0 ? "charts" : null,
    draft.datasets && draft.datasets.length > 0 ? "datasets" : null,
    draft.tools && draft.tools.length > 0 ? "tools" : null,
    draft.scripts && draft.scripts.length > 0 ? "scripts" : null,
  ].filter(Boolean);
  const hasContent =
    title.length > 0 ||
    sections.length > 0 ||
    (draft.curatorInfo &&
      (draft.curatorInfo.firstName || draft.curatorInfo.emailId));
  if (!hasContent) return null;
  return { title: title || "Untitled draft", sections };
};

export {
  CURATOR_DRAFT_KEY,
  clearBrowserDraft,
  getBrowserDraft,
  hasBrowserDraft,
  saveBrowserDraft,
  summarizeBrowserDraft,
};
