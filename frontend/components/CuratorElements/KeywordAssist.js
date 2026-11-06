import { AutoAwesome } from "@mui/icons-material";
import { Fragment, useContext, useRef, useState } from "react";
import PropTypes from "prop-types";

import axios from "axios";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Typography,
} from "@mui/material";

import CuratorContext from "../../Context/Curator/curatorContext";

// "Suggest Keywords with AI" — the only AI action in the Curator besides RCC
// candidate descriptions, and the only one that touches the record itself.
//
// What it reads is the curator's OWN work: the bibliographic fields they
// typed and the descriptive fields of the datasets, charts, scripts and tools
// they have already accepted into the record. Not a source file, not a path,
// not a URL, not an unaccepted folder candidate, and nothing about the
// account. Publication metadata is never suggested here — that comes from the
// DOI registry and manual entry.

// The allowlist, in one place, so what leaves the browser is auditable by
// reading this file rather than by tracing the request.
//
// These are the CANONICAL field names Curator state actually uses — the same
// ones `Utils/artifactFields.js` declares and `schema.json` publishes. They
// used to be the names the AI payload uses instead (`description` for a
// dataset, `facility` for a tool), which match nothing in state: those two
// fields were read as undefined and never sent, so the artifacts a curator
// had attached contributed nothing to the suggestions.
//
// The backend accepts these and normalizes them itself; it does not trust
// this list. Sending a path, a file name or anything about the account is
// still impossible here, because only these keys are ever read.
const ARTIFACT_FIELDS = {
  charts: ["caption", "properties"],
  datasets: ["readme", "keywords"],
  scripts: ["readme", "keywords"],
  tools: ["packageName", "description", "facilityName", "measurement"],
};

const pick = (entry, fields) => {
  const item = {};
  fields.forEach((field) => {
    const value = entry && entry[field];
    if (Array.isArray(value)) {
      const joined = value.filter(Boolean).join(", ").trim();
      if (joined) item[field] = joined;
    } else if (value != null && String(value).trim()) {
      item[field] = String(value).trim();
    }
  });
  return item;
};

// Build the request from a draft-state snapshot: the values ON SCREEN at the
// moment of the click, including sections the curator has not saved yet.
export const buildKeywordRequest = (state = {}) => {
  const reference = state.referenceInfo || {};
  const request = {
    consent: true,
    kind: reference.kind || "",
    title: reference.title || "",
    abstract: reference.abstract || "",
    publication: reference.publication || "",
    doi: reference.doi || "",
    year: reference.year == null ? "" : String(reference.year),
  };

  Object.keys(ARTIFACT_FIELDS).forEach((kind) => {
    const entries = Array.isArray(state[kind]) ? state[kind] : [];
    const reduced = entries
      .map((entry) => pick(entry, ARTIFACT_FIELDS[kind]))
      .filter((item) => Object.keys(item).length);
    if (reduced.length) request[kind] = reduced;
  });

  return request;
};

export const hasSomethingToWorkFrom = (state = {}) => {
  const request = buildKeywordRequest(state);
  const hasBiblio = Boolean(
    (request.title || "").trim() || (request.abstract || "").trim()
  );
  const hasArtifacts = Object.keys(ARTIFACT_FIELDS).some(
    (kind) => (request[kind] || []).length
  );
  return hasBiblio || hasArtifacts;
};

