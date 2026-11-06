import { useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import axios from "axios";
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormControlLabel,
  LinearProgress,
  Paper,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AutoAwesome,
  CheckCircle,
  InfoOutlined as InfoOutlinedIcon,
  Description,
  SaveOutlined,
  Visibility,
  Psychology,
  ExpandMore,
  FolderOpen,
  InsertPhoto,
  PictureAsPdf,
  Search,
  SkipNext,
} from "@mui/icons-material";

import Router from "next/router";

import CuratorContext from "../../Context/Curator/curatorContext";
import AuthContext from "../../Context/Auth/authContext";
import AlertContext from "../../Context/Alert/alertContext";
import { saveThenPreview } from "./TopActions";
import ServerContext from "../../Context/Servers/serverContext";
import SourceTreeContext from "../../Context/SourceTree/SourceTreeContext";
import { getList } from "../../Utils/Scraper";
import { arxivIdOf, doiUtil } from "../../Utils/doi";
import { CODE_HOSTS, CODE_HOST_KEYS, isRepoFilesPath, needsFolder, workTypeInfo, workTypeOf } from "../../Utils/workTypes";
import { lookupRepo, referenceFromRepo } from "../../Utils/repoLookup";
import { buildImageUrl, isPdfFile } from "../../Utils/fileServerUrl";
import { initialsOf } from "../Profile/ProfileLinks";
import { labelFor, toRecord } from "../../Utils/artifactFields";
import { acceptGuidedChanges } from "../../Utils/savedSection";
import {
  AI_HELP,
  AiConsentDialog,
  AiInfoButton,
  ProposalReview,
  curateItemsOf,
  defaultProposalSkip,
  editKey,
  proposalCount,
} from "./AiAssist";
import {
  LISTS,
  buildImportPlan,
  countByList,
  curatorFromProfile,
  curatorIsBlank,
  curatorIsComplete,
  recordsNeedingDetails,
  referenceFromCrossref,
  unselectedKeys,
} from "../../Utils/autoCurate";

export const scrollToSection = (id) => {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

const ModelNote = ({ models }) =>
  models && models.length ? (
    <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
      {`Suggested by ${models.join(", ")}`}
    </Typography>
  ) : null;

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// "figures", "figures and scripts", "figures, datasets and scripts"
const joinWords = (words) =>
  words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

const LIST_OF_ID = { c: "charts", d: "datasets", s: "scripts", t: "tools" };
const FIND_KINDS = ["charts", "datasets", "scripts"];
const KIND_NOUN = { charts: "figures", datasets: "datasets", scripts: "scripts", tools: "tools" };

// An AI button with its "what does this do" popover beside it.
const AiAction = ({ help, children }) => (
  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}>
    {children}
    <AiInfoButton help={help} />
  </Box>
);

const Summary = ({ children }) => (
  <Box
    sx={{
      p: 1.5,
      borderRadius: 2,
      bgcolor: "rgba(0,0,0,0.02)",
      border: "1px solid",
      borderColor: "divider",
    }}
  >
    {children}
  </Box>
);

const SectionLink = ({ target, children }) => (
  <Button size="small" onClick={() => scrollToSection(target)} sx={{ textTransform: "none" }}>
    {children}
  </Button>
);

// ---- step 5: one table for every required field still empty ---------------

const DetailField = ({ record, field, type, multiline, onSave, placeholder }) => {
  const initial = Array.isArray(record[field]) ? record[field].join(", ") : record[field] || "";
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  const changed = value !== initial;
  const submit = () => {
    if (changed) onSave(field, value);
  };
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
      <TextField
        size="small"
        fullWidth
        multiline={multiline}
        minRows={multiline ? 1 : undefined}
        maxRows={multiline ? 4 : undefined}
        label={labelFor(type, field)}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        // Leaving the field still saves; Enter (Ctrl+Enter in a description)
        // saves without leaving it.
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (!multiline || e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <Button
        variant="contained"
        size="small"
        disableElevation
        disabled={!changed}
        // Keep focus in the field so its blur does not save a second time.
        onMouseDown={(e) => e.preventDefault()}
        onClick={submit}
        aria-label={`Save ${labelFor(type, field)}`}
        sx={{ mt: 0.25, flexShrink: 0, bgcolor: "#800000", "&:hover": { bgcolor: "#9a0000" } }}
      >
        Save
      </Button>
    </Box>
  );
};

const Thumb = ({ server, file }) => {
  const [failed, setFailed] = useState(false);
  const url = buildImageUrl(server, file);
  const box = {
    width: 56,
    height: 56,
    flexShrink: 0,
    borderRadius: 1,
    border: "1px solid",
    borderColor: "divider",
    bgcolor: "#fafafa",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };
  if (!url || failed || isPdfFile(file)) {
    return (
      <Box sx={box} component={url ? "a" : "div"} href={url || undefined} target="_blank" rel="noopener noreferrer">
        {isPdfFile(file) ? (
          <PictureAsPdf sx={{ color: "#800000" }} />
        ) : (
          <InsertPhoto sx={{ color: "text.disabled" }} />
        )}
      </Box>
    );
  }
  return (
    <Box sx={box}>
      <img src={url} alt="" style={{ maxWidth: "100%", maxHeight: "100%" }} onError={() => setFailed(true)} />
    </Box>
  );
};

const FinishDetails = ({ needing, fileServerPath, paperTags, edit }) => {
  const save = (type, record) => (field, raw) => {
    const listField = ["properties", "keywords", "files"].includes(field);
    const value = listField
      ? String(raw || "").split(",").map((s) => s.trim()).filter(Boolean)
      : raw;
    edit(type, { ...record, [field]: value });
  };

  const chartsMissingKeywords = needing.filter(
    (n) => n.type === "chart" && n.missing.includes("properties")
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {chartsMissingKeywords.length > 0 && paperTags.length > 0 && (
        <Alert
          severity="info"
          action={
            <Button
              size="small"
              onClick={() =>
                chartsMissingKeywords.forEach(({ record }) =>
                  edit("chart", { ...record, properties: paperTags })
                )
              }
            >
              Apply
            </Button>
          }
        >
          {`Use the paper's keywords (${paperTags.join(", ")}) for ${plural(
            chartsMissingKeywords.length,
            "figure",
            "figures"
          )} without keywords?`}
        </Alert>
      )}
      {needing.map(({ type, record, missing }) => (
        <Paper key={`${type}-${record.id}`} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
            {type === "chart" ? (
              <Thumb server={fileServerPath} file={record.imageFile} />
            ) : null}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" }}>
                <Chip size="small" label={LISTS.find((l) => l.type === type).noun} sx={{ textTransform: "capitalize" }} />
                <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
                  {String(record.imageFile || (record.files || [])[0] || record.packageName || record.id)
                    .split("/")
                    .filter(Boolean)
                    .pop()}
                </Typography>
              </Box>
              {/* One full-width field per row, so every label is readable. */}
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: "1fr" }}>
                {missing
                  .filter((field) => field !== "imageFile" && field !== "files")
                  .map((field) => (
                    <Box key={field}>
                      <DetailField
                        record={record}
                        field={field}
                        type={type}
                        multiline={field === "caption" || field === "readme"}
                        placeholder={
                          field === "number"
                            ? "e.g. 2 or S1"
                            : field === "properties"
                            ? "comma separated"
                            : undefined
                        }
                        onSave={save(type, record)}
                      />
                    </Box>
                  ))}
                {missing.some((f) => f === "imageFile" || f === "files") && (
                  <Typography variant="caption" color="error">
                    Choose its file in the record section below.
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        </Paper>
      ))}
    </Box>
  );
};

// ---- the setup ------------------------------------------------------------

// What step 2 asks for when the work is looked up by DOI, per work type.
const DOI_PROMPTS = {
  paper: {
    label: "Paper DOI or arXiv link",
    placeholder: "10.1038/s41524-025-01558-w or https://arxiv.org/abs/2409.00246",
    hint: "Fills in title, authors, journal, year and abstract. A preprint? Paste its arXiv link or ID. No DOI?",
  },
  report: {
    label: "DOI or arXiv link (if it has one)",
    placeholder: "https://arxiv.org/abs/2409.00246 or 10.2172/1234567",
    hint: "A preprint on arXiv, or a report with a DOI (e.g. from OSTI), fills in its title, authors, year and abstract. Neither?",
  },
  dataset: {
    label: "Dataset DOI",
    placeholder: "10.5281/zenodo.1234567",
    hint: "Data on Zenodo, Figshare, Dryad or a data repository usually has a DOI; it fills in the name, creators, year and description. No DOI?",
  },
  software: {
    label: "Software DOI",
    placeholder: "10.5281/zenodo.1234567",
    hint: "A release archived on Zenodo has a DOI that fills in the name, developers, year and description.",
  },
  other: {
    label: "DOI (if it has one)",
    placeholder: "10.5281/zenodo.1234567",
    hint: "A DOI fills in the title, authors, year and description. No DOI?",
  },
};

// Which commit a repository scan read, and what it left out.
const RepoNotes = ({ analysis }) => {
  const repo = (analysis && analysis.repo) || {};
  const notes = (analysis && analysis.warnings) || [];
  return (
    <Box data-testid="guided-repo-notes">
      {repo.commit && (
        <Typography variant="caption" color="text.secondary" component="div">
          {`Read ${repo.path || "the repository"} at commit ${String(repo.commit).slice(0, 7)}` +
            `${repo.branch ? ` (${repo.branch})` : ""}. Every file will link to this commit, so the record keeps pointing at this exact code.`}
        </Typography>
      )}
      {notes.map((note) => (
        <Typography key={note} variant="caption" color="text.secondary" component="div">
          {note}
        </Typography>
      ))}
    </Box>
  );
};

