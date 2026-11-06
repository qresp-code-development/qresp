import { useReducer, useCallback, useEffect, useRef, useState } from "react";
import CuratorReducer from "./curatorReducer";
import CuratorContext from "./curatorContext";

import WebStore from "../../Utils/Persist";
import { summarizeBrowserDraft } from "../../Utils/browserDraft";
import { codeHostOf, workTypeOf } from "../../Utils/workTypes";
import { listServerDrafts, saveServerDraft } from "../../Utils/serverDrafts";
import { isNamedDraftTitle, sameDraftTitle as sameTitle } from "../../Utils/draftTitle";
import { collapseAllSections } from "../../Utils/sectionCollapse";

import {
  SET_CURATOR_STATE,
  SET_CURATORINFO,
  SET_FILESERVERPATH,
  SET_PAPERINFO,
  SET_REFERENCE_AUTHORS,
  SET_REFERENCEINFO,
  SET_DOCUMENTATION,
  SET_LICENSE,
  SET_WORK_TYPE,
  SET_CODE_HOST,
  SET,
  ADD,
  ADD_MANY,
  ADD_AND_LINK,
  IMPORT_BUNDLE,
  EDIT,
  DELETE,
  ADD_EDGE,
  DELETE_EDGE,
  UNLINK,
  SET_NODES,
  SET_EDGES,
} from "../types";

