import axios from "axios";

// Account-scoped curator drafts (backend /api/account/drafts). All calls are
// same-origin and session-authenticated; the axios CSRF interceptor adds the
// X-CSRF-Token header on mutations. Draft state is stored server-side as-is;
// it is never publish-validated, so arbitrarily incomplete drafts save fine.

export const listServerDrafts = () =>
  axios.get("/api/account/drafts").then((res) => res.data.drafts || []);

export const fetchServerDraft = (id) =>
  axios
    .get(`/api/account/drafts/${encodeURIComponent(id)}`)
    .then((res) => res.data);

export const createServerDraft = (state, title) =>
  axios
    .post("/api/account/drafts", { state, ...(title ? { title } : {}) })
    .then((res) => res.data);

export const updateServerDraft = (id, payload) =>
  axios
    .put(`/api/account/drafts/${encodeURIComponent(id)}`, payload)
    .then((res) => res.data);

export const deleteServerDraft = (id) =>
  axios
    .delete(`/api/account/drafts/${encodeURIComponent(id)}`)
    .then((res) => res.data);

// Update the active draft when one is loaded, otherwise create a new one.
// Resolves to the saved draft document so callers can keep id/title in sync.
export const saveServerDraft = (activeDraftId, state, title) => {
  if (activeDraftId) {
    return updateServerDraft(activeDraftId, {
      state,
      ...(title ? { title } : {}),
    });
  }
  return createServerDraft(state, title);
};