const KeywordAssist = ({ onApply }) => {
  const { collectDraftState } = useContext(CuratorContext) || {};

  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState({});
  const [applied, setApplied] = useState(0);
  const [snapshot, setSnapshot] = useState(null);

  // Every control here sits inside the Qresp Curation Information form. A
  // Button with no explicit type submits it, which would save and collapse
  // the section behind the curator's back.
  const halt = (event) => {
    if (!event) return;
    if (event.preventDefault) event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();
  };

  const triggerRef = useRef(null);

  const start = (event) => {
    halt(event);
    // Snapshot at the moment of the click: this runs the registered draft
    // flushers, so values typed but not yet saved are included.
    setSnapshot(collectDraftState ? collectDraftState() : {});
    setConsent(false);
    setError("");
    setResult(null);
    setSelected({});
    setApplied(0);
    setOpen(true);
  };

  const close = (event) => {
    halt(event);
    if (triggerRef.current) triggerRef.current.focus();
    setOpen(false);
  };

  const request = async (event) => {
    halt(event);
    setLoading(true);
    setError("");
    try {
      const response = await axios.post(
        "/api/assist/keywords",
        buildKeywordRequest(snapshot || {})
      );
      setResult(response.data || {});
      setSelected({});
    } catch (err) {
      const status = err && err.response && err.response.status;
      const message = err && err.response && err.response.data &&
        err.response.data.error;
      // Each failure means something different to the curator, so each says
      // something different.
      if (status === 503) {
        setError(
          message ||
            "AI keyword suggestions are not configured on this server. Ask " +
              "an administrator, or enter keywords by hand."
        );
      } else if (status === 429) {
        setError(
          message ||
            "You have reached today's AI suggestion limit. Please try again " +
              "tomorrow."
        );
      } else if (status === 502) {
        setError(
          message ||
            "The AI service could not be reached or answered unreadably. " +
              "Nothing was changed — try again, or enter keywords by hand."
        );
      } else {
        setError(message || "Keyword suggestions could not be generated.");
      }
    } finally {
      setLoading(false);
    }
  };

  const suggestions = (result && result.keywords) || [];
  const anySelected = suggestions.some((item) => selected[item.keyword]);

  const apply = (event) => {
    halt(event);
    const chosen = suggestions
      .filter((item) => selected[item.keyword])
      .map((item) => item.keyword);
    if (chosen.length && onApply) {
      // The caller appends; this never replaces what is already there.
      onApply(chosen);
    }
    setApplied(chosen.length);
    setSelected({});
  };

  const state = snapshot || {};
  const preview = buildKeywordRequest(state);
  const artifactCount = Object.keys(ARTIFACT_FIELDS).reduce(
    (total, kind) => total + (preview[kind] || []).length,
    0
  );
  const eligible = hasSomethingToWorkFrom(
    collectDraftState ? collectDraftState() : {}
  );

  return (
    <Fragment>
      <Box sx={{ mt: 1 }}>
        <Button
          type="button"
          size="small"
          variant="outlined"
          startIcon={<AutoAwesome fontSize="small" />}
          ref={triggerRef}
          onClick={start}
          disabled={!eligible}
          sx={{ textTransform: "none", fontWeight: 600, mb: 0.5 }}
        >
          Suggest Keywords with AI
        </Button>
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          data-testid="keyword-assist-availability"
        >
          {eligible
            ? "Reads this record's own title, abstract and reviewed " +
              "artifacts. Suggestions only — nothing is applied, saved or " +
              "published without you."
            : "Enter a title or abstract, or add some datasets, charts, " +
              "scripts or tools first — there is nothing to read yet."}
        </Typography>
      </Box>

      <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
        <DialogTitle>Suggest Keywords with AI</DialogTitle>
        <DialogContent dividers>
          {!result && (
            <Fragment>
              <Typography variant="body2" gutterBottom>
                If you continue, Qresp sends to Gemini:
              </Typography>
              <Box component="ul" sx={{ pl: 3, mt: 0, mb: 2 }}>
                <Typography component="li" variant="body2">
                  this paper&rsquo;s kind, title, abstract, publication, DOI
                  and year
                </Typography>
                <Typography component="li" variant="body2">
                  {artifactCount > 0
                    ? `the captions, descriptions and keywords of the ` +
                      `${artifactCount} dataset, chart, script and tool ` +
                      `entries you have already added`
                    : "no artifacts — you have not added any yet"}
                </Typography>
                <Typography component="li" variant="body2">
                  the keywords already used across Qresp, so suggestions match
                  the vocabulary other records use
                </Typography>
              </Box>
              <Typography variant="body2" gutterBottom>
                It does <strong>not</strong> send any file, notebook or image,
                any file path or RCC URL, your unclassified files, folder
                candidates you have not accepted, or any curator, owner or
                account details. Nothing is stored or published, and
                suggestions are applied one by one by you.
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    slotProps={{
                      input: {
                        "aria-label":
                          "I agree to send these details to Gemini",
                      },
                    }}
                  />
                }
                label="Send these details for this request."
              />
            </Fragment>
          )}

          {loading && (
            <Box sx={{ display: "flex", gap: 2, alignItems: "center", mt: 1 }}>
              <CircularProgress size={20} />
              <Typography variant="body2">Reading this record…</Typography>
            </Box>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 1 }} data-testid="keyword-error">
              {error}
            </Alert>
          )}

          {result && (
            <Fragment>
              {suggestions.length === 0 && (
                <Typography variant="body2" data-testid="no-keywords">
                  No keyword suggestions came back for this record.
                </Typography>
              )}
              {suggestions.map((item) => (
                <Box
                  key={item.keyword}
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                  data-testid={`suggestion-${item.keyword}`}
                >
                  <Checkbox
                    size="small"
                    checked={Boolean(selected[item.keyword])}
                    onChange={(event) =>
                      setSelected((current) => ({
                        ...current,
                        [item.keyword]: event.target.checked,
                      }))
                    }
                    slotProps={{
                      input: { "aria-label": `Apply ${item.keyword}` },
                    }}
                  />
                  <Typography variant="body2" sx={{ flexGrow: 1 }}>
                    {item.keyword}
                    {item.reason ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                      >
                        {item.reason}
                      </Typography>
                    ) : null}
                  </Typography>
                  <Chip
                    size="small"
                    variant={item.existing ? "filled" : "outlined"}
                    color={item.existing ? "success" : "secondary"}
                    label={
                      item.existing
                        ? "Existing Qresp keyword"
                        : "New suggestion"
                    }
                  />
                </Box>
              ))}
              {applied > 0 && (
                <Alert severity="success" sx={{ mt: 1 }}>
                  {applied} keyword{applied === 1 ? "" : "s"} added to the
                  Keywords field. Nothing has been saved or published — review
                  them and use Save when you are ready.
                </Alert>
              )}
            </Fragment>
          )}
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={close}>
            Close
          </Button>
          {!result ? (
            <Button
              type="button"
              variant="contained"
              disabled={!consent || loading}
              onClick={request}
            >
              Continue and get suggestions
            </Button>
          ) : (
            <Button
              type="button"
              variant="contained"
              disabled={!anySelected}
              onClick={apply}
            >
              Apply Selected Keywords
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Fragment>
  );
};

KeywordAssist.propTypes = {
  onApply: PropTypes.func,
};

export default KeywordAssist;