const GuidedSetup = () => {
  const ctx = useContext(CuratorContext);
  const {
    workType,
    metadata,
    curatorInfo,
    referenceInfo,
    paperInfo,
    fileServerPath,
    charts,
    datasets,
    scripts,
    tools,
    prefillCuratorInfo,
    collectDraftState,
    setAll,
    remountForms,
    cacheRccAnalysis,
    edit,
    resetVersion,
    saveDraftToServer,
    getDraftTitle,
    codeHost,
    setCodeHost,
  } = ctx;
  // A code repository says where its code lives. Code on GitHub or GitLab
  // has no project folder to find or ask the AI about, so those steps are
  // left out unless an RCC folder was added anyway -- and the import step
  // reads the repository instead of a folder (repoMode).
  const isCode = workTypeOf(workType) === "software";
  const folderNeeded = needsFolder(workType, codeHost);
  const rccFolder = fileServerPath && !isRepoFilesPath(fileServerPath) ? fileServerPath : "";
  const folderSteps = folderNeeded || Boolean(rccFolder);
  const repoMode = isCode && !folderSteps;
  // What the import step reads: the repository link, or the folder.
  const scanKey = repoMode ? String(referenceInfo.url || "").trim() : fileServerPath;
  const { setAlert } = useContext(AlertContext) || {};
  const { loading: authLoading, authenticated, user } = useContext(AuthContext);

  // Apply programmatic changes without losing anything typed into open
  // forms: snapshot every open form, merge, then remount so they re-seed.
  // What the setup fills in counts as saved: the sections it changes do not
  // then say "Not saved" (see Utils/savedSection).
  const apply = (patch) => {
    acceptGuidedChanges();
    setAll({ ...collectDraftState(), ...patch });
    remountForms();
  };
  const importBundle = (records, links) => {
    acceptGuidedChanges();
    ctx.importBundle(records, links);
  };

  // 1. You -------------------------------------------------------------------
  useEffect(() => {
    if (authLoading || !authenticated || !user) return;
    if (curatorIsBlank(curatorInfo)) {
      const info = curatorFromProfile(user);
      if (info && (info.emailId || info.firstName)) prefillCuratorInfo(info);
    }
    // On sign-in and after every reset (Start Fresh, a new form), never on
    // ordinary edits: a curator who clears a field is not overridden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authenticated, user && user.email, resetVersion]);

  // 2. Paper -----------------------------------------------------------------
  const [doi, setDoi] = useState(referenceInfo.doi || "");
  const [doiBusy, setDoiBusy] = useState(false);
  const [doiError, setDoiError] = useState("");
  const [changingPaper, setChangingPaper] = useState(false);
  // A code repository is looked up from its GitHub/GitLab link instead.
  const [repoLink, setRepoLink] = useState(referenceInfo.url || "");
  const [repoBusy, setRepoBusy] = useState(false);
  const [repoError, setRepoError] = useState("");
  const [repoNote, setRepoNote] = useState("");
  const [repoUseDoi, setRepoUseDoi] = useState(false);
  const lookUpRepo = () => {
    setRepoBusy(true);
    setRepoError("");
    setRepoNote("");
    lookupRepo(repoLink)
      .then((result) => {
        const current = collectDraftState();
        const patch = { referenceInfo: referenceFromRepo(result, current.referenceInfo) };
        // The repository's topics are its keywords, when it has any and the
        // curator has written none.
        const tags = ((current.paperInfo || {}).tags || []).filter(Boolean);
        if (!tags.length && result.topics.length) {
          patch.paperInfo = { ...current.paperInfo, tags: result.topics };
        }
        apply(patch);
        const filled = [
          "name",
          result.description && "description",
          result.developers.length && `${result.developers.length} developer${result.developers.length === 1 ? "" : "s"}`,
          result.year && "year",
          "repository URL",
          patch.paperInfo && "keywords",
        ].filter(Boolean);
        setRepoNote(
          `Filled in the ${filled.join(", ")} from the repository.` +
            (result.contributorsWithoutNames > 0
              ? ` ${result.contributorsWithoutNames} contributor${result.contributorsWithoutNames === 1 ? " has" : "s have"} no full name on their profile; add them in the details.`
              : "")
        );
        setChangingPaper(false);
      })
      .catch((err) => setRepoError(err.message))
      .finally(() => setRepoBusy(false));
  };
  useEffect(() => {
    if (referenceInfo.doi) setDoi(referenceInfo.doi);
  }, [referenceInfo.doi]);

  const lookUpDoi = () => {
    const bare = doiUtil.normalize(doi);
    if (!doiUtil.isValid(bare)) {
      setDoiError(
        "That does not look like a DOI or an arXiv link. Examples: 10.1038/s41524-025-01558-w, https://arxiv.org/abs/2409.00246"
      );
      return;
    }
    setDoiBusy(true);
    setDoiError("");
    doiUtil
      .get(bare)
      .then((record) => {
        const current = collectDraftState();
        const looked = referenceFromCrossref(record, { ...current.referenceInfo, doi: bare });
        const lookedType = workTypeOf(current.workType);
        const referenceInfo = workTypeInfo(lookedType).paperFields
          ? looked
          : { ...looked, kind: lookedType };
        const patch = { referenceInfo };
        // The last author is, by convention, the P.I.; it fills an empty P.I.
        // field and can be changed in Qresp Curation Information.
        const pis = (current.paperInfo || {}).PIs;
        const last = String(referenceInfo.authors || "")
          .split(",")
          .map((name) => name.replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .pop();
        // A person's name only: a collaboration ("ATLAS") is not a P.I.
        if (last && last.includes(" ") &&
            !(Array.isArray(pis) ? pis.filter(Boolean).length : String(pis || "").trim())) {
          patch.paperInfo = { ...current.paperInfo, PIs: last };
        }
        apply(patch);
        // An arXiv paper's LaTeX is on arXiv: offer it for the captions step.
        const arxiv = arxivIdOf(bare.replace(/^10\.48550\/arxiv\./i, ""));
        if (arxiv) setArxivInput((was) => was || arxiv);
        setChangingPaper(false);
        locate(bare);
      })
      .catch(() =>
        setDoiError("No publication was found for that DOI. Check it, or fill in the paper details below.")
      )
      .finally(() => setDoiBusy(false));
  };

  // 3. Folder ----------------------------------------------------------------
  const [locating, setLocating] = useState(false);
  const [locateResult, setLocateResult] = useState(null);
  const locatedFor = useRef("");

  const locate = (rawDoi) => {
    const bare = doiUtil.normalize(rawDoi || referenceInfo.doi || "");
    if (!bare || !authenticated || locatedFor.current === bare) return;
    locatedFor.current = bare;
    setLocating(true);
    setLocateResult(null);
    axios
      .post("/api/curation/locate-folder", { doi: bare })
      .then((res) => {
        const data = res.data || {};
        setLocateResult(data);
        if (data.found && data.path && !collectDraftState().fileServerPath) {
          apply({ fileServerPath: data.path });
        }
      })
      .catch(() => setLocateResult({ found: false, error: true }))
      .finally(() => setLocating(false));
  };

  useEffect(() => {
    if (!fileServerPath && folderNeeded && referenceInfo.doi && authenticated) locate(referenceInfo.doi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceInfo.doi, authenticated, fileServerPath, folderNeeded]);

  // Choosing the folder here: paste/type an address, or browse the file
  // server with the same picker the full form uses.
  const { httpServers, setSelectedHttp } = useContext(ServerContext) || {};
  const {
    setTree,
    openSelector,
    setSaveMethod,
    setConfirmLabel,
    setMultiple,
  } = useContext(SourceTreeContext) || {};
  const [editingFolder, setEditingFolder] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const [folderError, setFolderError] = useState("");
  const [pendingFolder, setPendingFolder] = useState(null);
  const [browsing, setBrowsing] = useState(false);

  // The file server to browse, chosen from the configured list (RCC by
  // default) or typed in. Defaults to the server the saved folder is on.
  const serverOptions = (httpServers || []).filter((server) => server && server.value);
  const serverFor = (path) =>
    serverOptions
      .map((server) => server.value)
      .filter((value) => String(path || "").startsWith(value))
      .sort((a, b) => b.length - a.length)[0] ||
    (serverOptions[0] && serverOptions[0].value) ||
    "";
  const [serverRoot, setServerRoot] = useState("");
  useEffect(() => {
    if (!serverRoot) setServerRoot(serverFor(fileServerPath));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverOptions.length, fileServerPath]);

  const startEditingFolder = () => {
    setServerRoot(serverFor(fileServerPath));
    setFolderInput(fileServerPath || "");
    setFolderError("");
    setPendingFolder(null);
    setEditingFolder(true);
  };

  const commitFolder = (raw, { force = false } = {}) => {
    const folder = String(raw || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^\s]+$/i.test(folder)) {
      setFolderError("Enter the folder's full address, starting with https://");
      return;
    }
    const current = collectDraftState();
    // Every figure, dataset and script path is relative to this folder, so
    // moving it re-points them all. Same warning as the full form.
    if (!force && (current.charts || []).length && current.fileServerPath &&
        current.fileServerPath !== folder) {
      setPendingFolder(folder);
      return;
    }
    apply({ fileServerPath: folder });
    setFolderError("");
    setPendingFolder(null);
    setEditingFolder(false);
  };

  const browseFolders = () => {
    const root = String(serverRoot || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^\s]+$/i.test(root)) {
      setFolderError("Choose a file server to browse, or enter its address starting with https://");
      return;
    }
    if (!openSelector || !setTree || !setSaveMethod) {
      setFolderError("Browsing is not available here. Paste the folder address instead.");
      return;
    }
    setSaveMethod((picked) => {
      setFolderInput(picked);
      commitFolder(picked);
    });
    if (setMultiple) setMultiple(false);
    if (setConfirmLabel) setConfirmLabel("Use folder");
    setBrowsing(true);
    setFolderError("");
    getList(root, "http", true, null)
      .then((listing) => {
        if (setSelectedHttp) setSelectedHttp(listing.details);
        setTree(listing.files);
        openSelector();
      })
      .catch(() =>
        setFolderError("That file server could not be listed. Check the address, or paste the folder address instead.")
      )
      .finally(() => setBrowsing(false));
  };

  const showFolderEditor = editingFolder || (!fileServerPath && !locating);

  // AI, shared by every step that offers it --------------------------------------
  // One consent for the session: the checkbox in the AI assistant step, or
  // the dialog any other AI button opens when it has not been given yet.
  const [aiConsent, setAiConsent] = useState(false);
  const [consentAsk, setConsentAsk] = useState(null);
  const [aiBusy, setAiBusy] = useState("");
  const askConsent = (run) => {
    if (aiConsent) run();
    else setConsentAsk(() => run);
  };

  const aiErrorFrom = (err) => {
    const response = err && err.response;
    const message = (response && response.data && response.data.error) || "";
    if (response && response.status === 503 && /not configured/i.test(message)) {
      return "AI suggestions are not set up on this server. An administrator can turn them on with QRESP_GEMINI_ENABLED and QRESP_GEMINI_API_KEY.";
    }
    if (response && response.status === 404) {
      return "This Qresp server does not have AI suggestions yet. If it was just updated, the backend needs a restart.";
    }
    return (response && response.data && response.data.error) || "The AI suggestions could not be loaded.";
  };

  const paperForAi = () => ({
    title: referenceInfo.title || "",
    abstract: referenceInfo.abstract || "",
    keywords: (paperInfo.tags || []).filter(Boolean),
  });

  // What the record already holds, for the AI to skip and to review.
  const existingForAi = () => ({
    charts: charts.map(({ id, imageFile, number, caption, properties }) => ({
      id, imageFile, number, caption, properties: properties || [] })),
    datasets: datasets.map(({ id, files, readme, keywords }) => ({
      id, files: files || [], readme: readme || "", keywords: keywords || [] })),
    scripts: scripts.map(({ id, files, readme, keywords }) => ({
      id, files: files || [], readme: readme || "", keywords: keywords || [] })),
    tools: tools.map(({ id, packageName, version, description }) => ({
      id, packageName: packageName || "", version: version || "", description: description || "" })),
  });

  const existingLinks = () =>
    ((metadata.workflow || {}).edges || [])
      .map((edge) => (Array.isArray(edge) ? { from: edge[0], to: edge[1] } : { from: edge.from, to: edge.to }));

  const recordLabel = (id) => {
    const lists = { c: charts, s: scripts, d: datasets, t: tools };
    const record = (lists[id[0]] || []).find((item) => item.id === id);
    if (!record) return id;
    if (id[0] === "c") {
      const file = String(record.imageFile || id).split("/").filter(Boolean).pop();
      return record.number ? `${file} (${/^Table/.test(record.number) ? record.number : `Figure ${record.number}`})` : file;
    }
    return String((record.files || [])[0] || record.packageName || id).split("/").filter(Boolean).pop();
  };

  // Apply the ticked part of an AI proposal: edits to existing items in one
  // change (see applyKeywords), then the new items and links.
  const applyProposal = (result, skip) => {
    const chosen = curateItemsOf(result).filter((item) => !skip[item.key]);
    const chosenKeys = new Set(chosen.map((item) => item.key));
    const isExisting = (id) => /^[cdst]\d+$/.test(id);
    const records = chosen.map((item) => {
      let draft;
      if (item.type === "chart") {
        draft = { imageFile: item.imageFile, number: item.number || "", caption: "",
                  properties: (item.keywords || []).join(", "), files: "", notebookFile: "" };
      } else if (item.type === "tool") {
        draft = { packageName: item.packageName, version: item.version, description: "" };
      } else {
        draft = { files: (item.files || []).join(", "), readme: item.description || "", keywords: "" };
      }
      return { key: item.key, list: item.list, value: toRecord(item.type, draft) };
    });
    const links = ((result && result.links) || []).filter(
      (link) =>
        !skip[`${link.from}>${link.to}`] &&
        (chosenKeys.has(link.from) || isExisting(link.from)) &&
        (chosenKeys.has(link.to) || isExisting(link.to))
    );
    const edits = ((result && result.edits) || []).filter((edit) => !skip[editKey(edit)]);
    if (edits.length) {
      const current = collectDraftState();
      const patch = {};
      edits.forEach((edit) => {
        const list = LIST_OF_ID[edit.id[0]];
        patch[list] = (patch[list] || current[list] || []).map((record) =>
          record.id === edit.id ? { ...record, [edit.field]: edit.value } : record
        );
      });
      apply(patch);
    }
    if (records.length || links.length) {
      importBundle(records, links.map(({ from, to, type }) => ({ from, to, type })));
    }
    const parts = [
      records.length && `added ${plural(records.length, "item", "items")}`,
      links.length && `${records.length ? "" : "added "}${plural(links.length, "link", "links")}`,
      edits.length && `updated ${plural(edits.length, "field", "fields")}`,
    ].filter(Boolean);
    const text = parts.length ? `${joinWords(parts)}.` : "nothing was selected.";
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  // 4. Import ----------------------------------------------------------------
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [scannedPath, setScannedPath] = useState("");
  const [excluded, setExcluded] = useState({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [added, setAdded] = useState(null);

  const scan = () => {
    if (!scanKey) return;
    const key = scanKey;
    setScanning(true);
    setScanError("");
    setAdded(null);
    (repoMode
      ? axios.post("/api/curation/analyze-repo", { url: key })
      : axios.post("/api/curation/analyze-folder", { path: key }))
      .then((res) => {
        setAnalysis(res.data || {});
        setScannedPath(key);
        setExcluded(unselectedKeys(res.data || {}));
        if (!repoMode && cacheRccAnalysis) cacheRccAnalysis(key, res.data || {});
      })
      .catch((err) =>
        setScanError(
          (err && err.response && err.response.data && err.response.data.error) ||
            (repoMode ? "The repository could not be read." : "The folder could not be read.")
        )
      )
      .finally(() => setScanning(false));
  };

  const artifactCount = charts.length + datasets.length + scripts.length + tools.length;

  // A different (or cleared) folder, repository or paper makes earlier
  // results stale -- this is also how Start Fresh resets the setup.
  useEffect(() => {
    if (scanKey !== scannedPath) {
      setAnalysis(null);
      setAdded(null);
      setScanError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanKey]);
  useEffect(() => {
    if (!referenceInfo.doi) {
      locatedFor.current = "";
      setLocateResult(null);
      setDoi("");
      setLatexSource(null);
    }
  }, [referenceInfo.doi]);
  // Scan once, automatically, as soon as there is a folder (or repository
  // link) and nothing yet.
  useEffect(() => {
    if (scanKey && authenticated && !artifactCount && scannedPath !== scanKey && !scanning) {
      scan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanKey, authenticated]);

  const paperTags = (paperInfo.tags || []).filter(Boolean);
  const plan = useMemo(
    () =>
      analysis
        ? buildImportPlan(analysis, { state: metadata, paperTags })
        : { items: [], links: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analysis, artifactCount]
  );
  const isIncluded = (item) => !item.duplicate && !excluded[item.key];
  const chosen = plan.items.filter(isIncluded);
  const chosenKeys = new Set(chosen.map((item) => item.key));
  const chosenLinks = plan.links.filter(
    (link) => chosenKeys.has(link.from) && chosenKeys.has(link.to) && !excluded[`${link.from}>${link.to}`]
  );
  const counts = countByList(chosen);
  const labels = Object.fromEntries(plan.items.map((item) => [item.key, item.label]));

  const addAll = () => {
    // Repository paths are relative to the commit that was read; storing that
    // as the record's file path root makes every file link to it.
    const filesBase = repoMode && analysis && analysis.repo && analysis.repo.files_base;
    if (filesBase && filesBase !== fileServerPath && ctx.setFileServerPath) {
      ctx.setFileServerPath(filesBase);
    }
    importBundle(
      chosen.map(({ key, list, value }) => ({ key, list, value })),
      chosenLinks.map(({ from, to, type }) => ({ from, to, type }))
    );
    setAdded({ counts, links: chosenLinks.length });
    setReviewOpen(false);
  };

  // AI backup for the scan: look for the kinds of item neither the record
  // nor the scan has, or, once everything found is in, for anything missed.
  const [findResult, setFindResult] = useState(null);
  const [findSkip, setFindSkip] = useState({});
  const [findError, setFindError] = useState("");
  const [findNote, setFindNote] = useState("");
  const recordLists = { charts, datasets, scripts, tools };
  const pendingScan = Boolean(analysis) && !added;
  const missingKinds = FIND_KINDS.filter(
    (kind) => !recordLists[kind].length && !(pendingScan && counts[kind])
  );
  // A scan that failed still leaves the AI, which reads the folder its own way.
  const scanned = Boolean(analysis) || artifactCount > 0 || Boolean(scanError);
  // While scan results wait to be added, only kinds the scan did not find
  // are asked for, so the AI never proposes the same files twice.
  const canFind = !repoMode && Boolean(fileServerPath) && authenticated && scanned && !scanning &&
    (missingKinds.length > 0 || !(pendingScan && chosen.length));
  const findKinds = missingKinds.length ? missingKinds : [...FIND_KINDS, "tools"];
  const findLabel = missingKinds.length
    ? `Find ${joinWords(missingKinds.map((kind) => KIND_NOUN[kind]))} with AI`
    : "Find anything the scan missed, with AI";

  const findWithAi = () => {
    setAiBusy("find");
    setFindError("");
    setFindNote("");
    setFindResult(null);
    axios
      .post("/api/curation/ai-curate", {
        consent: true,
        path: fileServerPath,
        paper: paperForAi(),
        existing: existingForAi(),
        focus: findKinds,
      })
      .then((res) => {
        const data = res.data || {};
        setFindResult(data);
        setFindSkip(defaultProposalSkip(data));
      })
      .catch((err) => setFindError(aiErrorFrom(err)))
      .finally(() => setAiBusy(""));
  };

  const applyFound = () => {
    setFindNote(applyProposal(findResult, findSkip));
    setFindResult(null);
  };

  // 5. Captions from the paper's LaTeX ------------------------------------------
  const [srcMode, setSrcMode] = useState("arxiv");
  const [arxivInput, setArxivInput] = useState("");
  const [latexBusy, setLatexBusy] = useState(false);
  const [latexError, setLatexError] = useState("");
  const [latexResult, setLatexResult] = useState(null);
  const [captionSkip, setCaptionSkip] = useState({});
  const [captionsApplied, setCaptionsApplied] = useState(null);
  // The source's figures outlive the review, so figures still without a
  // caption can be matched with AI after the exact matches are applied.
  const [latexSource, setLatexSource] = useState(null);
  const [matchError, setMatchError] = useState("");
  const [matchNote, setMatchNote] = useState("");
  const arxivSearchedFor = useRef("");

  // Look the paper up on arXiv once its title is known, and offer the id.
  useEffect(() => {
    const title = (referenceInfo.title || "").trim();
    if (!title || !authenticated || arxivSearchedFor.current === title) return;
    arxivSearchedFor.current = title;
    axios
      .post("/api/curation/find-arxiv", { title })
      .then((res) => {
        const data = res.data || {};
        if (data.found && data.arxiv) setArxivInput((current) => current || data.arxiv);
      })
      .catch(() => {});
  }, [referenceInfo.title, authenticated]);

  const runLatex = (payload) => {
    setLatexBusy(true);
    setLatexError("");
    setLatexResult(null);
    setCaptionsApplied(null);
    axios
      .post("/api/curation/latex-captions", {
        ...payload,
        charts: charts.map(({ id, imageFile, number }) => ({ id, imageFile, number })),
      })
      .then((res) => {
        const data = res.data || {};
        // The DOI registry often has no abstract; the paper's source does.
        const current = collectDraftState();
        const abstractFilled = Boolean(
          data.abstract && !String((current.referenceInfo || {}).abstract || "").trim()
        );
        if (abstractFilled) {
          apply({ referenceInfo: { ...current.referenceInfo, abstract: data.abstract } });
        }
        setLatexResult({ ...data, abstractFilled });
        setLatexSource({ source: data.source, figures: data.figures || [] });
        setMatchError("");
        setMatchNote("");
        const skip = {};
        (data.matches || []).forEach((match) => {
          const record = charts.find((chart) => chart.id === match.id);
          // A caption the curator already wrote is only replaced on request.
          if (record && String(record.caption || "").trim()) skip[match.id] = true;
        });
        setCaptionSkip(skip);
      })
      .catch((err) => {
        const response = err && err.response;
        setLatexError(
          (response && response.data && response.data.error) ||
            (response && response.status === 404
              ? "This Qresp server cannot read LaTeX yet. If it was just updated, the backend needs a restart."
              : "The LaTeX source could not be read.")
        );
      })
      .finally(() => setLatexBusy(false));
  };

  const onLatexFile = (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setLatexError("That file is larger than 10 MB. Upload just the .tex files, or a .zip without the images.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      runLatex({ filename: file.name, content_b64: result.slice(result.indexOf(",") + 1) });
    };
    reader.onerror = () => setLatexError("The file could not be read.");
    reader.readAsDataURL(file);
  };

  const captionMatches = ((latexResult && latexResult.matches) || []).filter((match) => {
    const record = charts.find((chart) => chart.id === match.id);
    return record && String(record.caption || "").trim() !== match.caption;
  });
  const captionChosen = captionMatches.filter((match) => !captionSkip[match.id]);

  const applyCaptions = () => {
    captionChosen.forEach((match) => {
      const record = charts.find((chart) => chart.id === match.id);
      if (!record) return;
      edit("chart", {
        ...record,
        caption: match.caption,
        number: String(record.number || "").trim() ? record.number : match.number,
      });
    });
    setCaptionsApplied(captionChosen.length);
    setLatexResult(null);
  };

  // Figures with no caption that no exact match covers: when the source has
  // captions, the names probably differ and the AI can match them.
  const pendingMatchIds = new Set(((latexResult && latexResult.matches) || []).map((match) => match.id));
  const matchCandidates = charts.filter(
    (chart) => !String(chart.caption || "").trim() && !pendingMatchIds.has(chart.id)
  );
  const canAiMatch = Boolean(
    latexSource && (latexSource.figures || []).some((figure) => figure.caption) && matchCandidates.length
  );

  const matchWithAi = () => {
    setAiBusy("match");
    setMatchError("");
    setMatchNote("");
    axios
      .post("/api/curation/match-captions", {
        consent: true,
        figures: (latexSource.figures || []).slice(0, 150)
          .map(({ kind, number, graphics, caption, label }) => ({ kind, number, graphics, caption, label })),
        charts: matchCandidates.map(({ id, imageFile, number }) => ({ id, imageFile, number })),
      })
      .then((res) => {
        const found = (res.data || {}).matches || [];
        if (!found.length) {
          setMatchNote("The AI could not match any more figures to the paper's captions with confidence.");
          return;
        }
        setCaptionsApplied(null);
        setLatexResult((prev) => ({
          ...(prev || { source: latexSource.source, figures: latexSource.figures, matches: [] }),
          matches: [...((prev && prev.matches) || []), ...found],
          models: (res.data || {}).models || [],
        }));
        setCaptionSkip((skip) => {
          const next = { ...skip };
          found.forEach((match) => {
            if (match.confidence === "low") next[match.id] = true;
          });
          return next;
        });
      })
      .catch((err) => setMatchError(aiErrorFrom(err)))
      .finally(() => setAiBusy(""));
  };

  const chartFileName = (id) => {
    const record = charts.find((chart) => chart.id === id);
    return String((record && record.imageFile) || id).split("/").filter(Boolean).pop();
  };
  const uncaptioned = charts.filter((chart) => !String(chart.caption || "").trim()).length;

  // 6. AI assistant (optional) --------------------------------------------------
  const [aiError, setAiError] = useState("");
  const [kwResult, setKwResult] = useState(null);
  const [kwSkip, setKwSkip] = useState({});
  const [linkResult, setLinkResult] = useState(null);
  const [linkSkip, setLinkSkip] = useState({});
  const [aiApplied, setAiApplied] = useState("");

  const sameList = (a, b) =>
    (a || []).map((x) => String(x).toLowerCase()).join("|") ===
    (b || []).map((x) => String(x).toLowerCase()).join("|");

  const suggestKeywords = () => {
    setAiBusy("keywords");
    setAiError("");
    setAiApplied("");
    setKwResult(null);
    axios
      .post("/api/curation/suggest-figure-keywords", {
        consent: aiConsent,
        paper: paperForAi(),
        figures: charts.map(({ id, number, caption }) => ({ id, number, caption })),
      })
      .then((res) => {
        const data = res.data || {};
        setKwResult(data);
        const skip = {};
        (data.figures || []).forEach(({ id }) => {
          const record = charts.find((chart) => chart.id === id);
          const current = (record && record.properties) || [];
          // Keywords the curator wrote are kept unless they opt in; the
          // paper-tag defaults from the import are replaced.
          if (current.length && !sameList(current, paperTags)) skip[id] = true;
        });
        setKwSkip(skip);
      })
      .catch((err) => setAiError(aiErrorFrom(err)))
      .finally(() => setAiBusy(""));
  };

  // ONE change for the figures and the paper. Editing each figure and then
  // calling apply() lost every figure edit: apply() snapshots the form before
  // those dispatches have landed and writes that stale snapshot back.
  const applyKeywords = () => {
    const current = collectDraftState();
    const chosen = {};
    ((kwResult && kwResult.figures) || []).forEach(({ id, keywords }) => {
      if (!kwSkip[id] && keywords && keywords.length) chosen[id] = keywords;
    });
    let count = 0;
    const nextCharts = (current.charts || []).map((chart) => {
      if (!chosen[chart.id]) return chart;
      count += 1;
      return { ...chart, properties: chosen[chart.id] };
    });
    const patch = { charts: nextCharts };
    const paperKeywords = (kwResult && kwResult.paper_keywords) || [];
    const currentTags = ((current.paperInfo || {}).tags || []).filter(Boolean);
    let paperNote = "";
    if (!kwSkip.__paper && paperKeywords.length && !currentTags.length) {
      patch.paperInfo = { ...current.paperInfo, tags: paperKeywords };
      paperNote = " and the paper's keywords";
    }
    apply(patch);
    setAiApplied(`Updated keywords on ${plural(count, "figure", "figures")}${paperNote}.`);
    setKwResult(null);
  };

  const suggestLinks = () => {
    setAiBusy("links");
    setAiError("");
    setAiApplied("");
    setLinkResult(null);
    const name = (record) =>
      String((record.files || [])[0] || record.id).split("/").filter(Boolean).pop();
    axios
      .post("/api/curation/suggest-links", {
        consent: aiConsent,
        path: fileServerPath,
        paper: paperForAi(),
        figures: charts.map(({ id, number, caption }) => ({ id, number, caption })),
        scripts: scripts.map((record) => ({ id: record.id, files: record.files || [], description: record.readme || "" })),
        datasets: datasets.map((record) => ({ id: record.id, name: name(record), files: record.files || [] })),
        existing_links: existingLinks(),
      })
      .then((res) => {
        const data = res.data || {};
        setLinkResult(data);
        const skip = {};
        (data.links || []).forEach((link) => {
          if (link.confidence === "low") skip[`${link.from}>${link.to}`] = true;
        });
        setLinkSkip(skip);
      })
      .catch((err) => setAiError(aiErrorFrom(err)))
      .finally(() => setAiBusy(""));
  };

  const applyLinks = () => {
    const chosen = ((linkResult && linkResult.links) || []).filter(
      (link) => !linkSkip[`${link.from}>${link.to}`]
    );
    importBundle([], chosen.map(({ from, to, type }) => ({ from, to, type })));
    setAiApplied(`Added ${plural(chosen.length, "link", "links")}.`);
    setLinkResult(null);
  };

  // Descriptions for datasets and scripts.
  const [descResult, setDescResult] = useState(null);
  const [descSkip, setDescSkip] = useState({});
  const resourceById = (id) =>
    ({ c: charts, d: datasets, s: scripts }[id[0]] || []).find((item) => item.id === id);
  const currentDescription = (id) => {
    const record = resourceById(id) || {};
    return String((id[0] === "c" ? record.caption : record.readme) || "").trim();
  };

  const suggestDescriptions = () => {
    setAiBusy("descriptions");
    setAiError("");
    setAiApplied("");
    setDescResult(null);
    const resource = ({ id, files, readme }) => ({ id, files: files || [], readme: readme || "" });
    axios
      .post("/api/curation/suggest-descriptions", {
        consent: aiConsent,
        path: fileServerPath,
        paper: paperForAi(),
        // Figures without a caption get a drafted description too.
        figures: charts.map(({ id, number, caption, imageFile }) => ({ id, number, caption, imageFile })),
        datasets: datasets.map(resource),
        scripts: scripts.map(resource),
        existing_links: existingLinks(),
      })
      .then((res) => {
        const data = res.data || {};
        setDescResult(data);
        const skip = {};
        // A description the curator wrote is only replaced on request.
        (data.descriptions || []).forEach(({ id }) => {
          if (currentDescription(id)) skip[id] = true;
        });
        setDescSkip(skip);
      })
      .catch((err) => setAiError(aiErrorFrom(err)))
      .finally(() => setAiBusy(""));
  };

  const applyDescriptions = () => {
    const chosen = {};
    ((descResult && descResult.descriptions) || []).forEach(({ id, description }) => {
      if (!descSkip[id] && description) chosen[id] = description;
    });
    const current = collectDraftState();
    const fill = (list, field) =>
      (current[list] || []).map((record) =>
        chosen[record.id] ? { ...record, [field]: chosen[record.id] } : record
      );
    // A figure's drafted description goes where its caption would.
    apply({
      charts: fill("charts", "caption"),
      datasets: fill("datasets", "readme"),
      scripts: fill("scripts", "readme"),
    });
    setAiApplied(`Added ${plural(Object.keys(chosen).length, "description", "descriptions")}.`);
    setDescResult(null);
  };

  // Whole-folder AI curation: what Qresp's own pass missed, or the whole
  // paper when the folder is not organised the Qresp way, plus a review of
  // what the record already holds.
  const [curateResult, setCurateResult] = useState(null);
  const [curateSkip, setCurateSkip] = useState({});

  const curateFolder = () => {
    setAiBusy("curate");
    setAiError("");
    setAiApplied("");
    setCurateResult(null);
    axios
      .post("/api/curation/ai-curate", {
        consent: aiConsent,
        path: fileServerPath,
        paper: paperForAi(),
        existing: existingForAi(),
        review: true,
      })
      .then((res) => {
        const data = res.data || {};
        setCurateResult(data);
        setCurateSkip(defaultProposalSkip(data));
      })
      .catch((err) => setAiError(aiErrorFrom(err)))
      .finally(() => setAiBusy(""));
  };

  const applyCuration = () => {
    const note = applyProposal(curateResult, curateSkip);
    setAiApplied(`${note} Captions for new figures can be filled from the LaTeX in step 5.`);
    setCurateResult(null);
  };

  const figuresWithoutKeywords = charts.filter((chart) => !(chart.properties || []).length).length;

  // 7. Finish ----------------------------------------------------------------
  // Nothing is required to publish (schema.json): every detail below is a
  // suggestion that helps readers, and the curator may skip all of it -- a
  // record that is just its data is still worth publishing.
  const optionalNeeding = recordsNeedingDetails(metadata, { recommended: true });
  const optionalFigures = optionalNeeding.filter((entry) => entry.type === "chart").length;
  const optionalResources = optionalNeeding.length - optionalFigures;
  const missingPI = !(
    paperInfo.PIs && String(paperInfo.PIs).trim() &&
    (!Array.isArray(paperInfo.PIs) || paperInfo.PIs.length)
  );
  const missingOptional = [
    missingPI && "principal investigator",
    !(paperInfo.collections && paperInfo.collections.length) && "collections",
    !(paperInfo.tags && paperInfo.tags.length) && "keywords",
  ].filter(Boolean);
  const [skipOptional, setSkipOptional] = useState(false);
  const optionalLeft = !skipOptional && (missingOptional.length > 0 || optionalNeeding.length > 0);
  const recordReady = !optionalLeft;
  const [draftNote, setDraftNote] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const saveDraftNow = () => {
    if (!saveDraftToServer) return;
    setDraftSaving(true);
    setDraftNote("");
    const title = (getDraftTitle && getDraftTitle()) || referenceInfo.title || "Untitled draft";
    saveDraftToServer(title)
      .then(() => setDraftNote("Saved to your account drafts."))
      .catch(() => setDraftNote("The draft could not be saved. Check that you are still signed in."))
      .finally(() => setDraftSaving(false));
  };
  const previewNow = () =>
    saveThenPreview({
      metadata,
      collectDraftState,
      saveDraftToServer,
      getDraftTitle,
      setAlert: setAlert || (() => {}),
      router: { push: (...args) => Router.push(...args) },
    });
  const lastAuthor = String(referenceInfo.authors || "")
    .split(",")
    .map((name) => name.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .pop();
  const applyLastAuthorAsPI = () => {
    const current = collectDraftState();
    apply({ paperInfo: { ...current.paperInfo, PIs: lastAuthor } });
  };

  // ---- status ----
  // A step that could not be finished (no captions found, the folder could
  // not be read) can be skipped for now; the AI assistant may fill the gap.
  const [skipped, setSkipped] = useState({});
  const skipToAi = (key) => {
    setSkipped((was) => ({ ...was, [key]: true }));
    scrollToSection("guided-ai");
  };
  const SkipToAi = ({ step, note }) => !folderSteps ? null : (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
      <Button
        size="small"
        variant="text"
        endIcon={<SkipNext />}
        onClick={() => skipToAi(step)}
        sx={{ textTransform: "none" }}
      >
        Skip for now — go to the AI assistant
      </Button>
      {note && (
        <Typography variant="caption" color="text.secondary">{note}</Typography>
      )}
    </Box>
  );
  // A code repository, dataset or other work has no paper LaTeX to copy
  // captions from, so that step is only offered for papers and reports.
  const type = workTypeOf(workType);
  const typeInfo = workTypeInfo(type);
  const isPaper = Boolean(typeInfo.paperFields);
  const hasLatex = type === "paper" || type === "report";
  const steps = {
    you: curatorIsComplete(curatorInfo),
    paper: Boolean(referenceInfo.title),
    folder: Boolean(fileServerPath),
    import: artifactCount > 0,
    captions: charts.length > 0 && uncaptioned === 0,
    ai: charts.length > 0 && figuresWithoutKeywords === 0,
    finish: recordReady,
  };
  const offered = (key) =>
    (key !== "captions" || hasLatex) &&
    (folderSteps || !["folder", "import", "ai"].includes(key) || (repoMode && key === "import"));
  const done = Object.keys(steps).filter((key) => steps[key] && offered(key)).length;
  const STEP_KEYS = ["you", "paper", "folder", "import", "captions", "ai", "finish"].filter(offered);
  const firstOpen = STEP_KEYS.findIndex((k) => !steps[k] && !skipped[k]);

  const stepLabel = (key, title, subtitle) => (
    <StepLabel
      optional={
        <Typography variant="caption" color="text.secondary">
          {skipped[key] && !steps[key] ? "Skipped for now — you can come back to it" : subtitle}
        </Typography>
      }
      slotProps={{ label: { sx: { fontWeight: 700 } } }}
    >
      {title}
    </StepLabel>
  );

  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 4 }} data-testid="guided-setup">
      <Box sx={{ p: { xs: 2, sm: 2.5 }, bgcolor: "rgba(128,0,0,0.04)", borderBottom: "1px solid", borderColor: "divider" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AutoAwesome sx={{ color: "#800000" }} fontSize="small" />
          <Typography variant="subtitle1" fontWeight={700}>
            Guided setup
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">{`${done} of ${STEP_KEYS.length} done`}</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {isPaper
            ? "Qresp fills in what it can from your profile, the paper's DOI and its project folder. You review it and add what only you know."
            : !folderSteps
            ? `Qresp fills in what it can from your profile and the repository. You describe the ${typeInfo.noun} and add what only you know.`
            : `Qresp fills in what it can from your profile and the project folder. You describe the ${typeInfo.noun} and add what only you know.`}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={(done / STEP_KEYS.length) * 100}
          sx={{ mt: 1.5, height: 6, borderRadius: 3, bgcolor: "rgba(128,0,0,0.08)" }}
        />
      </Box>

      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stepper orientation="vertical" nonLinear activeStep={firstOpen === -1 ? STEP_KEYS.length : firstOpen}>
          {/* 1. You */}
          <Step completed={steps.you} expanded>
            {stepLabel("you", "Who is curating", "From your Qresp profile")}
            <StepContent>
              {curatorIsComplete(curatorInfo) ? (
                <Summary>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Avatar
                      src={user && typeof user.avatar_b64 === "string" && user.avatar_b64.startsWith("data:image/") ? user.avatar_b64 : undefined}
                      sx={{ bgcolor: "#800000", width: 40, height: 40, fontSize: "0.95rem", fontWeight: 700 }}
                    >
                      {initialsOf(`${curatorInfo.firstName} ${curatorInfo.lastName}`, curatorInfo.emailId)}
                    </Avatar>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" fontWeight={700}>
                        {[curatorInfo.firstName, curatorInfo.middleName, curatorInfo.lastName].filter(Boolean).join(" ")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div" sx={{ overflowWrap: "anywhere" }}>
                        {[curatorInfo.emailId, curatorInfo.affiliation].filter(Boolean).join(" · ")}
                      </Typography>
                    </Box>
                    <SectionLink target="curate-curator">Edit</SectionLink>
                  </Box>
                </Summary>
              ) : authenticated ? (
                <Typography variant="body2" color="text.secondary">
                  Your profile has no full name yet.{" "}
                  <Link href="/account" style={{ color: "#800000" }}>Add it to your profile</Link>{" "}
                  or <SectionLink target="curate-curator">fill it in below</SectionLink>.
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  <Link href="/login?next=%2Fcurator" style={{ color: "#800000" }}>Sign in</Link>{" "}
                  to fill this from your profile and to look up the project folder.
                </Typography>
              )}
            </StepContent>
          </Step>

          {/* 2. Paper */}
          <Step completed={steps.paper} expanded>
            {stepLabel(
              "paper",
              isPaper ? "The paper" : `The ${typeInfo.noun}`,
              isPaper
                ? "Looked up from its DOI"
                : `Its ${typeInfo.titleLabel.toLowerCase()}, ${typeInfo.authorsLabel.toLowerCase()} and ${typeInfo.abstractLabel.toLowerCase()}`
            )}
            <StepContent>
              {isCode && (
                <Box sx={{ mb: 1.5 }} data-testid="guided-code-host">
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                    Where is the code?
                  </Typography>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    color="primary"
                    value={codeHost}
                    onChange={(_event, value) => value && setCodeHost(value)}
                    aria-label="Where is the code"
                    sx={{ flexWrap: "wrap" }}
                  >
                    {CODE_HOST_KEYS.map((key) => (
                      <ToggleButton
                        key={key}
                        value={key}
                        data-testid={`code-host-${key}`}
                        sx={{ textTransform: "none", px: 1.5 }}
                      >
                        {CODE_HOSTS[key].label}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                    {codeHost === "repository"
                      ? "Step 3 reads the repository from its link: figures, the scripts that make them, their data and dependencies. No RCC folder needed."
                      : codeHost === "fileserver"
                      ? "Point Qresp at the folder in step 3; a repository link is optional."
                      : "Give the repository link here and the RCC folder in step 3."}
                  </Typography>
                </Box>
              )}
              {referenceInfo.title && !changingPaper ? (
                <Summary>
                  <Typography variant="body2" fontWeight={700}>{referenceInfo.title}</Typography>
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.25 }}>
                    {[referenceInfo.authors, referenceInfo.year].filter(Boolean).join(" · ")}
                  </Typography>
                  <Typography variant="caption" color={referenceInfo.abstract ? "text.secondary" : "warning.main"} component="div">
                    {referenceInfo.abstract
                      ? `${typeInfo.abstractLabel} included.`
                      : isPaper
                      ? "The DOI registry has no abstract for this paper; step 5 fills it in from the LaTeX source."
                      : `No ${typeInfo.abstractLabel.toLowerCase()} yet; add one in the details below.`}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.75, flexWrap: "wrap" }}>
                    {referenceInfo.doi && <Chip size="small" variant="outlined" label={`DOI ${referenceInfo.doi}`} />}
                    {type === "software" && referenceInfo.url && (
                      <Chip
                        size="small"
                        variant="outlined"
                        component="a"
                        clickable
                        href={referenceInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        label={referenceInfo.url.replace(/^https?:\/\//, "")}
                      />
                    )}
                    <Box sx={{ flex: 1 }} />
                    {type === "software" && codeHost !== "fileserver" ? (
                      <Button size="small" onClick={() => setChangingPaper(true)} sx={{ textTransform: "none" }}>
                        Use a different repository
                      </Button>
                    ) : (isPaper || referenceInfo.doi) && (
                      <Button size="small" onClick={() => setChangingPaper(true)} sx={{ textTransform: "none" }}>
                        Use a different DOI
                      </Button>
                    )}
                    <SectionLink target="curate-reference">Edit details</SectionLink>
                  </Box>
                  {repoNote && (
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }} data-testid="guided-repo-note">
                      {repoNote}
                    </Typography>
                  )}
                </Summary>
              ) : type === "software" && !repoUseDoi && codeHost !== "fileserver" ? (
                <Box data-testid="guided-repo-lookup">
                  <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <TextField
                      size="small"
                      label="GitHub or GitLab repository link"
                      placeholder="https://github.com/org/repo"
                      value={repoLink}
                      onChange={(e) => setRepoLink(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          lookUpRepo();
                        }
                      }}
                      sx={{ flex: "1 1 260px" }}
                      disabled={repoBusy}
                      slotProps={{ htmlInput: { "data-testid": "guided-repo-input" } }}
                    />
                    <Button
                      variant="contained"
                      disableElevation
                      onClick={lookUpRepo}
                      disabled={repoBusy || !repoLink.trim()}
                      startIcon={repoBusy ? <CircularProgress size={16} color="inherit" /> : <Search />}
                      sx={{ textTransform: "none", minHeight: 40 }}
                      data-testid="guided-repo-lookup-button"
                    >
                      Look up
                    </Button>
                    {changingPaper && (
                      <Button onClick={() => setChangingPaper(false)} sx={{ textTransform: "none", minHeight: 40 }}>
                        Cancel
                      </Button>
                    )}
                  </Box>
                  {repoError && <Alert severity="warning" sx={{ mt: 1 }}>{repoError}</Alert>}
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
                    Fills in the name, description, developers, year and repository URL
                    from its public page. Released on Zenodo with a DOI?{" "}
                    <Link
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setRepoUseDoi(true);
                      }}
                      style={{ color: "#800000" }}
                    >
                      Look it up by DOI
                    </Link>
                    . Hosted somewhere else?{" "}
                    <SectionLink target="curate-reference">Enter the details by hand</SectionLink>
                  </Typography>
                </Box>
              ) : (
                <Box>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <TextField
                      size="small"
                      label={DOI_PROMPTS[type].label}
                      placeholder={DOI_PROMPTS[type].placeholder}
                      value={doi}
                      onChange={(e) => setDoi(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          lookUpDoi();
                        }
                      }}
                      sx={{ flex: "1 1 260px" }}
                      disabled={doiBusy}
                    />
                    <Button
                      variant="contained"
                      disableElevation
                      onClick={lookUpDoi}
                      disabled={doiBusy || !doi.trim()}
                      startIcon={doiBusy ? <CircularProgress size={16} color="inherit" /> : <Search />}
                      sx={{ textTransform: "none", minHeight: 40 }}
                    >
                      Look up
                    </Button>
                    {changingPaper && (
                      <Button onClick={() => setChangingPaper(false)} sx={{ textTransform: "none", minHeight: 40 }}>
                        Cancel
                      </Button>
                    )}
                  </Box>
                  {doiError && <Alert severity="warning" sx={{ mt: 1 }}>{doiError}</Alert>}
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }} data-testid="guided-doi-hint">
                    {DOI_PROMPTS[type].hint}{" "}
                    <SectionLink target="curate-reference">Enter the details by hand</SectionLink>
                    {type === "software" && codeHost !== "fileserver" && (
                      <>
                        {" · "}
                        <Link
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setRepoUseDoi(false);
                          }}
                          style={{ color: "#800000" }}
                        >
                          Use the repository link instead
                        </Link>
                      </>
                    )}
                  </Typography>
                </Box>
              )}
            </StepContent>
          </Step>

          {/* 3. Folder */}
          {folderSteps && (
          <Step completed={steps.folder} expanded>
            {stepLabel("folder", "Project folder", "Where the figures, data and scripts are stored")}
            <StepContent>
              {fileServerPath && !editingFolder ? (
                <Summary>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <FolderOpen sx={{ color: "#800000" }} fontSize="small" />
                    <Typography
                      component="a"
                      href={fileServerPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="body2"
                      sx={{ color: "#800000", overflowWrap: "anywhere", flex: 1 }}
                    >
                      {fileServerPath}
                    </Typography>
                    <Button size="small" onClick={startEditingFolder} sx={{ textTransform: "none" }}>
                      Change
                    </Button>
                  </Box>
                  {locateResult && locateResult.found && locateResult.path === fileServerPath && (
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                      Found automatically from the DOI
                      {locateResult.folders && locateResult.folders.length
                        ? ` · contains ${locateResult.folders.join(", ")}`
                        : ""}
                    </Typography>
                  )}
                </Summary>
              ) : locating && !editingFolder ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">
                    Looking for the paper's folder on the research computing server…
                  </Typography>
                </Box>
              ) : null}

              {showFolderEditor && (
                <Box>
                  {!editingFolder && locateResult && !locateResult.found && !locateResult.error && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      No folder named after this DOI was found. Paste its address or browse for it.
                    </Typography>
                  )}
                  <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <Autocomplete
                      freeSolo
                      size="small"
                      options={serverOptions}
                      getOptionLabel={(option) => (typeof option === "string" ? option : option.label || option.value)}
                      value={serverOptions.find((server) => server.value === serverRoot) || serverRoot || null}
                      onChange={(_event, value) =>
                        setServerRoot(typeof value === "string" ? value : value ? value.value : "")
                      }
                      onInputChange={(_event, value, reason) => {
                        if (reason === "input") setServerRoot(value);
                      }}
                      renderInput={(params) => (
                        <TextField {...params} label="File server" placeholder="https://notebook.rcc.uchicago.edu/files" />
                      )}
                      sx={{ flex: "1 1 320px" }}
                    />
                    <Button
                      variant="contained"
                      disableElevation
                      onClick={browseFolders}
                      disabled={browsing || !String(serverRoot || "").trim()}
                      startIcon={browsing ? <CircularProgress size={16} color="inherit" /> : <FolderOpen />}
                      sx={{ textTransform: "none", minHeight: 40 }}
                    >
                      Browse…
                    </Button>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap", mt: 1.5 }}>
                    <TextField
                      size="small"
                      label="Or paste the folder address"
                      placeholder={`${(serverRoot || "https://notebook.rcc.uchicago.edu/files").replace(/\/+$/, "")}/your-paper-folder`}
                      value={folderInput}
                      onChange={(e) => {
                        setFolderInput(e.target.value);
                        setFolderError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitFolder(folderInput);
                        }
                      }}
                      sx={{ flex: "1 1 320px" }}
                    />
                    <Button
                      variant="outlined"
                      onClick={() => commitFolder(folderInput)}
                      disabled={!folderInput.trim()}
                      sx={{ textTransform: "none", minHeight: 40 }}
                    >
                      Use this folder
                    </Button>
                    {editingFolder && (
                      <Button
                        onClick={() => {
                          setEditingFolder(false);
                          setPendingFolder(null);
                          setFolderError("");
                        }}
                        sx={{ textTransform: "none", minHeight: 40 }}
                      >
                        Cancel
                      </Button>
                    )}
                  </Box>
                  {folderError && <Alert severity="warning" sx={{ mt: 1 }}>{folderError}</Alert>}
                  {pendingFolder && (
                    <Alert
                      severity="warning"
                      sx={{ mt: 1 }}
                      action={
                        <Box sx={{ display: "flex", gap: 0.5 }}>
                          <Button size="small" onClick={() => setPendingFolder(null)}>
                            Keep current
                          </Button>
                          <Button
                            size="small"
                            color="warning"
                            onClick={() => commitFolder(pendingFolder, { force: true })}
                          >
                            Change anyway
                          </Button>
                        </Box>
                      }
                    >
                      {`This record already has ${plural(charts.length, "figure", "figures")}. Their paths are relative to the folder, so changing it can break their images.`}
                    </Alert>
                  )}
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
                    Zenodo record?{" "}
                    <SectionLink target="curate-fileserver">Use the full form</SectionLink>
                  </Typography>
                </Box>
              )}
            </StepContent>
          </Step>
          )}

          {/* 4. Import */}
          {(folderSteps || repoMode) && (
          <Step completed={steps.import} expanded>
            {repoMode
              ? stepLabel("import", "Scripts, data & tools", "Read from the repository")
              : stepLabel("import", "Figures, data & scripts", "Read from the project folder")}
            <StepContent>
              {!scanKey ? (
                <Typography variant="body2" color="text.secondary">
                  {repoMode
                    ? "Available once the repository link is set in step 2."
                    : "Available once the project folder is set."}
                </Typography>
              ) : scanning ? (
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {repoMode
                      ? "Reading the repository… large repositories can take a minute."
                      : "Reading the project folder… large folders can take a minute."}
                  </Typography>
                  <LinearProgress />
                </Box>
              ) : scanError ? (
                <Box>
                  <Alert
                    severity="warning"
                    action={<Button size="small" onClick={scan}>Try again</Button>}
                  >
                    {scanError}
                  </Alert>
                  <SkipToAi step="import" />
                </Box>
              ) : added ? (
                <Alert severity="success" icon={<CheckCircle fontSize="inherit" />}>
                  {`Added ${LISTS.map(({ key, noun, plural: many }) =>
                    added.counts[key] ? plural(added.counts[key], noun, many) : null
                  )
                    .filter(Boolean)
                    .join(", ")}${added.links ? ` and ${plural(added.links, "link", "links")} between them` : ""}.`}{" "}
                  <SectionLink target="curate-figures">Review them</SectionLink>
                </Alert>
              ) : analysis ? (
                plan.items.length === 0 ? (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      {`Nothing importable was found in this ${repoMode ? "repository" : "folder"}.`}{" "}
                      <SectionLink target="curate-figures">Add items by hand</SectionLink>
                      {repoMode ? "." : ", or let the AI look for them below."}
                    </Typography>
                    <SkipToAi step="import" />
                  </Box>
                ) : (
                  <Box>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center" }}>
                      {LISTS.map(({ key, noun, plural: many }) =>
                        counts[key] ? (
                          <Chip key={key} label={plural(counts[key], noun, many)} color="primary" variant="outlined" />
                        ) : null
                      )}
                      {chosenLinks.length > 0 && (
                        <Chip label={plural(chosenLinks.length, "link found", "links found")} variant="outlined" />
                      )}
                    </Box>
                    {plan.items.length - chosen.length - plan.items.filter((item) => item.duplicate).length > 0 && (
                      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }} data-testid="guided-unselected">
                        {`${plural(
                          plan.items.length - chosen.length - plan.items.filter((item) => item.duplicate).length,
                          "more item was",
                          "more items were"
                        )} found but not selected${repoMode ? " (images no script writes, scripts that write no figure)" : ""}. Review the list to add them.`}
                      </Typography>
                    )}
                    {plan.items.some((item) => item.duplicate) && (
                      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
                        Items already in this record are skipped.
                      </Typography>
                    )}
                    <Box sx={{ display: "flex", gap: 1, mt: 1.5, flexWrap: "wrap" }}>
                      <Button
                        variant="contained"
                        disableElevation
                        onClick={addAll}
                        disabled={!chosen.length}
                        sx={{ textTransform: "none", fontWeight: 600 }}
                      >
                        {`Add ${plural(chosen.length, "item", "items")} to the record`}
                      </Button>
                      <Button
                        onClick={() => setReviewOpen((v) => !v)}
                        endIcon={<ExpandMore sx={{ transform: reviewOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />}
                        sx={{ textTransform: "none" }}
                      >
                        {reviewOpen ? "Hide list" : "Review the list"}
                      </Button>
                    </Box>
                    <Collapse in={reviewOpen} unmountOnExit>
                      <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
                        {LISTS.map(({ key, plural: many }) => {
                          const group = plan.items.filter((item) => item.list === key && !item.duplicate);
                          if (!group.length) return null;
                          return (
                            <Box key={key}>
                              <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                {many}
                              </Typography>
                              {group.map((item) => (
                                <Box key={item.key} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                  <Checkbox
                                    size="small"
                                    checked={!excluded[item.key]}
                                    onChange={(e) => setExcluded((x) => ({ ...x, [item.key]: !e.target.checked }))}
                                    slotProps={{ input: { "aria-label": item.label } }}
                                  />
                                  <Typography variant="body2" sx={{ overflowWrap: "anywhere", flex: 1 }}>
                                    {item.label}
                                    {item.type === "chart" && item.value.number ? (
                                      <Typography component="span" variant="caption" color="text.secondary">{`  · Figure ${item.value.number}`}</Typography>
                                    ) : null}
                                  </Typography>
                                  {item.missing.length > 0 && (
                                    <Tooltip title={`Still needs: ${item.missing.map((f) => labelFor(item.type, f)).join(", ")}`}>
                                      <Chip size="small" label={`${item.missing.length} to fill`} sx={{ height: 20 }} />
                                    </Tooltip>
                                  )}
                                </Box>
                              ))}
                            </Box>
                          );
                        })}
                        {plan.links.length > 0 && (
                          <Box>
                            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              Links
                            </Typography>
                            {plan.links.map((link) => {
                              const id = `${link.from}>${link.to}`;
                              return (
                                <Box key={id + link.type} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                  <Checkbox
                                    size="small"
                                    checked={!excluded[id]}
                                    onChange={(e) => setExcluded((x) => ({ ...x, [id]: !e.target.checked }))}
                                    slotProps={{ input: { "aria-label": `${labels[link.from]} to ${labels[link.to]}` } }}
                                  />
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                                      {`${labels[link.from]} → ${labels[link.to]}`}
                                      {link.confidence === "medium" && (
                                        <Chip size="small" label="likely" sx={{ ml: 1, height: 18 }} />
                                      )}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">{link.reason}</Typography>
                                  </Box>
                                </Box>
                              );
                            })}
                          </Box>
                        )}
                      </Box>
                    </Collapse>
                    <Divider sx={{ my: 1.5 }} />
                    {repoMode ? (
                      <RepoNotes analysis={analysis} />
                    ) : (
                      <>
                        <Typography variant="caption" color="text.secondary" component="div">
                          Need finer control over what becomes a figure?{" "}
                          <SectionLink target="curate-figures">Use the detailed import</SectionLink>
                        </Typography>
                        <Typography variant="caption" color="text.secondary" component="div">
                          Folder not organised the Qresp way, or something missing? Step 6 can
                          review and curate the whole folder with AI.
                        </Typography>
                      </>
                    )}
                  </Box>
                )
              ) : artifactCount ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="body2" color="text.secondary">
                    {`This record has ${[
                      charts.length && plural(charts.length, "figure", "figures"),
                      datasets.length && plural(datasets.length, "dataset", "datasets"),
                      scripts.length && plural(scripts.length, "script", "scripts"),
                      tools.length && plural(tools.length, "tool", "tools"),
                    ]
                      .filter(Boolean)
                      .join(", ")}.`}
                  </Typography>
                  <Button size="small" onClick={scan} sx={{ textTransform: "none" }}>
                    {repoMode ? "Read the repository for more" : "Scan the folder for more"}
                  </Button>
                </Box>
              ) : (
                <Button variant="outlined" onClick={scan} sx={{ textTransform: "none" }}>
                  {repoMode ? "Read the repository" : "Scan the project folder"}
                </Button>
              )}

              {canFind && (
                <Box
                  data-testid="ai-find"
                  sx={{ mt: 1.5, p: 1.5, borderRadius: 2, border: "1px dashed", borderColor: "divider" }}
                >
                  <AiAction help={AI_HELP.find}>
                    <Button
                      variant={missingKinds.length ? "contained" : "outlined"}
                      disableElevation
                      size="small"
                      onClick={() => askConsent(findWithAi)}
                      disabled={Boolean(aiBusy)}
                      startIcon={aiBusy === "find" ? <CircularProgress size={14} color="inherit" /> : <AutoAwesome />}
                      sx={{ textTransform: "none" }}
                    >
                      {findLabel}
                    </Button>
                  </AiAction>
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                    {missingKinds.length
                      ? `The folder scan found no ${joinWords(missingKinds.map((kind) => KIND_NOUN[kind]))}. As a backup, the AI can read the folder and look for them itself.`
                      : "A backup to the folder scan: the AI reads the folder and proposes anything it missed."}
                  </Typography>
                  {aiBusy === "find" && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Reading the folder and asking the AI… this can take a minute.
                      </Typography>
                      <LinearProgress sx={{ mt: 0.5 }} />
                    </Box>
                  )}
                  {findError && <Alert severity="warning" sx={{ mt: 1 }}>{findError}</Alert>}
                  {findNote && <Alert severity="success" sx={{ mt: 1 }}>{findNote}</Alert>}
                  {findResult && (
                    <Box sx={{ mt: 1.5 }}>
                      <ProposalReview
                        result={findResult}
                        skip={findSkip}
                        setSkip={setFindSkip}
                        recordLabel={recordLabel}
                        intro={`The AI proposes ${plural(curateItemsOf(findResult).length, "item", "items")}${(findResult.links || []).length ? ` and ${plural(findResult.links.length, "link", "links")}` : ""}. Untick anything that is wrong.`}
                        emptyText={`The AI found no ${joinWords(findKinds.map((kind) => KIND_NOUN[kind]))} in this folder that are not already in the record.`}
                      />
                      <ModelNote models={findResult.models} />
                      <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                        {proposalCount(findResult) > 0 && (
                          <Button variant="contained" disableElevation onClick={applyFound} sx={{ textTransform: "none", fontWeight: 600 }}>
                            Add selected
                          </Button>
                        )}
                        <Button onClick={() => setFindResult(null)} sx={{ textTransform: "none" }}>
                          {proposalCount(findResult) > 0 ? "Cancel" : "Close"}
                        </Button>
                      </Box>
                    </Box>
                  )}
                </Box>
              )}
            </StepContent>
          </Step>
          )}

          {/* 5. Captions (papers and reports only) */}
          {hasLatex && (
          <Step completed={steps.captions} expanded>
            {stepLabel("captions", "Figure captions", "Copied from the paper's LaTeX source")}
            <StepContent>
              {!charts.length ? (
                <Typography variant="body2" color="text.secondary">
                  Available once figures are in the record.
                </Typography>
              ) : !authenticated ? (
                <Typography variant="body2" color="text.secondary">
                  Sign in to read captions from the paper's source.
                </Typography>
              ) : (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Your paper's LaTeX already contains every figure's caption.
                    Point Qresp at the source and it copies each{" "}
                    <Box component="code" sx={{ fontSize: "0.85em" }}>\caption{"{…}"}</Box>{" "}
                    onto the matching figure: the paper's exact words, and
                    nothing is stored. If the DOI lookup found no abstract, the
                    abstract is taken from the source too. When the file names
                    differ, an AI backup can match the rest.
                  </Typography>

                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={srcMode}
                    onChange={(_event, value) => value && setSrcMode(value)}
                    sx={{ mb: 1.5, flexWrap: "wrap" }}
                  >
                    <ToggleButton value="arxiv" sx={{ textTransform: "none" }}>arXiv</ToggleButton>
                    <ToggleButton value="upload" sx={{ textTransform: "none" }}>Upload .tex / .zip</ToggleButton>
                    <ToggleButton value="overleaf" sx={{ textTransform: "none" }}>Overleaf</ToggleButton>
                  </ToggleButtonGroup>

                  {srcMode === "arxiv" && (
                    <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <TextField
                        size="small"
                        label="arXiv ID or link"
                        placeholder="2409.00246 or https://arxiv.org/abs/2409.00246"
                        value={arxivInput}
                        onChange={(e) => setArxivInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && arxivInput.trim()) {
                            e.preventDefault();
                            runLatex({ arxiv: arxivInput.trim() });
                          }
                        }}
                        sx={{ flex: "1 1 280px" }}
                        disabled={latexBusy}
                      />
                      <Button
                        variant="contained"
                        disableElevation
                        onClick={() => runLatex({ arxiv: arxivInput.trim() })}
                        disabled={latexBusy || !arxivInput.trim()}
                        startIcon={latexBusy ? <CircularProgress size={16} color="inherit" /> : <Description />}
                        sx={{ textTransform: "none", minHeight: 40 }}
                      >
                        Get captions
                      </Button>
                    </Box>
                  )}

                  {(srcMode === "upload" || srcMode === "overleaf") && (
                    <Box>
                      {srcMode === "overleaf" && (
                        <Box component="ol" sx={{ m: 0, mb: 1.5, pl: 2.5, color: "text.secondary", typography: "body2" }}>
                          <li>Open the project in Overleaf.</li>
                          <li>Choose <strong>Menu → Download → Source</strong> to get a .zip.</li>
                          <li>Upload that .zip below.</li>
                        </Box>
                      )}
                      <Button
                        variant="contained"
                        disableElevation
                        component="label"
                        disabled={latexBusy}
                        startIcon={latexBusy ? <CircularProgress size={16} color="inherit" /> : <Description />}
                        sx={{ textTransform: "none" }}
                      >
                        {srcMode === "overleaf" ? "Upload the Overleaf .zip" : "Choose a file…"}
                        <input
                          hidden
                          type="file"
                          accept=".tex,.ltx,.zip,.tar,.gz,.tgz"
                          onChange={onLatexFile}
                          data-testid="latex-file"
                        />
                      </Button>
                      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
                        {srcMode === "overleaf"
                          ? "Overleaf projects are private, so Qresp cannot read them from a link."
                          : "A single .tex file, or a .zip / .tar.gz of the whole project (up to 10 MB; the images are not needed)."}
                      </Typography>
                    </Box>
                  )}

                  {latexError && <Alert severity="warning" sx={{ mt: 1.5 }}>{latexError}</Alert>}

                  {captionsApplied !== null && !latexResult && (
                    <Alert severity="success" sx={{ mt: 1.5 }}>
                      {captionsApplied
                        ? `Added ${plural(captionsApplied, "caption", "captions")}.`
                        : "No captions were changed."}
                      {uncaptioned ? ` ${plural(uncaptioned, "figure still needs", "figures still need")} a caption.` : ""}
                    </Alert>
                  )}

                  {latexResult && (
                    <Box sx={{ mt: 1.5 }}>
                      {latexResult.abstractFilled && (
                        <Alert severity="success" sx={{ mb: 1 }}>
                          The DOI lookup had no abstract, so it was filled in from the LaTeX source.
                        </Alert>
                      )}
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        {`Read ${latexResult.source} · ${plural((latexResult.figures || []).length, "figure or table", "figures and tables")} found · `}
                        <strong>{`${plural((latexResult.matches || []).length, "matches a figure", "match figures")} in this record`}</strong>
                      </Typography>
                      {captionMatches.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          {(latexResult.matches || []).length
                            ? "Those captions are already on their figures."
                            : "None of them could be matched to this record's figures by file name or figure number."}
                        </Typography>
                      ) : (
                        <Box>
                          <Box sx={{ maxHeight: 340, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                            {captionMatches.map((match) => {
                              const record = charts.find((chart) => chart.id === match.id);
                              const replaces = record && String(record.caption || "").trim();
                              return (
                                <Box
                                  key={match.id}
                                  sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", px: 1, py: 0.75, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } }}
                                >
                                  <Checkbox
                                    size="small"
                                    checked={!captionSkip[match.id]}
                                    onChange={(e) => setCaptionSkip((x) => ({ ...x, [match.id]: !e.target.checked }))}
                                    slotProps={{ input: { "aria-label": `Caption for ${chartFileName(match.id)}` } }}
                                  />
                                  <Box sx={{ minWidth: 0, flex: 1 }}>
                                    <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
                                      {`${chartFileName(match.id)} · ${/^Table/.test(match.number) ? match.number : `Figure ${match.number}`}`}
                                      <Typography component="span" variant="caption" color="text.secondary">
                                        {match.how === "file"
                                          ? "  · matched by file name"
                                          : match.how === "ai"
                                          ? "  · matched by AI"
                                          : "  · matched by number"}
                                      </Typography>
                                      {match.how === "ai" && match.confidence && (
                                        <Chip size="small" label={match.confidence} variant="outlined" sx={{ ml: 1, height: 18 }} />
                                      )}
                                    </Typography>
                                    {match.how === "ai" && match.reason && (
                                      <Typography variant="caption" color="text.secondary" component="div" sx={{ fontStyle: "italic" }}>
                                        {match.reason}
                                      </Typography>
                                    )}
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                                    >
                                      {match.caption}
                                    </Typography>
                                    {replaces && (
                                      <Typography variant="caption" color="warning.main" component="div">
                                        Replaces the caption already on this figure.
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                              );
                            })}
                          </Box>
                          <ModelNote models={latexResult.models} />
                          <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                            <Button
                              variant="contained"
                              disableElevation
                              onClick={applyCaptions}
                              disabled={!captionChosen.length}
                              sx={{ textTransform: "none", fontWeight: 600 }}
                            >
                              {`Apply ${plural(captionChosen.length, "caption", "captions")}`}
                            </Button>
                            <Button onClick={() => setLatexResult(null)} sx={{ textTransform: "none" }}>
                              Cancel
                            </Button>
                          </Box>
                        </Box>
                      )}
                    </Box>
                  )}

                  {canAiMatch && (
                    <Box
                      data-testid="ai-match"
                      sx={{ mt: 1.5, p: 1.5, borderRadius: 2, border: "1px dashed", borderColor: "divider" }}
                    >
                      <AiAction help={AI_HELP.match}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => askConsent(matchWithAi)}
                          disabled={Boolean(aiBusy)}
                          startIcon={aiBusy === "match" ? <CircularProgress size={14} /> : <AutoAwesome />}
                          sx={{ textTransform: "none" }}
                        >
                          {`Match ${plural(matchCandidates.length, "remaining figure", "remaining figures")} with AI`}
                        </Button>
                      </AiAction>
                      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                        {`${plural(matchCandidates.length, "figure has", "figures have")} no caption and could not be matched by file name or number, probably because the names in the LaTeX differ from the folder's. The AI can match them; the caption applied is still the paper's own text.`}
                      </Typography>
                    </Box>
                  )}
                  {matchError && <Alert severity="warning" sx={{ mt: 1.5 }}>{matchError}</Alert>}
                  {matchNote && <Alert severity="info" sx={{ mt: 1.5 }}>{matchNote}</Alert>}
                  {uncaptioned > 0 && !latexBusy && (
                    <SkipToAi
                      step="captions"
                      note={`${plural(uncaptioned, "figure has", "figures have")} no caption yet. The AI assistant can draft a description for ${uncaptioned === 1 ? "it" : "them"}.`}
                    />
                  )}
                </Box>
              )}
            </StepContent>
          </Step>
          )}

          {/* 6. AI assistant */}
          {folderSteps && (
          <Step completed={steps.ai} expanded id="guided-ai" sx={{ scrollMarginTop: 96 }}>
            {stepLabel("ai", "AI assistant (optional)", "Fill the gaps: keywords, descriptions, links and a review of the record")}
            <StepContent>
              {!artifactCount && !fileServerPath ? (
                <Typography variant="body2" color="text.secondary">
                  Available once the project folder is set.
                </Typography>
              ) : !authenticated ? (
                <Typography variant="body2" color="text.secondary">
                  Sign in to use the AI assistant.
                </Typography>
              ) : (
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Qresp has already matched everything it can from file names,
                    folders and the paper's LaTeX. The AI assistant fills the
                    gaps: keywords for each figure, descriptions for each dataset
                    and script, which scripts and data produced which figures,
                    and a review of the whole record. Every suggestion comes with
                    a reason and nothing is applied until you choose it. Use the{" "}
                    <InfoOutlinedIcon sx={{ fontSize: "1rem", verticalAlign: "text-bottom" }} />{" "}
                    beside a button to see exactly what it does.
                  </Typography>
                  <FormControlLabel
                    control={<Checkbox size="small" checked={aiConsent} onChange={(e) => setAiConsent(e.target.checked)} />}
                    label={
                      <Typography variant="body2">
                        Send the paper's title, abstract and figure captions, the list
                        of files in the project folder, its READMEs and the start of
                        each script, to Google Gemini. Nothing is stored.
                      </Typography>
                    }
                    sx={{ alignItems: "flex-start", mb: 1, "& .MuiCheckbox-root": { pt: 0.25 } }}
                  />
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                    <AiAction help={AI_HELP.keywords}>
                      <Button
                        variant="contained"
                        disableElevation
                        onClick={suggestKeywords}
                        disabled={!aiConsent || Boolean(aiBusy) || !charts.some((chart) => String(chart.caption || "").trim())}
                        startIcon={aiBusy === "keywords" ? <CircularProgress size={16} color="inherit" /> : <Psychology />}
                        sx={{ textTransform: "none" }}
                      >
                        Suggest keywords
                      </Button>
                    </AiAction>
                    <AiAction help={AI_HELP.descriptions}>
                      <Button
                        variant="outlined"
                        onClick={suggestDescriptions}
                        disabled={!aiConsent || Boolean(aiBusy) || !fileServerPath || !(scripts.length || datasets.length || uncaptioned)}
                        startIcon={aiBusy === "descriptions" ? <CircularProgress size={16} /> : <Psychology />}
                        sx={{ textTransform: "none" }}
                      >
                        Suggest descriptions
                      </Button>
                    </AiAction>
                    <AiAction help={AI_HELP.links}>
                      <Button
                        variant="outlined"
                        onClick={suggestLinks}
                        disabled={!aiConsent || Boolean(aiBusy) || !charts.length || !(scripts.length || datasets.length)}
                        startIcon={aiBusy === "links" ? <CircularProgress size={16} /> : <Psychology />}
                        sx={{ textTransform: "none" }}
                      >
                        Suggest missing links
                      </Button>
                    </AiAction>
                    <AiAction help={AI_HELP.curate}>
                      <Button
                        variant="outlined"
                        onClick={curateFolder}
                        disabled={!aiConsent || Boolean(aiBusy) || !fileServerPath}
                        startIcon={aiBusy === "curate" ? <CircularProgress size={16} /> : <AutoAwesome />}
                        sx={{ textTransform: "none" }}
                      >
                        Curate the whole folder with AI
                      </Button>
                    </AiAction>
                  </Box>
                  {uncaptioned > 0 && (
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
                      {`${plural(uncaptioned, "figure has", "figures have")} no caption. Suggest descriptions can draft one for ${uncaptioned === 1 ? "it" : "each"}; keywords are suggested from captions, so do that first.`}
                    </Typography>
                  )}
                  {!artifactCount && (
                    <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75 }}>
                      Nothing is in the record yet: Curate the whole folder with AI can propose the figures, data and scripts.
                    </Typography>
                  )}

                  {aiError && <Alert severity="warning" sx={{ mt: 1.5 }}>{aiError}</Alert>}
                  {aiApplied && <Alert severity="success" sx={{ mt: 1.5 }}>{aiApplied}</Alert>}

                  {(aiBusy === "curate" || aiBusy === "descriptions") && (
                    <Box sx={{ mt: 1.5 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {aiBusy === "curate"
                          ? "Reading the folder and the record, and asking the AI… this can take a minute."
                          : "Reading the datasets and scripts and asking the AI…"}
                      </Typography>
                      <LinearProgress />
                    </Box>
                  )}

                  {curateResult && (
                    <Box sx={{ mt: 1.5 }}>
                      <ProposalReview
                        result={curateResult}
                        skip={curateSkip}
                        setSkip={setCurateSkip}
                        recordLabel={recordLabel}
                        intro={(() => {
                          const items = curateItemsOf(curateResult).length;
                          const links = (curateResult.links || []).length;
                          const edits = (curateResult.edits || []).length;
                          const parts = [
                            items && `${plural(items, "item", "items")} that Qresp did not find`,
                            links && plural(links, "link", "links"),
                            edits && plural(edits, "improvement", "improvements"),
                          ].filter(Boolean);
                          return parts.length
                            ? `The AI proposes ${joinWords(parts)}. Untick anything that is wrong.`
                            : "";
                        })()}
                        emptyText="The AI found nothing more to add or improve: the record already covers the folder."
                      />
                      <ModelNote models={curateResult.models} />
                      <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                        {proposalCount(curateResult) > 0 && (
                          <Button variant="contained" disableElevation onClick={applyCuration} sx={{ textTransform: "none", fontWeight: 600 }}>
                            Add selected
                          </Button>
                        )}
                        <Button onClick={() => setCurateResult(null)} sx={{ textTransform: "none" }}>
                          {proposalCount(curateResult) > 0 ? "Cancel" : "Close"}
                        </Button>
                      </Box>
                    </Box>
                  )}

                  {descResult && (
                    <Box sx={{ mt: 1.5 }}>
                      {(descResult.descriptions || []).length === 0 ? (
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            The AI could not describe any dataset or script from the evidence in the folder.
                          </Typography>
                          <ModelNote models={descResult.models} />
                        </Box>
                      ) : (
                        <Box>
                          <Box sx={{ maxHeight: 340, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                            {descResult.descriptions.map(({ id, description, confidence }) => {
                              const current = currentDescription(id);
                              return (
                                <Box key={id} sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", px: 1, py: 0.75, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } }}>
                                  <Checkbox
                                    size="small"
                                    checked={!descSkip[id]}
                                    onChange={(e) => setDescSkip((x) => ({ ...x, [id]: !e.target.checked }))}
                                    slotProps={{ input: { "aria-label": `Description for ${recordLabel(id)}` } }}
                                  />
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
                                      {recordLabel(id)}
                                      <Typography component="span" variant="caption" color="text.secondary">
                                        {id[0] === "d" ? "  · dataset" : id[0] === "s" ? "  · script" : "  · figure"}
                                      </Typography>
                                      <Chip size="small" label={confidence} variant="outlined" sx={{ ml: 1, height: 18 }} />
                                    </Typography>
                                    <Typography variant="body2">{description}</Typography>
                                    {id[0] === "c" && (
                                      <Typography variant="caption" color="text.secondary" component="div" sx={{ fontStyle: "italic" }}>
                                        AI-drafted description, not the paper's caption. Check it, or replace it with the caption later.
                                      </Typography>
                                    )}
                                    {current && (
                                      <Typography variant="caption" color="warning.main" component="div">
                                        {`Replaces: ${current}`}
                                      </Typography>
                                    )}
                                  </Box>
                                </Box>
                              );
                            })}
                          </Box>
                          <ModelNote models={descResult.models} />
                          <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                            <Button variant="contained" disableElevation onClick={applyDescriptions} sx={{ textTransform: "none", fontWeight: 600 }}>
                              Apply selected descriptions
                            </Button>
                            <Button onClick={() => setDescResult(null)} sx={{ textTransform: "none" }}>Cancel</Button>
                          </Box>
                        </Box>
                      )}
                    </Box>
                  )}

                  {kwResult && (
                    <Box sx={{ mt: 1.5 }}>
                      {kwResult.incomplete && (
                        <Alert severity="info" sx={{ mb: 1 }}>
                          {`The AI service was busy for part of the request, so only ${plural((kwResult.figures || []).length, "figure has", "figures have")} suggestions. Apply these, then run Suggest keywords again for the rest.`}
                        </Alert>
                      )}
                      <Box sx={{ maxHeight: 340, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                        {(kwResult.paper_keywords || []).length > 0 && !paperTags.length && (
                          <Box sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", px: 1, py: 0.75, borderBottom: "1px solid", borderColor: "divider" }}>
                            <Checkbox
                              size="small"
                              checked={!kwSkip.__paper}
                              onChange={(e) => setKwSkip((x) => ({ ...x, __paper: !e.target.checked }))}
                              slotProps={{ input: { "aria-label": "Paper keywords" } }}
                            />
                            <Box>
                              <Typography variant="body2" fontWeight={600}>The paper</Typography>
                              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.25 }}>
                                {kwResult.paper_keywords.map((k) => <Chip key={k} size="small" label={k} />)}
                              </Box>
                            </Box>
                          </Box>
                        )}
                        {(kwResult.figures || []).map(({ id, keywords }) => {
                          const record = charts.find((chart) => chart.id === id) || {};
                          const current = record.properties || [];
                          return (
                            <Box key={id} sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", px: 1, py: 0.75, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } }}>
                              <Checkbox
                                size="small"
                                checked={!kwSkip[id]}
                                onChange={(e) => setKwSkip((x) => ({ ...x, [id]: !e.target.checked }))}
                                slotProps={{ input: { "aria-label": `Keywords for ${recordLabel(id)}` } }}
                              />
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: "anywhere" }}>{recordLabel(id)}</Typography>
                                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.25 }}>
                                  {keywords.map((k) => <Chip key={k} size="small" color="primary" variant="outlined" label={k} />)}
                                </Box>
                                {current.length > 0 && (
                                  <Typography variant="caption" color="text.secondary">
                                    {`Replaces: ${current.join(", ")}`}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          );
                        })}
                      </Box>
                      <ModelNote models={kwResult.models} />
                      <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                        <Button variant="contained" disableElevation onClick={applyKeywords} sx={{ textTransform: "none", fontWeight: 600 }}>
                          Apply selected keywords
                        </Button>
                        <Button onClick={() => setKwResult(null)} sx={{ textTransform: "none" }}>Cancel</Button>
                      </Box>
                    </Box>
                  )}

                  {linkResult && (
                    <Box sx={{ mt: 1.5 }}>
                      {(linkResult.links || []).length === 0 ? (
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            The AI found no further links it could support with evidence.
                          </Typography>
                          <ModelNote models={linkResult.models} />
                        </Box>
                      ) : (
                        <Box>
                          <Box sx={{ maxHeight: 340, overflowY: "auto", border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                            {linkResult.links.map((link) => {
                              const key = `${link.from}>${link.to}`;
                              return (
                                <Box key={key} sx={{ display: "flex", gap: 0.5, alignItems: "flex-start", px: 1, py: 0.75, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: 0 } }}>
                                  <Checkbox
                                    size="small"
                                    checked={!linkSkip[key]}
                                    onChange={(e) => setLinkSkip((x) => ({ ...x, [key]: !e.target.checked }))}
                                    slotProps={{ input: { "aria-label": `${recordLabel(link.from)} to ${recordLabel(link.to)}` } }}
                                  />
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                                      {`${recordLabel(link.from)} ${link.type === "generates" ? "generates" : "supplies"} ${recordLabel(link.to)}`}
                                      <Chip
                                        size="small"
                                        label={link.confidence}
                                        color={link.confidence === "high" ? "success" : link.confidence === "medium" ? "default" : "warning"}
                                        variant="outlined"
                                        sx={{ ml: 1, height: 18 }}
                                      />
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">{link.reason}</Typography>
                                  </Box>
                                </Box>
                              );
                            })}
                          </Box>
                          <ModelNote models={linkResult.models} />
                          <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
                            <Button variant="contained" disableElevation onClick={applyLinks} sx={{ textTransform: "none", fontWeight: 600 }}>
                              Add selected links
                            </Button>
                            <Button onClick={() => setLinkResult(null)} sx={{ textTransform: "none" }}>Cancel</Button>
                          </Box>
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              )}
            </StepContent>
          </Step>
          )}

          {/* 7. Finish */}
          <Step completed={steps.finish} expanded>
            {stepLabel("finish", "Finish the details", "Captions and anything only you know")}
            <StepContent>
              {(
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  {missingPI && !skipOptional && (
                    <Alert
                      severity="info"
                      action={
                        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {lastAuthor && (
                            <Button size="small" onClick={applyLastAuthorAsPI} sx={{ textTransform: "none" }}>
                              {`Use last author: ${lastAuthor}`}
                            </Button>
                          )}
                          <SectionLink target="curate-paperinfo">Open</SectionLink>
                        </Box>
                      }
                    >
                      No principal investigator yet. Optional, but it tells readers whose group the work is from.
                    </Alert>
                  )}

                  {optionalLeft && (
                    <>
                      <Alert
                        severity="info"
                        action={
                          <Button size="small" onClick={() => setSkipOptional(true)} sx={{ textTransform: "none", whiteSpace: "nowrap" }}>
                            Skip, leave blank
                          </Button>
                        }
                      >
                        {[
                          missingOptional.length ? `The ${typeInfo.noun} has no ${joinWords(missingOptional)}` : "",
                          optionalFigures
                            ? `${plural(optionalFigures, "figure is", "figures are")} missing a caption, number or keywords`
                            : "",
                          optionalResources
                            ? `${plural(optionalResources, "dataset or script has", "datasets and scripts have")} no description`
                            : "",
                        ]
                          .filter(Boolean)
                          .join("; ") + ". All of this is optional: it helps readers, but you can publish without it and add it later."}
                        {optionalResources > 0 && authenticated
                          ? " Suggest descriptions in step 6 can draft the descriptions for you."
                          : ""}
                      </Alert>
                      {optionalNeeding.length > 0 && (
                        <FinishDetails
                          needing={optionalNeeding}
                          fileServerPath={fileServerPath}
                          paperTags={paperTags}
                          edit={edit}
                        />
                      )}
                      {missingOptional.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Add collections or keywords in{" "}
                          <SectionLink target="curate-paperinfo">Qresp Curation Information</SectionLink>.
                        </Typography>
                      )}
                    </>
                  )}

                  {recordReady && (
                    <Paper
                      variant="outlined"
                      sx={{ p: 2, borderRadius: 2, borderColor: "success.light", bgcolor: "rgba(46,125,50,0.04)" }}
                      data-testid="record-ready"
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <CheckCircle sx={{ color: "success.main" }} />
                        <Typography variant="subtitle2" fontWeight={700}>
                          Your curated record is ready
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Review the full record below, then preview how it will look
                        (this saves your draft first) or just save the draft. When you are happy, choose a license and publish.
                      </Typography>
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mt: 1.5 }}>
                        <Button
                          variant="contained"
                          disableElevation
                          startIcon={<Visibility />}
                          onClick={previewNow}
                          sx={{ textTransform: "none" }}
                        >
                          Save &amp; preview
                        </Button>
                        <Button
                          variant="outlined"
                          startIcon={draftSaving ? <CircularProgress size={16} /> : <SaveOutlined />}
                          onClick={saveDraftNow}
                          disabled={draftSaving || !authenticated}
                          sx={{ textTransform: "none" }}
                        >
                          Save draft
                        </Button>
                        <Button onClick={() => scrollToSection("curate-curator")} sx={{ textTransform: "none" }}>
                          Review the record
                        </Button>
                        <Button onClick={() => scrollToSection("curate-publish")} sx={{ textTransform: "none" }}>
                          Go to publish
                        </Button>
                      </Box>
                      {draftNote && (
                        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                          {draftNote}
                        </Typography>
                      )}
                    </Paper>
                  )}
                </Box>
              )}
            </StepContent>
          </Step>
        </Stepper>
      </Box>
      <AiConsentDialog
        open={Boolean(consentAsk)}
        onCancel={() => setConsentAsk(null)}
        onConfirm={() => {
          const run = consentAsk;
          setAiConsent(true);
          setConsentAsk(null);
          if (run) run();
        }}
      />
    </Paper>
  );
};

export default GuidedSetup;