const CuratorState = (props) => {
  const draftKey = props.draftKey === undefined ? "state" : props.draftKey;
  const firstPersist = useRef(true);
  const autoResumeAttempted = useRef(false);
  const preserveDraftOnNextReset = useRef(false);

  // Server drafts: id of the account draft this form was loaded from (saves
  // update it instead of creating duplicates), a dirty flag for the
  // navigation guard, and a version counter that remounts the form tree on
  // reset so uncontrolled RHF inputs actually blank.
  const [activeDraftId, setActiveDraftIdState] = useState(null);
  const [activeDraftTitle, setActiveDraftTitleState] = useState("");
  // The account draft this form is, read synchronously by saves (a second
  // save started before a re-render must still see the id the first one
  // got) and kept with the browser copy of the form, so a reload or a trip
  // to another page keeps overwriting the same draft instead of starting a
  // copy.
  const activeDraft = useRef({ id: null, title: "" });
  const activeDraftKey = draftKey ? `${draftKey}:activeDraft` : null;
  const persistActiveDraft = () => {
    if (!activeDraftKey) return;
    try {
      if (activeDraft.current.id) WebStore.set(activeDraftKey, activeDraft.current);
      else WebStore.remove(activeDraftKey);
    } catch (e) {
      // Storage unavailable: still tracked for this page.
    }
  };
  const setActiveDraftId = (id) => {
    activeDraft.current = { ...activeDraft.current, id: id || null };
    setActiveDraftIdState(id || null);
    persistActiveDraft();
  };
  const setActiveDraftTitle = (title) => {
    activeDraft.current = { ...activeDraft.current, title: title || "" };
    setActiveDraftTitleState(title || "");
    persistActiveDraft();
  };
  // Saves run one after another, never side by side.
  const saveQueue = useRef(Promise.resolve());
  // LIVE mirror of the publication form's currently TYPED title/abstract
  // (reported via react-hook-form watch, before the section is saved). This
  // is an availability SIGNAL only — never a second source of truth: the
  // canonical bibliography stays referenceInfo, and snapshots for
  // saving/importing/AI still go through collectDraftState's flushers.
  // The manuscript source the curator picked (.tex/.zip/.pdf), held as a
  // RUNTIME-ONLY File handle for this page session. Deliberately NOT part of
  // `state`: it is never normalized, never serialized into a browser or
  // account draft, and never persisted anywhere — it exists so the AI
  // keyword assist can re-read the file after explicit consent.
  const [draftDirty, setDraftDirty] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  // Bumped only when the form starts over or another record/draft replaces
  // it -- never by remountForms -- so guided-setup progress and messages are
  // cleared exactly then.
  const [freshVersion, setFreshVersion] = useState(0);
  // Bumped whenever a stored draft is loaded into the form (an account
  // draft, the browser copy, or the way back from the preview). Sections use
  // it to treat complete, loaded content as saved rather than unsaved.
  const [loadVersion, setLoadVersion] = useState(0);
  // Runtime-only RCC analysis. It is deliberately outside `state`, so it is
  // never serialized into browser/account drafts, metadata exports or a
  // publish payload. Artifact sections share it to avoid crawling the same
  // saved folder once per Chart/Dataset/Script/Tool dialog.
  const [rccAnalysisCache, setRccAnalysisCache] = useState({
    path: "",
    data: null,
  });
  const firstDirtyCheck = useRef(true);
  const skipNextDirty = useRef(false);
  const stateRef = useRef(null);
  const draftFlushers = useRef(new Map());

  const initialState = {
    curatorInfo: {
      firstName: "",
      middleName: "",
      lastName: "",
      emailId: "",
      affiliation: "",
    },
    fileServerPath: "",
    paperInfo: {
      PIs: "",
      collections: [],
      tags: [],
      notebookFile: "",
      notebookPath: "",
      // Optional, record-level -- see project.models.Paper.institution on
      // the backend. Never inferred from PIs, collections or anything else
      // already in this state; a blank string publishes as "no institution".
      institution: "",
    },
    // The PRIMARY paper's bibliography ("Publication Information for This
    // Paper") — the ONE canonical source that publishes as the record's
    // `reference` block (driving search/details/publish/dedup). A Qresp
    // record is one paper; there is no separate cited-works model.
    referenceInfo: {
      kind: "",
      doi: "",
      authors: "",
      title: "",
      publication: "",
      year: null,
      url: "",
      abstract: "",
    },
    documentation: "",
    charts: [],
    tools: [],
    datasets: [],
    scripts: [],
    heads: [],
    workflow: { nodes: [], edges: [] },
    // A new record starts under CC BY 4.0, the usual choice for open data;
    // the curator can change it in Choose a License.
    license: "cc_by",
    // What is being curated (Utils/workTypes.js). "" until the curator picks
    // one in the "What are you curating?" step a new record opens with.
    workType: "",
    // Where a code repository's code lives (CODE_HOSTS). "" until chosen;
    // the context resolves it from what the record has (codeHostOf).
    codeHost: "",
  };

  const [state, dispatch] = useReducer(CuratorReducer, initialState);

  const clearRccAnalysis = useCallback(() => {
    setRccAnalysisCache({ path: "", data: null });
  }, []);

  const cacheRccAnalysis = useCallback((path, data) => {
    setRccAnalysisCache({ path: path || "", data: data || null });
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    firstPersist.current = true;
    autoResumeAttempted.current = false;
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) {
      return;
    }
    if (firstPersist.current) {
      firstPersist.current = false;
      return;
    }
    if (JSON.stringify(state) === JSON.stringify(initialState)) {
      if (preserveDraftOnNextReset.current) {
        preserveDraftOnNextReset.current = false;
        return;
      }
      WebStore.remove(draftKey);
    } else {
      WebStore.set(draftKey, state);
    }
  }, [state, draftKey]);

  useEffect(() => {
    if (!draftKey || !props.autoResumeDraft || autoResumeAttempted.current) {
      return;
    }
    autoResumeAttempted.current = true;
    const data = WebStore.get(draftKey);
    if (data !== null) {
      setAll(data);
    }
    // Keep tracking the account draft this form came from: the one named
    // on the way back from Preview, else the one stored with the form.
    try {
      const saved = JSON.parse(window.sessionStorage.getItem("qresp:previewReturn") || "null");
      window.sessionStorage.removeItem("qresp:previewReturn");
      const stored = data !== null && activeDraftKey ? WebStore.get(activeDraftKey) : null;
      const pick =
        saved && saved.draftId
          ? { id: saved.draftId, title: saved.draftTitle || "" }
          : stored && typeof stored === "object" && stored.id
          ? stored
          : null;
      if (pick) {
        setActiveDraftId(pick.id);
        setActiveDraftTitle(pick.title || "");
      }
      // Back from the preview (or resuming): the record opens tidy.
      if (data !== null) {
        setLoadVersion((version) => version + 1);
        collapseAllSections();
      }
    } catch (e) {
      // No storage, or nothing saved: resume without an account draft id.
    }
  }, [draftKey, props.autoResumeDraft]);

  useEffect(() => {
    const nextNodes = [
      ...state.charts.map((el) => el.id),
      ...state.scripts.map((el) => el.id),
      ...state.datasets.map((el) => el.id),
      ...state.tools.map((el) => el.id),
      ...state.heads.map((el) => el.id),
    ];
    const currentNodes = state.workflow.nodes || [];
    const nodesChanged =
      nextNodes.length !== currentNodes.length ||
      nextNodes.some((node, index) => node !== currentNodes[index]);
    if (nodesChanged) {
      setNodes(nextNodes);
    }
  }, [
    state.charts,
    state.scripts,
    state.datasets,
    state.tools,
    state.heads,
    state.workflow.nodes,
  ]);

  useEffect(() => {
    if (skipNextDirty.current) {
      skipNextDirty.current = false;
      firstDirtyCheck.current = false;
      return;
    }
    if (firstDirtyCheck.current) {
      firstDirtyCheck.current = false;
      return;
    }
    setDraftDirty(true);
  }, [state]);

  const normalizeState = (data = {}) => ({
    ...initialState,
    ...data,
    curatorInfo: {
      ...initialState.curatorInfo,
      ...(data.curatorInfo || {}),
    },
    paperInfo: {
      ...initialState.paperInfo,
      ...(data.paperInfo || {}),
    },
    // referenceInfo is the canonical primary-paper bibliography. A short-
    // lived intermediate draft shape stored it under `publicationInfo`
    // instead — absorb that back on load (publicationInfo wins when both
    // exist, since that shape treated it as the primary record).
    referenceInfo: {
      ...initialState.referenceInfo,
      ...(data.referenceInfo || {}),
      ...(data.publicationInfo || {}),
    },
    workflow: {
      ...initialState.workflow,
      ...(data.workflow || {}),
    },
    charts: data.charts || initialState.charts,
    tools: data.tools || initialState.tools,
    datasets: data.datasets || initialState.datasets,
    scripts: data.scripts || initialState.scripts,
    heads: data.heads || initialState.heads,
    // A stored draft or record that predates work types is a published
    // paper; only a brand-new form (initialState) is still unchosen.
    workType: workTypeOf(data.workType),
  });

  const setAll = (data) => {
    clearRccAnalysis();
    dispatch({ type: SET_CURATOR_STATE, payload: normalizeState(data) });
  };


  const registerDraftFlusher = useCallback((key, flusher) => {
    if (!key || typeof flusher !== "function") {
      return () => {};
    }
    draftFlushers.current.set(key, flusher);
    return () => {
      if (draftFlushers.current.get(key) === flusher) {
        draftFlushers.current.delete(key);
      }
    };
  }, []);

  const collectDraftState = useCallback(() => {
    let nextState = normalizeState(stateRef.current || state);
    draftFlushers.current.forEach((flusher) => {
      const patch = flusher(nextState);
      if (patch && typeof patch === "object") {
        nextState = normalizeState({ ...nextState, ...patch });
      }
    });
    return nextState;
  }, [state]);

  const getDraftTitle = useCallback(() => {
    const summary = summarizeBrowserDraft(collectDraftState());
    return (
      activeDraft.current.title ||
      activeDraftTitle ||
      (summary && summary.title) ||
      "Untitled draft"
    );
  }, [activeDraftTitle, collectDraftState]);

  const hasMeaningfulDraft = () =>
    Boolean(summarizeBrowserDraft(collectDraftState()));

  const hasUnsavedDraftChanges = useCallback(() => {
    const draftState = collectDraftState();
    if (!summarizeBrowserDraft(draftState)) {
      return false;
    }
    if (draftDirty) {
      return true;
    }
    return (
      JSON.stringify(draftState) !==
      JSON.stringify(normalizeState(stateRef.current || state))
    );
  }, [collectDraftState, draftDirty, state]);

  const saveDraft = () => {
    const draftState = collectDraftState();
    if (!draftKey || !summarizeBrowserDraft(draftState)) {
      return false;
    }
    WebStore.set(draftKey, draftState);
    return true;
  };

  const resetAll = (options = {}) => {
    if (draftKey && options.preserveDraft) {
      saveDraft();
      preserveDraftOnNextReset.current = true;
    } else if (draftKey) {
      WebStore.remove(draftKey);
    }
    skipNextDirty.current = true;
    setActiveDraftId(null);
    setActiveDraftTitle("");
    setDraftDirty(false);
    clearRccAnalysis();
    // Remount the form tree: context reset alone leaves stale values in the
    // always-mounted uncontrolled form inputs.
    setResetVersion((version) => version + 1);
    setFreshVersion((version) => version + 1);
    dispatch({ type: SET_CURATOR_STATE, payload: initialState });
  };

  // Persist the current form to the signed-in user's account drafts. Updates
  // the loaded draft when there is one, otherwise creates a new draft and
  // starts tracking its id. Resolves to the draft id; rejects on API errors
  // (e.g. 401 when not signed in) so callers can surface them.
  //
  // ONE DRAFT PER WORK. With no tracked draft, a draft already saved under
  // the same (real) name is overwritten rather than duplicated.
  const saveDraftToServer = (title) => {
    const run = async () => {
      const draftState = collectDraftState();
      const nextTitle = (title || getDraftTitle()).trim() || "Untitled draft";
      let id = activeDraft.current.id;
      if (!id && isNamedDraftTitle(nextTitle)) {
        try {
          const existing = (await listServerDrafts())
            .filter((draft) => sameTitle(draft.title, nextTitle))
            .sort((a, b) =>
              String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
            );
          if (existing.length) id = existing[0].id;
        } catch (e) {
          // Could not list drafts: fall back to creating one.
        }
      }
      let draft;
      try {
        draft = await saveServerDraft(id, draftState, nextTitle);
      } catch (error) {
        // The tracked draft was deleted elsewhere: save this as a new one.
        if (id && error && error.response && error.response.status === 404) {
          draft = await saveServerDraft(null, draftState, nextTitle);
        } else {
          throw error;
        }
      }
      if (draft && draft.id) {
        setActiveDraftId(draft.id);
      }
      setActiveDraftTitle((draft && draft.title) || nextTitle);
      skipNextDirty.current = true;
      dispatch({ type: SET_CURATOR_STATE, payload: draftState });
      setDraftDirty(false);
      return draft && draft.id;
    };
    const next = saveQueue.current.then(run, run);
    saveQueue.current = next.catch(() => {});
    return next;
  };

  // Remount the form tree WITHOUT clearing state: used after programmatic
  // state updates (e.g. applying manuscript-import proposals) so the
  // always-mounted uncontrolled form inputs re-seed from the new values.
  const remountForms = () => setResetVersion((version) => version + 1);

  // Forget the tracked account draft without touching the form (used after
  // the user deletes the draft they published from). Subsequent Save Draft
  // then creates a fresh draft instead of PUTting a deleted id.
  const clearActiveDraft = () => {
    setActiveDraftId(null);
    setActiveDraftTitle("");
  };

  // Used by edit mode (EditModeController) to fill the form from a stored
  // record without marking it dirty — the unsaved-changes guard must only
  // fire on actual user edits after the load.
  const applyLoadedRecord = (data) => {
    skipNextDirty.current = true;
    setAll(data || {});
    setDraftDirty(false);
    setFreshVersion((version) => version + 1);
    remountForms();
  };

  // Called by the ?draft=<id> loader after fetching a server draft: fills the
  // form without marking it dirty (nothing is unsaved right after a load).
  //
  // The remount is not optional. react-hook-form reads defaultValues once, at
  // mount, and the form tree is already mounted by the time this async fetch
  // resolves — so updating context alone left every input showing the blank
  // it had on page load. Worse, the next Save Draft then read those blanks
  // back out through the draft flusher and overwrote the stored draft with
  // them. resetAll has always done this; these two paths were missed.
  const applyServerDraft = (draft) => {
    skipNextDirty.current = true;
    setAll((draft && draft.state) || {});
    setActiveDraftId(draft ? draft.id : null);
    setActiveDraftTitle(draft ? draft.title || "" : "");
    setDraftDirty(false);
    setFreshVersion((version) => version + 1);
    remountForms();
    // A loaded draft opens with every section closed.
    setLoadVersion((version) => version + 1);
    collapseAllSections();
  };

  const getSavedDraft = () => (draftKey ? WebStore.get(draftKey) : null);

  const resumeDraft = () => {
    const data = getSavedDraft();
    if (data !== null) {
      setAll(data);
      // The account draft this browser copy belongs to, if any.
      const stored = activeDraftKey ? WebStore.get(activeDraftKey) : null;
      if (stored && typeof stored === "object" && stored.id) {
        setActiveDraftId(stored.id);
        setActiveDraftTitle(stored.title || "");
      }
      setLoadVersion((version) => version + 1);
      collapseAllSections();
      // Same reason as applyServerDraft: the inputs re-seed only on remount.
      remountForms();
    }
    return data;
  };

  const setCuratorInfo = (info) =>
    dispatch({ type: SET_CURATORINFO, payload: info });

  // Profile-derived curator details applied automatically: not a user edit,
  // so the leave-page guard does not treat it as unsaved work.
  const prefillCuratorInfo = (info) => {
    skipNextDirty.current = true;
    dispatch({ type: SET_CURATORINFO, payload: { ...initialState.curatorInfo, ...info } });
  };

  // records: [{ key, list: "charts"|"datasets"|"scripts"|"tools", value }]
  // links:   [{ from: key, to: key, type }]
  const importBundle = (records, links) =>
    dispatch({ type: IMPORT_BUNDLE, payload: { records, links } });

  const setFileServerPath = (path) => {
    if (path !== state.fileServerPath) clearRccAnalysis();
    dispatch({ type: SET_FILESERVERPATH, payload: path });
  };

  const setPaperInfo = (data) =>
    dispatch({ type: SET_PAPERINFO, payload: data });

  const setReferenceAuthors = (authors) =>
    dispatch({ type: SET_REFERENCE_AUTHORS, payload: authors });

  const setReferenceInfo = (data) =>
    dispatch({ type: SET_REFERENCEINFO, payload: data });

  const setDocumentation = (data) =>
    dispatch({ type: SET_DOCUMENTATION, payload: data });

  const setLicense = (license) =>
    dispatch({ type: SET_LICENSE, payload: license });

  const setWorkType = (workType) =>
    dispatch({ type: SET_WORK_TYPE, payload: workTypeOf(workType) });

  const setCodeHost = (codeHost) =>
    dispatch({ type: SET_CODE_HOST, payload: codeHost });

  const set = (type, value) =>
    dispatch({ type: SET, payload: { type: type + "s", value } });

  const add = (type, value) =>
    dispatch({ type: ADD, payload: { type: type + "s", value } });

  // Append several records of one type in a single dispatch, letting the
  // reducer mint collision-safe ids. Existing records are never touched.
  const addMany = (type, values) =>
    dispatch({ type: ADD_MANY, payload: { type: type + "s", values } });

  // Create records AND the arrow joining each to the row they were started
  // from, in one dispatch. The reducer refuses the whole change if any arrow
  // is invalid, so a caller never gets a record without its link.
  const addAndLink = (type, values, intent, choice) =>
    dispatch({
      type: ADD_AND_LINK,
      payload: { type: type + "s", values, intent, choice },
    });

  const edit = (type, value) =>
    dispatch({ type: EDIT, payload: { type: type + "s", value } });

  const del = (type, id) =>
    dispatch({ type: DELETE, payload: { type: type + "s", id } });

  const setNodes = (nodes) => dispatch({ type: SET_NODES, payload: nodes });
  const setEdges = (edges) => dispatch({ type: SET_EDGES, payload: edges });
  const addEdge = (edge) => dispatch({ type: ADD_EDGE, payload: edge });
  const deleteEdge = (edge) => dispatch({ type: DELETE_EDGE, payload: edge });
  // Remove one connection by its endpoints, leaving both artifacts and all
  // their other connections alone.
  const unlink = (from, to) =>
    dispatch({ type: UNLINK, payload: { from, to } });

  return (
    <CuratorContext.Provider
      value={{
        reference: state.reference,
        curatorInfo: state.curatorInfo,
        fileServerPath: state.fileServerPath,
        paperInfo: state.paperInfo,
        referenceInfo: state.referenceInfo,
        workType: state.workType,
        setWorkType,
        codeHost: codeHostOf(state),
        setCodeHost,
        documentation: state.documentation,
        charts: state.charts,
        tools: state.tools,
        datasets: state.datasets,
        scripts: state.scripts,
        workflow: state.workflow,
        heads: state.heads,
        license: state.license,
        metadata: state,
        setAll,
        addAndLink,
        resetAll,
        getSavedDraft,
        resumeDraft,
        saveDraft,
        hasMeaningfulDraft,
        hasUnsavedDraftChanges,
        activeDraftId,
        activeDraftTitle,
        draftDirty,
        resetVersion,
        freshVersion,
        loadVersion,
        remountForms,
        rccAnalysisCache,
        cacheRccAnalysis,
        clearRccAnalysis,
        collectDraftState,
        getDraftTitle,
        registerDraftFlusher,
        saveDraftToServer,
        applyServerDraft,
        applyLoadedRecord,
        clearActiveDraft,
        setCuratorInfo,
        prefillCuratorInfo,
        importBundle,
        setFileServerPath,
        setPaperInfo,
        setReferenceAuthors,
        setReferenceInfo,
        setDocumentation,
        set,
        add,
        addMany,
        edit,
        del,
        setNodes,
        setEdges,
        addEdge,
        deleteEdge,
        unlink,
        setLicense,
      }}
    >
      {props.children}
    </CuratorContext.Provider>
  );
};

export default CuratorState;
